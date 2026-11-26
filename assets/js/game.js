/* =========================================================
   遊戲本體 game.js（原型）
   流程：黑幕 → 開機與連線文字、進度條 → 輸入密碼
        → 登入成功 → 點陣十字白光（電視開機）→ 員工桌面
   目前密碼：password（之後換成正式謎題）
   ========================================================= */

const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PASSWORD = 'password';

const terminal  = document.getElementById('terminal');
const output    = document.getElementById('term-output');
const inputLine = document.getElementById('term-input-line');
const input     = document.getElementById('term-input');
const mask      = document.getElementById('term-mask');
const hint      = document.getElementById('term-hint');

/* ---------------------------------------------------------
   小工具
   --------------------------------------------------------- */

// 點擊畫面可以加速：加速時所有等待時間縮短
let fast = false;
terminal.addEventListener('click', () => {
    fast = true;
    if (!inputLine.hidden) input.focus();
});

function sleep(ms) {
    return new Promise(res => setTimeout(res, fast || REDUCE ? Math.min(ms, 30) : ms));
}

function scrollDown() { terminal.scrollTop = terminal.scrollHeight; }

// 新增一行（可指定顏色：dim / warn / ok）
function newLine(type = '') {
    const line = document.createElement('div');
    if (type) line.className = type;
    output.appendChild(line);
    scrollDown();
    return line;
}

// 一個字一個字打出來
async function typeLine(text, { type = '', speed = 22 } = {}) {
    const line = newLine(type);
    for (const ch of text) {
        line.textContent += ch;
        if (ch !== ' ') MuonAudio.tick();
        await sleep(speed);
    }
    scrollDown();
    return line;
}

// 整行直接出現（像系統一次吐出來的訊息）
async function printLine(text, type = '', wait = 120) {
    newLine(type).textContent = text || '\u00a0';   // 空行也要保留高度
    await sleep(wait);
}

// 文字進度條：[██████░░░░░░] 52%
async function progressBar(label, duration = 2200) {
    const line = newLine();
    const WIDTH = 24;
    let p = 0;
    while (p < 100) {
        // 每次前進的量不固定，看起來比較像真的在讀取
        p = Math.min(100, p + Math.random() * 9 + 1);
        const filled = Math.round(WIDTH * p / 100);
        line.textContent = `${label} [${'█'.repeat(filled)}${'░'.repeat(WIDTH - filled)}] ${String(Math.floor(p)).padStart(3)}%`;
        await sleep(duration / 18);
    }
    await sleep(200);
}

/* ---------------------------------------------------------
   1. 開機與連線
   --------------------------------------------------------- */

async function boot() {
    await sleep(1800);                              // 先黑一段時間

    await printLine('MUON-LINK 遠端終端程式  v2.3.0', 'ok', 80);
    await printLine('(C) IDOA 深海資訊部', 'dim', 400);
    await printLine('', '', 200);

    await typeLine('> 初始化網路介面…………… OK');
    await typeLine('> 載入加密模組…………… OK');
    await typeLine('> 掃描公開頻道');
    await progressBar('  SCAN', 2600);
    await printLine('', '', 100);

    await typeLine('> 偵測到未登記的訊號源', { type: 'warn' });
    await printLine('  位置：不明　　頻段：ELF-07　　延遲：4,812 ms', 'dim', 600);
    await typeLine('> 嘗試建立連線');
    await progressBar('  LINK', 2000);
    await typeLine('> 連線建立。');
    await printLine('', '', 500);

    MuonAudio.beep();
    await printLine('════════════════════════════════════', 'dim', 60);
    await printLine('  MUON-07 中央系統　v4.1.2', 'ok', 60);
    await printLine('  上次登入：214 天前', 'dim', 60);
    await printLine('════════════════════════════════════', 'dim', 500);
    await typeLine('使用者帳號：maint_07', { speed: 60 });

    askPassword();
}

/* ---------------------------------------------------------
   2. 輸入密碼
   --------------------------------------------------------- */

let tries = 0;

function askPassword() {
    hint.hidden = true;
    fast = false;
    input.value = '';
    mask.textContent = '';
    inputLine.hidden = false;
    // 輸入框要移到輸出的最後面
    output.after(inputLine);
    input.focus();
    scrollDown();
}

// 畫面上用星號顯示輸入的內容
input.addEventListener('input', () => {
    mask.textContent = '*'.repeat(input.value.length);
    MuonAudio.tick();
});

