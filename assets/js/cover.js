/* =========================================================
   首頁 cover.js
   1. 點陣走廊背景（斜角構圖、壞掉的燈會慢慢掙扎）
   2. 無音的獨白（台詞在 muon-lines.js）
   3. 失聯時間、繼續按鈕、外部連線紀錄
   4. 電力變化圖
   5. 標題故障、開始連線的轉場
   ※ REDUCE_MOTION 定義在 site.js
   ========================================================= */

/* ---------------------------------------------------------
   1. 點陣走廊
   原理：用很低的解析度（寬 240 像素）一格一格算出走廊的亮度，
   再用「Bayer 有序抖色」把亮度轉成少數幾種顏色的網點，
   最後讓 CSS 把畫布放大，就會有顆粒感。
   --------------------------------------------------------- */

const canvas = document.getElementById('corridor');
const ctx = canvas.getContext('2d');

// 調色盤：每種材質只有 5 階顏色，網點感就是從這裡來的
const PALETTE = {
    teal: [[10, 13, 15], [14, 38, 36], [29, 95, 88], [47, 154, 140], [95, 214, 196]],
    gray: [[10, 13, 15], [24, 29, 32], [55, 64, 68], [118, 128, 132], [200, 208, 210]],
};

// 4×4 Bayer 矩陣（數值 0~1），決定每個像素「進位」的門檻
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);

// 走廊的形狀
const HALF_W = 1.4;     // 走廊半寬
const HALF_H = 1.0;     // 走廊半高
const FOCAL = 1.25;     // 鏡頭焦距
const YAW = -0.38;      // 鏡頭往左偏一點，走廊的盡頭就會出現在畫面右邊
const FAR = 16;         // 盡頭距離
const PANEL = 2.0;      // 牆上玻璃窗的間距
const LIGHT = 3.0;      // 天花板燈的間距

let W = 240, H = 135;
let rays = [];          // 每個像素預先算好的光線資料
let image;

// 簡單的雜湊函式：同樣的輸入永遠得到同樣的亂數，用來決定哪扇窗、哪盞燈壞掉
function hash(n) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
}

function resize() {
    W = 240;
    H = Math.max(100, Math.round(W * window.innerHeight / window.innerWidth));
    canvas.width = W;
    canvas.height = H;
    image = ctx.createImageData(W, H);

    const cos = Math.cos(YAW), sin = Math.sin(YAW);

    // 鏡頭只會往前移動，所以每個像素「看出去碰到哪個面」是固定的，先算好
    rays = new Array(W * H);
    for (let py = 0; py < H; py++) {
        for (let px = 0; px < W; px++) {
            const sx = (px - W / 2) / (H / 2);
            const sy = (py - H / 2) / (H / 2);
            // 把光線轉一個角度
            const dx = sx * cos + FOCAL * sin;
            const dz = -sx * sin + FOCAL * cos;

            const tWall = Math.abs(dx) > 1e-4 ? HALF_W / Math.abs(dx) : Infinity;
            const tFlat = Math.abs(sy) > 1e-4 ? HALF_H / Math.abs(sy) : Infinity;
            const t = Math.min(tWall, tFlat);
            const depth = t * dz;

            let kind, a;
            if (dz <= 0 || depth > FAR) {
                kind = 'end';  a = 0;
            } else if (tWall < tFlat) {
                kind = dx < 0 ? 'wallL' : 'wallR';
                a = t * sy;    // 在牆上的高度
            } else if (sy < 0) {
                kind = 'ceil'; a = t * dx;   // 在天花板上的左右位置
            } else {
                kind = 'floor'; a = t * dx;
            }
            rays[py * W + px] = { kind, a, depth, bayer: BAYER[(py % 4) * 4 + (px % 4)] };
        }
    }
}

/* 天花板的燈
   - 約 2 成的燈已經全壞
   - 約 1.5 成是「快壞掉」的燈：每十幾秒會慢慢變暗、停在暗處、頓兩下，再慢慢亮回來
   - 其他燈穩定亮著 */
