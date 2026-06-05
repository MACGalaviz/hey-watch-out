const bar = document.getElementById('bar');
const label = document.getElementById('label');
const fill = document.getElementById('fill');
const openBtn = document.getElementById('open');
const pauseBtn = document.getElementById('pause');
const resetBtn = document.getElementById('reset');

let intervalMinutes = 20;
let nextBreakAt = null;
let paused = false;

function fmt(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function render() {
  bar.classList.toggle('is-paused', paused);
  pauseBtn.classList.toggle('is-paused', paused);
  pauseBtn.title = paused ? 'Resume' : 'Pause';
  pauseBtn.setAttribute('aria-label', paused ? 'Resume' : 'Pause');
  if (paused) {
    label.textContent = 'Paused';
    fill.style.width = '100%';
    fill.classList.add('paused');
    return;
  }
  if (!nextBreakAt) {
    label.textContent = '--:--';
    fill.style.width = '0%';
    fill.classList.remove('paused');
    return;
  }
  const remaining = nextBreakAt - Date.now();
  const totalMs = intervalMinutes * 60 * 1000;
  const pct = Math.max(0, Math.min(100, (1 - remaining / totalMs) * 100));
  label.textContent = `Break in ${fmt(remaining)}`;
  fill.style.width = `${pct}%`;
  fill.classList.remove('paused');
}

async function refresh() {
  const settings = await window.api.getSettings();
  intervalMinutes = settings.intervalMinutes;
  const state = await window.api.getState();
  nextBreakAt = state.nextBreakAt;
  paused = state.paused;
  render();
}

openBtn.addEventListener('click', () => window.api.openSettings());
pauseBtn.addEventListener('click', async () => {
  paused = await window.api.togglePause();
  await refresh();
});
resetBtn.addEventListener('click', async () => {
  paused = await window.api.resetTimer();
  await refresh();
});

window.api.onTick((payload) => {
  if (payload.nextBreakAt !== undefined) nextBreakAt = payload.nextBreakAt;
  if (payload.paused !== undefined) paused = payload.paused;
  render();
});

refresh();
setInterval(render, 1000);
setInterval(refresh, 30000);
