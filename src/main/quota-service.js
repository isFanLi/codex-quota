const { spawn } = require("node:child_process");
const { resolveCodexPath, codexEnvironment } = require("./codex-path");
const { version: APP_VERSION } = require("../../package.json");
const { buildPaceAdvice } = require("./pace-advice");

const DEFAULT_TIMEOUT_MS = 12000;

async function getQuota() {
  const response = await requestRateLimits();
  const legacy = response.rateLimits;
  const snapshot = response.rateLimitsByLimitId?.codex
    ?? (legacy && (!legacy.limitId || legacy.limitId === "codex") ? legacy : null);

  if (!snapshot) {
    throw new Error("Codex did not return the codex rate-limit snapshot.");
  }

  return normalizeSnapshot(snapshot);
}

function normalizeSnapshot(snapshot) {
  const primary = normalizeWindow(snapshot.primary);
  const secondary = normalizeWindow(snapshot.secondary);
  const activeWindow = primary || secondary;
  if (!activeWindow) {
    throw new Error("Codex rate-limit snapshot does not include a usable quota window.");
  }
  const normalized = {
    limitId: snapshot.limitId ?? "codex",
    limitName: snapshot.limitName ?? "Codex",
    planType: snapshot.planType ?? "unknown",
    reachedType: snapshot.rateLimitReachedType ?? null,
    credits: snapshot.credits ?? null,
    primary,
    secondary,
    remainingPercent: activeWindow.remainingPercent,
    usedPercent: activeWindow.usedPercent,
    resetsAt: activeWindow.resetsAt,
    fetchedAt: new Date().toISOString()
  };

  return {
    ...normalized,
    paceAdvice: buildPaceAdvice(normalized, normalized.fetchedAt)
  };
}

function normalizeWindow(window) {
  if (!window) return null;
  const usedPercent = normalizeUsedPercent(window.usedPercent);
  return {
    usedPercent,
    remainingPercent: clampPercent(100 - usedPercent),
    windowDurationMins: window.windowDurationMins ?? null,
    resetsAt: normalizeResetTime(window.resetsAt)
  };
}

function normalizeUsedPercent(value) {
  const usedPercent = Number(value);
  if (!Number.isFinite(usedPercent)) {
    throw new Error("Codex quota window is missing a numeric usedPercent.");
  }
  return clampPercent(usedPercent);
}

function normalizeResetTime(value) {
  if (value === null || value === undefined) return null;
  const timestampSeconds = Number(value);
  if (!Number.isFinite(timestampSeconds)) {
    throw new Error("Codex quota window has an invalid reset timestamp.");
  }
  return new Date(timestampSeconds * 1000).toISOString();
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function requestRateLimits() {
  const codexPath = resolveCodexPath();
  const child = spawn(codexPath, ["app-server"], {
    stdio: ["pipe", "pipe", "pipe"],
    env: codexEnvironment(codexPath),
    windowsHide: true
  });

  let buffer = "";
  let stderr = "";
  let nextId = 1;
  const pending = new Map();

  const cleanup = () => {
    for (const request of pending.values()) {
      clearTimeout(request.timer);
    }
    pending.clear();
    if (!child.killed) child.kill();
  };

  const send = (method, params) => {
    const id = nextId++;
    const payload = params === undefined ? { id, method } : { id, method, params };
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, DEFAULT_TIMEOUT_MS);
      pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify(payload)}\n`);
    });
  };

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;
      handleMessage(line, pending);
    }
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  return new Promise((resolve, reject) => {
    child.stdin.on("error", (error) => {
      rejectPendingRequests(pending, error);
      cleanup();
      reject(new Error(`无法连接 Codex 内置服务：${error.message}`));
    });
    child.once("error", (error) => {
      cleanup();
      reject(error.code === "ENOENT"
        ? new Error("未找到桌面版自带的 Codex 程序。请将 Codex.app 或 ChatGPT.app 放入“应用程序”文件夹后重试，无需另装 CLI。")
        : error);
    });

    child.once("exit", (code) => {
      if (pending.size > 0) {
        cleanup();
        reject(new Error(stderr || `Codex app-server exited with code ${code}`));
      }
    });

    (async () => {
      try {
        await send("initialize", {
          clientInfo: {
            name: "codex-quota",
            title: "codex-quota",
            version: APP_VERSION
          },
          capabilities: null
        });
        child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
        const result = await send("account/rateLimits/read");
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(new Error(stderr || error.message));
      }
    })();
  });
}

function handleMessage(line, pending) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    rejectPendingRequests(pending, new Error(`Codex app-server returned invalid JSON: ${error.message}`));
    return;
  }

  if (!Object.prototype.hasOwnProperty.call(message, "id")) return;
  const request = pending.get(message.id);
  if (!request) return;

  clearTimeout(request.timer);
  pending.delete(message.id);

  if (message.error) {
    request.reject(new Error(message.error.message || JSON.stringify(message.error)));
  } else {
    request.resolve(message.result);
  }
}

function rejectPendingRequests(pending, error) {
  for (const [id, request] of pending) {
    clearTimeout(request.timer);
    pending.delete(id);
    request.reject(error);
  }
}

module.exports = { getQuota, normalizeSnapshot, resolveCodexPath };
