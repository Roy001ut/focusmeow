/**
 * FocusMeow - Content Script
 * 职责：Shadow DOM 注入、SVG 猫咪渲染、动画状态机、拖拽、交互
 */

// ─────────────────────────────────────────────
// 防止重复注入（SPA 路由切换时可能触发多次）
// ─────────────────────────────────────────────
if (document.getElementById('focusmeow-host')) {
  // 已注入，仅更新监听即可
} else {
  initFocusMeow();
}

function initFocusMeow() {
  // ─────────────────────────────────────────────
  // 1. 创建宿主元素 + Shadow DOM（完全隔离 CSS）
  // ─────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = 'focusmeow-host';
  // 宿主本身：固定定位、透明背景、不拦截下方点击（resting state）
  Object.assign(host.style, {
    position:  'fixed',
    bottom:    '24px',
    right:     '24px',
    width:     '120px',
    height:    '160px',
    zIndex:    '2147483647', // 最高层
    cursor:    'grab',
    userSelect: 'none',
    // 宿主本身透明，不遮挡页面
    background: 'transparent',
    border:    'none',
    padding:   '0',
    margin:    '0',
    overflow:  'visible',
  });
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ─────────────────────────────────────────────
  // 2. 注入 CSS（包含所有动画关键帧）
  // ─────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = getCatCSS();
  shadow.appendChild(style);

  // ─────────────────────────────────────────────
  // 3. 注入 SVG 猫咪
  // ─────────────────────────────────────────────
  const wrapper = document.createElement('div');
  wrapper.className = 'cat-wrapper mood-idle';
  wrapper.innerHTML = getCatSVG();
  shadow.appendChild(wrapper);

  // ─────────────────────────────────────────────
  // 4. 气泡容器（点击/Hover 时浮现文字）
  // ─────────────────────────────────────────────
  const bubble = document.createElement('div');
  bubble.className = 'bubble hidden';
  shadow.appendChild(bubble);

  // ─────────────────────────────────────────────
  // 5. 拖拽实现（Pointer Events API）
  // ─────────────────────────────────────────────
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  // 保存当前的 right/bottom 值，改用 left/top 在拖拽中定位
  let posX = window.innerWidth  - 24 - 120; // right:24
  let posY = window.innerHeight - 24 - 160; // bottom:24

  host.addEventListener('pointerdown', (e) => {
    // 只响应左键
    if (e.button !== 0) return;
    isDragging = true;
    host.setPointerCapture(e.pointerId);

    // 切换到 left/top 定位，避免 bottom/right 与鼠标坐标换算混乱
    const rect = host.getBoundingClientRect();
    posX = rect.left;
    posY = rect.top;
    host.style.right  = 'auto';
    host.style.bottom = 'auto';
    host.style.left   = posX + 'px';
    host.style.top    = posY + 'px';

    dragOffsetX = e.clientX - rect.left;
    dragOffsetY = e.clientY - rect.top;

    host.style.cursor = 'grabbing';
    wrapper.classList.add('is-dragging');
    e.preventDefault();
  });

  host.addEventListener('pointermove', (e) => {
    if (!isDragging) return;
    posX = e.clientX - dragOffsetX;
    posY = e.clientY - dragOffsetY;

    // 边界约束：不超出视口
    posX = Math.max(0, Math.min(posX, window.innerWidth  - 120));
    posY = Math.max(0, Math.min(posY, window.innerHeight - 160));

    host.style.left = posX + 'px';
    host.style.top  = posY + 'px';
    e.preventDefault();
  });

  host.addEventListener('pointerup', (e) => {
    if (!isDragging) return;
    isDragging = false;
    host.releasePointerCapture(e.pointerId);
    host.style.cursor = 'grab';
    wrapper.classList.remove('is-dragging');
  });

  // ─────────────────────────────────────────────
  // 6. Click 交互：爱心冒泡 + 喵语气泡
  // ─────────────────────────────────────────────
  const CLICK_TEXTS = ['喵~', '干嘛啦！', '揉揉头~', '(=^ω^=)'];

  host.addEventListener('click', (e) => {
    // 拖拽结束时 pointerup 会触发 click，通过位移量过滤掉
    if (wasDragging) { wasDragging = false; return; }

    showBubble(CLICK_TEXTS[Math.floor(Math.random() * CLICK_TEXTS.length)]);
    spawnHearts(shadow, host);
  });

  let wasDragging = false;
  host.addEventListener('pointermove', () => { if (isDragging) wasDragging = true; });

  // Hover 悬停：尾巴加速
  host.addEventListener('mouseenter', () => wrapper.classList.add('is-hover'));
  host.addEventListener('mouseleave', () => wrapper.classList.remove('is-hover'));

  // ─────────────────────────────────────────────
  // 7. 心情状态机
  // ─────────────────────────────────────────────
  const MOOD_CLASSES = ['mood-idle', 'mood-sleep', 'mood-stretch',
                        'mood-focused', 'mood-distracted'];

  function setMood(mood) {
    MOOD_CLASSES.forEach(c => wrapper.classList.remove(c));
    wrapper.classList.add('mood-' + mood);
  }

  // 休闲模式下自动轮换动画
  let leisureTimer = null;
  const LEISURE_SEQUENCE = [
    { mood: 'idle',    duration: 8000  },
    { mood: 'stretch', duration: 4000  },
    { mood: 'idle',    duration: 6000  },
    { mood: 'sleep',   duration: 10000 },
  ];
  let leisureIdx = 0;

  function startLeisureCycle() {
    stopLeisureCycle();
    function next() {
      const { mood, duration } = LEISURE_SEQUENCE[leisureIdx % LEISURE_SEQUENCE.length];
      setMood(mood);
      leisureIdx++;
      leisureTimer = setTimeout(next, duration);
    }
    next();
  }

  function stopLeisureCycle() {
    if (leisureTimer) { clearTimeout(leisureTimer); leisureTimer = null; }
  }

  // ─────────────────────────────────────────────
  // 8. 监听 Background 发来的心情变化消息
  // ─────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'FOCUSMEOW_MOOD_CHANGE') return;

    const { mood, mode } = message;

    if (mode === 'leisure') {
      startLeisureCycle();
      return;
    }

    // 工作模式：直接由 background 指定心情
    stopLeisureCycle();
    setMood(mood);

    // 分心时显示提示气泡
    if (mood === 'distracted') {
      setTimeout(() => showBubble('该专注啦！╭(╯ε╰)╮'), 600);
    } else if (mood === 'focused') {
      setTimeout(() => showBubble('加油！你最棒 ★'), 600);
    }
  });

  // ─────────────────────────────────────────────
  // 9. 自定义贴图：监听 storage 变化更新头像
  // ─────────────────────────────────────────────
  async function loadCustomFace() {
    const { customFaceDataUrl } = await chrome.storage.sync.get({ customFaceDataUrl: '' });
    if (customFaceDataUrl) {
      const img = shadow.querySelector('#custom-face-img');
      if (img) img.setAttribute('href', customFaceDataUrl);
    }
  }
  loadCustomFace();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && 'customFaceDataUrl' in changes) {
      const img = shadow.querySelector('#custom-face-img');
      if (img) img.setAttribute('href', changes.customFaceDataUrl.newValue || '');
    }
  });

  // ─────────────────────────────────────────────
  // 10. 初始化：向 Background 请求当前状态
  // ─────────────────────────────────────────────
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (resp) => {
    if (chrome.runtime.lastError || !resp) { startLeisureCycle(); return; }
    if (resp.mode === 'leisure') {
      startLeisureCycle();
    } else {
      setMood(resp.mood || 'idle');
    }
  });

  // ─────────────────────────────────────────────
  // 辅助：气泡显示
  // ─────────────────────────────────────────────
  let bubbleTimer = null;
  function showBubble(text) {
    bubble.textContent = text;
    bubble.classList.remove('hidden');
    bubble.classList.add('visible');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = setTimeout(() => {
      bubble.classList.remove('visible');
      bubble.classList.add('hidden');
    }, 2200);
  }

  // ─────────────────────────────────────────────
  // 辅助：爱心粒子
  // ─────────────────────────────────────────────
  function spawnHearts(shadowRoot, hostEl) {
    const HEARTS = ['♡', '♥', '✿', '★'];
    for (let i = 0; i < 5; i++) {
      const h = document.createElement('span');
      h.className = 'heart-particle';
      h.textContent = HEARTS[i % HEARTS.length];
      h.style.setProperty('--dx', (Math.random() * 60 - 30) + 'px');
      h.style.setProperty('--dy', -(Math.random() * 60 + 30) + 'px');
      h.style.left = (30 + Math.random() * 60) + 'px';
      h.style.top  = '30px';
      shadowRoot.appendChild(h);
      h.addEventListener('animationend', () => h.remove());
    }
  }
}

