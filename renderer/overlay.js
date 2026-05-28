const LEAF_EMOJIS = ['🍂', '🍁', '🍃'];
const LEAF_COUNT = 36;

function fileUrl(p) {
  if (!p) return '';
  const normalized = p.replace(/\\/g, '/');
  return normalized.startsWith('file://') ? normalized : `file:///${normalized.replace(/^\//, '')}`;
}

function spawnLeaves(container) {
  for (let i = 0; i < LEAF_COUNT; i++) {
    const leaf = document.createElement('span');
    leaf.className = 'leaf';
    leaf.textContent = LEAF_EMOJIS[i % LEAF_EMOJIS.length];
    leaf.style.left = `${Math.random() * 100}%`;
    leaf.style.animationDuration = `${6 + Math.random() * 9}s`;
    leaf.style.animationDelay = `${Math.random() * 10}s`;
    leaf.style.fontSize = `${18 + Math.random() * 32}px`;
    leaf.style.opacity = `${0.65 + Math.random() * 0.35}`;
    container.appendChild(leaf);
  }
}

function applyBackground(settings) {
  const bg = document.getElementById('bg-container');
  const leaves = document.getElementById('leaves');
  const baseColor = settings.backgroundColor || '#16352a';

  document.body.style.background = baseColor;

  if (settings.backgroundType === 'image' && settings.backgroundPath) {
    bg.style.backgroundImage = `url("${fileUrl(settings.backgroundPath)}")`;
    bg.style.backgroundSize = settings.backgroundFit || 'cover';
  } else if (settings.backgroundType === 'video' && settings.backgroundPath) {
    const video = document.createElement('video');
    video.src = fileUrl(settings.backgroundPath);
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    video.style.objectFit = settings.backgroundFit === 'contain' ? 'contain' : 'cover';
    bg.appendChild(video);
  }

  if (settings.leavesEnabled) {
    leaves.classList.remove('hidden');
    spawnLeaves(leaves);
  }
}

function playDefaultChime(volume) {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.18;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(volume * 0.35, start + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.95);
    });
  } catch (err) {
    console.error('Default chime failed', err);
  }
}

function playSound(settings) {
  if (!settings.soundEnabled) return;
  const vol = Math.max(0, Math.min(1, (settings.soundVolume || 0) / 100));
  if (settings.soundPath) {
    const audio = document.getElementById('chime');
    audio.src = fileUrl(settings.soundPath);
    audio.volume = vol;
    audio.play().catch((err) => {
      console.error('Custom sound failed, falling back to chime', err);
      playDefaultChime(vol);
    });
    return;
  }
  playDefaultChime(vol);
}

function setupSkip(settings) {
  const btn = document.getElementById('skip');
  if (!settings.skipEnabled) {
    btn.remove();
    return;
  }
  const reveal = () => btn.classList.remove('hidden');
  if (settings.skipAfterSeconds > 0) {
    setTimeout(reveal, settings.skipAfterSeconds * 1000);
  } else {
    reveal();
  }
  btn.addEventListener('click', () => window.api.skipBreak());
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !btn.classList.contains('hidden')) {
      window.api.skipBreak();
    }
  });
}

function startCountdown(totalSeconds) {
  const cdEls = document.querySelectorAll('.cd-center, .countdown-inline');
  const prog = document.getElementById('progress');
  let remaining = totalSeconds;

  const fmt = (s) => {
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return mm > 0 ? `${mm}:${String(ss).padStart(2, '0')}` : String(ss);
  };

  const render = () => {
    const text = fmt(remaining);
    cdEls.forEach((el) => (el.textContent = text));
    const elapsed = totalSeconds - remaining;
    prog.style.width = `${Math.max(0, Math.min(100, (elapsed / totalSeconds) * 100))}%`;
  };

  render();
  const itv = setInterval(() => {
    remaining -= 1;
    render();
    if (remaining <= 0) {
      clearInterval(itv);
      window.api.skipBreak();
    }
  }, 1000);
}

async function init() {
  const settings = await window.api.getSettings();
  document.getElementById('title').textContent = settings.title || 'Hey, watch out!';
  document.getElementById('subtitle').textContent = settings.subtitle || '';
  document.body.style.color = settings.textColor || '#ffffff';

  const pos = ['center', 'left', 'right', 'hidden'].includes(settings.countdownPosition)
    ? settings.countdownPosition
    : 'center';
  document.body.classList.add(`cd-mode-${pos}`);

  applyBackground(settings);
  playSound(settings);
  setupSkip(settings);
  startCountdown(Math.max(5, settings.breakDurationSeconds));
}

init();