function lightLevel(index, time) {
    const h = hash(index * 3.7);
    if (h < 0.22) return 0.12;
    if (h < 0.36 && !REDUCE_MOTION) {
        const period = 14 + hash(index * 9.1) * 8;            // 每盞燈的節奏不一樣
        const p = (time + hash(index * 5.3) * period) % period;
        if (p < 1.4) return 1 - 0.8 * (p / 1.4);               // 慢慢變暗
        if (p < 3.0) return 0.2;                               // 停在暗處
        if (p < 3.5) return Math.floor((p - 3.0) * 10) % 2 ? 0.9 : 0.2;  // 頓兩下
        if (p < 4.7) return 0.2 + 0.8 * ((p - 3.5) / 1.2);     // 慢慢亮回來
    }
    return 1;
}

// 計算單一像素的材質和亮度
function shade(r, camZ, time) {
    const z = r.depth + camZ;
    const fog = Math.exp(-r.depth * 0.11);
    let v = 0, mat = 'gray';

    switch (r.kind) {
        case 'end':
            return ['gray', 0.02];

        case 'wallL':
        case 'wallR': {
            mat = 'teal';
            const idx = Math.floor(z / PANEL);
            const u = z / PANEL - idx;
            const side = r.kind === 'wallL' ? 1 : 2;
            const isWindow = u > 0.12 && u < 0.94 && r.a > -0.62 && r.a < 0.5;
            if (u < 0.06) {
                v = 0.32;                                  // 窗框
            } else if (isWindow) {
                const broken = hash(idx * 7.1 + side) < 0.2;
                // 玻璃裡的光：上暗下亮，再加一點緩慢的波動，像水的反光
                const wave = 0.06 * Math.sin(time * 0.8 + idx + r.a * 6);
                v = broken ? 0.12 : 0.55 + 0.25 * (r.a + 0.62) + wave;
            } else {
                v = 0.16;                                  // 牆面
            }
            break;
        }

        case 'ceil': {
            const idx = Math.floor(z / LIGHT);
            const u = z / LIGHT - idx;
            v = (Math.abs(r.a) < 0.1 && u < 0.4) ? 1.1 * lightLevel(idx, time) : 0.07;
            break;
        }

        case 'floor': {
            const idx = Math.floor(z / LIGHT);
            const u = z / LIGHT - idx;
            // 地上積水，淡淡倒映天花板的燈
            if (Math.abs(r.a) < 0.2 && u < 0.45) {
                v = 0.22 * lightLevel(idx, time);
            } else {
                v = 0.06 + (hash(Math.floor(z * 4) * 13 + Math.floor(r.a * 8)) < 0.04 ? 0.12 : 0);
            }
            break;
        }
    }
    return [mat, v * fog];
}

// 漂浮的海中微粒
const particles = Array.from({ length: 40 }, () => ({
    x: Math.random(), y: Math.random(), s: 0.002 + Math.random() * 0.004,
}));

let camZ = 0;
let last = performance.now();
let glitchRows = null;

function render(now) {
    requestAnimationFrame(render);

    const time = now / 1000;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;

    // 捲到下面的資料區時，走廊被蓋住了，就先不畫，省電
    if (window.scrollY > window.innerHeight) return;

    if (!REDUCE_MOTION) camZ += dt * 0.35;     // 慢慢往前飄

    const data = image.data;
    for (let i = 0; i < rays.length; i++) {
        const r = rays[i];
        const [mat, v] = shade(r, camZ, time);
        const pal = PALETTE[mat];
        // 抖色：亮度 × 階數 + 門檻，取整數決定用哪一階顏色
        let level = Math.floor(v * (pal.length - 1) + r.bayer);
        level = Math.max(0, Math.min(pal.length - 1, level));
        const c = pal[level];
        const o = i * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
    }

    // 微粒：一顆一像素，慢慢往上飄
    for (const p of particles) {
        if (!REDUCE_MOTION) {
            p.y -= p.s * dt * 6;
            p.x += Math.sin(time + p.s * 999) * 0.0004;
            if (p.y < 0) { p.y = 1; p.x = Math.random(); }
        }
        const o = (Math.floor(p.y * H) * W + Math.floor(p.x * W)) * 4;
        if (o >= 0 && o < data.length) { data[o] = 120; data[o + 1] = 160; data[o + 2] = 160; }
    }

    // 偶爾整排像素錯位，模擬訊號不穩
    if (!REDUCE_MOTION && !glitchRows && Math.random() < 0.002) {
        glitchRows = {
            y: Math.floor(Math.random() * H),
            h: 2 + Math.floor(Math.random() * 8),
            shift: Math.floor((Math.random() - 0.5) * 30),
            until: time + 0.12,
        };
    }
    if (glitchRows) {
        shiftRows(data, glitchRows);
        if (time > glitchRows.until) glitchRows = null;
    }

    ctx.putImageData(image, 0, 0);
}

