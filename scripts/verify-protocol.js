const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const filename = path.resolve(__dirname, '../src/main/quota-service.js');
const realRequire = createRequire(filename);
const snapshot = { primary: { usedPercent: 23, windowDurationMins: 300, resetsAt: 1800000000 } };
async function run(response, strictHandshake = true) {
  const messages = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = () => { child.killed = true; };
  child.stdin = new EventEmitter();
  child.stdin.write = function(line) {
    const message = JSON.parse(line);
    messages.push(message.method);
    if (message.id === undefined) return;
    queueMicrotask(() => {
      const ready = !strictHandshake || messages.includes('initialized');
      const reply = message.method === 'initialize' ? { result: {} }
        : ready ? { result: response } : { error: { message: 'Not initialized' } };
      child.stdout.emit('data', Buffer.from(JSON.stringify({ id: message.id, ...reply }) + '\n'));
    });
  };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module, exports: module.exports, setTimeout, clearTimeout,
    require(name) {
      if (name === 'node:child_process') return { spawn: () => child };
      if (name === './codex-path') return { resolveCodexPath: () => '/Applications/Codex.app/Contents/Resources/codex', codexEnvironment: () => ({}) };
      return realRequire(name);
    }
  }, { filename });
  const result = await module.exports.getQuota();
  assert.equal(child.killed, true);
  return { result, messages };
}
(async () => {
  const legacy = await run({ rateLimits: snapshot });
  assert.equal(legacy.result.remainingPercent, 77);
  assert.deepEqual(legacy.messages, ['initialize', 'initialized', 'account/rateLimits/read']);
  const modern = await run({ rateLimitsByLimitId: { codex: snapshot } });
  assert.equal(modern.result.remainingPercent, 77);
  const preferred = await run({ rateLimits: { ...snapshot, primary: { ...snapshot.primary, usedPercent: 90 } }, rateLimitsByLimitId: { codex: snapshot } });
  assert.equal(preferred.result.remainingPercent, 77);
  await assert.rejects(run({ rateLimits: { ...snapshot, limitId: 'other' } }), /snapshot/);
  console.log('PASS: strict initialization, legacy/current quota responses, bucket precedence and unrelated bucket rejection.');
})().catch(error => { console.error(error); process.exitCode = 1; });
