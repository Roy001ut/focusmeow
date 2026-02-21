/**
 * FocusMeow - Options Page Script
 * 职责：URL 规则 CRUD、自定义贴图上传/裁剪/应用
 */

// ─────────────────────────────────────────────
// Tab 切换
// ─────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ─────────────────────────────────────────────
// 工具：Toast 提示
// ─────────────────────────────────────────────
function showToast(msg = '设置已保存', color = '#4caf50') {
  const el = document.getElementById('save-toast');
  el.textContent = '✓ ' + msg;
  el.style.background = color;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ─────────────────────────────────────────────
// ① URL 规则管理
// ─────────────────────────────────────────────
const DEFAULT_WHITELIST = [
  '*.edu', '*.edu.cn', 'scholar.google.com', 'arxiv.org',
  'stackoverflow.com', 'github.com', 'developer.mozilla.org',
  'leetcode.com', 'notion.so',
];
const DEFAULT_BLACKLIST = [
  '*.netflix.com', '*.tiktok.com', 'youtube.com/watch*',
  'bilibili.com', '*.twitch.tv', 'weibo.com',
];

let whitelist = [...DEFAULT_WHITELIST];
let blacklist = [...DEFAULT_BLACKLIST];

async function loadRules() {
  const stored = await chrome.storage.sync.get({
    whitelist: DEFAULT_WHITELIST,
    blacklist: DEFAULT_BLACKLIST,
  });
  whitelist = stored.whitelist;
  blacklist = stored.blacklist;
  renderRules();
}

async function saveRules() {
  await chrome.storage.sync.set({ whitelist, blacklist });
  showToast();
}

function renderRules() {
  renderList('whitelist-container', whitelist, 'whitelist');
  renderList('blacklist-container', blacklist, 'blacklist');
}

function renderList(containerId, rules, type) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  if (rules.length === 0) {
    container.innerHTML = '<p style="color:#ccc;font-size:13px;padding:8px 0">暂无规则</p>';
    return;
  }
  rules.forEach((rule, idx) => {
    const item = document.createElement('div');
    item.className = 'rule-item ' + type;
    item.innerHTML = `
      <span class="rule-pattern">${escapeHtml(rule)}</span>
      <button class="btn-del" data-idx="${idx}" data-type="${type}">删除</button>
    `;
    container.appendChild(item);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 添加规则
document.getElementById('btn-add-white').addEventListener('click', () => {
  const val = document.getElementById('input-whitelist').value.trim();
  if (!val) return;
  if (!whitelist.includes(val)) {
    whitelist.push(val);
    saveRules();
    renderRules();
  }
  document.getElementById('input-whitelist').value = '';
});

document.getElementById('btn-add-black').addEventListener('click', () => {
  const val = document.getElementById('input-blacklist').value.trim();
  if (!val) return;
  if (!blacklist.includes(val)) {
    blacklist.push(val);
    saveRules();
    renderRules();
  }
  document.getElementById('input-blacklist').value = '';
});

// 回车快捷添加
document.getElementById('input-whitelist').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-white').click();
});
document.getElementById('input-blacklist').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btn-add-black').click();
});

// 删除规则（事件委托）
document.getElementById('whitelist-container').addEventListener('click', handleDelete);
document.getElementById('blacklist-container').addEventListener('click', handleDelete);

function handleDelete(e) {
  if (!e.target.classList.contains('btn-del')) return;
  const idx  = parseInt(e.target.dataset.idx, 10);
  const type = e.target.dataset.type;
  if (type === 'whitelist') whitelist.splice(idx, 1);
  else                      blacklist.splice(idx, 1);
  saveRules();
  renderRules();
}

loadRules();

// ─────────────────────────────────────────────
// ② 自定义贴图：Canvas 裁剪
// ─────────────────────────────────────────────
const uploadZone   = document.getElementById('upload-zone');
const uploadInput  = document.getElementById('upload-input');
const previewImg   = document.getElementById('preview-img');
const cropCanvas   = document.getElementById('crop-canvas');
const ctx          = cropCanvas.getContext('2d');

let sourceImage  = null;  // HTMLImageElement
let cropScale    = 1;     // 缩放比例
let cropOffsetX  = 0;     // 图片在 canvas 中的偏移
let cropOffsetY  = 0;
let isDraggingCrop = false;
let lastMouseX   = 0;
let lastMouseY   = 0;