function shiftRows(data, g) {
    for (let y = g.y; y < Math.min(H, g.y + g.h); y++) {
        const row = data.slice(y * W * 4, (y + 1) * W * 4);
        for (let x = 0; x < W; x++) {
            const sx = ((x - g.shift) % W + W) % W;
            data.set(row.subarray(sx * 4, sx * 4 + 4), (y * W + x) * 4);
        }
    }
}

window.addEventListener('resize', resize);
resize();
requestAnimationFrame(render);

/* ---------------------------------------------------------
   2. 無音的獨白
   打字 → 停幾秒 → 一個字一個字刪掉 → 換下一句，一直循環。
   滑鼠移到「開始連線」或很久沒動作時，會插話。
   --------------------------------------------------------- */

const messageEl = document.getElementById('message');

const SPEED = {
    char: 140,       // 每個字
    pause: 520,      // 標點符號後
    hold: 4200,      // 講完停多久
    erase: 45,       // 刪除每個字
    gap: 1400,       // 兩句之間
};

let pendingLine = null;   // 插話的內容
let interrupted = false;  // 是否要打斷目前這句
const recent = [];        // 最近說過的句子，避免重複

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// 等待一段時間，但如果被插話就提早結束
async function wait(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end && !interrupted) await sleep(80);
}

function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

// 把文字畫到畫面上（用 textContent 比較安全）
function show(text, noise = '') {
    messageEl.textContent = text;
    if (noise) {
        const n = document.createElement('span');
        n.className = 'noise';
        n.textContent = noise;
        messageEl.appendChild(n);
    }
    const cursor = document.createElement('span');
    cursor.className = 'cursor';
    messageEl.appendChild(cursor);
}

// 隨機挑下一句：大多是獨白，偶爾看時間說話，偶爾壞掉
function nextLine() {
    for (let tries = 0; tries < 10; tries++) {
        const r = Math.random();
        let line;
        if (r < 0.7)       line = { text: pick(MUON_LINES.idle) };
        else if (r < 0.85) line = { text: muonTimeLine() };
        else               line = { text: pick(MUON_LINES.glitch), glitch: true };
        if (!recent.includes(line.text)) {
            recent.push(line.text);
            if (recent.length > 4) recent.shift();
            return line;
        }
    }
    return { text: pick(MUON_LINES.idle) };
}

async function speak(line) {
    const text = line.text;

    // 減少動態效果：整句直接出現，不打字
    if (REDUCE_MOTION) {
        show(text);
        await wait(SPEED.hold + 2000);
        return;
    }

    // 打字
    let shown = 0;
    while (shown < text.length && !interrupted) {
        shown++;
        show(text.slice(0, shown));
        if (text[shown - 1] !== ' ') MuonAudio.tick();      // 打字聲
        await sleep('，。…？'.includes(text[shown - 1]) ? SPEED.pause : SPEED.char);
    }

    // 壞掉的句子：後面接一串亂碼
    let noise = '';
    if (line.glitch && !interrupted) {
        const BLOCKS = '█▓▒░';
        MuonAudio.glitch(0.75);                               // 壞掉時的雜訊
        for (let i = 0; i < 8; i++) {
            noise += pick(BLOCKS);
            show(text, noise);
            await sleep(90);
        }
        await wait(900);
    } else {
        await wait(SPEED.hold);
    }

    // 刪掉（被打斷時刪得比較快）
    let all = text.slice(0, shown) + noise;
    while (all.length > 0) {
        all = all.slice(0, -1);
        show(all);
        await sleep(interrupted ? 12 : SPEED.erase);
    }

    if (!interrupted) await wait(SPEED.gap);
}

