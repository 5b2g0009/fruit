/**
 * Fruit Ninja HTML5 Canvas Game Engine (Fixed Speed and Delta Time Bug)
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
  const SPEED_MULTIPLIER = 1.05; // speed up game slightly as score increases
  const SWIPE_SOUND_MIN_DISTANCE = 100; // 每累積滑動超過 70px 才播放一次揮刀音效
  const SWIPE_SOUND_COOLDOWN = 140; // 揮刀音效冷卻時間，避免短時間過於密集

  // Game State Variables
  let isPlaying = false;
  let score = 0;
  let lives = 3;
  let slicedCount = 0;
  let maxCombo = 0;
  let soundEnabled = true;
  let lastSpawnTime = 0;
  let lastFrameTime = 0; // 【新增】用來記錄上一次繪製的時間戳記

  // Game Objects lists
  let fruits = [];
  let particles = [];
  let splatters = [];
  let bladePoints = []; // Tracks mouse trail
  let floatingTexts = [];

  // Drag State Tracker
  let isDragging = false;
  let activeSwipeFruits = new Set(); // Sliced fruits during current drag event
  let comboTimer = null;
  let lastSwipeSoundTime = 0;
  let accumulatedSwipeDistance = 0;

  // Fruit Types and Properties
  const FRUIT_TYPES = {
    WATERMELON: {
      name: 'watermelon',
      radius: 46,
      colorOuter: '#1b4d3e', // green
      colorInner: '#ff2d55', // red
      colorSeed: '#000000',
      splatColor: 'rgba(255, 45, 85, 0.85)',
      points: 1
    },
    APPLE: {
      name: 'apple',
      radius: 34,
      colorOuter: '#c8102e', // red
      colorInner: '#fffdd0', // cream
      colorSeed: '#5c4033',
      splatColor: 'rgba(200, 16, 46, 0.8)',
      points: 1
    },
    ORANGE: {
      name: 'orange',
      radius: 36,
      colorOuter: '#ff8c00', // dark orange
      colorInner: '#ffa500', // orange
      colorSeed: '#fff',
      splatColor: 'rgba(255, 140, 0, 0.85)',
      points: 1
    },
    BANANA: {
      name: 'banana',
      radius: 30,
      colorOuter: '#ffd700', // gold yellow
      colorInner: '#fffdd0',
      colorSeed: '#000',
      splatColor: 'rgba(255, 215, 0, 0.8)',
      points: 1
    },
    COCONUT: {
      name: 'coconut',
      radius: 38,
      colorOuter: '#5c4033', // brown
      colorInner: '#ffffff', // white
      colorSeed: '#5c4033',
      splatColor: 'rgba(240, 240, 240, 0.85)',
      points: 2
    },
    BOMB: {
      name: 'bomb',
      radius: 32,
      colorOuter: '#222222',
      colorInner: '#ff3b30', // glowing red fuse
      splatColor: 'rgba(255, 255, 255, 0.95)',
      points: 0,
      isBomb: true
    }
  };

  // Web Audio Context Synthesizer (No assets dependency)
  let audioCtx = null;

  function initAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
  }

  function playSound(type) {
    if (!soundEnabled) return;
    initAudio();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    try {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === 'swoosh') {
        // 更像划刀破風的聲音：短促白噪音 + 高通/帶通濾波掃頻。
        // 原本 triangle 比較像電子音，白噪音濾波後會更像刀快速劃過空氣的「咻」。
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
      }
    } catch (e) {
      console.warn('Audio Context block:', e);
    }
  }

  // --- Initialize UI Bindings ---
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
      target.requestFullscreen?.().catch(err => {
        console.warn('Fullscreen request failed:', err);
      });
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

    // 等瀏覽器完成全螢幕尺寸切換後再更新 Canvas 顯示尺寸
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

    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      accumulatedSwipeDistance = 0;
      evaluateCombo();
    });

    canvas.addEventListener('mouseleave', () => {
      if (!isDragging) return;
      isDragging = false;
      accumulatedSwipeDistance = 0;
      evaluateCombo();
    });

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

    canvas.addEventListener('touchend', () => {
      if (!isDragging) return;
      isDragging = false;
      accumulatedSwipeDistance = 0;
      evaluateCombo();
    });

    canvas.addEventListener('touchcancel', () => {
      if (!isDragging) return;
      isDragging = false;
      accumulatedSwipeDistance = 0;
      evaluateCombo();
    });
  }

  function addBladePoint(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    bladePoints.push({ x, y, age: 0 });

    if (bladePoints.length > 15) {
      bladePoints.shift();
    }
  }

  function maybePlaySwipeSound() {
    if (bladePoints.length < 2) return;

    const last = bladePoints[bladePoints.length - 1];
    const previous = bladePoints[bladePoints.length - 2];
    const dx = last.x - previous.x;
    const dy = last.y - previous.y;
    accumulatedSwipeDistance += Math.sqrt(dx * dx + dy * dy);

    const now = performance.now();
    if (
      accumulatedSwipeDistance >= SWIPE_SOUND_MIN_DISTANCE &&
      now - lastSwipeSoundTime >= SWIPE_SOUND_COOLDOWN
    ) {
      playSound('swoosh');
      lastSwipeSoundTime = now;
      accumulatedSwipeDistance = 0;
    }
  }

  // --- Fruit Class / Generator ---
  class Fruit {
    constructor(type) {
      this.type = type;
      this.radius = type.radius;
      this.isSliced = false;
      this.isBomb = !!type.isBomb;
      this.points = type.points;

      this.x = Math.random() * (canvas.width - 200) + 100;
      this.y = canvas.height + this.radius;

      const direction = this.x < canvas.width / 2 ? 1 : -1;
      this.vx = (Math.random() * 3 + 1) * direction;
      
      // 修正後的向上飛行速度公式 (確保重新開始時速度公式不崩潰)
      const baseUpwardSpeed = Math.abs(INITIAL_SPAWN_SPEED_Y) * Math.pow(SPEED_MULTIPLIER, Math.floor(score / 15));
      const cappedUpwardSpeed = Math.min(18, baseUpwardSpeed); 
      this.vy = -(cappedUpwardSpeed + Math.random() * 3);

      this.angle = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() * 0.06 - 0.03);

      this.halfL = null;
      this.halfR = null;
    }

    // 接收來自 Game loop 的 timeScale 控制運動幅度
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
        gameOver();
        return;
      }

      activeSwipeFruits.add(this);
      playSound('slice');
      slicedCount++;

      createJuiceParticles(this.x, this.y, this.type.splatColor);
      createSplatter(this.x, this.y, this.type.splatColor);

      this.halfL = new SlicedHalf(this.x, this.y, this.radius, this.type, 'left', this.vx - 3.5, this.vy - 1);
      this.halfR = new SlicedHalf(this.x, this.y, this.radius, this.type, 'right', this.vx + 3.5, this.vy - 1);
    }
  }

  // --- Sliced Half Class ---
  class SlicedHalf {
    constructor(x, y, radius, type, side, vx, vy) {
      this.x = x;
      this.y = y;
      this.radius = radius;
      this.type = type;
      this.side = side; 
      this.vx = vx;
      this.vy = vy;
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
      if (this.side === 'left') {
        ctx.arc(0, 0, this.radius, Math.PI * 0.5, Math.PI * 1.5, false);
      } else {
        ctx.arc(0, 0, this.radius, Math.PI * 1.5, Math.PI * 0.5, false);
      }
      ctx.closePath();
      ctx.clip();

      drawFruitGraphic(ctx, this.type, this.radius);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -this.radius);
      ctx.lineTo(0, this.radius);
      ctx.stroke();

      ctx.restore();
    }
  }

  // --- Juice Particles and Splatter Classes ---
  class Particle {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.radius = Math.random() * 4 + 2;
      this.vx = Math.random() * 10 - 5;
      this.vy = Math.random() * 12 - 7;
      this.opacity = 1.0;
      this.decay = Math.random() * 0.03 + 0.02;
    }

    update(timeScale) {
      this.x += this.vx * timeScale;
      this.y += this.vy * timeScale;
      this.vy += (GRAVITY * 0.8) * timeScale;
      this.opacity -= this.decay * timeScale;
    }

    draw() {
      if (this.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  class Splatter {
    constructor(x, y, color) {
      this.x = x;
      this.y = y;
      this.color = color;
      this.radius = Math.random() * 30 + 15;
      this.opacity = 0.9;
      this.decay = 0.0015; 
      this.splats = []; 

      for (let i = 0; i < 6; i++) {
        this.splats.push({
          rx: Math.random() * 20 - 10,
          ry: Math.random() * 20 - 10,
          rad: Math.random() * (this.radius * 0.5) + 3
        });
      }
    }

    update(timeScale) {
      this.opacity -= this.decay * timeScale;
    }

    draw() {
      if (this.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      this.splats.forEach(s => {
        ctx.beginPath();
        ctx.arc(this.x + s.rx, this.y + s.ry, s.rad, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.restore();
    }
  }

  class FloatingText {
    constructor(x, y, text, color) {
      this.x = x;
      this.y = y;
      this.text = text;
      this.color = color;
      this.vy = -1.5;
      this.opacity = 1.0;
      this.scale = 1.0;
    }

    update(timeScale) {
      this.y += this.vy * timeScale;
      this.opacity -= 0.02 * timeScale;
      this.scale += 0.01 * timeScale;
    }

    draw() {
      if (this.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 10;
      ctx.font = '900 24px Outfit';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      ctx.translate(this.x, this.y);
      ctx.scale(this.scale, this.scale);
      ctx.fillText(this.text, 0, 0);
      ctx.restore();
    }
  }

  // --- Visual Rendering Helpers ---
  function drawFruitGraphic(c, type, r) {
    if (type.name === 'watermelon') {
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, r - 4, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 0, r - 7, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = type.colorSeed;
      const seedR = 2.5;
      const seedOffsets = [[-12, -8], [12, -8], [-5, 12], [5, 12], [-15, 8], [15, 8], [0, -18]];
      seedOffsets.forEach(pos => {
        c.beginPath();
        c.arc(pos[0], pos[1], seedR, 0, Math.PI * 2);
        c.fill();
      });
    } 
    else if (type.name === 'apple') {
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(-r/3, -r/10, r * 0.75, 0, Math.PI * 2);
      c.arc(r/3, -r/10, r * 0.75, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 0, r - 6, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = type.colorSeed;
      c.beginPath();
      c.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
      c.fill();
    } 
    else if (type.name === 'orange') {
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, r - 3, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = type.colorInner;
      for (let i = 0; i < 8; i++) {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, r - 5, (i * Math.PI / 4) + 0.08, ((i + 1) * Math.PI / 4) - 0.08);
        c.closePath();
        c.fill();
      }
    } 
    else if (type.name === 'banana') {
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 10, r * 1.5, Math.PI * 1.25, Math.PI * 1.75);
      c.arc(0, 22, r * 1.5, Math.PI * 1.75, Math.PI * 1.25, true);
      c.closePath();
      c.fill();
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 14, r * 1.3, Math.PI * 1.28, Math.PI * 1.72);
      c.arc(0, 20, r * 1.3, Math.PI * 1.72, Math.PI * 1.28, true);
      c.closePath();
      c.fill();
    } 
    else if (type.name === 'coconut') {
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 0, r - 5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#1e1c18';
      c.beginPath();
      c.arc(0, 0, r - 12, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawBomb(c, r) {
    const grad = c.createRadialGradient(-5, -5, 2, 0, 0, r);
    grad.addColorStop(0, '#555555');
    grad.addColorStop(0.7, '#222222');
    grad.addColorStop(1, '#0c0c0c');

    c.fillStyle = grad;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();

    c.fillStyle = '#444444';
    c.fillRect(-6, -r - 4, 12, 5);

    c.strokeStyle = '#b8860b';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(10, -r - 12, 12, Math.PI, Math.PI * 1.8, false);
    c.stroke();

    c.fillStyle = '#ffcc00';
    c.shadowColor = '#ff3300';
    c.shadowBlur = 10;
    c.beginPath();
    const sparks = 8;
    const outerR = 10;
    const innerR = 4;
    const sparkX = 22;
    const sparkY = -r - 15;
    
    for (let i = 0; i < sparks * 2; i++) {
      const angle = (i * Math.PI) / sparks;
      const currR = i % 2 === 0 ? outerR : innerR;
      const sx = sparkX + Math.cos(angle) * currR;
      const sy = sparkY + Math.sin(angle) * currR;
      if (i === 0) c.moveTo(sx, sy);
      else c.lineTo(sx, sy);
    }
    c.closePath();
    c.fill();
  }

  function createJuiceParticles(x, y, color) {
    const numParticles = Math.floor(Math.random() * 8) + 10;
    for (let i = 0; i < numParticles; i++) {
      particles.push(new Particle(x, y, color));
    }
  }

  function createExplosionParticles(x, y) {
    const numParticles = 40;
    const colors = ['#ffffff', '#ffcc00', '#ff3300', '#333333'];
    for (let i = 0; i < numParticles; i++) {
      const col = colors[Math.floor(Math.random() * colors.length)];
      const p = new Particle(x, y, col);
      p.radius = Math.random() * 8 + 3;
      p.vx = Math.random() * 20 - 10;
      p.vy = Math.random() * 20 - 10;
      particles.push(p);
    }
    floatingTexts.push(new FloatingText(x, y - 20, 'BOOM!', '#ff3b30'));
  }

  function createSplatter(x, y, color) {
    if (splatters.length > 8) {
      splatters.shift();
    }
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
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const distSq = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy);
      return distSq <= r * r;
    }
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    const distSq = (closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy);
    return distSq <= r * r;
  }

  function evaluateCombo() {
    if (activeSwipeFruits.size >= 3) {
      const size = activeSwipeFruits.size;
      let bonus = 0;
      let comboName = '';

      if (size === 3) { bonus = 3; comboName = '3-Fruit Combo! +3'; }
      else if (size === 4) { bonus = 5; comboName = '4-Fruit Combo! +5'; }
      else { bonus = 8; comboName = `${size}-Fruit Combo! +8`; }

      score += bonus;
      if (size > maxCombo) {
        maxCombo = size;
      }

      let avgX = 0;
      let avgY = 0;
      activeSwipeFruits.forEach(f => {
        avgX += f.x;
        avgY += f.y;
      });
      avgX /= size;
      avgY /= size;

      floatingTexts.push(new FloatingText(avgX, avgY - 20, comboName, '#ffd700'));
      updateHUD();
    }
    activeSwipeFruits.clear();
  }

  function updateHUD() {}

  function spawnFruits() {
    const batchCount = Math.floor(Math.random() * 3) + 1; 
    const bombThreshold = score < 10 ? 0.05 : (score < 25 ? 0.15 : 0.25);

    for (let i = 0; i < batchCount; i++) {
      const isBomb = Math.random() < bombThreshold;
      let type;
      
      if (isBomb) {
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

    // 1. 初始化與防錯時間基線
    if (!lastFrameTime) lastFrameTime = timestamp;
    if (!lastSpawnTime) lastSpawnTime = timestamp;

    // 計算當前影格與上一影格的時間差 (毫秒)
    let deltaTime = timestamp - lastFrameTime;
    lastFrameTime = timestamp;

    // 2. 【核心防線】切換視窗睡眠重啟時，限制異常的 deltaTime 垃圾值
    if (deltaTime > 33) {
      deltaTime = 16.66; // 修正回標準的 60 FPS 間隔
    }

    // 計算當前畫面的速度步伐比例 (若穩定 60fps 則 timeScale 為 1)
    const timeScale = deltaTime / 16.66;

    // 3. 清理與重置畫布，繪製背景背景血跡
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    splatters.forEach(s => s.draw());

    // 4. 水果生成機制計時
    const timeElapsed = timestamp - lastSpawnTime;
    const currentSpawnDelay = Math.max(1000, SPAWN_INTERVAL - (score * 12));
    
    if (timeElapsed >= currentSpawnDelay) {
      spawnFruits();
      lastSpawnTime = timestamp;
    }

    // 5. 更新背景血跡與生命期
    splatters.forEach(s => s.update(timeScale));
    splatters = splatters.filter(s => s.opacity > 0);

    // 6. 依據 timeScale 移動並更新所有水果
    fruits.forEach(f => {
      f.update(timeScale);
      f.draw();
    });

    // 7. 檢查漏接掉落的水果 (加上 y 軸緩衝防止邊緣誤判)
    fruits.forEach(f => {
      if (!f.isSliced && !f.isBomb && f.y > canvas.height + f.radius + 20 && f.vy > 0) {
        playSound('miss');
        lives--;
        f.isSliced = true; 
        floatingTexts.push(new FloatingText(f.x, canvas.height - 40, 'MISS X', '#ff3b30'));

        if (lives <= 0) {
          gameOver();
        }
      }
    });

    // 8. 过滤回收掉落出螢幕外的水果
    fruits = fruits.filter(f => {
      if (!f.isSliced) return f.y < canvas.height + f.radius + 50;
      if (f.halfL && f.halfL.opacity <= 0) return false;
      return true;
    });

    // 9. 更新並繪製果汁粒子與噴濺效果
    particles.forEach(p => {
      p.update(timeScale);
      p.draw();
    });
    particles = particles.filter(p => p.opacity > 0);

    // 10. 更新並繪製 Combo 與 Miss 漂浮文字
    floatingTexts.forEach(t => {
      t.update(timeScale);
      t.draw();
    });
    floatingTexts = floatingTexts.filter(t => t.opacity > 0);

    // 11. 繪製刀光軌跡與數據 HUD
    drawBladeTrail();
    drawCanvasHUD();

    // 遞迴請求下一影格
    animationFrameId = requestAnimationFrame(drawGame);
  }

  function drawBladeTrail() {
    if (bladePoints.length < 2) return;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.shadowColor = '#00f2fe';
    ctx.shadowBlur = 15;
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(bladePoints[0].x, bladePoints[0].y);
    for (let i = 1; i < bladePoints.length; i++) {
      ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.shadowBlur = 0;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(bladePoints[0].x, bladePoints[0].y);
    for (let i = 1; i < bladePoints.length; i++) {
      ctx.lineTo(bladePoints[i].x, bladePoints[i].y);
    }
    ctx.stroke();
    ctx.restore();

    bladePoints.forEach(p => p.age++);
  }

  function drawCanvasHUD() {
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Outfit';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(`SCORE: ${score}`, 24, 20);

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
      ctx.fillText(i < lives ? '❤' : '❤', hx, heartY - 12);
    }
    ctx.restore();
  }

  // --- Start & End Game controllers ---
  function startGame() {
    initAudio();
    
    // 清除任何潛在重複疊加的舊動畫線程
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    // 重設遊戲引擎狀態
    score = 0;
    lives = 3;
    slicedCount = 0;
    maxCombo = 0;
    fruits = [];
    particles = [];
    splatters = [];
    bladePoints = [];
    floatingTexts = [];
    
    // 重要：重啟時完全洗掉舊時間戳記
    lastFrameTime = 0; 
    lastSpawnTime = performance.now(); 
    isPlaying = true;

    document.getElementById('gameStartOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');

    // 重新拉起渲染迴圈
    animationFrameId = requestAnimationFrame(drawGame);
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
          body: JSON.stringify({
            score: score,
            sliced_fruits: slicedCount,
            max_combo: maxCombo
          })
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || '上傳失敗');

        submissionStatus.innerHTML = `<span class="neon-text-green"><i class="fa-solid fa-cloud-arrow-up"></i> 分數上傳成功！</span>`;
        if (typeof window.fetchLeaderboard === 'function') {
          window.fetchLeaderboard();
        }
      } catch (err) {
        submissionStatus.innerHTML = `<span class="neon-text-red"><i class="fa-solid fa-circle-xmark"></i> 上傳失敗：${err.message}</span>`;
      }
    } else {
      submissionStatus.innerHTML = `<span class="text-muted"><i class="fa-solid fa-right-to-bracket"></i> 登入帳號即可自動上傳高分！</span>`;
    }
  }

  window.resizeGameCanvas = resizeGameCanvas;
})();
