/**
 * FocusMeow - Popup Script
 */

const btnLeisure = document.getElementById('btn-leisure');
const btnWork    = document.getElementById('btn-work');
const statusDot  = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

// ── 加载当前状态 ──────────────────────────────
chrome.runtime.sendMessage({ type: 'GET_STATE' }, (resp) => {
  if (chrome.runtime.lastError || !resp) return;
  applyMode(resp.mode, resp.mood);
});

// ── 模式切换 ──────────────────────────────────
btnLeisure.addEventListener('click', () => switchMode('leisure'));
btnWork.addEventListener('click',    () => switchMode('work'));

function switchMode(mode) {
  chrome.runtime.sendMessage({ type: 'SET_MODE', mode }, (resp) => {
    if (resp) applyMode(resp.mode, null);
  });
}

function applyMode(mode, mood) {
  btnLeisure.classList.toggle('active', mode === 'leisure');
  btnWork.classList.toggle('active',    mode === 'work');

  if (mode === 'leisure') {
    setStatus('idle', '休闲模式 · 宠物正在放松');
    return;
  }

  // 工作模式下展示当前 URL 心情
  const moodMap = {
    focused:    ['focused',    '专注页面 · 加油！'],
    distracted: ['distracted', '摸鱼警告 · 快回来！'],
    idle:       ['idle',       '专注模式 · 监控中…'],
  };
  const [dotClass, text] = moodMap[mood] || moodMap['idle'];
  setStatus(dotClass, text);
}

function setStatus(dotClass, text) {
  statusDot.className = 'status-dot ' + dotClass;
  statusText.textContent = text;
}

// ── 快捷操作 ─────────────────────────────────
document.getElementById('btn-hide').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'FOCUSMEOW_TOGGLE_HIDE', hide: true });
  window.close();
});

document.getElementById('btn-show').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'FOCUSMEOW_TOGGLE_HIDE', hide: false });
  window.close();
});

document.getElementById('btn-pet').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { type: 'FOCUSMEOW_PET' });
  window.close();
});

document.getElementById('btn-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById('link-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
