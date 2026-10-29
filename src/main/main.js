const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { QuotaStore } = require("./quota-store");
const IS_MAC = process.platform === "darwin";
const ASSETS = path.join(__dirname, "../../assets");
const PANEL_SIZE = { width: 320, height: 104 };
let mainWindow, tray, trayMenu, quotaStore;
let isAlwaysOnTop = true;
let isQuitting = false;
let backgroundOpacity = 85;
let appearanceWindow, appearanceSaveTimer;
function preferencesPath() { return path.join(app.getPath("userData"), "appearance.json"); }
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showWindow);
  app.whenReady().then(startApp);
}
async function startApp() {
  try {
    const saved = JSON.parse(fs.readFileSync(preferencesPath(), "utf8"));
    if (Number.isFinite(saved.backgroundOpacity) && saved.backgroundOpacity >= 0 && saved.backgroundOpacity <= 100) backgroundOpacity = saved.backgroundOpacity;
  } catch (_) { /* Use defaults on first launch or invalid preferences. */ }
  if (process.platform === "win32") app.setAppUserModelId("cn.codex.quota.widget");
  if (IS_MAC) app.dock.hide();
  Menu.setApplicationMenu(null);
  quotaStore = new QuotaStore({ userDataPath: app.getPath("userData") });
  await quotaStore.loadCache();
  quotaStore.on("state", (state) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("quota:changed", state);
  });
  registerIpcHandlers();
  createTray();
  createWindow();
  quotaStore.refreshNow("startup").catch(() => {});
  app.on("activate", showWindow);
}
function createWindow() {
  mainWindow = new BrowserWindow({
    ...PANEL_SIZE, frame: false, transparent: true, resizable: false,
    ...(process.platform === "win32" ? { minWidth: PANEL_SIZE.width, maxWidth: PANEL_SIZE.width,
      minHeight: PANEL_SIZE.height, maxHeight: PANEL_SIZE.height, thickFrame: false } : {}),
    maximizable: false, fullscreenable: false, alwaysOnTop: isAlwaysOnTop,
    skipTaskbar: true, show: false, backgroundColor: "#00000000",
    icon: path.join(ASSETS, "app-icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, backgroundThrottling: true }
  });
  mainWindow.setHasShadow(false);
  if (IS_MAC) mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  const { workArea } = screen.getPrimaryDisplay();
  mainWindow.setPosition(workArea.x + Math.round((workArea.width - PANEL_SIZE.width) / 2), workArea.y + 6);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  mainWindow.on("show", () => {
    quotaStore.setWindowVisible(true);
    quotaStore.refreshNow("window-show").catch(() => {});
  });
  mainWindow.on("hide", () => quotaStore.setWindowVisible(false));
  mainWindow.on("close", (event) => {
    if (!isQuitting) { event.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}
function createTray() {
  const icon = nativeImage.createFromPath(path.join(ASSETS, IS_MAC ? "trayTemplate.png" : "app-icon-tray-16.png"));
  if (icon.isEmpty()) throw new Error("Missing tray icon.");
  if (IS_MAC) icon.setTemplateImage(true);
  tray = new Tray(icon);
  tray.setToolTip("codex-quota");
  rebuildTrayMenu();
  tray.on("click", toggleWindow);
  if (IS_MAC) tray.on("right-click", () => tray.popUpContextMenu(trayMenu));
}
function rebuildTrayMenu() {
  trayMenu = Menu.buildFromTemplate([
    { label: "显示/隐藏", click: toggleWindow },
    { label: "刷新额度", click: () => quotaStore.refreshNow("tray-manual").catch(() => {}) },
    { label: isAlwaysOnTop ? "取消置顶" : "置顶", click: toggleAlwaysOnTop },
    { label: "背景不透明度", click: showAppearance },
    { type: "separator" },
    { label: "退出", click: quitApp }
  ]);
  if (!IS_MAC) tray.setContextMenu(trayMenu);
}
function toggleAlwaysOnTop() {
  isAlwaysOnTop = !isAlwaysOnTop;
  mainWindow.setAlwaysOnTop(isAlwaysOnTop);
  rebuildTrayMenu();
}
function registerIpcHandlers() {
  ipcMain.handle("appearance:get", () => backgroundOpacity);
  ipcMain.handle("appearance:set", (_event, value) => {
    if (!Number.isFinite(value) || value < 0 || value > 100) return;
    backgroundOpacity = Math.round(value);
    mainWindow.webContents.send("appearance:changed", backgroundOpacity);
    clearTimeout(appearanceSaveTimer);
    appearanceSaveTimer = setTimeout(saveAppearance, 200);
  });
  ipcMain.handle("appearance:close", () => appearanceWindow?.close());
  ipcMain.handle("quota:state", () => quotaStore.getState());
  ipcMain.handle("window:hide", () => mainWindow.hide());
  ipcMain.handle("window:move", (_event, deltaX, deltaY) => {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const [x, y] = mainWindow.getPosition();
    if (process.platform === "win32") {
      // Specify fixed DIP dimensions instead of letting setPosition carry forward
      // native window dimensions after DPI rounding or Windows frame adjustments.
      mainWindow.setBounds({ x: Math.round(x + deltaX), y: Math.round(y + deltaY), ...PANEL_SIZE }, false);
    } else {
      mainWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
    }
  });
}
function toggleWindow() {
  if (mainWindow?.isVisible()) mainWindow.hide();
  else showWindow();
}
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.show();
  mainWindow.focus();
}
function saveAppearance() {
  clearTimeout(appearanceSaveTimer);
  try {
    fs.mkdirSync(app.getPath("userData"), { recursive: true });
    fs.writeFileSync(preferencesPath(), JSON.stringify({ backgroundOpacity }));
  } catch (error) { console.error("Unable to save appearance", error.message); }
}
function showAppearance() {
  if (appearanceWindow && !appearanceWindow.isDestroyed()) { appearanceWindow.show(); appearanceWindow.focus(); return; }
  appearanceWindow = new BrowserWindow({ width: 280, height: 126, frame: false, resizable: false, alwaysOnTop: true, skipTaskbar: true, show: true,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false } });

  appearanceWindow.on("closed", () => { appearanceWindow = null; saveAppearance(); });
  appearanceWindow.loadFile(path.join(__dirname, "../renderer/appearance.html")).then(() => { appearanceWindow?.show(); appearanceWindow?.focus(); });
}
function quitApp() { isQuitting = true; app.quit(); }
app.on("before-quit", () => { isQuitting = true; saveAppearance(); quotaStore?.destroy(); });
app.on("window-all-closed", () => {});
