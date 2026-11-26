/* =========================================================
   聲音系統 audio.js（全站共用）
   - 所有聲音都用瀏覽器內建的 Web Audio API 即時合成，
     不需要音檔，也沒有版權問題
   - 預設是靜音；玩家按下導覽列的聲音按鈕才會開啟，
     選擇會記在 localStorage，換頁、下次再來都會記得
   - 瀏覽器規定：使用者點擊或按鍵之前不能自動播放聲音，
     所以就算設定是「開」，也要等第一次點擊才會開始播

   其他程式可以這樣呼叫：
     MuonAudio.tick()          打字聲
     MuonAudio.glitch(0.6)     故障雜訊（秒數）
     MuonAudio.beep()          遠方的逼逼聲
     MuonAudio.crt()           電視開機聲
   靜音時呼叫也沒關係，會自動不出聲
   ========================================================= */

const MuonAudio = (() => {
    const STORAGE_KEY = 'muon-sound';
    const VOLUME = 0.5;          // 總音量（0～1）

    let ctx = null;              // AudioContext：所有聲音的「混音台」
    let master = null;           // 總音量旋鈕
    let ambientStarted = false;
    let enabled = false;

    try { enabled = localStorage.getItem(STORAGE_KEY) === 'on'; } catch (e) { /* 忽略 */ }

    /* ---------- 基本設定 ---------- */

    function ensureContext() {
        if (!ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return false;               // 太舊的瀏覽器不支援
            ctx = new AC();
            master = ctx.createGain();
            master.gain.value = 0;
            master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') ctx.resume();
        return true;
    }

    // 產生一段「棕色噪音」：低沉、像水流和遠方的轟鳴
    function makeBrownNoise(seconds) {
        const length = ctx.sampleRate * seconds;
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        let last = 0;
        for (let i = 0; i < length; i++) {
            const white = Math.random() * 2 - 1;
            last = (last + 0.02 * white) / 1.02;
            data[i] = last * 3.5;
        }
        return buffer;
    }

    function makeWhiteNoise(seconds) {
        const length = Math.floor(ctx.sampleRate * seconds);
        const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
        return buffer;
    }

    /* ---------- 背景音：海底低鳴 ---------- */

    function startAmbient() {
        if (ambientStarted || !ctx) return;
        ambientStarted = true;

        const ambient = ctx.createGain();
        ambient.gain.value = 1;
        ambient.connect(master);

        // 1. 水壓的低頻轟鳴：棕色噪音 ＋ 低通濾波，濾波頻率緩慢起伏，像海浪一樣
        const noise = ctx.createBufferSource();
        noise.buffer = makeBrownNoise(6);
        noise.loop = true;
        const lowpass = ctx.createBiquadFilter();
        lowpass.type = 'lowpass';
        lowpass.frequency.value = 260;
        const lfo = ctx.createOscillator();           // 很慢的起伏（約 14 秒一次）
        lfo.frequency.value = 0.07;
        const lfoDepth = ctx.createGain();
        lfoDepth.gain.value = 140;
        lfo.connect(lfoDepth).connect(lowpass.frequency);
        const noiseGain = ctx.createGain();
        noiseGain.gain.value = 0.35;
        noise.connect(lowpass).connect(noiseGain).connect(ambient);

        // 2. 機械的嗡嗡聲：兩個頻率很接近的低音，會產生緩慢的「拍頻」
        const droneGain = ctx.createGain();
        droneGain.gain.value = 0.05;
        droneGain.connect(ambient);
        [55, 55.4, 82.6].forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = i === 2 ? 'triangle' : 'sine';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.value = i === 2 ? 0.35 : 1;
            osc.connect(g).connect(droneGain);
            osc.start();
        });

        noise.start();
        lfo.start();

        // 3. 偶爾傳來遠方的聲納聲
        scheduleSonar(ambient);

        // 4. 偶爾傳來遠方設備的逼逼聲
        scheduleBeeps(ambient);
    }

    function scheduleSonar(out) {
        const wait = 18000 + Math.random() * 20000;
        setTimeout(() => {
            if (enabled && ctx) {
                const t = ctx.currentTime;
                const osc = ctx.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(1250, t);
                osc.frequency.exponentialRampToValueAtTime(1180, t + 2.5);
                const g = ctx.createGain();
                g.gain.setValueAtTime(0, t);
                g.gain.linearRampToValueAtTime(0.035, t + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
                // 加一點回音，聽起來比較遠
                const delay = ctx.createDelay();
                delay.delayTime.value = 0.45;
                const feedback = ctx.createGain();
                feedback.gain.value = 0.35;
                delay.connect(feedback).connect(delay);
                osc.connect(g);
                g.connect(out);
                g.connect(delay).connect(out);
                osc.start(t);
                osc.stop(t + 3);
            }
            scheduleSonar(out);
        }, wait);
    }

    /* ---------- 遠方的逼逼聲 ---------- */

    // 回音（殘響）：用一段慢慢變小的雜訊模擬「很大、很空的空間」
    let reverb = null;
    function getReverb(out) {
        if (reverb) return reverb;
        const seconds = 3.5;
        const length = Math.floor(ctx.sampleRate * seconds);
        const ir = ctx.createBuffer(2, length, ctx.sampleRate);
        for (let ch = 0; ch < 2; ch++) {
            const d = ir.getChannelData(ch);
            for (let i = 0; i < length; i++) {
                d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
            }
        }
        reverb = ctx.createConvolver();
        reverb.buffer = ir;
        const wet = ctx.createGain();
        wet.gain.value = 0.9;
        reverb.connect(wet).connect(out);
        return reverb;
    }

    // 一次逼逼：1～3 聲，高音、很小聲、經過低通（遠）＋回音
    function beepPattern(out) {
        const t0 = ctx.currentTime;
        const count = 1 + Math.floor(Math.random() * 3);
        const freq = [1760, 2093, 2349][Math.floor(Math.random() * 3)];
        const gap = 0.22;

        const far = ctx.createBiquadFilter();       // 越遠，高音越被吸收
        far.type = 'lowpass';
        far.frequency.value = 2600;
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
        if (pan.pan) pan.pan.value = Math.random() * 1.4 - 0.7;   // 隨機從左邊或右邊傳來
        far.connect(pan);
        const dry = ctx.createGain();
        dry.gain.value = 0.25;                       // 直接聲很小，大部分是回音
        pan.connect(dry).connect(out);
        pan.connect(getReverb(out));

        // 再加一點會重複的回聲，像聲音在走廊裡來回反彈
        const echo = ctx.createDelay();
        echo.delayTime.value = 0.38;
        const fb = ctx.createGain();
        fb.gain.value = 0.4;
        echo.connect(fb).connect(echo);
        const echoOut = ctx.createGain();
        echoOut.gain.value = 0.5;
        pan.connect(echo);
        echo.connect(echoOut).connect(out);

        for (let i = 0; i < count; i++) {
            const t = t0 + i * gap;
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0, t);
            g.gain.linearRampToValueAtTime(0.018, t + 0.005);
            g.gain.setValueAtTime(0.018, t + 0.09);
            g.gain.linearRampToValueAtTime(0, t + 0.1);
            osc.connect(g).connect(far);
            osc.start(t);
            osc.stop(t + 0.12);
        }
    }

    function scheduleBeeps(out) {
        const wait = 9000 + Math.random() * 16000;   // 9～25 秒一次
        setTimeout(() => {
            if (enabled && ctx && ctx.state === 'running') beepPattern(out);
            scheduleBeeps(out);
        }, wait);
    }

    /* ---------- 音效 ---------- */

    // 打字聲：很短的高頻雜訊，像舊鍵盤或終端機的喀噠聲
    function tick() {
        if (!enabled || !ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;
        const src = ctx.createBufferSource();
        src.buffer = makeWhiteNoise(0.03);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 2400 + Math.random() * 800;
        band.Q.value = 2;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.025);
        src.connect(band).connect(g).connect(master);
        src.start(t);
    }

    // 故障雜訊：像訊號被干擾的沙沙聲。
    // 雜訊會一下有一下沒有（斷斷續續），頻率亂跳，再加一點破音，聽起來比較「髒」
    function glitch(duration = 0.4) {
        if (!enabled || !ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;

        const out = ctx.createGain();
        out.gain.setValueAtTime(0.1, t);
        out.gain.setValueAtTime(0.1, t + duration - 0.04);
        out.gain.linearRampToValueAtTime(0, t + duration);
        out.connect(master);

        // 破音：把聲音削平，產生粗糙的失真感
        const crush = ctx.createWaveShaper();
        const curve = new Float32Array(256);
        for (let i = 0; i < 256; i++) {
            const x = i / 128 - 1;
            curve[i] = Math.round(x * 4) / 4;      // 只剩幾個階層，像低解析度的數位聲音
        }
        crush.curve = curve;
        crush.connect(out);

        // 1. 主體：白噪音經過一個頻率亂跳的濾波器，並且斷斷續續
        const noise = ctx.createBufferSource();
        noise.buffer = makeWhiteNoise(duration + 0.1);
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.Q.value = 0.8;
        const gate = ctx.createGain();
        for (let s = 0; s < duration; s += 0.02 + Math.random() * 0.04) {
            band.frequency.setValueAtTime(300 + Math.random() * 5000, t + s);
            gate.gain.setValueAtTime(Math.random() < 0.75 ? 0.6 + Math.random() * 0.8 : 0, t + s);
        }
        noise.connect(band).connect(gate).connect(crush);
        noise.start(t);

        // 2. 低頻的「啵」聲：訊號斷掉時的爆音
        const thump = ctx.createBufferSource();
        thump.buffer = makeBrownNoise(duration + 0.1);
        const tg = ctx.createGain();
        for (let s = 0; s < duration; s += 0.06 + Math.random() * 0.1) {
            tg.gain.setValueAtTime(Math.random() < 0.4 ? 1.2 : 0, t + s);
        }
        thump.connect(tg).connect(crush);
        thump.start(t);

        // 3. 很少量的電子音，只當一點點調味
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        const og = ctx.createGain();
        og.gain.value = 0.08;
        for (let s = 0; s < duration; s += 0.05) {
            osc.frequency.setValueAtTime(60 + Math.random() * 400, t + s);
        }
        osc.connect(og).connect(crush);
        osc.start(t);
        osc.stop(t + duration);
    }

    // 電視開機：「咚」一聲＋一陣靜電沙沙聲＋映像管的高頻嗡鳴
    function crt() {
        if (!enabled || !ctx || ctx.state !== 'running') return;
        const t = ctx.currentTime;

        const thump = ctx.createBufferSource();
        thump.buffer = makeBrownNoise(0.4);
        const tg = ctx.createGain();
        tg.gain.setValueAtTime(0.9, t);
        tg.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
        thump.connect(tg).connect(master);
        thump.start(t);

        const stat = ctx.createBufferSource();
        stat.buffer = makeWhiteNoise(1.2);
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 2000;
        const sg = ctx.createGain();
        sg.gain.setValueAtTime(0.0001, t);
        sg.gain.exponentialRampToValueAtTime(0.08, t + 0.15);
        sg.gain.exponentialRampToValueAtTime(0.0001, t + 1.2);
        stat.connect(hp).connect(sg).connect(master);
        stat.start(t);

        const whine = ctx.createOscillator();
        whine.type = 'sine';
        whine.frequency.setValueAtTime(7500, t);
        whine.frequency.linearRampToValueAtTime(7900, t + 0.4);
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0, t);
        wg.gain.linearRampToValueAtTime(0.012, t + 0.1);
        wg.gain.exponentialRampToValueAtTime(0.0001, t + 2);
        whine.connect(wg).connect(master);
        whine.start(t);
        whine.stop(t + 2);
    }

    /* ---------- 開／關 ---------- */

    function fadeTo(value, time) {
        if (!master) return;
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setTargetAtTime(value, now, time);
    }

    /* 瀏覽器的自動播放限制：
       每一頁都要等使用者「點擊或按鍵」之後，聲音才允許播放。
       所以設定為「開」時：
       1. 一進頁面就先試著播放（有些瀏覽器允許）
       2. 如果被擋下來，按鈕會顯示「點擊畫面啟用」，
          之後只要使用者在頁面上任何地方點擊或按鍵，就再試一次，直到成功為止 */

    let pending = false;   // 設定是開，但瀏覽器還不讓播
    const UNLOCK_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'click', 'keydown', 'touchend'];

    function isRunning() { return !!ctx && ctx.state === 'running'; }

    function refresh() {
        pending = enabled && !isRunning();
        updateButtons();
        if (!pending) UNLOCK_EVENTS.forEach(ev => window.removeEventListener(ev, tryStart, true));
    }

    function tryStart() {
        if (!enabled || !ensureContext()) return;
        startAmbient();
        fadeTo(VOLUME, 0.8);        // 慢慢淡入，不會突然嚇到人
        if (!ctx.onstatechange) ctx.onstatechange = refresh;
        const p = ctx.resume();
        if (p && p.then) p.then(refresh, refresh);
        refresh();
    }

    function waitForGesture() {
        UNLOCK_EVENTS.forEach(ev => window.addEventListener(ev, tryStart, true));
    }

    function setEnabled(on) {
        enabled = on;
        try { localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off'); } catch (e) { /* 忽略 */ }
        if (on) {
            tryStart();
            if (!isRunning()) waitForGesture();
        } else {
            fadeTo(0, 0.25);
        }
        refresh();
    }

    function updateButtons() {
        document.querySelectorAll('.sound-toggle').forEach(btn => {
            btn.classList.toggle('on', enabled);
            btn.classList.toggle('pending', pending);
            btn.setAttribute('aria-pressed', String(enabled));
            btn.setAttribute('aria-label', pending ? '點擊以啟用聲音' : enabled ? '關閉聲音' : '開啟聲音');
            const label = btn.querySelector('.sound-label');
            if (label) label.textContent = pending ? '點擊畫面啟用' : enabled ? '聲音 開' : '聲音 關';
        });
    }

    // 綁定按鈕
    document.querySelectorAll('.sound-toggle').forEach(btn => {
        btn.addEventListener('click', e => {
            e.stopPropagation();
            // 正在等待啟用時按按鈕：是要「讓聲音出來」，不是要關掉
            if (enabled && !isRunning()) { tryStart(); return; }
            setEnabled(!enabled);
        });
    });

    // 上次設定為「開」：先試著播放，被擋下來就等使用者的第一次點擊或按鍵
    if (enabled) {
        tryStart();
        waitForGesture();
    }
    refresh();

    // 遠方逼逼聲也開放給其他程式用（例如遊戲裡的警示）
    function beep() {
        if (enabled && ctx && ctx.state === 'running') beepPattern(master);
    }

    return { tick, glitch, beep, crt, isOn: () => enabled };
})();