let monologueStopped = false;   // 按下開始連線後，獨白就停止

async function monologue() {
    let line = { text: pick(hasSave ? MUON_LINES.returning : MUON_LINES.greeting) };
    while (!monologueStopped) {
        await speak(line);
        if (monologueStopped) break;
        if (pendingLine) {
            line = pendingLine;
            pendingLine = null;
            interrupted = false;
        } else {
            line = nextLine();
        }
    }
}

// 讓無音插話
function interject(text) {
    pendingLine = { text };
    interrupted = true;
}

// 滑鼠移到「開始連線」：15 秒內不重複插話
let lastHover = 0;
document.getElementById('btn-start').addEventListener('mouseenter', () => {
    if (Date.now() - lastHover > 15000) {
        lastHover = Date.now();
        interject(pick(MUON_LINES.hoverStart));
    }
});

// 30 秒沒有任何動作：問玩家還在不在
let lastActive = Date.now();
let awaySaid = false;
['mousemove', 'keydown', 'scroll', 'touchstart'].forEach(ev =>
    window.addEventListener(ev, () => { lastActive = Date.now(); awaySaid = false; }, { passive: true })
);
setInterval(() => {
    if (!awaySaid && Date.now() - lastActive > 30000) {
        awaySaid = true;
        interject(pick(MUON_LINES.away));
    }
}, 2000);

/* ---------------------------------------------------------
   3. 失聯時間、繼續按鈕、外部連線紀錄
   --------------------------------------------------------- */

// 失聯時間：從 214 天 07:42:13 開始往上數
const clockEl = document.getElementById('clock');
let elapsed = 214 * 86400 + 7 * 3600 + 42 * 60 + 13;
function pad(n, len = 2) { return String(n).padStart(len, '0'); }
function updateClock() {
    const d = Math.floor(elapsed / 86400);
    const h = Math.floor(elapsed % 86400 / 3600);
    const m = Math.floor(elapsed % 3600 / 60);
    const s = elapsed % 60;
    clockEl.textContent = `LAST CONTACT ── ${d} DAYS ${pad(h)}:${pad(m)}:${pad(s)}`;
    elapsed++;
}
updateClock();
setInterval(updateClock, 1000);

// 「繼續上次的進度」：localStorage 裡有存檔才能按
function readStorage(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }   // 部分瀏覽器會禁止存取
}
function writeStorage(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 忽略 */ }
}

const hasSave = !!readStorage('muon-save');
const continueBtn = document.getElementById('btn-continue');
if (!hasSave) {
    continueBtn.classList.add('disabled');
    continueBtn.setAttribute('aria-disabled', 'true');
    continueBtn.setAttribute('tabindex', '-1');
}

/* 外部連線紀錄
   目前用 localStorage 記錄「這台電腦」連線過幾次。
   之後接上後端（例如 Firebase），就能改成統計所有玩家的連線次數。 */
let visits = { count: 0, last: null };
try { visits = JSON.parse(readStorage('muon-visits')) || visits; } catch (e) { /* 資料壞掉就重來 */ }
const previous = visits.last;
visits.count += 1;
visits.last = Date.now();
writeStorage('muon-visits', JSON.stringify(visits));

document.getElementById('visit-count').textContent = pad(visits.count, 4);
document.getElementById('visit-text').textContent =
    visits.count === 1 ? '首次連線。系統已記錄這台裝置。' : `這是這台裝置第 ${visits.count} 次連線。`;
