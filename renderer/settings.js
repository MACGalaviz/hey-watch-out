const fields = [
  'intervalMinutes',
  'breakDurationSeconds',
  'fadeInSeconds',
  'fadeOutSeconds',
  'backgroundType',
  'backgroundColor',
  'backgroundPath',
  'backgroundFit',
  'leavesEnabled',
  'soundEnabled',
  'soundPath',
  'soundVolume',
  'title',
  'subtitle',
  'textColor',
  'countdownPosition',
  'skipEnabled',
  'skipAfterSeconds',
  'miniBarEnabled',
  'autostart',
];

const statusEl = document.getElementById('status');
let settings = null;
let saveTimer = null;

function getEl(id) {
  return document.getElementById(id);
}

function applyToForm(s) {
  fields.forEach((f) => {
    const el = getEl(f);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!s[f];
    else el.value = s[f] ?? '';
  });
  getEl('soundVolumeNum').value = s.soundVolume;
}

function gatherFromForm() {
  const out = {};
  fields.forEach((f) => {
    const el = getEl(f);
    if (!el) return;
    if (el.type === 'checkbox') out[f] = el.checked;
    else if (el.type === 'number') out[f] = Number(el.value);
    else if (el.type === 'range') out[f] = Number(el.value);
    else out[f] = el.value;
  });
  return out;
}

function flashStatus(text) {
  statusEl.textContent = text;
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => (statusEl.textContent = ''), 1500);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const partial = gatherFromForm();
    settings = await window.api.setSettings(partial);
    flashStatus('Saved');
  }, 250);
}

async function init() {
  settings = await window.api.getSettings();
  applyToForm(settings);

  fields.forEach((f) => {
    const el = getEl(f);
    if (!el) return;
    el.addEventListener('input', scheduleSave);
    el.addEventListener('change', scheduleSave);
  });

  const volRange = getEl('soundVolume');
  const volNum = getEl('soundVolumeNum');
  const clampVol = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
  volRange.addEventListener('input', () => {
    volNum.value = clampVol(volRange.value);
  });
  volNum.addEventListener('input', () => {
    const v = clampVol(volNum.value);
    volRange.value = v;
    scheduleSave();
  });
  volNum.addEventListener('blur', () => {
    volNum.value = clampVol(volNum.value);
  });

  getEl('pickBg').addEventListener('click', async () => {
    const filters = [
      {
        name: 'Media',
        extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov'],
      },
    ];
    const p = await window.api.pickFile(filters);
    if (!p) return;
    getEl('backgroundPath').value = p;
    const ext = p.split('.').pop().toLowerCase();
    if (['mp4', 'webm', 'mov'].includes(ext)) getEl('backgroundType').value = 'video';
    else getEl('backgroundType').value = 'image';
    scheduleSave();
  });

  getEl('clearBg').addEventListener('click', () => {
    getEl('backgroundPath').value = '';
    getEl('backgroundType').value = 'default';
    scheduleSave();
  });

  getEl('pickSound').addEventListener('click', async () => {
    const p = await window.api.pickFile([
      { name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'm4a', 'aac'] },
    ]);
    if (!p) return;
    getEl('soundPath').value = p;
    scheduleSave();
  });

  getEl('clearSound').addEventListener('click', () => {
    getEl('soundPath').value = '';
    scheduleSave();
  });

  getEl('breakNow').addEventListener('click', () => window.api.triggerBreakNow());

  const pauseBtn = getEl('togglePause');
  const refreshPauseLabel = async () => {
    const s = await window.api.getState();
    pauseBtn.textContent = s.paused ? 'Resume' : 'Pause';
  };
  refreshPauseLabel();
  pauseBtn.addEventListener('click', async () => {
    await window.api.togglePause();
    refreshPauseLabel();
  });

  window.api.onTick(() => refreshPauseLabel());
}

init();
