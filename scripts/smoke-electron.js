const { app, BrowserWindow, Menu } = require("electron");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const profile = path.resolve(__dirname, process.env.QUOTA_SMOKE_LIVE ? "../../smoke-minimal-live" : "../../smoke-minimal");
fs.mkdirSync(profile, { recursive: true });
app.setPath("userData", profile);
let trayTemplate;
const buildMenu = Menu.buildFromTemplate;
Menu.buildFromTemplate = (template) => {
  if (template.some((item) => item.label === "显示/隐藏")) trayTemplate = template;
  return buildMenu.call(Menu, template);
};
const appRoot = process.env.QUOTA_SMOKE_APP_ROOT || path.resolve(__dirname, "..");
const service = require(path.join(appRoot, "src/main/quota-service"));
const liveRead = service.getQuota;
let reads = 0;
service.getQuota = async () => {
  reads++;
  if (process.env.QUOTA_SMOKE_LIVE) return liveRead();
  return service.normalizeSnapshot({
    limitId: "codex", planType: "test",
    primary: { usedPercent: 37, windowDurationMins: 300, resetsAt: Math.floor(Date.now()/1000)+7200 },
    secondary: { usedPercent: 27, windowDurationMins: 10080, resetsAt: Math.floor(Date.now()/1000)+4*86400 }
  });
};
require(path.join(appRoot, "src/main/main"));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, label) {
  const deadline = Date.now()+15000;
  while (Date.now()<deadline) { if (await predicate()) return; await wait(40); }
  throw new Error("Timed out: "+label);
}
function click(win, count) {
  win.webContents.sendInputEvent({ type: "mouseMove", x: 50, y: 25 });
  win.webContents.sendInputEvent({ type: "mouseDown", x: 50, y: 25, button: "left", clickCount: count });
  win.webContents.sendInputEvent({ type: "mouseUp", x: 50, y: 25, button: "left", clickCount: count });
}
app.whenReady().then(async () => {
  try {
    await until(() => BrowserWindow.getAllWindows().some((w) => w.isVisible()), "panel visible");
    const win = BrowserWindow.getAllWindows()[0];
    const errors = [];
    win.webContents.on("console-message", (_event, level, message) => { if (level>=3) errors.push(message); });
    await until(() => win.webContents.executeJavaScript("/^\\d+%$/.test(document.getElementById('shortRemaining').textContent)"), "quota rendered");
    const [width, height] = win.getSize();
    assert.equal(width, 320);
    assert.ok(height >= 104 && height <= 110, "Windows may round the frameless minimum height at the current DPI");
    assert.equal(BrowserWindow.getAllWindows().length, 1);
    assert.equal(await win.webContents.executeJavaScript("document.querySelectorAll('button').length"), 0);
    assert.deepEqual(trayTemplate.filter((item) => item.label).map((item) => item.label), ["显示/隐藏", "刷新额度", "取消置顶", "背景不透明度", "退出"]);
    trayTemplate.find(item => item.label === "背景不透明度").click();
    await until(() => BrowserWindow.getAllWindows().some(w => w !== win && w.isVisible()), "slider opens");
    const editor = BrowserWindow.getAllWindows().find(w => w !== win);
    for (const value of [0, 37, 100, 85]) {
      await editor.webContents.executeJavaScript(`document.getElementById('opacity').value=${value};document.getElementById('opacity').dispatchEvent(new Event('input'))`);
      await until(() => win.webContents.executeJavaScript(`Number(document.getElementById('quotaPanel').style.getPropertyValue('--panel-opacity')) === ${value / 100}`), "live opacity preview");
    }
    editor.close();
    assert.equal(JSON.parse(fs.readFileSync(path.join(profile, 'appearance.json'), 'utf8')).backgroundOpacity, 85);
    assert.ok(await win.webContents.executeJavaScript("parseFloat(getComputedStyle(document.getElementById('quotaPanel'),'::after').borderTopWidth) > 0"));
    click(win, 1);
    await wait(120);
    assert.equal(win.isVisible(), true);
    click(win, 1); await wait(60); click(win, 2);
    await until(() => !win.isVisible(), "double-click hides");
    trayTemplate[0].click();
    await until(() => win.isVisible(), "tray restores");
    assert.equal(win.isAlwaysOnTop(), true);
    trayTemplate[2].click();
    assert.equal(win.isAlwaysOnTop(), false);
    assert.equal(trayTemplate[2].label, "置顶");
    trayTemplate[2].click();
    assert.equal(win.isAlwaysOnTop(), true);
    // Restoring can already be refreshing; let that shared request complete.
    await trayTemplate[1].click();
    const beforeReads = reads;
    await trayTemplate[1].click();
    assert.ok(reads>beforeReads, "refresh menu actually fetches quota");
    const beforeSize = win.getSize();
    for (let i = 0; i < 80; i++) await win.webContents.executeJavaScript(`window.codexQuota.moveWindow(${i % 2 ? -2 : 2}, 0)`);
    console.log("Drag size before/after", beforeSize, win.getSize());
    assert.deepEqual(win.getSize(), beforeSize, "Repeated dragging must not resize panel");
    const before = win.getPosition();
    await win.webContents.executeJavaScript("document.getElementById('quotaPanel').dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,screenX:100,screenY:100})); window.dispatchEvent(new MouseEvent('mousemove',{screenX:180,screenY:130}));");
    await wait(100);
    await win.webContents.executeJavaScript("window.dispatchEvent(new MouseEvent('mouseup',{button:0}))");
    await wait(150);
    assert.notDeepEqual(win.getPosition(), before);
    assert.equal(win.isVisible(), true);
    win.close();
    await until(() => !win.isVisible(), "close hides without extra window");
    app.emit("second-instance");
    await until(() => win.isVisible(), "relaunch restores");
    if (process.env.QUOTA_SMOKE_SCREENSHOT) fs.writeFileSync(process.env.QUOTA_SMOKE_SCREENSHOT, (await win.webContents.capturePage()).toPNG());
    assert.deepEqual(errors, []);
    console.log("PASS: small panel, quota, refresh, pin, opacity applied and saved, inset border, double-click hide, restore, drag, and no renderer errors.");
    if (process.env.QUOTA_SMOKE_LIVE) console.log("Live Codex quota read passed.");
    // Exercise the retained exit action, including normal app cleanup.
    trayTemplate.find((item) => item.label === "退出").click();
  } catch (error) { console.error(error.stack || error); app.exit(1); }
});
