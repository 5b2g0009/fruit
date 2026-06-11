/**
 * Fruit Ninja HTML5 Canvas Game Engine (With Classic & Arcade Modes)
 */
(function() {
  // Canvas and Context
  let canvas;
  let ctx;
  let animationFrameId = null;

  // Game Settings & Tuning
  const GRAVITY = 0.28;
  const SPAWN_INTERVAL = 2000; // ms
  const INITIAL_SPAWN_SPEED_Y = -12;
  const SPEED_MULTIPLIER = 1.05; 
  const SWIPE_SOUND_MIN_DISTANCE = 100; 
  const SWIPE_SOUND_COOLDOWN = 140; 

  // Game State Variables
  let isPlaying = false;
  let score = 0;
  let lives = 3;
  let slicedCount = 0;
  let maxCombo = 0;
  let soundEnabled = true;
  let lastSpawnTime = 0;
  let lastFrameTime = 0; 

  // 【新增】模式與娛樂模式特殊狀態狀態變數
  let gameMode = 'classic'; // 'classic' 或 'arcade'
  let frenzyTimer = 0;     // 狂暴模式剩餘時間 (毫秒)
  let freezeTimer = 0;     // 冰凍/慢動作剩餘時間 (毫秒)

  // Game Objects lists
  let fruits = [];
  let particles = [];
  let splatters = [];
  let bladePoints = []; 
  let floatingTexts = [];

  // Drag State Tracker
  let isDragging = false;
  let activeSwipeFruits = new Set(); 
  let comboTimer = null;
  let lastSwipeSoundTime = 0;
  let accumulatedSwipeDistance = 0;

  // Fruit Types and Properties (擴充娛樂模式道具)
  const FRUIT_TYPES = {
    WATERMELON: { name: 'watermelon', radius: 46, colorOuter: '#1b4d3e', colorInner: '#ff2d55', colorSeed: '#000000', splatColor: 'rgba(255, 45, 85, 0.85)', points: 1 },
    APPLE: { name: 'apple', radius: 34, colorOuter: '#c8102e', colorInner: '#fffdd0', colorSeed: '#5c4033', splatColor: 'rgba(200, 16, 46, 0.8)', points: 1 },
    ORANGE: { name: 'orange', radius: 36, colorOuter: '#ff8c00', colorInner: '#ffa500', colorSeed: '#fff', splatColor: 'rgba(255, 140, 0, 0.85)', points: 1 },
    BANANA: { name: 'banana', radius: 30, colorOuter: '#ffd700', colorInner: '#fffdd0', colorSeed: '#000', splatColor: 'rgba(255, 215, 0, 0.8)', points: 1 },
    COCONUT: { name: 'coconut', radius: 38, colorOuter: '#5c4033', colorInner: '#ffffff', colorSeed: '#5c4033', splatColor: 'rgba(240, 240, 240, 0.85)', points: 2 },
    BOMB: { name: 'bomb', radius: 32, colorOuter: '#222222', colorInner: '#ff3b30', splatColor: 'rgba(255, 255, 255, 0.95)', points: 0, isBomb: true },
    
    // 【娛樂模式專屬特殊道具】
    FRENZY_BANANA: { name: 'frenzy_banana', radius: 32, colorOuter: '#00f2fe', colorInner: '#fff', colorSeed: '#00f2fe', splatColor: 'rgba(0, 242, 254, 0.8)', points: 2, isSpecial: true },
    FREEZE_STRAWBERRY: { name: 'freeze_strawberry', radius: 28, colorOuter: '#33cdff', colorInner: '#fff', colorSeed: '#33cdff', splatColor: 'rgba(51, 205, 255, 0.8)', points: 2, isSpecial: true }
  };

  // Web Audio Context Synthesizer
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    try {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      const now = audioCtx.currentTime;

      if (type === 'swoosh') {
        const duration = 0.18;
        const sampleRate = audioCtx.sampleRate;
        const bufferSize = Math.floor(sampleRate * duration);
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
          const t = i / bufferSize;
          const fadeIn = Math.min(1, t / 0.12);
          const fadeOut = Math.pow(1 - t, 1.8);
          output[i] = (Math.random() * 2 - 1) * fadeIn * fadeOut;
        }

        const noise = audioCtx.createBufferSource();
        const highPass = audioCtx.createBiquadFilter();
        const bandPass = audioCtx.createBiquadFilter();
        const swooshGain = audioCtx.createGain();

        noise.buffer = noiseBuffer;
        highPass.type = 'highpass';
        highPass.frequency.setValueAtTime(650, now);
        bandPass.type = 'bandpass';
        bandPass.Q.setValueAtTime(1.1, now);
        bandPass.frequency.setValueAtTime(2200, now);
        bandPass.frequency.exponentialRampToValueAtTime(520, now + duration);

        swooshGain.gain.setValueAtTime(0.0001, now);
        swooshGain.gain.exponentialRampToValueAtTime(0.16, now + 0.035);
        swooshGain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

        noise.connect(highPass);
        highPass.connect(bandPass);
        bandPass.connect(swooshGain);
        swooshGain.connect(audioCtx.destination);

        noise.start(now);
        noise.stop(now + duration);
      } else if (type === 'slice') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'miss') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.08);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'explosion') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
        
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(100, now);
        filter.frequency.exponentialRampToValueAtTime(20, now + 0.6);

        osc.disconnect(gainNode);
        osc.connect(filter);
        filter.connect(gainNode);

        gainNode.gain.setValueAtTime(0.6, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
        osc.start(now);
        osc.stop(now + 0.65);
      } else if (type === 'powerup') { // 新增特殊道具音效
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.3);
        gainNode.gain.setValueAtTime(0.2, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch (e) {
      console.warn('Audio Context block:', e);
    }
  }

  // --- UI Bindings ---
  document.addEventListener('DOMContentLoaded', () => {
    canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    ctx = canvas.getContext('2d');

    const btnStart = document.getElementById('btnStartGame');
    const btnOverlayPlay = document.getElementById('btnOverlayPlay');
    const btnRestart = document.getElementById('btnRestartGame');
    const btnToggleSound = document.getElementById('btnToggleSound');
    const btnFullscreen = document.getElementById('btnFullscreenGame');
    
    if (btnStart) btnStart.addEventListener('click', startGame);
    if (btnOverlayPlay) btnOverlayPlay.addEventListener('click', startGame);
    if (btnRestart) btnRestart.addEventListener('click', startGame);
    if (btnFullscreen) btnFullscreen.addEventListener('click', toggleGameFullscreen);

    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        btnToggleSound.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-up"></i> 音效: 開' : '<i class="fa-solid fa-volume-mute"></i> 音效: 關';
        btnToggleSound.classList.toggle('btn-secondary', !soundEnabled);
        btnToggleSound.classList.toggle('btn-primary', soundEnabled);
      });
    }

    const storedHighScore = localStorage.getItem('fn_high_score') || 0;
    const gameHighScoreHUD = document.getElementById('gameHighScore');
    if (gameHighScoreHUD) gameHighScoreHUD.textContent = storedHighScore;

    window.addEventListener('resize', resizeGameCanvas);
    document.addEventListener('fullscreenchange', updateFullscreenButton);
    resizeGameCanvas();
    updateFullscreenButton();

    setupInputListeners();
  });

  function toggleGameFullscreen() {
    const target = document.getElementById('gameFullscreenTarget') || canvas?.parentElement;
    if (!target) return;
    if (!document.fullscreenElement) {
      target.requestFullscreen?.().catch(err => console.warn(err));
    } else {
      document.exitFullscreen?.();
    }
  }

  function updateFullscreenButton() {
    const btnFullscreen = document.getElementById('btnFullscreenGame');
    if (!btnFullscreen) return;
    const isFullscreen = !!document.fullscreenElement;
    btnFullscreen.innerHTML = isFullscreen
      ? '<i class="fa-solid fa-compress"></i><span>退出全螢幕</span>'
      : '<i class="fa-solid fa-expand"></i><span>全螢幕</span>';
    requestAnimationFrame(resizeGameCanvas);
  }

  function resizeGameCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    if (container) {
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
    }
  }

  function setupInputListeners() {
    canvas.addEventListener('mousedown', (e) => {
      if (!isPlaying) return;
      isDragging = true;
      bladePoints = [];
      activeSwipeFruits.clear();
      accumulatedSwipeDistance = 0;
      addBladePoint(e);
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging || !isPlaying) return;
      addBladePoint(e);
      maybePlaySwipeSound();
      checkSlices();
    });

    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      accumulatedSwipeDistance = 0;
      evaluateCombo();
    };

    window.addEventListener('mouseup', stopDrag);
    canvas.addEventListener('mouseleave', stopDrag);

    canvas.addEventListener('touchstart', (e) => {
      if (!isPlaying || e.touches.length === 0) return;
      isDragging = true;
      bladePoints = [];
      activeSwipeFruits.clear();
      accumulatedSwipeDistance = 0;
      addBladePoint(e.touches[0]);
    });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDragging || !isPlaying || e.touches.length === 0) return;
      e.preventDefault();
      addBladePoint(e.touches[0]);
      maybePlaySwipeSound();
      checkSlices();
    }, { passive: false });

    canvas.addEventListener('touchend', stopDrag);
    canvas.addEventListener('touchcancel', stopDrag);
  }

  function addBladePoint(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    bladePoints.push({ x, y, age: 0 });
    if (bladePoints.length > 15) bladePoints.shift();
  }

  function maybePlaySwipeSound() {
    if (bladePoints.length < 2) return;
    const last = bladePoints[bladePoints.length - 1];
    const previous = bladePoints[bladePoints.length - 2];
    const dx = last.x - previous.x;
    const dy = last.y - previous.y;
    accumulatedSwipeDistance += Math.sqrt(dx * dx + dy * dy);

    const now = performance.now();
    if (accumulatedSwipeDistance >= SWIPE_SOUND_MIN_DISTANCE && now - lastSwipeSoundTime >= SWIPE_SOUND_COOLDOWN) {
      playSound('swoosh');
      lastSwipeSoundTime = now;
      accumulatedSwipeDistance = 0;
    }
  }

  // --- Fruit Class ---
  class Fruit {
    constructor(type, customSide = null) {
      this.type = type;
      this.radius = type.radius;
      this.isSliced = false;
      this.isBomb = !!type.isBomb;
      this.isSpecial = !!type.isSpecial;
      this.points = type.points;

      // 如果是狂暴模式，水果會從左右兩側橫向噴出
      if (customSide === 'left') {
        this.x = -this.radius;
        this.y = Math.random() * (canvas.height * 0.4) + (canvas.height * 0.2);
        this.vx = Math.random() * 5 + 6;
        this.vy = -(Math.random() * 4 + 4);
      } else if (customSide === 'right') {
        this.x = canvas.width + this.radius;
        this.y = Math.random() * (canvas.height * 0.4) + (canvas.height * 0.2);
        this.vx = -(Math.random() * 5 + 6);
        this.vy = -(Math.random() * 4 + 4);
      } else {
        // 標準向上噴射
        this.x = Math.random() * (canvas.width - 200) + 100;
        this.y = canvas.height + this.radius;
        const direction = this.x < canvas.width / 2 ? 1 : -1;
        this.vx = (Math.random() * 3 + 1) * direction;
        
        const baseUpwardSpeed = Math.abs(INITIAL_SPAWN_SPEED_Y) * Math.pow(SPEED_MULTIPLIER, Math.floor(score / 15));
        const cappedUpwardSpeed = Math.min(18, baseUpwardSpeed); 
        this.vy = -(cappedUpwardSpeed + Math.random() * 3);
      }

      this.angle = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() * 0.06 - 0.03);
      this.halfL = null;
      this.halfR = null;
    }

    update(timeScale) {
      if (!this.isSliced) {
        this.x += this.vx * timeScale;
        this.y += this.vy * timeScale;
        this.vy += GRAVITY * timeScale; 
        this.angle += this.rotationSpeed * timeScale;
      } else {
        if (this.halfL) this.halfL.update(timeScale);
        if (this.halfR) this.halfR.update(timeScale);
      }
    }

    draw() {
      if (!this.isSliced) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);

        if (this.isBomb) {
          drawBomb(ctx, this.radius);
        } else if (this.isSpecial) {
          drawSpecialGraphic(ctx, this.type, this.radius);
        } else {
          drawFruitGraphic(ctx, this.type, this.radius);
        }
        ctx.restore();
      } else {
        if (this.halfL) this.halfL.draw();
        if (this.halfR) this.halfR.draw();
      }
    }

    slice() {
      if (this.isSliced) return;
      this.isSliced = true;

      if (this.isBomb) {
        playSound('explosion');
        createExplosionParticles(this.x, this.y);
        
        // 【模式客製處理】娛樂模式下切到炸彈不立刻結束，而是倒扣分數
        if (gameMode === 'arcade') {
          score = Math.max(0, score - 10);
          floatingTexts.push(new FloatingText(this.x, this.y - 30, '炸彈扣分! -10', '#ff3b30'));
          return;
        } else {
          gameOver();
          return;
        }
      }

      activeSwipeFruits.add(this);
      playSound('slice');
      slicedCount++;

      // 【道具觸發】若切到娛樂模式專屬道具
      if (this.type.name === 'frenzy_banana') {
        frenzyTimer = 5000; // 啟動 5 秒狂暴時間
        playSound('powerup');
        floatingTexts.push(new FloatingText(this.x, this.y - 20, 'FRENZY 狂暴香蕉!', '#00f2fe'));
      } else if (this.type.name === 'freeze_strawberry') {
        freezeTimer = 5000; // 啟動 5 秒冰凍慢動作
        playSound('powerup');
        floatingTexts.push(new FloatingText(this.x, this.y - 20, 'FREEZE 冰凍時間!', '#33cdff'));
      }

      createJuiceParticles(this.x, this.y, this.type.splatColor);
      createSplatter(this.x, this.y, this.type.splatColor);

      this.halfL = new SlicedHalf(this.x, this.y, this.radius, this.type, 'left', this.vx - 3.5, this.vy - 1);
      this.halfR = new SlicedHalf(this.x, this.y, this.radius, this.type, 'right', this.vx + 3.5, this.vy - 1);
    }
  }

  // --- Sliced Half Class ---
  class SlicedHalf {
    constructor(x, y, radius, type, side, vx, vy) {
      this.x = x; this.y = y; this.radius = radius; this.type = type; this.side = side; this.vx = vx; this.vy = vy;
      this.angle = Math.random() * Math.PI * 2;
      this.rotationSpeed = side === 'left' ? -0.06 : 0.06;
      this.opacity = 1.0;
    }
    update(timeScale) {
      this.x += this.vx * timeScale;
      this.y += this.vy * timeScale;
      this.vy += (GRAVITY * 1.1) * timeScale; 
      this.angle += this.rotationSpeed * timeScale;
      this.opacity -= 0.015 * timeScale; 
    }
    draw() {
      if (this.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);
      ctx.beginPath();
      if (this.side === 'left') ctx.arc(0, 0, this.radius, Math.PI * 0.5, Math.PI * 1.5, false);
      else ctx.arc(0, 0, this.radius, Math.PI * 1.5, Math.PI * 0.5, false);
      ctx.closePath();
      ctx.clip();

      if (this.type.isSpecial) drawSpecialGraphic(ctx, this.type, this.radius);
      else drawFruitGraphic(ctx, this.type, this.radius);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -this.radius); ctx.lineTo(0, this.radius); ctx.stroke();
      ctx.restore();
    }
  }

  // --- Juice Particles, Splatter & FloatingText Classes ---
  class Particle {
    constructor(x, y, color) {
      this.x = x; this.y = y; this.color = color;
      this.radius = Math.random() * 4 + 2;
      this.vx = Math.random() * 10 - 5;
      this.vy = Math.random() * 12 - 7;
      this.opacity = 1.0;
      this.decay = Math.random() * 0.03 + 0.02;
    }
    update(timeScale) {
      this.x += this.vx * timeScale; this.y += this.vy * timeScale;
      this.vy += (GRAVITY * 0.8) * timeScale; this.opacity -= this.decay * timeScale;
    }
    draw() {
      if (this.opacity <= 0) return;
      ctx.save(); ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  class Splatter {
    constructor(x, y, color) {
      this.x = x; this.y = y; this.color = color; this.radius = Math.random() * 30 + 15; this.opacity = 0.9; this.decay = 0.0015; this.splats = [];
      for (let i = 0; i < 6; i++) {
        this.splats.push({ rx: Math.random() * 20 - 10, ry: Math.random() * 20 - 10, rad: Math.random() * (this.radius * 0.5) + 3 });
      }
    }
    update(timeScale) { this.opacity -= this.decay * timeScale; }
    draw() {
      if (this.opacity <= 0) return;
      ctx.save(); ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2); ctx.fill();
      this.splats.forEach(s => { ctx.beginPath(); ctx.arc(this.x + s.rx, this.y + s.ry, s.rad, 0, Math.PI * 2); ctx.fill(); });
      ctx.restore();
    }
  }

  class FloatingText {
    constructor(x, y, text, color) {
      this.x = x; this.y = y; this.text = text; this.color = color; this.vy = -1.5; this.opacity = 1.0; this.scale = 1.0;
    }
    update(timeScale) { this.y += this.vy * timeScale; this.opacity -= 0.02 * timeScale; this.scale += 0.01 * timeScale; }
    draw() {
      if (this.opacity <= 0) return;
      ctx.save(); ctx.globalAlpha = this.opacity; ctx.fillStyle = this.color; ctx.shadowColor = this.color; ctx.shadowBlur = 10;
      ctx.font = '900 24px Outfit'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.translate(this.x, this.y); ctx.scale(this.scale, this.scale);
      ctx.fillText(this.text, 0, 0); ctx.restore();
    }
  }

  // --- Visual Rendering Helpers ---
  function drawFruitGraphic(c, type, r) {
    if (type.name === 'watermelon') {
      c.fillStyle = type.colorOuter; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r - 4, 0, Math.PI * 2); c.fill();
      c.fillStyle = type.colorInner; c.beginPath(); c.arc(0, 0, r - 7, 0, Math.PI * 2); c.fill();
      c.fillStyle = type.colorSeed; const seedR = 2.5; const seedOffsets = [[-12, -8], [12, -8], [-5, 12], [5, 12], [-15, 8], [15, 8], [0, -18]];
      seedOffsets.forEach(pos => { c.beginPath(); c.arc(pos[0], pos[1], seedR, 0, Math.PI * 2); c.fill(); });
    } else if (type.name === 'apple') {
      c.fillStyle = type.colorOuter; c.beginPath(); c.arc(-r/3, -r/10, r * 0.75, 0, Math.PI * 2); c.arc(r/3, -r/10, r * 0.75, 0, Math.PI * 2); c.fill();
      c.fillStyle = type.colorInner; c.beginPath(); c.arc(0, 0, r - 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = type.colorSeed; c.beginPath(); c.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2); c.fill();
    } else if (type.name === 'orange') {
      c.fillStyle = type.colorOuter; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, r - 3, 0, Math.PI * 2); c.fill();
      c.fillStyle = type.colorInner;
      for (let i = 0; i < 8; i++) {
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r - 5, (i * Math.PI / 4) + 0.08, ((i + 1) * Math.PI / 4) - 0.08); c.closePath(); c.fill();
      }
    } else if (type.name === 'banana') {
      c.fillStyle = type.colorOuter; c.beginPath(); c.arc(0, 10, r * 1.5, Math.PI * 1.25, Math.PI * 1.75); c.arc(0, 22, r * 1.5, Math.PI * 1.75, Math.PI * 1.25, true); c.closePath(); c.fill();
      c.fillStyle = type.colorInner; c.beginPath(); c.arc(0, 14, r * 1.3, Math.PI * 1.28, Math.PI * 1.72); c.arc(0, 20, r * 1.3, Math.PI * 1.72, Math.PI * 1.28, true); c.closePath(); c.fill();
    } else if (type.name === 'coconut') {
      c.fillStyle = type.colorOuter; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = type.colorInner; c.beginPath(); c.arc(0, 0, r - 5, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1e1c18'; c.beginPath(); c.arc(0, 0, r - 12, 0, Math.PI * 2); c.fill();
    }
  }

  // 【新增】繪製娛樂模式發光道具
  function drawSpecialGraphic(c, type, r) {
    c.save();
    c.shadowColor = type.colorOuter;
    c.shadowBlur = 15;
    
    if (type.name === 'frenzy_banana') {
      // 繪製科幻感發光藍香蕉
      c.fillStyle = '#00f2fe';
      c.beginPath(); c.arc(0, 10, r * 1.5, Math.PI * 1.25, Math.PI * 1.75); c.arc(0, 22, r * 1.5, Math.PI * 1.75, Math.PI * 1.25, true); c.closePath(); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, 14, r * 1.3, Math.PI * 1.28, Math.PI * 1.72); c.arc(0, 20, r * 1.3, Math.PI * 1.72, Math.PI * 1.28, true); c.closePath(); c.fill();
    } else if (type.name === 'freeze_strawberry') {
      // 繪製冰晶草莓（鑽石星芒外觀）
      c.fillStyle = '#33cdff';
      c.beginPath();
      c.moveTo(0, -r); c.lineTo(r, 0); c.lineTo(0, r); c.lineTo(-r, 0);
      c.closePath(); c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.moveTo(0, -r+6); c.lineTo(r-6, 0); c.lineTo(0, r-6); c.lineTo(-r+6, 0);
      c.closePath(); c.fill();
    }
    c.restore();
  }

  function drawBomb(c, r) {
    const grad = c.createRadialGradient(-5, -5, 2, 0, 0, r);
    grad.addColorStop(0, '#555555'); grad.addColorStop(0.7, '#222222'); grad.addColorStop(1, '#0c0c0c');
    c.fillStyle = grad; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#444444'; c.fillRect(-6, -r - 4, 12, 5);
    c.strokeStyle = '#b8860b'; c.lineWidth = 3; c.beginPath(); c.arc(10, -r - 12, 12, Math.PI, Math.PI * 1.8, false); c.stroke();

    c.fillStyle = '#ffcc00'; c.shadowColor = '#ff3300'; c.shadowBlur = 10;
    c.beginPath(); const sparks = 8; const outerR = 10; const innerR = 4; const sparkX = 22; const sparkY = -r - 15;
    for (let i = 0; i < sparks * 2; i++) {
      const angle = (i * Math.PI) / sparks; const currR = i % 2 === 0 ? outerR : innerR;
      const sx = sparkX + Math.cos(angle) * currR; const sy = sparkY + Math.sin(angle) * currR;
      if (i === 0) c.moveTo(sx, sy); else c.lineTo(sx, sy);
    }
    c.closePath(); c.fill();
  }

  function createJuiceParticles(x, y, color) {
    const numParticles = Math.floor(Math.random() * 8) + 10;
    for (let i = 0; i < numParticles; i++) particles.push(new Particle(x, y, color));
  }

  function createExplosionParticles(x, y) {
    const numParticles = 40; const colors = ['#ffffff', '#ffcc00', '#ff3300', '#333333'];
    for (let i = 0; i < numParticles; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const p = new Particle(x, y, col); p.radius = Math.random() * 8 + 3; p.vx = Math.random() * 20 - 10; p.vy = Math.random() * 20 - 10;
      particles.push(p);
    }
    floatingTexts.push(new FloatingText(x, y - 20, 'BOOM!', '#ff3b30'));
  }

  function createSplatter(x, y, color) {
    if (splatters.length > 8) splatters.shift();
    splatters.push(new Splatter(x, y, color));
  }

  function checkSlices() {
    if (bladePoints.length < 2) return;
    const p1 = bladePoints[bladePoints.length - 2];
    const p2 = bladePoints[bladePoints.length - 1];

    fruits.forEach(f => {
      if (f.isSliced) return;
      if (lineIntersectsCircle(p1.x, p1.y, p2.x, p2.y, f.x, f.y, f.radius)) {
        f.slice();
        if (!f.isBomb) {
          score += f.points;
          updateHUD();
        }
      }
    });
  }

  function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1; const dy = y2 - y1; const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return ((x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy)) <= r * r;
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq; t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx; const closestY = y1 + t * dy;
    return ((closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy)) <= r * r;
  }

  function evaluateCombo() {
    if (activeSwipeFruits.size >= 3) {
      const size = activeSwipeFruits.size;
      let bonus = 0; let comboName = '';
      if (size === 3) { bonus = 3; comboName = '3-Fruit Combo! +3'; }
      else if (size === 4) { bonus = 5; comboName = '4-Fruit Combo! +5'; }
      else { bonus = 8; comboName = `${size}-Fruit Combo! +8`; }

      score += bonus;
      if (size > maxCombo) maxCombo = size;

      let avgX = 0; let avgY = 0;
      activeSwipeFruits.forEach(f => { avgX += f.x; avgY += f.y; });
      avgX /= size; avgY /= size;

      floatingTexts.push(new FloatingText(avgX, avgY - 20, comboName, '#ffd700'));
      updateHUD();
    }
    activeSwipeFruits.clear();
  }

  function updateHUD() {}

  // 水果生成機制計時
  function spawnFruits() {
    // 若處於狂暴模式，生成數加倍，且不產生炸彈
    if (frenzyTimer > 0) {
      const side = Math.random() < 0.5 ? 'left' : 'right';
      const batchCount = Math.floor(Math.random() * 3) + 3; // 一次噴射 3-5 顆
      const types = [FRUIT_TYPES.WATERMELON, FRUIT_TYPES.APPLE, FRUIT_TYPES.ORANGE, FRUIT_TYPES.BANANA, FRUIT_TYPES.COCONUT];
      for (let i = 0; i < batchCount; i++) {
        const type = types[Math.floor(Math.random() * types.length)];
        fruits.push(new Fruit(type, side));
      }
      return;
    }

    // 標準模式生成規則
    const batchCount = Math.floor(Math.random() * 3) + 1; 
    const bombThreshold = score < 10 ? 0.05 : (score < 25 ? 0.15 : 0.25);

    for (let i = 0; i < batchCount; i++) {
      const rand = Math.random();
      let type;
      
      // 如果是娛樂模式，有 12% 機率產生狂暴香蕉或冰凍草莓
      if (gameMode === 'arcade' && rand < 0.12) {
        type = Math.random() < 0.5 ? FRUIT_TYPES.FRENZY_BANANA : FRUIT_TYPES.FREEZE_STRAWBERRY;
      } else if (rand < bombThreshold) {
        type = FRUIT_TYPES.BOMB;
      } else {
        const types = [FRUIT_TYPES.WATERMELON, FRUIT_TYPES.APPLE, FRUIT_TYPES.ORANGE, FRUIT_TYPES.BANANA, FRUIT_TYPES.COCONUT];
        type = types[Math.floor(Math.random() * types.length)];
      }
      fruits.push(new Fruit(type));
    }
  }

  // --- Main Canvas Render loop (Delta Time Control) ---
  function drawGame(timestamp) {
    if (!isPlaying) return;

    if (!lastFrameTime) lastFrameTime = timestamp;
    if (!lastSpawnTime) lastSpawnTime = timestamp;

    let deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    if (deltaTime > 33) deltaTime = 16.66; 

    // 【新增】減少道具剩餘時間計時器
    if (frenzyTimer > 0) frenzyTimer -= deltaTime;
    if (freezeTimer > 0) freezeTimer -= deltaTime;

    // 計算當前畫面的速度步伐比例
    let timeScale = deltaTime / 16.66;
    
    // 【新增效果】如果是冰凍時間，大幅調降物理步進（製造慢動作子彈時間）
    if (freezeTimer > 0) {
      timeScale *= 0.35; 
    }

    // 清理畫布並繪製
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 【新增畫面濾鏡】若有特殊模式，幫畫布加底色特效
    if (frenzyTimer > 0) {
      ctx.fillStyle = 'rgba(0, 242, 254, 0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else if (freezeTimer > 0) {
      ctx.fillStyle = 'rgba(51, 205, 255, 0.08)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    splatters.forEach(s => s.draw());

    // 水果生成機制計時
    const timeElapsed = timestamp - lastSpawnTime;
    // 狂暴模式下生成間隔縮短為 400ms
    const baseInterval = frenzyTimer > 0 ? 400 : SPAWN_INTERVAL;
    const currentSpawnDelay = Math.max(frenzyTimer > 0 ? 300 : 1000, baseInterval - (score * 12));
    
    if (timeElapsed >= currentSpawnDelay) {
      spawnFruits();
      lastSpawnTime = timestamp;
    }

    splatters.forEach(s => s.update(timeScale));
    splatters = splatters.filter(s => s.opacity > 0);

    fruits.forEach(f => {
      f.update(timeScale);
      f.draw();
    });

    // 檢查漏接掉落的水果
    fruits.forEach(f => {
      // 判定漏接
      const isOut = f.y > canvas.height + f.radius + 20 && f.vy > 0;
      const isHorizOut = (f.vx > 0 && f.x > canvas.width + f.radius + 20) || (f.vx < 0 && f.x < -f.radius - 20);
      
      if (!f.isSliced && !f.isBomb && (isOut || isHorizOut)) {
        f.isSliced = true; 
        
        // 【模式客製處理】娛樂模式漏接水果不扣血，只有經典模式才會因為漏接而死
        if (gameMode === 'classic') {
          playSound('miss');
          lives--;
          floatingTexts.push(new FloatingText(f.x, canvas.height - 40, 'MISS X', '#ff3b30'));
          if (lives <= 0) gameOver();
        }
      }
    });

    fruits = fruits.filter(f => {
      if (!f.isSliced) {
        return f.y < canvas.height + f.radius + 50 && f.x > -f.radius - 100 && f.x < canvas.width + f.radius + 100;
      }
      if (f.halfL && f.halfL.opacity <= 0) return false;
      return true;
    });

    particles.forEach(p => { p.update(timeScale); p.draw(); });
    particles = particles.filter(p => p.opacity > 0);

    floatingTexts.forEach(t => { t.update(timeScale); t.draw(); });
    floatingTexts = floatingTexts.filter(t => t.opacity > 0);

    drawBladeTrail();
    drawCanvasHUD();

    animationFrameId = requestAnimationFrame(drawGame);
  }

  function drawBladeTrail() {
    if (bladePoints.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    
    // 依據特殊狀態改變刀光顏色
    if (frenzyTimer > 0) ctx.shadowColor = '#ffd700';
    else if (freezeTimer > 0) ctx.shadowColor = '#33cdff';
    else ctx.shadowColor = '#00f2fe';
    
    ctx.shadowBlur = 15; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(bladePoints[0].x, bladePoints[0].y);
    for (let i = 1; i < bladePoints.length; i++) ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff'; ctx.shadowBlur = 0; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bladePoints[0].x, bladePoints[0].y);
    for (let i = 1; i < bladePoints.length; i++) ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
    ctx.stroke();
    ctx.restore();

    bladePoints.forEach(p => p.age++);
  }

  function drawCanvasHUD() {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 24px Outfit';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    
    // 顯示當前分數與遊戲模式
    const modeText = gameMode === 'classic' ? 'CLASSIC' : 'ARCADE';
    ctx.fillText(`${modeText} SCORE: ${score}`, 24, 20);

    // 如果有特殊狀態，在中央顯示倒數計時
    if (frenzyTimer > 0 || freezeTimer > 0) {
      ctx.textAlign = 'center';
      ctx.font = '800 22px Outfit';
      if (frenzyTimer > 0) {
        ctx.fillStyle = '#00f2fe';
        ctx.fillText(`狂暴瘋狂連擊中! ${(frenzyTimer/1000).toFixed(1)}s`, canvas.width / 2, 20);
      } else {
        ctx.fillStyle = '#33cdff';
        ctx.fillText(`子彈時間冰凍中! ${(freezeTimer/1000).toFixed(1)}s`, canvas.width / 2, 20);
      }
    }

    // 只有經典模式才需要渲染血量❤️ (娛樂模式靠無限水果在限制時間內刷高分)
    if (gameMode === 'classic') {
      ctx.textAlign = 'right';
      const heartSpacing = 35;
      const startHeartX = canvas.width - 24;
      const heartY = 32;

      for (let i = 0; i < 3; i++) {
        const hx = startHeartX - (i * heartSpacing);
        ctx.fillStyle = i < lives ? '#ff3b30' : 'rgba(255,255,255,0.15)';
        ctx.shadowBlur = i < lives ? 8 : 0;
        ctx.shadowColor = '#ff3b30';
        ctx.font = '24px "Font Awesome 6 Free"';
        ctx.fontWeight = '900';
        ctx.fillText('❤', hx, heartY - 12);
      }
    } else {
      // 娛樂模式用時間倒數當作完結判定（通常為 60 秒一局，此處簡化為不限生命，玩家可以玩到被炸彈扣光或自行設定）
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd700';
      ctx.fillText(`SLICED: ${slicedCount}`, canvas.width - 24, 20);
    }
    ctx.restore();
  }

  // --- Start & End Game controllers ---
  function startGame() {
    initAudio();
    
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // 【新增】從 HTML UI 讀取選擇的模式
    const modeSelect = document.getElementById('gameModeSelect');
    gameMode = modeSelect ? modeSelect.value : 'classic';

    // 重設遊戲引擎狀態
    score = 0;
    lives = gameMode === 'classic' ? 3 : 999; // 娛樂模式不採用傳統生命判定
    slicedCount = 0;
    maxCombo = 0;
    frenzyTimer = 0;
    freezeTimer = 0;
    fruits = [];
    particles = [];
    splatters = [];
    bladePoints = [];
    floatingTexts = [];
    
    lastFrameTime = 0; 
    lastSpawnTime = performance.now(); 
    isPlaying = true;

    document.getElementById('gameStartOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');

    animationFrameId = requestAnimationFrame(drawGame);
    
    // 【娛樂模式結束機制】如果是娛樂模式，設定 60 秒後時間到強制結束
    if (gameMode === 'arcade') {
      setTimeout(() => {
        if (isPlaying && gameMode === 'arcade') gameOver();
      }, 60000); // 60秒限時賽
    }
  }

  async function gameOver() {
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);

    const currentHigh = parseInt(localStorage.getItem('fn_high_score') || '0');
    if (score > currentHigh) {
      localStorage.setItem('fn_high_score', score.toString());
      const gameHighScoreHUD = document.getElementById('gameHighScore');
      if (gameHighScoreHUD) gameHighScoreHUD.textContent = score;
    }

    document.getElementById('gameOverOverlay').classList.remove('hidden');
    document.getElementById('finalScoreVal').textContent = score;
    document.getElementById('finalSlicedVal').textContent = slicedCount;
    document.getElementById('finalComboVal').textContent = maxCombo;

    const submissionStatus = document.getElementById('submissionStatus');
    if (!submissionStatus) return;

    if (window.appState && window.appState.isLoggedIn) {
      submissionStatus.innerHTML = `<span class="neon-text-blue"><i class="fa-solid fa-spinner fa-spin"></i> 正在上傳分數至排行榜...</span>`;
      try {
        const response = await fetch('/api/leaderboard/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${window.appState.token}`
          },
          body: JSON.stringify({ score: score, sliced_fruits: slicedCount, max_combo: maxCombo, mode: gameMode })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '上傳失敗');
        submissionStatus.innerHTML = `<span class="neon-text-green"><i class="fa-solid fa-cloud-arrow-up"></i> 分數上傳成功！</span>`;
        if (typeof window.fetchLeaderboard === 'function') window.fetchLeaderboard();
      } catch (err) {
        submissionStatus.innerHTML = `<span class="neon-text-red"><i class="fa-solid fa-circle-xmark"></i> 上傳失敗：${err.message}</span>`;
      }
    } else {
      submissionStatus.innerHTML = `<span class="text-muted"><i class="fa-solid fa-right-to-bracket"></i> 登入帳號即可自動上傳高分！</span>`;
    }
  }

  window.resizeGameCanvas = resizeGameCanvas;
})();