input.addEventListener('keydown', async e => {
    if (e.key !== 'Enter') return;
    e.preventDefault();

    const value = input.value;
    inputLine.hidden = true;
    newLine().textContent = '請輸入密碼：' + '*'.repeat(value.length);

    if (value === PASSWORD) {
        await loginSuccess();
    } else {
        tries++;
        await sleep(400);
        MuonAudio.glitch(0.25);
        await typeLine('認證失敗。', { type: 'warn' });
        if (tries >= 3) await typeLine('……提示功能，目前停用中。', { type: 'dim', speed: 70 });
        await sleep(300);
        askPassword();
    }
});

// 點畫面任何地方，都會把焦點放回輸入框（避免玩家打字沒反應）
document.addEventListener('click', () => {
    if (!inputLine.hidden) input.focus();
});

/* ---------------------------------------------------------
   3. 登入成功 → 電視開機 → 桌面
   --------------------------------------------------------- */

async function loginSuccess() {
    await sleep(500);
    await typeLine('認證成功。', { type: 'ok' });
    await typeLine('> 載入使用者設定檔');
    await progressBar('  LOAD', 1400);
    await typeLine('歡迎回來，maint_07。', { type: 'ok', speed: 60 });

    // 存檔：首頁的「繼續上次的進度」就能按了
    try {
        localStorage.setItem('muon-save', JSON.stringify({ stage: 'desktop', time: Date.now() }));
    } catch (e) { /* 忽略 */ }

    await sleep(1400);
    MuonAudio.glitch(0.4);
    terminal.classList.add('fade-out');
    await sleep(700);
    terminal.hidden = true;

    await sleep(500);                              // 全黑一下
    await crtPowerOn();
    showDesktop();
}

/* ---------------------------------------------------------
   點陣十字白光
   原理和首頁的走廊一樣：低解析度算亮度，再用 Bayer 抖色變成網點
   亮度 = 一條橫的光 + 一條直的光（十字），中心最亮，慢慢擴散到整個畫面
   --------------------------------------------------------- */

const crt = document.getElementById('crt');
const cctx = crt.getContext('2d');
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const LEVELS = [[0, 0, 0], [40, 60, 58], [150, 200, 194], [235, 250, 248]];   // 黑 → 帶一點青的白

function crtPowerOn() {
    return new Promise(resolve => {
        if (REDUCE) { resolve(); return; }

        const W = 200;
        const H = Math.max(100, Math.round(W * innerHeight / innerWidth));
        crt.width = W;
        crt.height = H;
        crt.style.display = 'block';
        const img = cctx.createImageData(W, H);
        const DURATION = 1500;
        const start = performance.now();
        MuonAudio.crt();

        function frame(now) {
            const t = Math.min(1, (now - start) / DURATION);
            const cx = W / 2, cy = H / 2;

            // 動畫分三段：
            // 0.00～0.35  中心亮點拉成十字（橫的比直的長）
            // 0.35～0.70  十字變粗、發光
            // 0.70～1.00  白光充滿整個畫面，最後整片淡掉
            const grow  = Math.min(1, t / 0.35);
            const thick = t < 0.35 ? 0.6 : 0.6 + (t - 0.35) / 0.35 * 5;
            const lenX  = grow * W * 0.75;
            const lenY  = grow * H * 0.75;
            const flood = t < 0.7 ? 0 : (t - 0.7) / 0.3;
            const fade  = t < 0.88 ? 1 : 1 - (t - 0.88) / 0.12;

            const d = img.data;
            for (let y = 0; y < H; y++) {
                for (let x = 0; x < W; x++) {
                    const dx = x - cx, dy = y - cy;
                    // 橫線：越靠近中線越亮，超過長度就漸暗
                    const h = Math.exp(-(dy * dy) / (2 * thick * thick)) * Math.max(0, 1 - Math.abs(dx) / (lenX + 1));
                    const v = Math.exp(-(dx * dx) / (2 * thick * thick * 0.6)) * Math.max(0, 1 - Math.abs(dy) / (lenY + 1)) * 0.8;
                    const glow = Math.exp(-(dx * dx + dy * dy) / (2 * (8 + thick * 6) ** 2)) * (t < 0.7 ? t : 0.7);
                    let b = Math.max(h, v) + glow * 0.6;
                    b = (b + flood * 1.2) * fade;
                    let level = Math.floor(b * (LEVELS.length - 1) + BAYER[(y % 4) * 4 + (x % 4)]);
                    level = Math.max(0, Math.min(LEVELS.length - 1, level));
                    const c = LEVELS[level];
                    const o = (y * W + x) * 4;
                    d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2];
                    // 白光後段整片變透明，讓背後的桌面透出來
                    d[o + 3] = Math.round(255 * fade);
                }
            }
            cctx.putImageData(img, 0, 0);

            // 白光最亮的時候，把桌面放到後面準備好
            if (t >= 0.85 && document.getElementById('desktop').hidden) showDesktop();

            if (t < 1) requestAnimationFrame(frame);
            else { crt.style.display = 'none'; resolve(); }
        }
        requestAnimationFrame(frame);
    });
}

