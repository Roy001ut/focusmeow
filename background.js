/**
 * FocusMeow - Background Service Worker
 * 职责：URL 监听、黑白名单比对、状态广播、模式管理
 */

// ─────────────────────────────────────────────
// 默认黑白名单规则（glob 模式，存入 storage）
// ─────────────────────────────────────────────
const DEFAULT_RULES = {
  whitelist: [
    '*.edu',
    '*.edu.cn',
    'scholar.google.com',
    'arxiv.org',
    'pubmed.ncbi.nlm.nih.gov',
    'stackoverflow.com',
    'github.com',
    'developer.mozilla.org',
    'docs.python.org',
    'leetcode.com',
    'notion.so',
    'obsidian.md',
  ],
  blacklist: [
    '*.netflix.com',
    '*.tiktok.com',
    '*.douyin.com',
    'youtube.com/watch*',  // 精确匹配 watch 页，排除教学视频整站屏蔽
    'bilibili.com',
    '*.twitch.tv',
    'weibo.com',
    'tieba.baidu.com',
    '*.game*',
    'steamcommunity.com',
  ],
};

// ─────────────────────────────────────────────
// 心情枚举
// ─────────────────────────────────────────────
const MOOD = {
  IDLE:        'idle',        // 休闲 - 默认放松
  SLEEP:       'sleep',       // 休闲 - 打盹
  STRETCH:     'stretch',     // 休闲 - 舒展
  FOCUSED:     'focused',     // 工作 - 白名单，加油鼓励
  DISTRACTED:  'distracted',  // 工作 - 黑名单，生气背身
};

// ─────────────────────────────────────────────
// 内存状态（Service Worker 重启后从 storage 恢复）
// ─────────────────────────────────────────────
let appState = {
  mode: 'leisure',   // 'work' | 'leisure'
  currentMood: MOOD.IDLE,
};

// ─────────────────────────────────────────────
// 初始化：从 storage 加载配置
// ─────────────────────────────────────────────
async function init() {
  const stored = await chrome.storage.sync.get({
    mode: 'leisure',
    whitelist: DEFAULT_RULES.whitelist,
    blacklist: DEFAULT_RULES.blacklist,
  });
  appState.mode = stored.mode;

  // 确保默认规则已写入（首次安装）
  await chrome.storage.sync.set({
    whitelist: stored.whitelist,
    blacklist: stored.blacklist,
  });
}

// ─────────────────────────────────────────────
// URL 模式匹配（支持 *.domain.com 和 domain.com/path* 两种通配符）
// ─────────────────────────────────────────────
function patternToRegex(pattern) {
  // 转义除 * 之外的正则特殊字符
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  // 将 * 替换为 .* 通配
  const regexStr = escaped.replace(/\*/g, '.*');
  return new RegExp(regexStr, 'i');
}

function matchesAnyPattern(url, patterns) {
  try {
    const { hostname, href } = new URL(url);
    return patterns.some(p => {
      const rx = patternToRegex(p);
      // 同时测试 hostname 和完整 href
      return rx.test(hostname) || rx.test(href);
    });
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────
// 核心：根据当前 tab URL 和模式，计算应有心情
// ─────────────────────────────────────────────
async function computeMood(url) {
  if (!url || url.startsWith('chrome://') || url.startsWith('about:')) {
    return MOOD.IDLE;
  }

  const { mode, whitelist, blacklist } = await chrome.storage.sync.get({
    mode: appState.mode,
    whitelist: DEFAULT_RULES.whitelist,
    blacklist: DEFAULT_RULES.blacklist,
  });

  if (mode === 'leisure') {
    // 休闲模式：随机在 idle / stretch / sleep 之间轮换，交给 content script 自行决定
    return MOOD.IDLE;
  }

  // 工作模式：白名单优先
  if (matchesAnyPattern(url, whitelist)) return MOOD.FOCUSED;
  if (matchesAnyPattern(url, blacklist)) return MOOD.DISTRACTED;
  return MOOD.IDLE; // 中性页面
}

// ─────────────────────────────────────────────
// 向指定 tab 发送心情更新消息（忽略 tab 尚未注入脚本的错误）
// ─────────────────────────────────────────────
async function broadcastMoodToTab(tabId, mood, mode) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'FOCUSMEOW_MOOD_CHANGE',
      mood,
      mode,
    });
  } catch {
    // Content script 未就绪（如 chrome:// 页面），静默忽略
  }
}

// ─────────────────────────────────────────────
// 处理单个 tab 状态更新
// ─────────────────────────────────────────────
async function handleTabChange(tabId, url) {
  if (!tabId || !url) return;
  const { mode } = await chrome.storage.sync.get({ mode: appState.mode });
  const mood = await computeMood(url);
  appState.currentMood = mood;
  await broadcastMoodToTab(tabId, mood, mode);
}

// ─────────────────────────────────────────────
// Tab 事件监听
// ─────────────────────────────────────────────

// 页面导航完成（包含 URL 变化）
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab.active) return;
  await handleTabChange(tabId, tab.url);
});

// 切换激活 tab
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    await handleTabChange(tabId, tab.url);
  } catch {
    // tab 已关闭
  }
});

// storage 变化时（用户更新 URL 规则或模式），重新评估当前 tab
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'sync') return;
  if (!('mode' in changes) && !('whitelist' in changes) && !('blacklist' in changes)) return;

  if ('mode' in changes) {
    appState.mode = changes.mode.newValue;
  }

  // 重新计算当前 active tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (activeTab) {
    await handleTabChange(activeTab.id, activeTab.url);
  }
});

// ─────────────────────────────────────────────
// 来自 Popup / Options 的消息处理
// ─────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'SET_MODE') {
    appState.mode = message.mode;
    chrome.storage.sync.set({ mode: message.mode });
    // 异步处理后不能直接 sendResponse，需返回 true 保持通道开启
    (async () => {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab) await handleTabChange(activeTab.id, activeTab.url);
      sendResponse({ ok: true, mode: appState.mode });
    })();
    return true; // 保持消息通道
  }

  if (message.type === 'GET_STATE') {
    sendResponse({ mode: appState.mode, mood: appState.currentMood });
    return false;
  }
});

// ─────────────────────────────────────────────
// Service Worker 启动
// ─────────────────────────────────────────────
init();