// ─────────────────────────────────────────────
// SVG 猫咪模板（骨架 + 自定义脸部贴图 overlay）
// ─────────────────────────────────────────────
function getCatSVG() {
  return `
<svg id="cat-svg" viewBox="0 0 120 160" xmlns="http://www.w3.org/2000/svg"
     xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs>
    <!-- 脸部圆形裁剪区域，用于用户自定义贴图 -->
    <clipPath id="face-clip">
      <circle cx="60" cy="62" r="24"/>
    </clipPath>
  </defs>

  <!-- ① 尾巴（身体后方，先绘制） -->
  <g class="part-tail">
    <path d="M 72 120 Q 110 115 105 95 Q 100 78 85 88 Q 75 95 78 108"
          fill="none" stroke="#e8c89a" stroke-width="9" stroke-linecap="round"/>
    <path d="M 72 120 Q 110 115 105 95 Q 100 78 85 88 Q 75 95 78 108"
          fill="none" stroke="#f9e4c4" stroke-width="5" stroke-linecap="round"/>
  </g>

  <!-- ② 身体 -->
  <g class="part-body">
    <ellipse cx="58" cy="112" rx="34" ry="38" fill="#f5ead6"/>
    <!-- 肚子 -->
    <ellipse cx="57" cy="118" rx="18" ry="22" fill="#fdf6ee"/>
  </g>

  <!-- ③ 前爪 -->
  <g class="part-paws">
    <ellipse cx="38" cy="145" rx="13" ry="9" fill="#f5ead6"/>
    <ellipse cx="76" cy="145" rx="13" ry="9" fill="#f5ead6"/>
    <!-- 爪纹 -->
    <ellipse cx="34" cy="147" rx="3.5" ry="2.5" fill="#e8c89a"/>
    <ellipse cx="40" cy="149" rx="3.5" ry="2.5" fill="#e8c89a"/>
    <ellipse cx="72" cy="147" rx="3.5" ry="2.5" fill="#e8c89a"/>
    <ellipse cx="78" cy="149" rx="3.5" ry="2.5" fill="#e8c89a"/>
  </g>

  <!-- ④ 头部 -->
  <g class="part-head">
    <!-- 耳朵外 -->
    <polygon class="ear-left"  points="28,50 35,18 52,44" fill="#f5ead6"/>
    <polygon class="ear-right" points="92,50 85,18 68,44" fill="#f5ead6"/>
    <!-- 耳朵内 -->
    <polygon points="32,47 38,24 50,42" fill="#f7c5c5"/>
    <polygon points="88,47 82,24 70,42" fill="#f7c5c5"/>
    <!-- 脑袋圆 -->
    <circle cx="60" cy="62" r="34" fill="#f5ead6"/>

    <!-- ★ 用户自定义贴图区域（默认透明，有上传时显示） -->
    <image id="custom-face-img" href=""
           x="36" y="38" width="48" height="48"
           clip-path="url(#face-clip)"
           preserveAspectRatio="xMidYMid slice"
           style="opacity:0.85"/>

    <!-- 腮红 -->
    <ellipse class="blush-left"  cx="38" cy="72" rx="8" ry="5" fill="#ffb0b0" opacity="0.4"/>
    <ellipse class="blush-right" cx="82" cy="72" rx="8" ry="5" fill="#ffb0b0" opacity="0.4"/>

    <!-- 眼睛（正常） -->
    <g class="eyes-normal">
      <ellipse class="eye-l" cx="48" cy="60" rx="6" ry="7" fill="#3a2a1a"/>
      <ellipse class="eye-r" cx="72" cy="60" rx="6" ry="7" fill="#3a2a1a"/>
      <!-- 高光 -->
      <circle cx="51" cy="57" r="2.5" fill="white"/>
      <circle cx="75" cy="57" r="2.5" fill="white"/>
      <!-- 眼睑（眨眼用，scaleY 0→1） -->
      <rect class="blink-l" x="42" y="53" width="12" height="14" rx="6" fill="#f5ead6"/>
      <rect class="blink-r" x="66" y="53" width="12" height="14" rx="6" fill="#f5ead6"/>
    </g>

    <!-- 眼睛（睡觉，弧线） -->
    <g class="eyes-sleep" style="display:none">
      <path d="M 43 62 Q 48 56 53 62" stroke="#3a2a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path d="M 67 62 Q 72 56 77 62" stroke="#3a2a1a" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </g>

    <!-- 眼睛（生气，斜线） -->
    <g class="eyes-angry" style="display:none">
      <ellipse cx="48" cy="62" rx="6" ry="5" fill="#3a2a1a"/>
      <ellipse cx="72" cy="62" rx="6" ry="5" fill="#3a2a1a"/>
      <!-- 皱眉纹 -->
      <line x1="43" y1="52" x2="53" y2="57" stroke="#c0392b" stroke-width="2.5" stroke-linecap="round"/>
      <line x1="77" y1="52" x2="67" y2="57" stroke="#c0392b" stroke-width="2.5" stroke-linecap="round"/>
    </g>

    <!-- 鼻子 -->
    <polygon class="nose" points="60,68 57,72 63,72" fill="#e88080"/>

    <!-- 嘴巴（开心↔难过，用 class 切换） -->
    <path class="mouth-happy" d="M 55 73 Q 60 79 65 73" stroke="#7a5a4a" stroke-width="1.8" fill="none" stroke-linecap="round"/>
    <path class="mouth-sad"   d="M 55 77 Q 60 72 65 77" stroke="#7a5a4a" stroke-width="1.8" fill="none" stroke-linecap="round" style="display:none"/>

    <!-- 胡须 -->
    <g class="whiskers" opacity="0.7">
      <line x1="20" y1="68" x2="48" y2="70" stroke="#bbb" stroke-width="1.2"/>
      <line x1="20" y1="73" x2="48" y2="73" stroke="#bbb" stroke-width="1.2"/>
      <line x1="72" y1="70" x2="100" y2="68" stroke="#bbb" stroke-width="1.2"/>
      <line x1="72" y1="73" x2="100" y2="73" stroke="#bbb" stroke-width="1.2"/>
    </g>
  </g>

  <!-- ⑤ 加油牌（focused 模式可见） -->
  <g class="part-sign" style="display:none">
    <rect x="68" y="90" width="46" height="28" rx="4" fill="#fff9e6" stroke="#f0c040" stroke-width="2"/>
    <text x="91" y="107" text-anchor="middle" font-size="10" fill="#d4a010" font-weight="bold"
          font-family="system-ui,sans-serif">加油！★</text>
    <!-- 牌子柄 -->
    <line x1="91" y1="118" x2="91" y2="138" stroke="#c8a060" stroke-width="3" stroke-linecap="round"/>
  </g>

  <!-- ⑥ ZZZ 气泡（sleep 模式） -->
  <g class="part-zzz" style="display:none">
    <text class="zzz-text" x="88" y="45" font-size="13" fill="#8899cc"
          font-family="system-ui,sans-serif" font-weight="bold">z</text>
    <text class="zzz-text zzz-2" x="98" y="32" font-size="16" fill="#8899cc"
          font-family="system-ui,sans-serif" font-weight="bold">z</text>
    <text class="zzz-text zzz-3" x="110" y="18" font-size="20" fill="#aabbdd"
          font-family="system-ui,sans-serif" font-weight="bold">Z</text>
  </g>
</svg>`;
}