/* ---------------------------------------------------------
   4. 員工桌面
   --------------------------------------------------------- */

// 像素圖示：每個字元代表一格。x＝淺灰  t＝青綠  d＝深青綠  r＝紅  .＝透明
const PIXEL_ICONS = {
    folder: [
        '................',
        '.ttttt..........',
        'tdddddt.........',
        'tttttttttttttttt',
        'tddddddddddddddt',
        'tddddddddddddddt',
        'tddddddddddddddt',
        'tddddddddddddddt',
        'tddddddddddddddt',
        'tddddddddddddddt',
        'tttttttttttttttt',
    ],
    chat: [
        '.xxxxxxxxxxxxxx.',
        'x..............x',
        'x..............x',
        'x..tt..tt..tt..x',
        'x..tt..tt..tt..x',
        'x..............x',
        '.xxxxxxxxxxxxxx.',
        '....xx..........',
        '....x...........',
    ],
    camera: [
        '...xxxx.........',
        'xxxxxxxxxxxxxxx.',
        'x.............xx',
        'x.....tttt....xx',
        'x....t....t...xx',
        'x....t.dd.t...x.',
        'x....t.dd.t...x.',
        'x....t....t...xx',
        'x.....tttt....xx',
        'x.............xx',
        'xxxxxxxxxxxxxxx.',
    ],
    terminal: [
        'xxxxxxxxxxxxxxxx',
        'xddddddddddddddx',
        'xdtddddddddddddx',
        'xddtdddddddddddx',
        'xdtddddddddddddx',
        'xddddddttttddddx',
        'xddddddddddddddx',
        'xxxxxxxxxxxxxxxx',
        '.....xxxxxx.....',
    ],
    text: [
        'xxxxxxxxxx......',
        'x........xx.....',
        'x........x.x....',
        'x.tttttt.xxxx...',
        'x...........x...',
        'x.tttttttt..x...',
        'x...........x...',
        'x.ttttttt...x...',
        'x...........x...',
        'x.tttt......x...',
        'xxxxxxxxxxxxx...',
    ],
    sheet: [
        'xxxxxxxxxxxxx...',
        'xtttxtttxtttx...',
        'xxxxxxxxxxxxx...',
        'x...x...x...x...',
        'xxxxxxxxxxxxx...',
        'x...x...x...x...',
        'xxxxxxxxxxxxx...',
        'x...x...x...x...',
        'xxxxxxxxxxxxx...',
    ],
    cards: [
        '...xxxxxxxx.....',
        '..xx......x.....',
        '.xx.r.....xxxx..',
        'xx.rrr....x..x..',
        'x...r.....x..x..',
        'x.........x..x..',
        'x.....r...x..x..',
        'x....rrr..xxxx..',
        'x.....r...x.....',
        'xxxxxxxxxxx.....',
    ],
    trash: [
        '....xxxxxx......',
        'xxxxxxxxxxxxxx..',
        '.xttdtxdtttdx...',
        '.x.x.x.x.x.x....',
        '.x.x.x.x.x.x....',
        '.x.x.x.x.x.x....',
        '.x.x.x.x.x.x....',
        '.xxxxxxxxxxx....',
    ],
};

const PIXEL_COLORS = { x: '#c8d0d2', t: '#3fbfae', d: '#1d5f58', r: '#d0605a' };