if (previous) {
    const d = new Date(previous);
    document.getElementById('visit-last').textContent =
        `上次連線：${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ---------------------------------------------------------
   4. 電力變化圖（用 canvas 自己畫，不需要外部套件）
   --------------------------------------------------------- */

// [第幾天, 電力 %]
const POWER_DATA = [
    [0, 100], [3, 97], [10, 89], [20, 80], [30, 72], [31, 64],
    [45, 58], [60, 51], [75, 45], [90, 40], [91, 34], [110, 30],
    [130, 26], [150, 22], [170, 19], [190, 16], [205, 14], [214, 12],
];
const EVENTS = [31, 91];   // 關閉 C 區、關閉照明的日子

const chart = document.getElementById('power-chart');

function drawChart() {
    const dpr = window.devicePixelRatio || 1;
    const w = chart.clientWidth, h = chart.clientHeight;
    chart.width = w * dpr;
    chart.height = h * dpr;
    const c = chart.getContext('2d');
    c.scale(dpr, dpr);

    const css = getComputedStyle(document.documentElement);
    const TEAL = css.getPropertyValue('--teal').trim();
    const WARN = css.getPropertyValue('--warn').trim();
    const LINE = css.getPropertyValue('--line').trim();
    const DIM = css.getPropertyValue('--ink-dim').trim();

    const pad = { l: 44, r: 16, t: 12, b: 28 };
    const x = d => pad.l + (d / 214) * (w - pad.l - pad.r);
    const y = p => pad.t + (1 - p / 100) * (h - pad.t - pad.b);

    c.font = '14px VT323, Consolas, monospace';
    c.textBaseline = 'middle';

    // 格線與刻度
    c.strokeStyle = LINE;
    c.fillStyle = DIM;
    c.lineWidth = 1;
    [0, 25, 50, 75, 100].forEach(p => {
        c.beginPath(); c.moveTo(pad.l, y(p)); c.lineTo(w - pad.r, y(p)); c.stroke();
        c.textAlign = 'right'; c.fillText(p + '%', pad.l - 8, y(p));
    });
    c.textAlign = 'center';
    [0, 30, 60, 90, 120, 150, 180, 214].forEach(d => c.fillText('D' + d, x(d), h - 10));

    // 面積
    c.beginPath();
    c.moveTo(x(0), y(0));
    POWER_DATA.forEach(([d, p]) => c.lineTo(x(d), y(p)));
    c.lineTo(x(214), y(0));
    c.closePath();
    c.fillStyle = 'rgba(63, 191, 174, .12)';
    c.fill();

    // 折線
    c.beginPath();
    POWER_DATA.forEach(([d, p], i) => i ? c.lineTo(x(d), y(p)) : c.moveTo(x(d), y(p)));
    c.strokeStyle = TEAL;
    c.lineWidth = 2;
    c.stroke();

    // 關閉設備的日子
    EVENTS.forEach(d => {
        const p = POWER_DATA.find(pt => pt[0] === d)[1];
        c.fillStyle = TEAL;
        c.fillRect(x(d) - 3, y(p) - 3, 6, 6);
    });

    // 現在
    c.fillStyle = WARN;
    c.fillRect(x(214) - 4, y(12) - 4, 8, 8);
    c.textAlign = 'right';
    c.fillText('NOW 12%', x(214) - 10, y(12) - 14);
}

drawChart();
window.addEventListener('resize', drawChart);
if (document.fonts) document.fonts.ready.then(drawChart);   // 字型載入後重畫，刻度才會用到 VT323

/* ---------------------------------------------------------
   5. 標題偶爾故障 ＋ 開始連線的轉場
   --------------------------------------------------------- */

const title = document.querySelector('.title');

function glitchTitle(duration = 120) {
    title.classList.add('glitching');
    setTimeout(() => title.classList.remove('glitching'), duration);
}
if (!REDUCE_MOTION) {
    setInterval(() => { if (Math.random() < 0.35) glitchTitle(); }, 2500);
}

/* 開始連線的轉場
   1. 無音停下獨白，打出「開始連線。」
   2. 畫面慢慢被雜訊（電視沙沙畫面）蓋過，聲音也越來越大
   3. 雜訊最滿的時候，畫面和聲音「啪」一聲同時切掉
   4. 全黑一下，跳到遊戲頁（遊戲頁也是從全黑開始，接起來就像同一個畫面） */

const staticCanvas = document.getElementById('static');
const sctx = staticCanvas.getContext('2d');
let leaving = false;

function drawStatic(amount) {
    // 低解析度的隨機灰點，amount（0～1）越大，畫面越亮、越不透明
    const W = 160;
    const H = Math.max(90, Math.round(W * innerHeight / innerWidth));
    if (staticCanvas.width !== W) { staticCanvas.width = W; staticCanvas.height = H; }
    const img = sctx.createImageData(W, H);
    const d = img.data;
    // 偶爾整排變亮，像訊號撕裂
    const tearY = Math.random() < amount ? Math.floor(Math.random() * H) : -1;
    for (let y = 0; y < H; y++) {
        const tear = Math.abs(y - tearY) < 2 ? 60 : 0;
        for (let x = 0; x < W; x++) {
            const v = Math.min(255, Math.random() * 255 * (0.35 + amount * 0.65) + tear);
            const o = (y * W + x) * 4;
            d[o] = v * 0.85; d[o + 1] = v; d[o + 2] = v * 0.97;   // 帶一點點青色
            d[o + 3] = 255;
        }
    }
    sctx.putImageData(img, 0, 0);
    staticCanvas.style.opacity = Math.min(1, amount * 1.1);
}

async function startConnection(href, text) {
    if (leaving) return;
    leaving = true;
    document.querySelectorAll('.actions .btn').forEach(b => b.classList.add('disabled'));

    // 1. 停下獨白，等目前這句快速刪完，再打出「開始連線。」
    monologueStopped = true;
    interrupted = true;
    pendingLine = null;
    await sleep(450);
    for (let i = 1; i <= text.length; i++) {
        show(text.slice(0, i));
        if (text[i - 1] !== '。') MuonAudio.tick();
        await sleep(text[i - 1] === '。' ? 400 : 160);
    }
    await sleep(700);

    // 2. 雜訊慢慢蓋過畫面（約 2.2 秒）
    const noise = MuonAudio.staticRise(2.2);
    staticCanvas.style.display = 'block';
    const DURATION = 2200;
    const start = performance.now();
    await new Promise(resolve => {
        function frame(now) {
            const t = Math.min(1, (now - start) / DURATION);
            drawStatic(t * t);                         // 一開始很淡，後面越來越快變滿
            if (t > 0.5 && Math.random() < 0.15) glitchTitle(80);
            if (t < 1) requestAnimationFrame(frame);
            else resolve();
        }
        requestAnimationFrame(frame);
    });

    // 3. 啪！同時切掉畫面和聲音
    const black = document.getElementById('glitch');
    black.style.animation = 'none';
    black.style.opacity = '1';
    staticCanvas.style.display = 'none';
    noise.cut();

    // 4. 全黑一下再換頁
    await sleep(350);
    window.location.href = href;
}

document.querySelectorAll('.actions .btn').forEach(btn => {
    btn.addEventListener('click', e => {
        if (e.ctrlKey || e.metaKey) return;               // 用新分頁開啟時就不播轉場
        if (REDUCE_MOTION) return;                        // 減少動態效果：直接換頁
        e.preventDefault();
        const isContinue = btn.id === 'btn-continue';
        startConnection(btn.getAttribute('href'), isContinue ? '恢復連線。' : '開始連線。');
    });
});

/* ---------------------------------------------------------
   6. 亂碼數字（座標、深度）— Minecraft 亂碼文字的效果
   data-glitch 裡的「#」位置會一直快速切換成隨機的英文、數字、符號
   （真正的數字要在遊戲裡找）；其他數字偶爾也會亂掉一下，像資料損毀。
   --------------------------------------------------------- */

const SCRAMBLE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghkmnpqrstuvwxyz0123456789#$%&*+=?!@<>/\\';
function randomChar() { return SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)]; }

// 先把每個字拆成一個 <span>，之後只換文字內容
const glitchChars = [];
document.querySelectorAll('.glitch-text').forEach(el => {
    el.textContent = '';
    for (const ch of el.dataset.glitch) {
        const span = document.createElement('span');
        const isDigit = ch >= '0' && ch <= '9';
        span.textContent = ch === '#' ? randomChar() : ch;
        if (ch === '#') span.className = 'nz';
        el.appendChild(span);
        glitchChars.push({ span, real: ch, locked: ch === '#', isDigit, until: 0 });
    }
});

function scramble() {
    const now = Date.now();
    glitchChars.forEach(g => {
        if (g.locked) {
            g.span.textContent = randomChar();            // 永遠在亂跳
        } else if (g.isDigit) {
            if (g.until === 0 && Math.random() < 0.002) {  // 偶爾開始亂掉
                g.until = now + 250 + Math.random() * 400;
                g.span.className = 'nz';
            }
            if (g.until > now) {
                g.span.textContent = randomChar();
            } else if (g.until !== 0) {                    // 亂完恢復原本的數字
                g.until = 0;
                g.span.textContent = g.real;
                g.span.className = '';
            }
        }
    });
}
if (REDUCE_MOTION) {
    glitchChars.forEach(g => { if (g.locked) g.span.textContent = '?'; });
} else {
    setInterval(scramble, 60);   // 每 0.06 秒換一次，看起來就是在快速切換
}

/* ---------------------------------------------------------
   7. 聲納圖：掃描線繞圈，基地在正中央閃爍
   --------------------------------------------------------- */

const sonar = document.getElementById('sonar');
const sc = sonar.getContext('2d');
const SIZE = 260;
const dprS = window.devicePixelRatio || 1;
sonar.width = SIZE * dprS;
sonar.height = SIZE * dprS;
sc.scale(dprS, dprS);

// 海底的訊號點（多金屬結核、地形），位置固定
const contacts = Array.from({ length: 26 }, (_, i) => {
    const a = hash(i * 2.3) * Math.PI * 2;
    const r = 30 + hash(i * 5.9) * 95;
    return { a, x: SIZE / 2 + Math.cos(a) * r, y: SIZE / 2 + Math.sin(a) * r };
});

let sonarVisible = false;
new IntersectionObserver(entries => { sonarVisible = entries[0].isIntersecting; }).observe(sonar);

function drawSonar(now) {
    requestAnimationFrame(drawSonar);
    if (!sonarVisible) return;

    const css = getComputedStyle(document.documentElement);
    const TEAL = css.getPropertyValue('--teal').trim();
    const LINE = css.getPropertyValue('--line').trim();
    const WARN = css.getPropertyValue('--warn').trim();
    const c = SIZE / 2;
    const sweep = REDUCE_MOTION ? -Math.PI / 4 : (now / 1000 * 0.9) % (Math.PI * 2);

    sc.clearRect(0, 0, SIZE, SIZE);

    // 同心圓與十字線
    sc.strokeStyle = LINE;
    sc.lineWidth = 1;
    [40, 80, 125].forEach(r => { sc.beginPath(); sc.arc(c, c, r, 0, Math.PI * 2); sc.stroke(); });
    sc.beginPath();
    sc.moveTo(c, 5); sc.lineTo(c, SIZE - 5);
    sc.moveTo(5, c); sc.lineTo(SIZE - 5, c);
    sc.stroke();

    // 掃描扇形（後面拖著漸淡的尾巴）
    for (let i = 0; i < 24; i++) {
        const a = sweep - i * 0.03;
        sc.beginPath();
        sc.moveTo(c, c);
        sc.arc(c, c, 125, a - 0.03, a);
        sc.closePath();
        sc.fillStyle = `rgba(63, 191, 174, ${0.22 * (1 - i / 24)})`;
        sc.fill();
    }

    // 訊號點：掃描線剛經過時最亮，之後慢慢變暗
    contacts.forEach(p => {
        let diff = (sweep - p.a) % (Math.PI * 2);
        if (diff < 0) diff += Math.PI * 2;
        const alpha = Math.max(0.08, 1 - diff / 3);
        sc.fillStyle = `rgba(63, 191, 174, ${alpha})`;
        sc.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 1, 3, 3);
    });

    // 基地：正中央，紅色閃爍
    const blink = REDUCE_MOTION || Math.floor(now / 600) % 2 === 0;
    sc.fillStyle = WARN;
    if (blink) sc.fillRect(c - 3, c - 3, 6, 6);
    sc.strokeStyle = WARN;
    sc.strokeRect(c - 8.5, c - 8.5, 17, 17);

    sc.fillStyle = TEAL;
    sc.font = '14px VT323, Consolas, monospace';
    sc.textAlign = 'center';
    sc.fillText('N', c, 14);
    sc.textAlign = 'left';
    sc.fillText('MUON', c + 13, c - 10);
}
requestAnimationFrame(drawSonar);

// 最後才開始獨白（要先知道有沒有存檔）
setTimeout(monologue, 800);
