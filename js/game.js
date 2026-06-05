/**
 * Fruit Ninja HTML5 Canvas Game Engine
 */
(function() {
  // Canvas and Context
  let canvas;
  let ctx;
  let animationFrameId = null;

  // Game Settings & Tuning
  const GRAVITY = 0.20;
  const SPAWN_INTERVAL = 2500; // ms
  const INITIAL_SPAWN_SPEED_Y = -8;
  const SPEED_MULTIPLIER = 1.01; // speed up game slightly as score increases

  // Game State Variables
  let isPlaying = false;
  let score = 0;
  let lives = 3;
  let slicedCount = 0;
  let maxCombo = 0;
  let soundEnabled = true;
  let lastSpawnTime = 0;

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
        // Drag Swoosh: Quick downward pitch slide
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.15);
        gainNode.gain.setValueAtTime(0.08, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === 'slice') {
        // Fruit Slice: Short splat sound (high pitch noise + drop)
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.12);
        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'miss') {
        // Missed fruit: Deep double tone alert
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.setValueAtTime(180, now + 0.08);
        gainNode.gain.setValueAtTime(0.12, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else if (type === 'explosion') {
        // Bomb Explosion: Low bass crash noise
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(20, now + 0.6);
        
        // Add a bandpass filter for rumble
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

    // UI Buttons
    const btnStart = document.getElementById('btnStartGame');
    const btnOverlayPlay = document.getElementById('btnOverlayPlay');
    const btnRestart = document.getElementById('btnRestartGame');
    const btnToggleSound = document.getElementById('btnToggleSound');
    
    if (btnStart) btnStart.addEventListener('click', startGame);
    if (btnOverlayPlay) btnOverlayPlay.addEventListener('click', startGame);
    if (btnRestart) btnRestart.addEventListener('click', startGame);

    if (btnToggleSound) {
      btnToggleSound.addEventListener('click', () => {
        soundEnabled = !soundEnabled;
        btnToggleSound.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-up"></i> 音效: 開' : '<i class="fa-solid fa-volume-mute"></i> 音效: 關';
        btnToggleSound.classList.toggle('btn-secondary', !soundEnabled);
        btnToggleSound.classList.toggle('btn-primary', soundEnabled);
      });
    }

    // Set high score from local storage
    const storedHighScore = localStorage.getItem('fn_high_score') || 0;
    const gameHighScoreHUD = document.getElementById('gameHighScore');
    if (gameHighScoreHUD) gameHighScoreHUD.textContent = storedHighScore;

    // Track canvas resizing
    window.addEventListener('resize', resizeGameCanvas);
    resizeGameCanvas();

    // Mouse and Touch Listeners on Canvas
    setupInputListeners();
  });

  function resizeGameCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    if (container) {
      // Keep canvas resolution fixed at 800x500 but style scale handles screen fitting
      const width = container.clientWidth;
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
    }
  }

  function setupInputListeners() {
    // Mouse Events
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      bladePoints = [];
      activeSwipeFruits.clear();
      addBladePoint(e);
      playSound('swoosh');
    });

    canvas.addEventListener('mousemove', (e) => {
      if (!isDragging || !isPlaying) return;
      addBladePoint(e);
      
      // Throttle swoosh sound
      if (bladePoints.length % 5 === 0) {
        playSound('swoosh');
      }

      checkSlices();
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
      evaluateCombo();
    });

    // Touch Events (Mobile)
    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length === 0) return;
      isDragging = true;
      bladePoints = [];
      activeSwipeFruits.clear();
      addBladePoint(e.touches[0]);
      playSound('swoosh');
    });

    canvas.addEventListener('touchmove', (e) => {
      if (!isDragging || !isPlaying || e.touches.length === 0) return;
      // Prevent scrolling when playing the game
      e.preventDefault();
      addBladePoint(e.touches[0]);
      
      if (bladePoints.length % 5 === 0) {
        playSound('swoosh');
      }
      
      checkSlices();
    }, { passive: false });

    canvas.addEventListener('touchend', () => {
      isDragging = false;
      evaluateCombo();
    });
  }

  function addBladePoint(e) {
    const rect = canvas.getBoundingClientRect();
    // Translate client coordinates into Canvas logic space (800x500)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    bladePoints.push({ x, y, age: 0 });

    // Keep trail short
    if (bladePoints.length > 15) {
      bladePoints.shift();
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

      // Spawn at the bottom area, throw upwards
      this.x = Math.random() * (canvas.width - 200) + 100;
      this.y = canvas.height + this.radius;

      // Velocity vectors
      const direction = this.x < canvas.width / 2 ? 1 : -1;
      this.vx = (Math.random() * 3 + 1) * direction;
      
      // Calculate speed up based on score
      const currentDifficultySpeed = INITIAL_SPAWN_SPEED_Y * Math.pow(SPEED_MULTIPLIER, Math.floor(score / 15));
      this.vy = Math.random() * 3 + Math.max(-18, currentDifficultySpeed);

      // Rotation settings
      this.angle = Math.random() * Math.PI * 2;
      this.rotationSpeed = (Math.random() * 0.06 - 0.03);

      // Sliced halves variables
      this.halfL = null;
      this.halfR = null;
    }

    update() {
      if (!this.isSliced) {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += GRAVITY; // Apply gravity force
        this.angle += this.rotationSpeed;
      } else {
        // Update both split halves
        if (this.halfL) this.halfL.update();
        if (this.halfR) this.halfR.update();
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
        // Draw both split halves
        if (this.halfL) this.halfL.draw();
        if (this.halfR) this.halfR.draw();
      }
    }

    slice() {
      if (this.isSliced) return;
      this.isSliced = true;

      if (this.isBomb) {
        // Trigger explosion particles and game over
        playSound('explosion');
        createExplosionParticles(this.x, this.y);
        gameOver();
        return;
      }

      // Add to combo tracker
      activeSwipeFruits.add(this);

      playSound('slice');
      slicedCount++;

      // Create juice particles and splatters
      createJuiceParticles(this.x, this.y, this.type.splatColor);
      createSplatter(this.x, this.y, this.type.splatColor);

      // Generate left and right halves
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
      this.side = side; // 'left' or 'right'
      this.vx = vx;
      this.vy = vy;
      this.angle = Math.random() * Math.PI * 2;
      this.rotationSpeed = side === 'left' ? -0.06 : 0.06;
      this.opacity = 1.0;
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += GRAVITY * 1.1; // Sliced pieces fall slightly faster
      this.angle += this.rotationSpeed;
      this.opacity -= 0.015; // Fade out slowly
    }

    draw() {
      if (this.opacity <= 0) return;

      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.translate(this.x, this.y);
      ctx.rotate(this.angle);

      // Draw semi-circle to represent cut fruit
      ctx.beginPath();
      if (this.side === 'left') {
        ctx.arc(0, 0, this.radius, Math.PI * 0.5, Math.PI * 1.5, false);
      } else {
        ctx.arc(0, 0, this.radius, Math.PI * 1.5, Math.PI * 0.5, false);
      }
      ctx.closePath();
      ctx.clip();

      // Render fruit graphic within the semi-circle clip bounds
      drawFruitGraphic(ctx, this.type, this.radius);

      // Draw shiny white divider line down the sliced edge
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

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.vy += GRAVITY * 0.8;
      this.opacity -= this.decay;
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
      this.decay = 0.0015; // Splatters stay on background for a very long time
      this.splats = []; // Sub-drops for irregular shape

      // Create random blobs around center
      for (let i = 0; i < 6; i++) {
        this.splats.push({
          rx: Math.random() * 20 - 10,
          ry: Math.random() * 20 - 10,
          rad: Math.random() * (this.radius * 0.5) + 3
        });
      }
    }

    update() {
      this.opacity -= this.decay;
    }

    draw() {
      if (this.opacity <= 0) return;
      ctx.save();
      ctx.globalAlpha = this.opacity;
      ctx.fillStyle = this.color;
      
      // Draw main blob
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      ctx.fill();

      // Draw satellite blobs
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

    update() {
      this.y += this.vy;
      this.opacity -= 0.02;
      this.scale += 0.01;
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
      // Outer shell
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      // Inner rind
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, r - 4, 0, Math.PI * 2);
      c.fill();
      // Red core
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 0, r - 7, 0, Math.PI * 2);
      c.fill();
      // Seeds
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
      // Apple body
      c.fillStyle = type.colorOuter;
      c.beginPath();
      // Heart-ish shape
      c.arc(-r/3, -r/10, r * 0.75, 0, Math.PI * 2);
      c.arc(r/3, -r/10, r * 0.75, 0, Math.PI * 2);
      c.fill();
      // Flesh inside slice look (for texture)
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 0, r - 6, 0, Math.PI * 2);
      c.fill();
      // Core seed
      c.fillStyle = type.colorSeed;
      c.beginPath();
      c.ellipse(0, 0, 3, 5, 0, 0, Math.PI * 2);
      c.fill();
    } 
    else if (type.name === 'orange') {
      // Outer skin
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      
      // Inside white segments layer
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, r - 3, 0, Math.PI * 2);
      c.fill();

      // Orange slices
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
      // Banana curve simulation
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 10, r * 1.5, Math.PI * 1.25, Math.PI * 1.75);
      c.arc(0, 22, r * 1.5, Math.PI * 1.75, Math.PI * 1.25, true);
      c.closePath();
      c.fill();
      
      // Inner cream highlights
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 14, r * 1.3, Math.PI * 1.28, Math.PI * 1.72);
      c.arc(0, 20, r * 1.3, Math.PI * 1.72, Math.PI * 1.28, true);
      c.closePath();
      c.fill();
    } 
    else if (type.name === 'coconut') {
      // Brown shell
      c.fillStyle = type.colorOuter;
      c.beginPath();
      c.arc(0, 0, r, 0, Math.PI * 2);
      c.fill();
      // White meat
      c.fillStyle = type.colorInner;
      c.beginPath();
      c.arc(0, 0, r - 5, 0, Math.PI * 2);
      c.fill();
      // Hollow center (transparent space filled with grey background shading)
      c.fillStyle = '#1e1c18';
      c.beginPath();
      c.arc(0, 0, r - 12, 0, Math.PI * 2);
      c.fill();
    }
  }

  function drawBomb(c, r) {
    // Metal body
    const grad = c.createRadialGradient(-5, -5, 2, 0, 0, r);
    grad.addColorStop(0, '#555555');
    grad.addColorStop(0.7, '#222222');
    grad.addColorStop(1, '#0c0c0c');

    c.fillStyle = grad;
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.fill();

    // Fuse connector cap
    c.fillStyle = '#444444';
    c.fillRect(-6, -r - 4, 12, 5);

    // Sparkling fuse curve
    c.strokeStyle = '#b8860b';
    c.lineWidth = 3;
    c.beginPath();
    c.arc(10, -r - 12, 12, Math.PI, Math.PI * 1.8, false);
    c.stroke();

    // Spark star
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

  // --- Visual Generation Controllers ---
  function createJuiceParticles(x, y, color) {
    const numParticles = Math.floor(Math.random() * 8) + 10;
    for (let i = 0; i < numParticles; i++) {
      particles.push(new Particle(x, y, color));
    }
  }

  function createExplosionParticles(x, y) {
    // Large dramatic flash effect for bomb hits
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
    // Keep max splatters low so memory stays clear
    if (splatters.length > 8) {
      splatters.shift();
    }
    splatters.push(new Splatter(x, y, color));
  }

  // --- Game Loop Update and Slicing Checking ---

  function checkSlices() {
    if (bladePoints.length < 2) return;
    
    const p1 = bladePoints[bladePoints.length - 2];
    const p2 = bladePoints[bladePoints.length - 1];

    fruits.forEach(f => {
      if (f.isSliced) return;

      // Distance checking: Check if the drag line segment intersects with the fruit's circular boundaries
      if (lineIntersectsCircle(p1.x, p1.y, p2.x, p2.y, f.x, f.y, f.radius)) {
        f.slice();
        if (!f.isBomb) {
          score += f.points;
          updateHUD();
        }
      }
    });
  }

  // Segment distance intersection algorithm
  function lineIntersectsCircle(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    
    // Length squared of segment
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      const distSq = (x1 - cx) * (x1 - cx) + (y1 - cy) * (y1 - cy);
      return distSq <= r * r;
    }

    // Projection coefficient t
    let t = ((cx - x1) * dx + (cy - y1) * dy) / lenSq;
    // Clamp to segment range
    t = Math.max(0, Math.min(1, t));

    // Project point on segment
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;

    // Distance squared from circle center to closest point
    const distSq = (closestX - cx) * (closestX - cx) + (closestY - cy) * (closestY - cy);
    return distSq <= r * r;
  }

  // Evaluate combo scores once dragging ends
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

      // Grab mid point of sliced fruits for text popup
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

  // HUD Score & Hearts Updater
  function updateHUD() {
    // Current HUD outputs
    const elements = document.getElementsByClassName('hud-val');
    // Canvas HUD is rendered in game loop, HTML overlay scores updated below
  }

  // Spawns new batches of fruits
  function spawnFruits() {
    const batchCount = Math.floor(Math.random() * 3) + 1; // 1 to 3 items
    
    // Chance of throwing a bomb decreases as score decreases, max 30% chance above 20 score
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

  // Main Canvas Render loop
  function drawGame(timestamp) {
    if (!isPlaying) return;

    // Clear Canvas and paint transparent wood backdrop grid
    ctx.fillStyle = '#11131a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw splatters under game objects
    splatters.forEach(s => s.draw());

    // Spawn mechanism timer
    if (!lastSpawnTime) lastSpawnTime = timestamp;
    const timeElapsed = timestamp - lastSpawnTime;
    
    // Scale spawn delay slightly with score
    const currentSpawnDelay = Math.max(1000, SPAWN_INTERVAL - (score * 12));
    
    if (timeElapsed >= currentSpawnDelay) {
      spawnFruits();
      lastSpawnTime = timestamp;
    }

    // Update & Draw splatters decay
    splatters.forEach(s => s.update());
    splatters = splatters.filter(s => s.opacity > 0);

    // Update & Draw Game elements (Fruits, Splitted halves)
    fruits.forEach(f => {
      f.update();
      f.draw();
    });

    // Check for missed fruits (falling below canvas bounds)
    fruits.forEach(f => {
      if (!f.isSliced && !f.isBomb && f.y > canvas.height + f.radius + 10 && f.vy > 0) {
        // Play miss alert & deduct heart
        playSound('miss');
        lives--;
        f.isSliced = true; // Mark as sliced to avoid double deduction
        
        // Spawn red floating cross
        floatingTexts.push(new FloatingText(f.x, canvas.height - 40, 'MISS X', '#ff3b30'));

        if (lives <= 0) {
          gameOver();
        }
      }
    });

    // Filter out entities off-screen
    fruits = fruits.filter(f => {
      if (!f.isSliced) return f.y < canvas.height + f.radius + 50;
      // If sliced, keep rendering until halves fade out completely
      if (f.halfL && f.halfL.opacity <= 0) return false;
      return true;
    });

    // Update & Draw Juice particles
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    particles = particles.filter(p => p.opacity > 0);

    // Update & Draw floating text indicators
    floatingTexts.forEach(t => {
      t.update();
      t.draw();
    });
    floatingTexts = floatingTexts.filter(t => t.opacity > 0);

    // Draw Blade Slash Trail
    drawBladeTrail();

    // Draw on-screen HUD graphics (Hearts and Scores overlay on top of Canvas)
    drawCanvasHUD();

    // Call loop recursively
    animationFrameId = requestAnimationFrame(drawGame);
  }

  function drawBladeTrail() {
    if (bladePoints.length < 2) return;

    ctx.save();
    
    // Draw thick outer neon blade shadow
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

    // Draw thin bright core blade
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

    // Age trail points
    bladePoints.forEach(p => p.age++);
  }

  function drawCanvasHUD() {
    // Draw Score
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px Outfit';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.fillText(`SCORE: ${score}`, 24, 20);

    // Draw Hearts for Lives
    ctx.textAlign = 'right';
    const heartSpacing = 35;
    const startHeartX = canvas.width - 24;
    const heartY = 32;

    for (let i = 0; i < 3; i++) {
      const hx = startHeartX - (i * heartSpacing);
      ctx.fillStyle = i < lives ? '#ff3b30' : 'rgba(255,255,255,0.15)';
      ctx.shadowBlur = i < lives ? 8 : 0;
      ctx.shadowColor = '#ff3b30';
      
      // Draw Unicode heart character or SVG path shape
      ctx.font = '24px "Font Awesome 6 Free"';
      ctx.fontWeight = '900';
      ctx.fillText(i < lives ? '\f004' : '\f004', hx, heartY - 12);
    }

    ctx.restore();
  }

  // --- Start & End Game controllers ---

  function startGame() {
    initAudio();
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }

    // Reset scores & vectors
    score = 0;
    lives = 3;
    slicedCount = 0;
    maxCombo = 0;
    fruits = [];
    particles = [];
    splatters = [];
    bladePoints = [];
    floatingTexts = [];
    lastSpawnTime = 0;

    isPlaying = true;

    // Toggle overlay visibility
    document.getElementById('gameStartOverlay').classList.add('hidden');
    document.getElementById('gameOverOverlay').classList.add('hidden');

    // Start frame loop
    animationFrameId = requestAnimationFrame(drawGame);
  }

  async function gameOver() {
    isPlaying = false;
    cancelAnimationFrame(animationFrameId);

    // Update high scores stored in browser local storage
    const currentHigh = parseInt(localStorage.getItem('fn_high_score') || '0');
    if (score > currentHigh) {
      localStorage.setItem('fn_high_score', score.toString());
      const gameHighScoreHUD = document.getElementById('gameHighScore');
      if (gameHighScoreHUD) gameHighScoreHUD.textContent = score;
    }

    // Display Game Over Overlay and scores
    document.getElementById('gameOverOverlay').classList.remove('hidden');
    document.getElementById('finalScoreVal').textContent = score;
    document.getElementById('finalSlicedVal').textContent = slicedCount;
    document.getElementById('finalComboVal').textContent = maxCombo;

    const submissionStatus = document.getElementById('submissionStatus');
    if (!submissionStatus) return;

    // Check if user is logged in
    if (window.appState.isLoggedIn) {
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

        if (!response.ok) {
          throw new Error(data.error || '上傳失敗');
        }

        submissionStatus.innerHTML = `<span class="neon-text-green"><i class="fa-solid fa-cloud-arrow-up"></i> 分數上傳成功！</span>`;
        
        // Refresh leaderboard list automatically
        if (typeof window.fetchLeaderboard === 'function') {
          window.fetchLeaderboard();
        }
      } catch (err) {
        submissionStatus.innerHTML = `<span class="neon-text-red"><i class="fa-solid fa-circle-xmark"></i> 上傳失敗：${err.message}</span>`;
      }
    } else {
      submissionStatus.innerHTML = `<span class="text-muted"><i class="fa-solid fa-right-to-bracket"></i> <a href="#leaderboard" style="color:var(--neon-blue);text-decoration:underline;">登入帳號</a> 即可自動上傳高分至排行榜！</span>`;
    }
  }

  // Expose function to trigger resize
  window.resizeGameCanvas = resizeGameCanvas;
})();