// 点击上传区触发文件选择
uploadZone.addEventListener('click', () => uploadInput.click());
uploadInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    previewImg.src = ev.target.result;
    previewImg.style.display = 'block';
    uploadZone.querySelector('span').style.display = 'none';
    uploadZone.querySelector('.icon').style.display = 'none';

    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      // 初始缩放：让图片适应 200×200 的 canvas
      cropScale = Math.max(200 / img.width, 200 / img.height);
      cropOffsetX = (200 - img.width  * cropScale) / 2;
      cropOffsetY = (200 - img.height * cropScale) / 2;
      drawCropPreview();
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

// 拖拽移动裁剪区域
cropCanvas.addEventListener('mousedown', (e) => {
  isDraggingCrop = true;
  lastMouseX = e.offsetX;
  lastMouseY = e.offsetY;
  cropCanvas.style.cursor = 'grabbing';
});
cropCanvas.addEventListener('mousemove', (e) => {
  if (!isDraggingCrop || !sourceImage) return;
  cropOffsetX += e.offsetX - lastMouseX;
  cropOffsetY += e.offsetY - lastMouseY;
  lastMouseX = e.offsetX;
  lastMouseY = e.offsetY;
  drawCropPreview();
});
cropCanvas.addEventListener('mouseup',   () => { isDraggingCrop = false; cropCanvas.style.cursor = 'grab'; });
cropCanvas.addEventListener('mouseleave', () => { isDraggingCrop = false; cropCanvas.style.cursor = 'default'; });

// 滚轮缩放
cropCanvas.addEventListener('wheel', (e) => {
  if (!sourceImage) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.05 : 0.05;
  cropScale = Math.max(0.3, Math.min(cropScale + delta, 5));
  drawCropPreview();
}, { passive: false });

// 缩放按钮
document.getElementById('btn-zoom-in').addEventListener('click', () => {
  if (!sourceImage) return;
  cropScale = Math.min(cropScale + 0.1, 5);
  drawCropPreview();
});
document.getElementById('btn-zoom-out').addEventListener('click', () => {
  if (!sourceImage) return;
  cropScale = Math.max(cropScale - 0.1, 0.3);
  drawCropPreview();
});

function drawCropPreview() {
  ctx.clearRect(0, 0, 200, 200);

  if (!sourceImage) {
    ctx.fillStyle = '#f0e8e0';
    ctx.fillRect(0, 0, 200, 200);
    ctx.fillStyle = '#ccc';
    ctx.font = '13px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText('上传图片后预览', 100, 105);
    return;
  }

  ctx.drawImage(
    sourceImage,
    cropOffsetX,
    cropOffsetY,
    sourceImage.width  * cropScale,
    sourceImage.height * cropScale
  );

  // 圆形裁剪辅助线
  ctx.save();
  ctx.strokeStyle = 'rgba(255,110,150,.7)';
  ctx.lineWidth   = 2;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.arc(100, 100, 88, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// 初始空白预览
drawCropPreview();

// 应用贴图：从 canvas 裁剪圆形区域，转为 DataURL 存入 storage
document.getElementById('btn-apply-skin').addEventListener('click', async () => {
  if (!sourceImage) { showToast('请先上传图片', '#f44336'); return; }

  // 在离屏 canvas 上绘制圆形裁剪结果
  const offscreen = document.createElement('canvas');
  offscreen.width  = 176; // 等比于 SVG 内 r=24 * 200/120
  offscreen.height = 176;
  const offCtx = offscreen.getContext('2d');

  // 圆形裁剪 clip
  offCtx.beginPath();
  offCtx.arc(88, 88, 88, 0, Math.PI * 2);
  offCtx.clip();

  // 将 crop canvas 中心 88px 圆范围缩放到 offscreen
  const srcX = 100 - 88;
  const srcY = 100 - 88;
  offCtx.drawImage(cropCanvas, srcX, srcY, 176, 176, 0, 0, 176, 176);

  const dataUrl = offscreen.toDataURL('image/png', 0.92);

  // storage.sync 单个 item 上限 8KB，压缩后的头像通常在 5-8KB 内
  // 如果超出，建议改用 storage.local
  try {
    await chrome.storage.sync.set({ customFaceDataUrl: dataUrl });
    showToast('贴图已应用！重新打开网页生效');
  } catch (err) {
    // 超出 sync 大小限制，退回 local storage
    await chrome.storage.local.set({ customFaceDataUrl: dataUrl });
    showToast('已存储到本地（图片较大）');
  }
});

// 移除贴图
document.getElementById('btn-clear-skin').addEventListener('click', async () => {
  await chrome.storage.sync.remove('customFaceDataUrl');
  await chrome.storage.local.remove('customFaceDataUrl');
  sourceImage = null;
  previewImg.style.display = 'none';
  uploadZone.querySelector('span').style.display = '';
  uploadZone.querySelector('.icon').style.display = '';
  drawCropPreview();
  showToast('已移除自定义贴图');
});
