const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Finder does not inherit a terminal's PATH, so check desktop and CLI installs.
function resolveCodexPath({ platform = process.platform, env = process.env, home = os.homedir(), exists = fs.existsSync, readdir = fs.readdirSync, stat = fs.statSync } = {}) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const candidates = [env.CODEX_CLI_PATH];
  if (platform === "win32" && env.LOCALAPPDATA) {
    const root = p.join(env.LOCALAPPDATA, "OpenAI", "Codex", "bin");
    candidates.push(p.join(root, "codex.exe"));
    if (exists(root)) {
      candidates.push(...readdir(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => p.join(root, entry.name, "codex.exe"))
        .filter(exists)
        .sort((a, b) => stat(b).mtimeMs - stat(a).mtimeMs));
    }
  }
  if (platform === "darwin") {
    candidates.push(
      "/Applications/Codex.app/Contents/Resources/codex",
      p.join(home, "Applications/Codex.app/Contents/Resources/codex"),
      "/Applications/ChatGPT.app/Contents/Resources/codex",
      p.join(home, "Applications/ChatGPT.app/Contents/Resources/codex"),
      "/opt/homebrew/bin/codex",
      "/usr/local/bin/codex",
      p.join(home, ".local/bin/codex"),
      p.join(home, ".npm-global/bin/codex"),
      p.join(home, ".volta/bin/codex"),
      p.join(home, ".cargo/bin/codex")
    );
    const nvmRoot = p.join(env.NVM_DIR || p.join(home, ".nvm"), "versions/node");
    if (exists(nvmRoot)) {
      candidates.push(...readdir(nvmRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))
        .map((entry) => p.join(nvmRoot, entry.name, "bin/codex")));
    }
  }
  return candidates.find((candidate) => candidate && exists(candidate)) || "codex";
}

function codexEnvironment(codexPath, { platform = process.platform, env = process.env } = {}) {
  if (platform !== "darwin") return env;
  const paths = [path.posix.dirname(codexPath), "/opt/homebrew/bin", "/usr/local/bin", env.PATH, "/usr/bin", "/bin"];
  return { ...env, PATH: paths.filter(Boolean).join(":") };
}

module.exports = { resolveCodexPath, codexEnvironment };
