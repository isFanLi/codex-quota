const slider = document.getElementById("opacity");
const value = document.getElementById("value");
window.codexQuota.getBackgroundOpacity().then(current => { slider.value = current; value.textContent = current + "%"; });
slider.addEventListener("input", () => {
  value.textContent = slider.value + "%";
  window.codexQuota.setBackgroundOpacity(Number(slider.value)).catch(console.error);
});
document.getElementById("close").addEventListener("click", () => window.codexQuota.closeAppearance());
document.addEventListener("keydown", event => { if (event.key === "Escape") window.codexQuota.closeAppearance(); });
