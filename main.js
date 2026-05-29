const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Tray,
  Menu,
  dialog,
  nativeImage,
  shell,
} = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store({
  defaults: {
    intervalMinutes: 20,
    breakDurationSeconds: 20,
    fadeInSeconds: 1.5,
    fadeOutSeconds: 0.5,
    backgroundType: 'default',
    backgroundPath: '',
    backgroundFit: 'cover',
    leavesEnabled: true,
    soundEnabled: false,
    soundPath: '',
    soundVolume: 50,
    title: 'Hey, watch out!',
    subtitle: 'Take a break. Look away. Breathe.',
    textColor: '#ffffff',
    backgroundColor: '#16352a',
    countdownPosition: 'center',
    skipEnabled: true,
    skipAfterSeconds: 0,
    miniBarEnabled: true,
    miniBarPosition: { x: 40, y: 40 },
    paused: false,
    autostart: false,
  },
});

function applyAutoStart() {
  const enabled = !!store.get('autostart');
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true,
    args: [],
  });
}

(function migrateStore() {
  const v = store.get('soundVolume');
  if (typeof v === 'number' && v <= 1) {
    store.set('soundVolume', Math.round(v * 100));
  }
})();

function fadeWindowOpacity(win, fromOpacity, toOpacity, durationMs) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed() || durationMs <= 0) {
      if (win && !win.isDestroyed()) win.setOpacity(toOpacity);
      resolve();
      return;
    }
    const start = Date.now();
    win.setOpacity(fromOpacity);
    const itv = setInterval(() => {
      if (win.isDestroyed()) {
        clearInterval(itv);
        resolve();
        return;
      }
      const t = Math.min(1, (Date.now() - start) / durationMs);
      const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      win.setOpacity(fromOpacity + (toOpacity - fromOpacity) * eased);
      if (t >= 1) {
        clearInterval(itv);
        resolve();
      }
    }, 16);
  });
}

let overlayWindows = [];
let settingsWindow = null;
let miniBar = null;
let tray = null;
let breakTimer = null;
let nextBreakAt = null;
let isBreakActive = false;

function scheduleNextBreak() {
  if (breakTimer) {
    clearTimeout(breakTimer);
    breakTimer = null;
  }
  if (store.get('paused')) {
    nextBreakAt = null;
    broadcast('tick', { nextBreakAt: null, paused: true });
    return;
  }
  const ms = Math.max(1, store.get('intervalMinutes')) * 60 * 1000;
  nextBreakAt = Date.now() + ms;
  breakTimer = setTimeout(startBreak, ms);
  broadcast('tick', { nextBreakAt, paused: false });
}

function startBreak() {
  if (isBreakActive) return;
  isBreakActive = true;
  if (breakTimer) {
    clearTimeout(breakTimer);
    breakTimer = null;
  }
  const fadeInMs = Math.max(0, store.get('fadeInSeconds') * 1000);
  const isMac = process.platform === 'darwin';
  const displays = screen.getAllDisplays();
  overlayWindows = displays.map((display) => {
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      focusable: true,
      hasShadow: false,
      fullscreenable: false,
      backgroundColor: '#000000',
      show: false,
      opacity: 0,
      simpleFullscreen: isMac,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    win.setBounds({ x, y, width, height });
    if (isMac) win.setSimpleFullScreen(true);
    win.loadFile(path.join(__dirname, 'renderer', 'overlay.html'));
    win._fadeInMs = fadeInMs;
    win._bounds = { x, y, width, height };
    return win;
  });
  refreshTrayMenu();
}

async function endBreak() {
  if (!isBreakActive) return;
  isBreakActive = false;
  const fadeOutMs = Math.max(0, store.get('fadeOutSeconds') * 1000);
  const wins = overlayWindows.slice();
  overlayWindows = [];
  if (fadeOutMs > 0) {
    await Promise.all(
      wins.map((w) => (w && !w.isDestroyed() ? fadeWindowOpacity(w, w.getOpacity(), 0, fadeOutMs) : null))
    );
  }
  wins.forEach((w) => {
    if (w && !w.isDestroyed()) w.destroy();
  });
  scheduleNextBreak();
  refreshTrayMenu();
}

function broadcast(channel, payload) {
  if (miniBar && !miniBar.isDestroyed()) miniBar.webContents.send(channel, payload);
  if (settingsWindow && !settingsWindow.isDestroyed())
    settingsWindow.webContents.send(channel, payload);
}

ipcMain.handle('get-settings', () => store.store);

ipcMain.handle('set-settings', (_e, partial) => {
  Object.entries(partial).forEach(([k, v]) => store.set(k, v));
  applySettingsChange();
  return store.store;
});

ipcMain.handle('skip-break', () => {
  endBreak();
  return true;
});

ipcMain.handle('trigger-break-now', () => {
  startBreak();
  return true;
});

