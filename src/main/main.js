const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require("electron");
const path = require("node:path");
const { QuotaStore } = require("./quota-store");
const IS_MAC = process.platform === "darwin";
const ASSETS = path.join(__dirname, "../../assets");
const PANEL_SIZE = { width: 320, height: 104 };
let mainWindow, tray, trayMenu, quotaStore;
let isAlwaysOnTop = true;
let isQuitting = false;
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on("second-instance", showWindow);
  app.whenReady().then(startApp);
}
async function startApp() {
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
  ipcMain.handle("quota:state", () => quotaStore.getState());
  ipcMain.handle("window:hide", () => mainWindow.hide());
  ipcMain.handle("window:move", (_event, deltaX, deltaY) => {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const [x, y] = mainWindow.getPosition();
    mainWindow.setPosition(Math.round(x + deltaX), Math.round(y + deltaY), false);
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
function quitApp() { isQuitting = true; app.quit(); }
app.on("before-quit", () => { isQuitting = true; quotaStore?.destroy(); });
app.on("window-all-closed", () => {});