function pixelSVG(rows) {
    const h = rows.length, w = 16;
    let rects = '';
    rows.forEach((row, y) => {
        [...row].forEach((ch, x) => {
            if (PIXEL_COLORS[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${PIXEL_COLORS[ch]}"/>`;
        });
    });
    return `<svg viewBox="0 ${-(16 - h) / 2} ${w} 16" aria-hidden="true">${rects}</svg>`;
}

// 桌面上的東西：四個主要程式，加上偷懶員工亂丟的檔案
const DESKTOP_ITEMS = [
    { label: '檔案',       icon: 'folder',   body: '功能建置中。' },
    { label: '聊天紀錄',   icon: 'chat',     body: '功能建置中。' },
    { label: '監視器',     icon: 'camera',   body: '功能建置中。' },
    { label: '終端機',     icon: 'terminal', body: '功能建置中。' },
    { label: '新增資料夾 (7)', icon: 'folder', body: '這個資料夾是空的。' },
    { label: '不要刪.txt', icon: 'text',     mono: true,
      body: '密碼：password\n\n（主管說要改成八碼以上\n　剛好八碼，完美）' },
    { label: '值班表_最終版(2).xls', icon: 'sheet', body: '檔案已損毀，無法開啟。' },
    { label: '接龍',       icon: 'cards',    body: '最高分：48,210\n上次遊玩：值班時間',
      action: { label: '再玩一局', result: '……還是算了，主管好像在看。' } },
    { label: '資源回收筒', icon: 'trash',    body: '資源回收筒內有 1,284 個項目。\n上次清空：從未清空' },
];

const iconsEl = document.getElementById('icons');
const windowsEl = document.getElementById('windows');

function buildDesktop() {
    if (iconsEl.children.length) return;
    DESKTOP_ITEMS.forEach(item => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'icon';
        btn.innerHTML = pixelSVG(PIXEL_ICONS[item.icon]);
        const label = document.createElement('span');
        label.textContent = item.label;
        btn.appendChild(label);

        // 點一下選取，點兩下（或按 Enter）開啟，跟一般電腦一樣
        btn.addEventListener('click', e => {
            e.stopPropagation();
            document.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
            btn.classList.add('selected');
        });
        btn.addEventListener('dblclick', () => openWindow(item));
        btn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); openWindow(item); } });

        iconsEl.appendChild(btn);
    });

    // 點桌面空白處取消選取
    document.getElementById('desktop').addEventListener('click', () => {
        document.querySelectorAll('.icon.selected').forEach(i => i.classList.remove('selected'));
    });
}

/* ---------------------------------------------------------
   視窗管理
   - 可以同時開好幾個視窗，新視窗會往右下錯開一點
   - 在視窗上任何地方按下滑鼠，那個視窗就會跑到最上層；
     只是調整前後順序，不會擋住視窗裡按鈕、文字的功能
   - 拖曳標題列可以移動視窗
   - 同一個圖示再點兩下，只會把已經開著的視窗叫到最上層
   - 工作列會列出開著的視窗，點一下也能叫到最上層
   --------------------------------------------------------- */

const taskWindowsEl = document.getElementById('task-windows');
const openWindows = new Map();     // 圖示名稱 → { win, taskBtn }
let topZ = 10;                     // 目前最上層的 z-index
let cascade = 0;                   // 新視窗錯開的次數

function focusWindow(win) {
    topZ += 1;
    win.style.zIndex = topZ;
    // 只有最上層的視窗標題列是亮的，其他變暗
    openWindows.forEach(({ win: w, taskBtn }) => {
        const active = w === win;
        w.classList.toggle('active', active);
        taskBtn.classList.toggle('active', active);
    });
}

function closeWindow(label) {
    const entry = openWindows.get(label);
    if (!entry) return;
    entry.win.remove();
    entry.taskBtn.remove();
    openWindows.delete(label);
    // 關掉後，讓剩下最上層的那個變成作用中
    let top = null;
    openWindows.forEach(({ win }) => {
        if (!top || Number(win.style.zIndex) > Number(top.style.zIndex)) top = win;
    });
    if (top) focusWindow(top);
}

