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

function clampNumber(el) {
  const min = el.min !== '' ? Number(el.min) : -Infinity;
  const max = el.max !== '' ? Number(el.max) : Infinity;
  const step = el.step && el.step !== 'any' ? Number(el.step) : null;
  let v = Number(el.value);
  if (!Number.isFinite(v)) v = min === -Infinity ? 0 : min;
  v = Math.min(max, Math.max(min, v));
  if (step && step > 0) v = Math.round(v / step) * step;
  return Number(v.toFixed(4));
}

function gatherFromForm() {
  const out = {};
  fields.forEach((f) => {
    const el = getEl(f);
    if (!el) return;
    if (el.type === 'checkbox') out[f] = el.checked;
    else if (el.type === 'number' || el.type === 'range') out[f] = clampNumber(el);
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

  const version = await window.api.getVersion();
  document.getElementById('versionBadge').textContent = `v${version}`;

  fields.forEach((f) => {
    const el = getEl(f);
    if (!el) return;
    el.addEventListener('input', scheduleSave);
    el.addEventListener('change', scheduleSave);
    if (el.type === 'number') {
      el.addEventListener('blur', () => {
        el.value = clampNumber(el);
      });
    }
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

  document.querySelectorAll('.corner-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.api.moveMiniBarCorner(btn.dataset.corner);
    });
  });

  await renderDisplays();
  window.api.onDisplaysChanged(() => renderDisplays());
}

async function renderDisplays() {
  const list = getEl('displayList');
  if (!list) return;
  const displays = await window.api.getDisplays();
  list.innerHTML = '';
  displays.forEach((d) => {
    const row = document.createElement('label');
    row.className = 'display-item';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = d.blocked;
    cb.dataset.id = d.id;
    const text = document.createElement('span');
    const tag = d.primary ? ' (primary)' : '';
    text.textContent = `${d.label} — ${d.width}×${d.height}${tag}`;
    cb.addEventListener('change', saveDisplays);
    row.appendChild(cb);
    row.appendChild(text);
    list.appendChild(row);
  });
}

async function saveDisplays() {
  const excluded = [];
  getEl('displayList')
    .querySelectorAll('input[type="checkbox"]')
    .forEach((cb) => {
      if (!cb.checked) excluded.push(Number(cb.dataset.id));
    });
  settings = await window.api.setSettings({ excludedDisplayIds: excluded });
  flashStatus('Saved');
}

init();
