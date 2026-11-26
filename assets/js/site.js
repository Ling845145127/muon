/* =========================================================
   全站共用 site.js
   - 導覽列右邊的訊號、電力
   - 往下捲時導覽列變成實心底
   ========================================================= */

const REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// 基地目前的電力（之後可以改成跟著遊戲進度變化）
const BASE_POWER = 12;

const powerEl = document.getElementById('power');
if (powerEl) {
    powerEl.textContent = BASE_POWER;
    if (BASE_POWER <= 15) powerEl.classList.add('low');
}

// 訊號格數隨機跳動
const signalEl = document.getElementById('signal');
if (signalEl) {
    const BARS = ['▂▁▁▁', '▂▄▁▁', '▂▄▆▁', '▁▁▁▁'];
    setInterval(() => {
        const r = Math.random();
        signalEl.textContent = '訊號 ' + (r < 0.6 ? BARS[1] : r < 0.85 ? BARS[0] : r < 0.95 ? BARS[2] : BARS[3]);
    }, 1200);
}

// 捲動超過 40px，導覽列加上實心底，避免文字疊在一起看不清楚
// （只有首頁需要，其他頁的導覽列一開始就是實心的）
const header = document.querySelector('.site-header');
if (header && document.body.classList.contains('cover')) {
    const updateHeader = () => header.classList.toggle('solid', window.scrollY > 40);
    window.addEventListener('scroll', updateHeader, { passive: true });
    updateHeader();
}