function openWindow(item) {
    // 已經開著：叫到最上層就好
    if (openWindows.has(item.label)) {
        focusWindow(openWindows.get(item.label).win);
        return;
    }

    const win = document.createElement('div');
    win.className = 'window';
    win.setAttribute('role', 'dialog');
    win.setAttribute('aria-label', item.label);

    // ---- 標題列 ----
    const bar = document.createElement('div');
    bar.className = 'win-bar';
    const title = document.createElement('span');
    title.className = 'win-title';
    title.textContent = item.label;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'win-close';
    close.setAttribute('aria-label', '關閉視窗');
    close.textContent = '✕';
    close.addEventListener('click', () => closeWindow(item.label));
    bar.append(title, close);

    // ---- 內容 ----
    const body = document.createElement('div');
    body.className = 'win-body' + (item.mono ? ' mono' : '');
    const text = document.createElement('p');
    text.textContent = item.body;
    body.appendChild(text);

    // 有些檔案裡有按鈕（例如接龍），用來確認視窗裡的功能都能正常操作
    if (item.action) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'win-action';
        btn.textContent = item.action.label;
        btn.addEventListener('click', () => {
            text.textContent = item.action.result;
            btn.remove();
            MuonAudio.glitch(0.2);
        });
        body.appendChild(btn);
    }

    win.append(bar, body);

    // ---- 位置：從畫面中間偏左上開始，每開一個就往右下錯開 28px ----
    const desk = document.getElementById('desktop');
    const W = Math.min(440, desk.clientWidth * 0.9);
    const step = cascade % 8;
    cascade += 1;
    const left = Math.max(8, (desk.clientWidth - W) / 2 - 80 + step * 28);
    const top = Math.max(8, desk.clientHeight * 0.18 + step * 28);
    win.style.width = W + 'px';
    win.style.left = left + 'px';
    win.style.top = top + 'px';

    // ---- 按下視窗任何地方 → 移到最上層（用 capture，先處理順序，再讓裡面的按鈕正常運作）----
    win.addEventListener('pointerdown', () => focusWindow(win), true);
    win.addEventListener('click', e => e.stopPropagation());   // 不要讓桌面取消圖示選取

    makeDraggable(win, bar);

    // ---- 工作列按鈕 ----
    const taskBtn = document.createElement('button');
    taskBtn.type = 'button';
    taskBtn.className = 'task-win';
    taskBtn.textContent = item.label;
    taskBtn.addEventListener('click', e => { e.stopPropagation(); focusWindow(win); });
    taskWindowsEl.appendChild(taskBtn);

    windowsEl.appendChild(win);
    openWindows.set(item.label, { win, taskBtn });
    focusWindow(win);
    MuonAudio.tick();
    close.focus();
}

// 拖曳標題列移動視窗
function makeDraggable(win, handle) {
    let startX, startY, startLeft, startTop, dragging = false;

    handle.addEventListener('pointerdown', e => {
        if (e.target.closest('.win-close')) return;       // 按關閉鍵不算拖曳
        dragging = true;
        startX = e.clientX;
        startY = e.clientY;
        startLeft = win.offsetLeft;
        startTop = win.offsetTop;
        handle.setPointerCapture(e.pointerId);
        win.classList.add('dragging');
    });

    handle.addEventListener('pointermove', e => {
        if (!dragging) return;
        const desk = document.getElementById('desktop');
        // 限制範圍：標題列不能拖出畫面，避免視窗找不回來
        const maxLeft = desk.clientWidth - 80;
        const maxTop = desk.clientHeight - 44 - handle.offsetHeight;
        const left = Math.min(maxLeft, Math.max(80 - win.offsetWidth, startLeft + e.clientX - startX));
        const top = Math.min(maxTop, Math.max(0, startTop + e.clientY - startY));
        win.style.left = left + 'px';
        win.style.top = top + 'px';
    });

    const stop = () => { dragging = false; win.classList.remove('dragging'); };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
}

// Esc 關閉最上層的視窗
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !openWindows.size) return;
    let topLabel = null, topValue = -1;
    openWindows.forEach(({ win }, label) => {
        const z = Number(win.style.zIndex);
        if (z > topValue) { topValue = z; topLabel = label; }
    });
    closeWindow(topLabel);
});

function showDesktop() {
    const desk = document.getElementById('desktop');
    if (!desk.hidden) return;
    buildDesktop();
    desk.hidden = false;
    desk.classList.add('power-on');
    updateClock();
}

// 工作列時鐘：顯示玩家電腦的真實時間
function updateClock() {
    const now = new Date();
    document.getElementById('task-clock').textContent =
        String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
}
setInterval(updateClock, 10000);

/* ---------------------------------------------------------
   開始
   有存檔又是從「繼續上次的進度」進來：跳過開機，直接開桌面
   --------------------------------------------------------- */

const params = new URLSearchParams(location.search);
let saved = null;
try { saved = JSON.parse(localStorage.getItem('muon-save')); } catch (e) { /* 忽略 */ }

if (params.get('continue') && saved) {
    terminal.hidden = true;
    setTimeout(async () => { await crtPowerOn(); showDesktop(); }, 600);
} else {
    boot();
}
