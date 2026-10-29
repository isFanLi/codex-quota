const assert = require("node:assert/strict");
const { resolveCodexPath, codexEnvironment } = require("../src/main/codex-path");

function resolve(platform, files, env = {}, extras = {}) {
  return resolveCodexPath({ platform, env, home: "/Users/test", exists: (file) => files.includes(file), ...extras });
}

assert.equal(resolve("darwin", ["/Applications/Codex.app/Contents/Resources/codex"]), "/Applications/Codex.app/Contents/Resources/codex");
assert.equal(resolve("darwin", ["/opt/homebrew/bin/codex"]), "/opt/homebrew/bin/codex");
assert.equal(resolve("darwin", ["/usr/local/bin/codex"]), "/usr/local/bin/codex");
assert.equal(resolve("darwin", ["/Users/test/Applications/Codex.app/Contents/Resources/codex"]), "/Users/test/Applications/Codex.app/Contents/Resources/codex");
assert.equal(resolve("darwin", ["/custom/codex", "/opt/homebrew/bin/codex"], { CODEX_CLI_PATH: "/custom/codex" }), "/custom/codex");
assert.equal(resolve("darwin", []), "codex");
const nvmRoot = "/Users/test/.nvm/versions/node";
assert.equal(resolve("darwin", [nvmRoot, `${nvmRoot}/v22.1.0/bin/codex`, `${nvmRoot}/v20.9.0/bin/codex`], {}, {
  readdir: () => ["v20.9.0", "v22.1.0"].map((name) => ({ name, isDirectory: () => true }))
}), `${nvmRoot}/v22.1.0/bin/codex`);
const winRoot = "C:\\Users\\test\\AppData\\Local\\OpenAI\\Codex\\bin";
assert.equal(resolve("win32", [`${winRoot}\\codex.exe`], { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" }), `${winRoot}\\codex.exe`);
assert.equal(resolve("win32", [winRoot, `${winRoot}\\old\\codex.exe`, `${winRoot}\\new\\codex.exe`], { LOCALAPPDATA: "C:\\Users\\test\\AppData\\Local" }, {
  readdir: () => ["old", "new"].map((name) => ({ name, isDirectory: () => true })),
  stat: (file) => ({ mtimeMs: file.includes("\\new\\") ? 2 : 1 })
}), `${winRoot}\\new\\codex.exe`);
const env = codexEnvironment("/Users/test/.nvm/versions/node/v22/bin/codex", { platform: "darwin", env: { PATH: "/usr/bin:/bin", TEST: "keep" } });
assert.ok(env.PATH.startsWith("/Users/test/.nvm/versions/node/v22/bin:"));
assert.ok(env.PATH.includes("/opt/homebrew/bin"));
assert.equal(env.TEST, "keep");
console.log("Verified macOS Finder, Homebrew, custom CLI, nvm, Windows versioned installs, and child PATH.");