ipcMain.handle('toggle-pause', () => {
  togglePause();
  return store.get('paused');
});

ipcMain.handle('pick-file', async (_e, filters) => {
  const r = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: filters || [],
  });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('reveal-file', (_e, p) => {
  if (p) shell.showItemInFolder(p);
});

ipcMain.handle('get-state', () => ({
  isBreakActive,
  nextBreakAt,
  paused: store.get('paused'),
}));

ipcMain.handle('open-settings', () => createSettingsWindow());

ipcMain.handle('move-mini-bar-corner', (_e, corner) => {
  moveMiniBarToCorner(corner);
  return store.get('miniBarPosition');
});

ipcMain.on('overlay-ready', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win || win.isDestroyed()) return;
  if (win._bounds) win.setBounds(win._bounds);
  win.setOpacity(0);
  win.show();
  win.focus();
  fadeWindowOpacity(win, 0, 1, win._fadeInMs || 0);
});

function applySettingsChange() {
  if (!isBreakActive) scheduleNextBreak();
  const wantMini = store.get('miniBarEnabled');
  if (wantMini && !miniBar) createMiniBar();
  if (!wantMini && miniBar) {
    miniBar.destroy();
    miniBar = null;
  }
  applyAutoStart();
  refreshTrayMenu();
}

function createMiniBar() {
  if (miniBar && !miniBar.isDestroyed()) return;
  const pos = store.get('miniBarPosition');
  miniBar = new BrowserWindow({
    width: 170,
    height: 32,
    x: pos.x,
    y: pos.y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    focusable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  miniBar.setAlwaysOnTop(true, 'floating');
  miniBar.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  miniBar.loadFile(path.join(__dirname, 'renderer', 'minibar.html'));
  miniBar.on('move', () => {
    if (!miniBar) return;
    const [x, y] = miniBar.getPosition();
    store.set('miniBarPosition', { x, y });
  });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  const iconFile = process.platform === 'win32' ? 'icon.ico' : 'icon.icns';
  settingsWindow = new BrowserWindow({
    width: 640,
    height: 780,
    title: 'Hey Watch Out — Settings',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'assets', iconFile),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray.png');
  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    image = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAUElEQVQ4jWNgGAWjYBSMAjygQwLBfwYGhv8MeOzJBjBBwAA+S5gYGBjeM+BQiE0BLkUwBQwMDDB/4FKAUwETAwMDPwODwn8GBgYGBobBBgBlxAcCmnsbtAAAAABJRU5ErkJggg=='
    );
  }
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Hey Watch Out');
  refreshTrayMenu();
  tray.on('click', () => {
    if (process.platform === 'win32') createSettingsWindow();
  });
}

function refreshTrayMenu() {
  if (!tray) return;
  const paused = store.get('paused');
  const menu = Menu.buildFromTemplate([
    { label: 'Hey Watch Out', enabled: false },
    { type: 'separator' },
    {
      label: isBreakActive ? 'End break' : 'Take a break now',
      click: () => (isBreakActive ? endBreak() : startBreak()),
    },
    {
      label: paused ? 'Resume reminders' : 'Pause reminders',
      click: () => togglePause(),
    },
    { label: 'Settings…', click: () => createSettingsWindow() },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function moveMiniBarToCorner(corner) {
  if (!miniBar || miniBar.isDestroyed()) {
    if (store.get('miniBarEnabled')) createMiniBar();
    if (!miniBar || miniBar.isDestroyed()) return;
  }
  const [bx, by] = miniBar.getPosition();
  const [w, h] = miniBar.getSize();
  const display = screen.getDisplayMatching({ x: bx, y: by, width: w, height: h });
  const { x, y, width, height } = display.workArea;
  const margin = 20;
  let nx = x + margin;
  let ny = y + margin;
  if (corner === 'top-right') {
    nx = x + width - w - margin;
    ny = y + margin;
  } else if (corner === 'bottom-left') {
    nx = x + margin;
    ny = y + height - h - margin;
  } else if (corner === 'bottom-right') {
    nx = x + width - w - margin;
    ny = y + height - h - margin;
  }
  miniBar.setPosition(nx, ny);
  store.set('miniBarPosition', { x: nx, y: ny });
}

function togglePause() {
  const paused = !store.get('paused');
  store.set('paused', paused);
  if (paused) {
    if (breakTimer) clearTimeout(breakTimer);
    breakTimer = null;
    nextBreakAt = null;
    broadcast('tick', { nextBreakAt: null, paused: true });
  } else {
    scheduleNextBreak();
  }
  refreshTrayMenu();
}

app.on('window-all-closed', (e) => {
  e.preventDefault();
});

app.whenReady().then(() => {
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  applyAutoStart();
  createTray();
  if (store.get('miniBarEnabled')) createMiniBar();
  if (!store.get('paused')) scheduleNextBreak();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (breakTimer) clearTimeout(breakTimer);
});