// ─────────────────────────────────────────────
// 所有 CSS：动画 + 状态控制（注入 Shadow DOM）
// ─────────────────────────────────────────────
function getCatCSS() {
  return `
:host { all: initial; }

/* 包装器 */
.cat-wrapper {
  position: relative;
  width: 120px;
  height: 160px;
  transform-origin: bottom center;
}

/* 拖拽中轻微放大 */
.cat-wrapper.is-dragging { transform: scale(1.08); transition: transform 0.1s; }

/* ══════════════════════════════
   通用动画定义
══════════════════════════════ */

/* 尾巴摆动 */
@keyframes tail-wag {
  0%,100% { transform: rotate(0deg);   }
  35%     { transform: rotate(18deg);  }
  70%     { transform: rotate(-12deg); }
}

/* 呼吸（身体微缩放） */
@keyframes breathe {
  0%,100% { transform: scaleY(1);    }
  50%     { transform: scaleY(1.04); }
}

/* 深呼吸（睡觉） */
@keyframes breathe-deep {
  0%,100% { transform: scaleY(1);    }
  50%     { transform: scaleY(1.08) translateY(2px); }
}

/* 眨眼 */
@keyframes blink {
  0%,90%,100% { transform: scaleY(0); }
  95%         { transform: scaleY(1); }
}

/* 整体上下漂浮（idle） */
@keyframes float {
  0%,100% { transform: translateY(0);   }
  50%     { transform: translateY(-5px);}
}

/* 舒展动作：头颈部左右摆 */
@keyframes stretch-head {
  0%,100% { transform: rotate(0deg);   }
  20%     { transform: rotate(-18deg); }
  50%     { transform: rotate(15deg);  }
  75%     { transform: rotate(-8deg);  }
}

/* 舒展：身体左右拉伸 */
@keyframes stretch-body {
  0%,100% { transform: scaleX(1) scaleY(1); }
  30%     { transform: scaleX(1.15) scaleY(0.9); }
  60%     { transform: scaleX(0.9) scaleY(1.1); }
}

/* 专注：小幅左右摇摆（活泼） */
@keyframes focused-sway {
  0%,100% { transform: rotate(0deg);  }
  25%     { transform: rotate(4deg);  }
  75%     { transform: rotate(-4deg); }
}

/* 生气：抖动 */
@keyframes angry-shake {
  0%,100% { transform: translateX(0);  }
  20%     { transform: translateX(-4px); }
  40%     { transform: translateX(4px);  }
  60%     { transform: translateX(-4px); }
  80%     { transform: translateX(3px);  }
}

/* ZZZ 上浮消散 */
@keyframes zzz-float {
  0%   { opacity:0; transform: translateY(0)   scale(0.6); }
  30%  { opacity:1; }
  100% { opacity:0; transform: translateY(-24px) scale(1); }
}

/* 爱心粒子 */
@keyframes heart-burst {
  0%   { opacity:1; transform: translate(0,0) scale(1); }
  100% { opacity:0; transform: translate(var(--dx), var(--dy)) scale(0.5); }
}

/* 气泡淡入淡出 */
@keyframes bubble-in {
  from { opacity:0; transform: scale(0.7) translateY(8px); }
  to   { opacity:1; transform: scale(1)   translateY(0);   }
}

/* ══════════════════════════════
   各部件 baseline 动画（idle 状态激活）
══════════════════════════════ */
.part-tail {
  transform-origin: 72px 120px;
}

/* ── mood-idle ── */
.mood-idle .part-tail  { animation: tail-wag 2s ease-in-out infinite; }
.mood-idle .part-body  { animation: breathe 3s ease-in-out infinite;  }
.mood-idle .cat-wrapper { animation: float 4s ease-in-out infinite; }
.mood-idle .blink-l,
.mood-idle .blink-r    { transform-origin: center; animation: blink 4s infinite; }

/* ── mood-sleep ── */
.mood-sleep .eyes-normal { display: none; }
.mood-sleep .eyes-sleep  { display: block; }
.mood-sleep .part-zzz    { display: block; }
.mood-sleep .part-body   { animation: breathe-deep 5s ease-in-out infinite; }
.mood-sleep .whiskers    { opacity: 0.3; }
.mood-sleep .mouth-happy { display: none; }
/* ZZZ 依次延迟 */
.mood-sleep .zzz-text   { animation: zzz-float 2.4s ease-out infinite; }
.mood-sleep .zzz-2      { animation-delay: 0.8s; }
.mood-sleep .zzz-3      { animation-delay: 1.6s; }

/* ── mood-stretch ── */
.mood-stretch .part-head {
  transform-origin: 60px 96px;
  animation: stretch-head 3.5s ease-in-out 1 forwards;
}
.mood-stretch .part-body {
  transform-origin: 60px 145px;
  animation: stretch-body 3.5s ease-in-out 1 forwards;
}
.mood-stretch .part-tail { animation: tail-wag 1s ease-in-out infinite; }

/* ── mood-focused ── */
.mood-focused .part-sign { display: block; }
.mood-focused .cat-wrapper { animation: focused-sway 1.8s ease-in-out infinite; }
.mood-focused .part-tail { animation: tail-wag 0.8s ease-in-out infinite; }
/* 大眼效果 */
.mood-focused .eye-l,
.mood-focused .eye-r { transform-box: fill-box; transform-origin: center; transform: scaleY(1.2); }

/* ── mood-distracted ── */
.mood-distracted .eyes-normal { display: none; }
.mood-distracted .eyes-angry  { display: block; }
.mood-distracted .mouth-happy { display: none; }
.mood-distracted .mouth-sad   { display: block; }
.mood-distracted .blush-left,
.mood-distracted .blush-right { fill: #6688aa; opacity: 0.3; }
.mood-distracted .cat-wrapper { animation: angry-shake 0.4s ease-in-out 3; }
.mood-distracted .part-tail   { animation: tail-wag 0.5s ease-in-out infinite; }

/* ── Hover 加速尾巴 ── */
.is-hover .part-tail { animation-duration: 0.6s !important; }

/* ══════════════════════════════
   气泡
══════════════════════════════ */
.bubble {
  position: absolute;
  bottom: 155px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  border: 2px solid #f0a0b0;
  border-radius: 12px;
  padding: 5px 10px;
  font-size: 13px;
  font-family: system-ui, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  color: #555;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 2px 8px rgba(0,0,0,.12);
  animation: bubble-in 0.2s ease-out;
}
.bubble::after {
  content: '';
  position: absolute;
  bottom: -8px;
  left: 50%;
  transform: translateX(-50%);
  border: 4px solid transparent;
  border-top-color: #f0a0b0;
}
.bubble.hidden  { display: none; }
.bubble.visible { display: block; }

/* ══════════════════════════════
   爱心粒子
══════════════════════════════ */
.heart-particle {
  position: absolute;
  font-size: 16px;
  pointer-events: none;
  animation: heart-burst 0.9s ease-out forwards;
  color: #ff6699;
}
`;
}
