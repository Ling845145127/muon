/* =========================================================
   關於頁 about.js
   捲動時，左側目錄會亮起目前正在看的段落（scrollspy）
   ========================================================= */

const tocLinks = document.querySelectorAll('.toc a');
const sections = document.querySelectorAll('.about-section');

const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        tocLinks.forEach(link => {
            link.classList.toggle('current', link.getAttribute('href') === '#' + entry.target.id);
        });
    });
}, {
    // 段落進入畫面上方 1/3 的範圍時，才算「正在看」
    rootMargin: '-20% 0px -65% 0px',
});

sections.forEach(section => observer.observe(section));
