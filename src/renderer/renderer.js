const panel = document.getElementById("quotaPanel");
const bridge = window.codexQuota;
function applyBackgroundOpacity(value) {
  if (Number.isFinite(value) && value >= 0 && value <= 100) {
    panel.style.setProperty("--panel-opacity", value / 100);
    panel.style.backdropFilter = value === 0 ? "none" : "blur(20px) saturate(1.06)";
  }
}
bridge.onBackgroundOpacityChanged(applyBackgroundOpacity);
bridge.getBackgroundOpacity().then(applyBackgroundOpacity).catch(console.error);
let dragging = null;
let moveFrame = null;
let lastDragAt = 0;
function renderWindow(prefix, quotaWindow) {
  const value = quotaWindow?.remainingPercent;
  const remaining = value !== null && value !== undefined && Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : null;
  document.getElementById(prefix + "Remaining").textContent = remaining === null ? "--" : Math.round(remaining) + "%";
  document.getElementById(prefix + "Fill").style.width = (remaining ?? 0) + "%";
  const track = document.getElementById(prefix + "Track");
  if (remaining === null) track.removeAttribute("aria-valuenow");
  else track.setAttribute("aria-valuenow", remaining);
  const reset = new Date(quotaWindow?.resetsAt || "");
  const hasReset = Number.isFinite(reset.getTime());
  const pad = (value) => String(value).padStart(2, "0");
  document.getElementById(prefix + "Reset").textContent = hasReset ? pad(reset.getMonth()+1) + "/" + pad(reset.getDate()) + " " + pad(reset.getHours()) + ":" + pad(reset.getMinutes()) : "--";
  const marker = document.getElementById(prefix + "Ideal");
  const duration = Number(quotaWindow?.windowDurationMins);
  marker.hidden = !hasReset || !Number.isFinite(duration) || duration <= 0;
  if (!marker.hidden) marker.style.left = Math.min(100, Math.max(0, (reset.getTime()-Date.now())/(duration*60000)*100)) + "%";
}
function renderState(snapshot) {
  const quota = snapshot?.quota;
  const windows = [quota?.primary, quota?.secondary].filter(Boolean);
  renderWindow("short", windows.find((window) => Number(window.windowDurationMins) === 300));
  renderWindow("weekly", windows.find((window) => Number(window.windowDurationMins) === 10080));
  document.body.dataset.state = snapshot?.status || "loading";
  panel.title = snapshot?.error?.message || "";
  if (snapshot?.error) {
    document.getElementById("shortReset").textContent = "读取失败（悬停查看原因）";
  } else if (!quota) {
    document.getElementById("shortReset").textContent = "正在读取…";
  }
}
panel.addEventListener("mousedown", (event) => {
  if (event.button !== 0) return;
  event.preventDefault();
  dragging = { startX: event.screenX, startY: event.screenY, lastX: event.screenX, lastY: event.screenY, deltaX: 0, deltaY: 0, moved: false, pending: Promise.resolve() };
});
window.addEventListener("mousemove", (event) => {
  if (!dragging) return;
  if (!dragging.moved && Math.hypot(event.screenX-dragging.startX, event.screenY-dragging.startY) < 4) return;
  dragging.moved = true;
  dragging.deltaX += event.screenX-dragging.lastX;
  dragging.deltaY += event.screenY-dragging.lastY;
  dragging.lastX = event.screenX;
  dragging.lastY = event.screenY;
  if (!moveFrame) moveFrame = requestAnimationFrame(() => { moveFrame = null; flushMove(); });
});
function flushMove() {
  if (!dragging) return;
  const { deltaX, deltaY } = dragging;
  dragging.deltaX = 0; dragging.deltaY = 0;
  if (deltaX || deltaY) dragging.pending = dragging.pending.then(() => bridge.moveWindow(deltaX, deltaY)).catch(console.error);
}
window.addEventListener("mouseup", () => {
  if (!dragging) return;
  if (moveFrame) { cancelAnimationFrame(moveFrame); moveFrame = null; }
  flushMove();
  if (dragging.moved) lastDragAt = Date.now();
  dragging = null;
});
panel.addEventListener("dblclick", (event) => {
  if (event.button !== 0 || Date.now()-lastDragAt < 350) return;
  event.preventDefault();
  bridge.hide().catch(console.error);
});
bridge.onQuotaChanged(renderState);
bridge.getQuotaState().then(renderState).catch((error) => renderState({ status: "error", error }));
