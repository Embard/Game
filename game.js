"use strict";

const CONFIG = {
  gravity: 2160,
  jumpForce: 790,
  baseSpeed: 300,
  speedGrowth: 5.35,
  obstacleFrequency: 0.96,
  maxDt: 0.033,
  groundHeight: 96,
  maxHealthUnits: 6,
  damageUnits: 2,
  invulnerabilityDuration: 1.05,
  beverageSpawnMin: 3.6,
  beverageSpawnMax: 5.8,
  cartSpawnMin: 25.0,
  cartSpawnMax: 38.0,
  cup: {
    healUnits: 1,
    slowdownAmount: 10,
    minSpeedFactor: 0.92,
    slowDuration: 1.4,
  },
  teapot: {
    healUnits: 2,
    slowdownAmount: 28,
    minSpeedFactor: 0.84,
    slowDuration: 2.6,
  },
  cartRideDuration: 4.0,
  cartRideOffsetY: 46,
};

const STORAGE_KEY = "gip-runner-best";
const LEADERBOARD_KEY = "gip-runner-leaderboard";
const PLAYER_NAME_KEY = "gip-runner-player-name";
const CHARACTER_STORAGE_KEY = "gip-runner-character";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDjs3ZU1vPYraihsEUhHdC_yGKGVBXfZN8",
  authDomain: "runner-bb9a8.firebaseapp.com",
  databaseURL: "https://runner-bb9a8-default-rtdb.firebaseio.com",
  projectId: "runner-bb9a8",
  storageBucket: "runner-bb9a8.firebasestorage.app",
  messagingSenderId: "36209569924",
  appId: "1:36209569924:web:f44e0b9bf1c3c818b492d1",
};
const LEADERBOARD_PATH = "leaderboard";

const CHARACTERS = [
  {
    id: "gip",
    name: "ГИП",
    description: "Основной персонаж",
    path: "assets/characters/gip",
    preview: "assets/characters/gip/preview.png",
  },
  {
    id: "alexey",
    name: "Alexey",
    description: "Инженер в пиджаке",
    path: "assets/characters/alexey",
    preview: "assets/characters/alexey/preview.png",
  },
];

function getCharacterById(id) {
  return CHARACTERS.find((character) => character.id === id) || CHARACTERS[0];
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function wrap01(value) {
  let v = value % 1;
  if (v < 0) v += 1;
  return v;
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width * 0.5, height * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - clamp(t, 0, 1), 3);
}

class ParticleSystem {
  constructor() {
    this.items = [];
  }

  reset() {
    this.items.length = 0;
  }

  emit(count, opts) {
    for (let i = 0; i < count; i++) {
      const life = (opts.lifeMin || 0.25) + Math.random() * ((opts.lifeMax || 0.55) - (opts.lifeMin || 0.25));
      const angle = (opts.angle ?? -Math.PI / 2) + (Math.random() - 0.5) * (opts.spread || 1.2);
      const speed = (opts.speedMin || 40) + Math.random() * ((opts.speedMax || 120) - (opts.speedMin || 40));
      this.items.push({
        x: (opts.x || 0) + (Math.random() - 0.5) * (opts.jitterX || 8),
        y: (opts.y || 0) + (Math.random() - 0.5) * (opts.jitterY || 4),
        vx: Math.cos(angle) * speed + (opts.vx || 0),
        vy: Math.sin(angle) * speed + (opts.vy || 0),
        life,
        maxLife: life,
        size: (opts.sizeMin || 2) + Math.random() * ((opts.sizeMax || 6) - (opts.sizeMin || 2)),
        gravity: opts.gravity ?? 280,
        drag: opts.drag ?? 0.92,
        color: opts.color || "rgba(255,255,255,0.8)",
        fade: opts.fade !== false,
        shape: opts.shape || "circle",
      });
    }
  }

  burstDust(x, y, strength = 1) {
    this.emit(Math.round(6 * strength), {
      x,
      y,
      angle: -Math.PI / 2,
      spread: Math.PI * 0.9,
      speedMin: 30 * strength,
      speedMax: 90 * strength,
      lifeMin: 0.2,
      lifeMax: 0.45,
      sizeMin: 2,
      sizeMax: 5.5,
      gravity: 180,
      color: "rgba(220, 235, 248, 0.85)",
      vx: -40,
    });
  }

  burstSparkles(x, y, warm = false) {
    this.emit(10, {
      x,
      y,
      angle: -Math.PI / 2,
      spread: Math.PI * 1.6,
      speedMin: 50,
      speedMax: 140,
      lifeMin: 0.35,
      lifeMax: 0.7,
      sizeMin: 2,
      sizeMax: 4.5,
      gravity: 60,
      color: warm ? "rgba(255, 196, 90, 0.95)" : "rgba(255, 255, 255, 0.95)",
      shape: "spark",
    });
  }

  burstHit(x, y) {
    this.emit(12, {
      x,
      y,
      angle: 0,
      spread: Math.PI * 2,
      speedMin: 80,
      speedMax: 180,
      lifeMin: 0.2,
      lifeMax: 0.4,
      sizeMin: 2,
      sizeMax: 5,
      gravity: 120,
      color: "rgba(255, 120, 110, 0.9)",
      shape: "spark",
    });
  }

  trailSlide(x, y) {
    this.emit(2, {
      x,
      y,
      angle: Math.PI,
      spread: 0.4,
      speedMin: 20,
      speedMax: 55,
      lifeMin: 0.15,
      lifeMax: 0.32,
      sizeMin: 3,
      sizeMax: 7,
      gravity: 40,
      color: "rgba(255,255,255,0.55)",
      vx: -30,
    });
  }

  update(dt) {
    for (const p of this.items) {
      p.life -= dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      const alpha = p.fade ? easeOutCubic(t) : 1;
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.shape === "spark") {
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.45);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.size * (0.7 + t * 0.5), p.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }
}

function drawContainedImage(ctx, image, x, y, width, height) {
  if (!image || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) return false;
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawW = image.naturalWidth * scale;
  const drawH = image.naturalHeight * scale;
  const drawX = x + (width - drawW) * 0.5;
  const drawY = y + (height - drawH) * 0.5;
  ctx.drawImage(image, drawX, drawY, drawW, drawH);
  return true;
}

function formatWorkTime(progress) {
  const start = 8 * 60;
  const end = 17 * 60 + 30;
  const total = end - start;
  const minutes = Math.round(clamp(progress, 0, 1) * total);
  const current = start + minutes;
  const h = Math.floor(current / 60);
  const m = current % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function normalizePlayerName(value) {
  return (
    String(value || "Игрок")
      .trim()
      .replace(/[\n\r\t<>]/g, "")
      .slice(0, 18) || "Игрок"
  );
}

function isTypingTarget(target) {
  if (!target) return false;
  if (typeof target.closest === "function" && target.closest("input, textarea, [contenteditable='true']")) {
    return true;
  }
  const tag = String(target.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable === true;
}

function leaderboardNameKey(name) {
  const safe = normalizePlayerName(name)
    .toLowerCase()
    .replace(/[^a-zа-яё0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
  return safe || "player";
}

function mergeLeaderboardRows(rows) {
  const bestByName = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const normalized = normalizePlayerName(row && row.name);
    const candidate = {
      name: normalized,
      score: Number((row && row.score) || 0),
      tea: Number((row && row.tea) || 0),
      date: row && row.date ? String(row.date) : "",
    };
    const key = normalized.toLowerCase();
    const current = bestByName.get(key);
    if (
      !current ||
      candidate.score > current.score ||
      (candidate.score === current.score && candidate.tea > current.tea) ||
      (candidate.score === current.score && candidate.tea === current.tea && candidate.date > current.date)
    ) {
      bestByName.set(key, candidate);
    }
  }
  return Array.from(bestByName.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.tea !== a.tea) return b.tea - a.tea;
    return String(b.date || "").localeCompare(String(a.date || ""));
  });
}

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
  }

  ensure() {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.enabled = true;
  }

  ping(type = "square", frequency = 440, duration = 0.08, volume = 0.05) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  jump() {
    this.ping("triangle", 600, 0.09, 0.07);
  }

  score() {
    this.ping("sine", 760, 0.06, 0.04);
  }

  hit() {
    this.ping("sawtooth", 140, 0.18, 0.08);
  }

  tea() {
    this.ping("sine", 950, 0.08, 0.05);
    window.setTimeout(() => this.ping("triangle", 700, 0.06, 0.04), 55);
  }

  powerup() {
    this.ping("triangle", 520, 0.09, 0.06);
    window.setTimeout(() => this.ping("triangle", 760, 0.11, 0.05), 90);
  }

  win() {
    this.ping("triangle", 660, 0.09, 0.06);
    window.setTimeout(() => this.ping("triangle", 880, 0.13, 0.055), 90);
  }
}

class Background {
  constructor(game) {
    this.game = game;
    this.clouds = [];
    this.birds = [];
    this.motes = [];
    this.spawnCloud(0);
    while (this.clouds.length < 10) this.spawnCloud(this.game.worldWidth * Math.random());
    while (this.birds.length < 3) this.spawnBird(this.game.worldWidth * Math.random());
    while (this.motes.length < 18) this.spawnMote(true);
  }

  spawnCloud(minX = this.game.worldWidth + 80) {
    const y = 18 + Math.random() * 100;
    const scale = 0.55 + Math.random() * 1.05;
    this.clouds.push({
      x: minX + Math.random() * 200,
      y,
      scale,
      speedMul: 0.08 + Math.random() * 0.14,
      soft: Math.random() > 0.35,
    });
  }

  spawnBird(minX = this.game.worldWidth + 40) {
    this.birds.push({
      x: minX + Math.random() * 260,
      y: 40 + Math.random() * 70,
      speedMul: 0.32 + Math.random() * 0.22,
      phase: Math.random() * Math.PI * 2,
      size: 0.7 + Math.random() * 0.5,
    });
  }

  spawnMote(anywhere = false) {
    const w = this.game.worldWidth;
    this.motes.push({
      x: anywhere ? Math.random() * w : w + Math.random() * 40,
      y: 30 + Math.random() * (this.game.groundY - 80),
      speedMul: 0.05 + Math.random() * 0.08,
      phase: Math.random() * Math.PI * 2,
      size: 1 + Math.random() * 1.8,
    });
  }

  update(dt) {
    for (const cloud of this.clouds) cloud.x -= this.game.speed * cloud.speedMul * dt;
    this.clouds = this.clouds.filter((c) => c.x > -260);
    while (this.clouds.length < 10) this.spawnCloud();

    for (const bird of this.birds) {
      bird.x -= this.game.speed * bird.speedMul * dt;
      bird.phase += dt * 9;
      bird.y += Math.sin(bird.phase) * 8 * dt;
    }
    this.birds = this.birds.filter((b) => b.x > -40);
    while (this.birds.length < 3) this.spawnBird();

    for (const mote of this.motes) {
      mote.x -= this.game.speed * mote.speedMul * dt;
      mote.phase += dt * 2.2;
      mote.y += Math.sin(mote.phase) * 6 * dt;
    }
    this.motes = this.motes.filter((m) => m.x > -10);
    while (this.motes.length < 18) this.spawnMote();
  }

  dayProgress() {
    const maxScoreFeel = 2200;
    return clamp(this.game.distance / maxScoreFeel, 0, 1);
  }

  draw(ctx) {
    const { worldWidth: w, worldHeight: h, groundY } = this.game;
    const t = this.game.distance;
    const day = this.dayProgress();
    const warm = day * 0.35;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, `rgb(${210 + warm * 30}, ${232 - warm * 20}, ${255 - warm * 40})`);
    sky.addColorStop(0.55, `rgb(${200 + warm * 35}, ${220 - warm * 10}, ${245 - warm * 30})`);
    sky.addColorStop(1, `rgb(${180 + warm * 40}, ${205 - warm * 5}, ${230 - warm * 20})`);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    const sunX = w * (0.72 + day * 0.12);
    const sunY = 54 + day * 28;
    const sunGlow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 180 + day * 40);
    sunGlow.addColorStop(0, `rgba(255, ${245 - day * 40}, ${210 - day * 60}, 0.75)`);
    sunGlow.addColorStop(0.35, `rgba(255, 230, 180, ${0.22 + day * 0.12})`);
    sunGlow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sunGlow;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = `rgba(255, ${236 - day * 30}, ${170 - day * 40}, 0.95)`;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 18 + day * 4, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud.x, cloud.y, cloud.scale, cloud.soft);
    }

    for (const bird of this.birds) this.drawBird(ctx, bird);
    for (const mote of this.motes) {
      ctx.fillStyle = `rgba(255,255,255,${0.18 + Math.sin(mote.phase) * 0.12})`;
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawHills(ctx, 0.08, groundY - 118, "#b7cce4");
    this.drawSkyline(ctx, 0.14, groundY - 138, 96, 170, ["#b9cde4", "#a7bfd9"]);
    this.drawSkyline(ctx, 0.26, groundY - 104, 118, 118, ["#96b1d0", "#839fc4"]);
    this.drawTrees(ctx, 0.4, groundY - 22);

    const grass = ctx.createLinearGradient(0, groundY - 10, 0, groundY + 8);
    grass.addColorStop(0, "#8fbc7a");
    grass.addColorStop(1, "#6f9a5f");
    ctx.fillStyle = grass;
    ctx.fillRect(0, groundY - 8, w, 12);

    const road = ctx.createLinearGradient(0, groundY, 0, h);
    road.addColorStop(0, "#7ea8cc");
    road.addColorStop(0.35, "#6e96b8");
    road.addColorStop(1, "#5f87a8");
    ctx.fillStyle = road;
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(0, groundY + 2, w, 2);

    ctx.fillStyle = "#5a7f9c";
    ctx.fillRect(0, groundY + 14, w, 7);

    const stride = 46;
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = -stride; x < w + stride; x += stride) {
      const sx = x - ((t * 0.9) % stride);
      ctx.moveTo(sx, groundY + 32);
      ctx.lineTo(sx + 16, groundY + 40);
    }
    ctx.stroke();

    ctx.fillStyle = "rgba(40, 70, 100, 0.08)";
    for (let x = -40; x < w + 40; x += 28) {
      const sx = x - ((t * 0.55) % 28);
      ctx.fillRect(sx, groundY + 48, 10, 3);
    }

    const speedFactor = clamp(this.game.speed / CONFIG.baseSpeed - 1, 0, 1.6);
    if (speedFactor > 0.15 && this.game.state === "running") {
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + speedFactor * 0.12})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i++) {
        const y = 40 + ((i * 47 + t * 0.2) % (groundY - 50));
        const len = 18 + speedFactor * 28;
        const x = w - ((t * (1.2 + speedFactor) + i * 90) % (w + 80));
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y);
        ctx.stroke();
      }
    }
  }

  drawCloud(ctx, x, y, scale, soft) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (soft) {
      const g = ctx.createRadialGradient(24, 14, 4, 24, 18, 42);
      g.addColorStop(0, "rgba(255,255,255,0.95)");
      g.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(24, 18, 42, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    ctx.beginPath();
    ctx.arc(0, 16, 18, 0, Math.PI * 2);
    ctx.arc(18, 8, 24, 0, Math.PI * 2);
    ctx.arc(44, 14, 17, 0, Math.PI * 2);
    ctx.arc(28, 22, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(190, 215, 235, 0.28)";
    ctx.beginPath();
    ctx.ellipse(24, 28, 28, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawBird(ctx, bird) {
    const flap = Math.sin(bird.phase) * 7;
    ctx.save();
    ctx.translate(bird.x, bird.y);
    ctx.scale(bird.size, bird.size);
    ctx.strokeStyle = "rgba(55, 80, 110, 0.55)";
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-8, 0);
    ctx.quadraticCurveTo(-3, -flap, 0, 0);
    ctx.quadraticCurveTo(3, -flap, 8, 0);
    ctx.stroke();
    ctx.restore();
  }

  drawHills(ctx, parallax, baseY, color) {
    const w = this.game.worldWidth;
    const drift = (this.game.distance * parallax) % 220;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-40, baseY + 40);
    for (let x = -40; x < w + 80; x += 55) {
      const bx = x - drift;
      const hump = 18 + Math.sin(bx * 0.02) * 12 + Math.cos(bx * 0.011) * 8;
      ctx.lineTo(bx, baseY - hump);
    }
    ctx.lineTo(w + 40, baseY + 40);
    ctx.closePath();
    ctx.fill();
  }

  drawSkyline(ctx, parallax, baseY, spacing, maxWidth, palette) {
    const w = this.game.worldWidth;
    const drift = (this.game.distance * parallax) % spacing;
    const time = this.game.time;
    for (let x = -spacing; x < w + spacing; x += spacing) {
      const bx = x - drift;
      const width = maxWidth * (0.48 + ((x / spacing + 5) % 5) * 0.1);
      const height = 48 + (((x / spacing + 3) % 4) + 1) * 26;
      const color = palette[Math.abs(Math.floor(x / spacing)) % palette.length];
      ctx.fillStyle = "rgba(30, 55, 85, 0.08)";
      roundedRectPath(ctx, bx + 4, baseY - 4, width, 10, 4);
      ctx.fill();

      ctx.fillStyle = color;
      roundedRectPath(ctx, bx, baseY - height, width, height, 6);
      ctx.fill();

      const roof = ctx.createLinearGradient(0, baseY - height, 0, baseY - height + 14);
      roof.addColorStop(0, "rgba(255,255,255,0.28)");
      roof.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = roof;
      ctx.fillRect(bx, baseY - height, width, 14);

      const winW = 8;
      const winH = 11;
      for (let iy = 12; iy < height - 10; iy += 18) {
        for (let ix = 10; ix < width - 10; ix += 16) {
          const glow = 0.35 + Math.sin(time * 1.4 + bx * 0.05 + iy) * 0.2;
          ctx.fillStyle = `rgba(255, 245, 210, ${glow})`;
          roundedRectPath(ctx, bx + ix, baseY - height + iy, winW, winH, 2);
          ctx.fill();
        }
      }
    }
  }

  drawTrees(ctx, parallax, baseY) {
    const w = this.game.worldWidth;
    const stride = 108;
    const drift = (this.game.distance * parallax) % stride;
    for (let x = -stride; x < w + stride; x += stride) {
      const bx = x - drift;
      const variant = Math.abs(Math.floor(x / stride)) % 3;
      const sway = Math.sin(this.game.time * 1.6 + bx * 0.02) * 2.2;

      ctx.fillStyle = "#6a533f";
      ctx.fillRect(bx + 48 + sway * 0.15, baseY - 2, 7, 24);

      ctx.fillStyle = variant === 0 ? "#6f9460" : variant === 1 ? "#7fa56c" : "#628a55";
      ctx.beginPath();
      ctx.arc(bx + 36 + sway, baseY - 16, 17, 0, Math.PI * 2);
      ctx.arc(bx + 52 + sway, baseY - 26, 16, 0, Math.PI * 2);
      ctx.arc(bx + 66 + sway, baseY - 14, 15, 0, Math.PI * 2);
      if (variant !== 2) ctx.arc(bx + 50 + sway, baseY - 8, 14, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.12)";
      ctx.beginPath();
      ctx.arc(bx + 46 + sway, baseY - 28, 8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

class Player {
  constructor(game) {
    this.game = game;
    this.x = 186;
    this.width = 96;
    this.standHeight = 134;
    this.slideHeight = 76;
    this.spriteSet = null;
    this.reset();
  }

  reset() {
    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.runTime = 0;
    this.landingDust = 0;
    this.lastGrounded = true;
    this.squash = 1;
    this.stretch = 1;
    this.lean = 0;
    this.footstepPhase = 0;
    this.hurtFlash = 0;
  }

  jump() {
    if (this.game.isRidingCart()) return;
    if (!this.grounded) return;
    this.vy = -CONFIG.jumpForce;
    this.grounded = false;
    this.ducking = false;
    this.slideTimer = 0;
    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.squash = 0.88;
    this.stretch = 1.12;
    this.game.audio.jump();
    this.game.fx.burstDust(this.x + this.width * 0.5, this.game.groundY - 4, 0.7);
  }

  startSlide() {
    if (this.game.isRidingCart()) return;
    if (!this.grounded) return;
    if (this.ducking || this.slideCooldown > 0) return;
    this.ducking = true;
    this.slideTimer = 0.64;
    this.height = this.slideHeight;
    this.y = this.game.groundY - this.height;
    this.squash = 1.18;
    this.stretch = 0.88;
    this.game.fx.burstDust(this.x + this.width * 0.35, this.game.groundY - 3, 0.85);
  }

  update(dt) {
    this.runTime += dt * (this.game.speed / CONFIG.baseSpeed) * 1.5;
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 3.2);
    this.squash = lerp(this.squash, 1, 1 - Math.pow(0.001, dt));
    this.stretch = lerp(this.stretch, 1, 1 - Math.pow(0.001, dt));

    const speedLean = clamp((this.game.speed / CONFIG.baseSpeed - 1) * 0.08, 0, 0.12);
    const targetLean = this.ducking ? 0.18 : !this.grounded ? (this.vy < 0 ? -0.06 : 0.1) : speedLean;
    this.lean = lerp(this.lean, targetLean, 1 - Math.pow(0.0008, dt));

    if (this.game.isRidingCart()) {
      this.ducking = true;
      this.grounded = true;
      this.slideTimer = 0.2;
      this.slideCooldown = 0;
      this.height = this.slideHeight;
      this.vy = 0;
      this.y = this.game.groundY - this.height - CONFIG.cartRideOffsetY;
      this.landingDust = 0;
      this.lastGrounded = true;
      this.lean = 0.05;
      if (Math.random() < dt * 14) {
        this.game.fx.emit(1, {
          x: this.x - 8,
          y: this.game.groundY - 6,
          angle: Math.PI,
          spread: 0.5,
          speedMin: 20,
          speedMax: 50,
          lifeMin: 0.2,
          lifeMax: 0.4,
          sizeMin: 2,
          sizeMax: 5,
          color: "rgba(200, 220, 240, 0.7)",
          vx: -60,
        });
      }
      return;
    }

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);

    if (this.ducking) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.ducking = false;
        this.slideTimer = 0;
        this.slideCooldown = 0.18;
        this.squash = 0.92;
        this.stretch = 1.08;
      } else if (Math.random() < dt * 28) {
        this.game.fx.trailSlide(this.x + 10, this.game.groundY - 4);
      }
    }

    if (!this.grounded) {
      this.ducking = false;
      this.height = this.standHeight;
    }

    const targetHeight = this.ducking ? this.slideHeight : this.standHeight;
    if (this.grounded && this.height !== targetHeight) {
      this.height = targetHeight;
      this.y = this.game.groundY - this.height;
    }

    this.vy += CONFIG.gravity * dt;
    this.y += this.vy * dt;

    const floor = this.game.groundY - this.height;
    if (this.y >= floor) {
      if (!this.lastGrounded) {
        this.landingDust = 1;
        this.squash = 1.22;
        this.stretch = 0.82;
        this.game.fx.burstDust(this.x + this.width * 0.5, this.game.groundY - 3, 1.15);
      }
      this.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.height = this.standHeight;
      if (this.vy < -200) {
        this.stretch = Math.max(this.stretch, 1.08);
        this.squash = Math.min(this.squash, 0.92);
      }
    }

    if (this.grounded && !this.ducking) {
      const phase = wrap01(this.runTime * 1.75);
      const step = Math.floor(phase * 4);
      if (step !== this.footstepPhase && (step === 0 || step === 2)) {
        this.game.fx.emit(2, {
          x: this.x + this.width * 0.35,
          y: this.game.groundY - 3,
          angle: Math.PI * 0.85,
          spread: 0.6,
          speedMin: 15,
          speedMax: 45,
          lifeMin: 0.12,
          lifeMax: 0.28,
          sizeMin: 2,
          sizeMax: 4.5,
          color: "rgba(230, 240, 250, 0.65)",
          vx: -25,
          gravity: 100,
        });
      }
      this.footstepPhase = step;
    }

    this.lastGrounded = this.grounded;
    this.landingDust = Math.max(0, this.landingDust - dt * 4);
  }

  getBounds() {
    if (this.ducking && this.grounded) {
      return {
        x: this.x + 18,
        y: this.y + 22,
        width: this.width - 36,
        height: this.height - 28,
      };
    }

    if (!this.grounded) {
      return {
        x: this.x + 22,
        y: this.y + 16,
        width: this.width - 44,
        height: this.height - 28,
      };
    }

    return {
      x: this.x + 22,
      y: this.y + 14,
      width: this.width - 44,
      height: this.height - 22,
    };
  }

  getSpriteFrameName() {
    if (this.game.isRidingCart()) return "slide";
    if (this.hurtFlash > 0.35 && this.spriteSet?.get("hurt")) return "hurt";
    if (this.ducking && this.grounded) return "slide";
    if (!this.grounded) return this.vy < 150 ? "jump" : "land";
    const frames = ["run1", "run2", "run3", "run4"];
    const phase = wrap01(this.runTime * 1.75);
    const eased = phase < 0.5 ? phase * phase * 2 : 1 - Math.pow(-2 * phase + 2, 2) / 2;
    const index = Math.floor(eased * frames.length) % frames.length;
    return frames[index];
  }

  draw(ctx) {
    const centerX = this.x + this.width * 0.5;
    const riding = this.game.isRidingCart();
    const visualGroundY = riding ? this.game.groundY - CONFIG.cartRideOffsetY : this.game.groundY;
    const sliding = (this.ducking && this.grounded && !riding) || riding;
    const airborne = !this.grounded && !riding;
    const descending = airborne && this.vy >= 120;
    const runBob = this.grounded && !sliding && !riding ? Math.sin(this.runTime * 13) * 2.8 : 0;
    const visualBottomY = riding ? visualGroundY : airborne ? this.y + this.height : this.game.groundY;

    ctx.save();
    ctx.setLineDash([]);
    const shadowScale = airborne ? 0.72 : sliding ? 1.2 : 1;
    const shadowAlpha = riding ? 0.05 : this.grounded ? 0.16 : 0.08;
    if (shadowAlpha > 0) {
      ctx.fillStyle = `rgba(35, 64, 92, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(
        centerX + (sliding ? 8 : 0),
        this.game.groundY - 4,
        (sliding ? 42 : 30) * shadowScale,
        (sliding ? 7 : 6) * shadowScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    if (this.landingDust > 0) {
      ctx.globalAlpha = this.landingDust * 0.35;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(centerX - 30 - (1 - this.landingDust) * 14, this.game.groundY - 6, 12, 3.5, 0, 0, Math.PI * 2);
      ctx.ellipse(centerX + 28 + (1 - this.landingDust) * 14, this.game.groundY - 5, 10, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const sprite = this.spriteSet ? this.spriteSet.get(this.getSpriteFrameName()) : null;
    if (sprite) {
      let drawH = 146;
      let xOffset = 0;
      let yOffset = 0;

      if (riding) {
        drawH = 82;
        xOffset = -14;
        yOffset = 4;
      } else if (sliding) {
        drawH = 90;
        xOffset = -16;
        yOffset = 2;
      } else if (airborne && !descending) {
        drawH = 138;
        yOffset = -8;
      } else if (descending) {
        drawH = 120;
        xOffset = 4;
        yOffset = -2;
      }

      const aspect = sprite.naturalWidth / Math.max(1, sprite.naturalHeight);
      const drawW = drawH * aspect;
      const pivotX = centerX + xOffset;
      const pivotY = visualBottomY + yOffset + runBob;

      ctx.translate(pivotX, pivotY);
      ctx.rotate(this.lean);
      ctx.scale(this.squash, this.stretch);
      if (this.hurtFlash > 0) {
        ctx.globalAlpha = 0.7 + Math.sin(this.game.time * 40) * 0.3;
      }
      ctx.drawImage(sprite, -drawW * 0.5, -drawH, drawW, drawH);
    } else {
      this.drawFallback(ctx, centerX, visualBottomY, runBob, sliding, airborne);
    }

    ctx.restore();
  }

  drawFallback(ctx, centerX, groundY, runBob, sliding, airborne) {
    const y = groundY - 112 + runBob;
    ctx.fillStyle = "#13375a";
    roundedRectPath(ctx, centerX - 20, y + 22, 40, 46, 14);
    ctx.fill();
    ctx.strokeStyle = "#204f7a";
    ctx.lineWidth = 7;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(centerX - 8, y + 68);
    ctx.lineTo(centerX - (sliding ? 18 : 22), y + 98);
    ctx.moveTo(centerX + 8, y + 68);
    ctx.lineTo(centerX + (sliding ? 34 : 26), y + (sliding ? 82 : 98));
    ctx.moveTo(centerX - 18, y + 34);
    ctx.lineTo(centerX - 36, y + 52);
    ctx.moveTo(centerX + 18, y + 34);
    ctx.lineTo(centerX + 36, y + (airborne ? 20 : 54));
    ctx.stroke();
    ctx.fillStyle = "#efc49e";
    ctx.beginPath();
    ctx.arc(centerX + 2, y + 10, 20, 0, Math.PI * 2);
    ctx.fill();
  }
}

class SpriteSet {
  constructor(images) {
    this.images = images || {};
  }

  get(name) {
    return this.images[name] || null;
  }

  isReady() {
    return Object.keys(this.images).length > 0;
  }
}

function loadImage(path, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const img = new Image();
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.decoding = "async";
    img.onload = () => {
      window.clearTimeout(timer);
      finish(img);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      finish(null);
    };
    img.src = path;
  });
}

function loadPlayerSprites(characterId = CHARACTERS[0].id) {
  const character = getCharacterById(characterId);
  const names = ["run1", "run2", "run3", "run4", "jump", "land", "slide", "hurt"];
  return Promise.all(names.map((name) => loadImage(`${character.path}/${name}.png`).then((image) => [name, image]))).then((entries) => {
    const images = {};
    for (const [name, image] of entries) {
      if (image) images[name] = image;
    }
    return new SpriteSet(images);
  });
}

const GAME_ART_PATHS = {
  cup: "assets/game/cup.png",
  teapot: "assets/game/teapot.png",
  cart: "assets/game/cart.png",
};

function createArtImage(path) {
  const img = new Image();
  img.decoding = "async";
  img.src = path;
  return img;
}

const GAME_ART = Object.fromEntries(Object.entries(GAME_ART_PATHS).map(([key, path]) => [key, createArtImage(path)]));

function getGameArt(name) {
  const image = GAME_ART[name];
  return image && image.complete && image.naturalWidth > 0 ? image : null;
}

class Obstacle {
  constructor(game, type, x) {
    this.game = game;
    this.type = type;
    this.x = x;
    this.width = type.width;
    this.height = type.height;
    this.y = game.groundY - type.height + (type.offsetY || 0);
    this.phase = Math.random() * Math.PI * 2;
    this.paperLabels = [];

    if (type.kind === "paperHigh") {
      this.paperLabels = Array.from({ length: 2 }, () => 1 + Math.floor(Math.random() * 50));
    }
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    return {
      x: this.x + (this.type.hitInsetX || 6),
      y: this.y + (this.type.hitInsetY || 6),
      width: this.width - 2 * (this.type.hitInsetX || 6),
      height: this.height - 2 * (this.type.hitInsetY || 6),
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.setLineDash([]);

    switch (this.type.kind) {
      case "houseLow":
        this.drawBuilding(ctx, this.width, this.height, 2, 2);
        break;
      case "houseTall":
        this.drawBuilding(ctx, this.width, this.height, 3, 3);
        break;
      case "towerSlim":
        this.drawTower(ctx);
        break;
      case "paperHigh":
        this.drawFlyingPapers(ctx, this.game.time);
        break;
      default:
        this.drawBuilding(ctx, this.width, this.height, 2, 2);
        break;
    }

    ctx.restore();
  }

  drawBuilding(ctx, width, height, cols, rows) {
    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height + 4, width * 0.48, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4d6073";
    roundedRectPath(ctx, 0, 0, width, height, 8);
    ctx.fill();

    const wall = ctx.createLinearGradient(0, 0, width, height);
    wall.addColorStop(0, "#9a8579");
    wall.addColorStop(0.45, "#7d675c");
    wall.addColorStop(1, "#5d4a42");
    ctx.fillStyle = wall;
    roundedRectPath(ctx, 4, 5, width - 8, height - 10, 6);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.14)";
    ctx.lineWidth = 1;
    for (let x = 10; x < width - 8; x += 12) {
      ctx.beginPath();
      ctx.moveTo(x, 6);
      ctx.lineTo(x, height - 6);
      ctx.stroke();
    }
    for (let y = 12; y < height - 8; y += 11) {
      ctx.beginPath();
      ctx.moveTo(5, y);
      ctx.lineTo(width - 5, y);
      ctx.stroke();
    }

    const paddingX = 10;
    const paddingY = 12;
    const gapX = 8;
    const gapY = 8;
    const winW = Math.max(9, Math.floor((width - paddingX * 2 - gapX * (cols - 1)) / cols));
    const winH = Math.max(8, Math.floor((height - paddingY * 2 - gapY * (rows - 1)) / rows));
    const time = this.game.time;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = paddingX + col * (winW + gapX);
        const y = paddingY + row * (winH + gapY);
        ctx.fillStyle = "#1d3348";
        roundedRectPath(ctx, x, y, winW, winH, 2);
        ctx.fill();
        const glow = 0.42 + Math.sin(time * 2 + this.phase + row + col) * 0.18;
        ctx.fillStyle = `rgba(170, 220, 255, ${glow})`;
        roundedRectPath(ctx, x + 2, y + 2, winW - 4, winH - 4, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillRect(x + 2, y + 2, (winW - 4) * 0.35, 2);
      }
    }

    const roof = ctx.createLinearGradient(0, -6, 0, 8);
    roof.addColorStop(0, "#d4b4aa");
    roof.addColorStop(1, "#a8877c");
    ctx.fillStyle = roof;
    roundedRectPath(ctx, -4, -7, width + 8, 13, 5);
    ctx.fill();

    ctx.fillStyle = "#576675";
    roundedRectPath(ctx, -3, height - 8, width + 6, 10, 5);
    ctx.fill();
  }

  drawTower(ctx) {
    const width = this.width;
    const height = this.height;

    ctx.fillStyle = "rgba(0,0,0,0.14)";
    ctx.beginPath();
    ctx.ellipse(width * 0.5, height + 4, width * 0.44, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4f647a";
    roundedRectPath(ctx, 7, 0, width - 14, height, 10);
    ctx.fill();

    const glass = ctx.createLinearGradient(0, 0, width, 0);
    glass.addColorStop(0, "#2a3848");
    glass.addColorStop(0.5, "#8ec4e8");
    glass.addColorStop(1, "#2a3848");
    ctx.fillStyle = glass;
    roundedRectPath(ctx, 13, 8, width - 26, height - 16, 9);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let y = 14; y < height - 14; y += 16) {
      ctx.fillRect(17, y, width - 34, 3);
    }

    const shine = ctx.createLinearGradient(14, 8, width * 0.45, height);
    shine.addColorStop(0, "rgba(255,255,255,0.28)");
    shine.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = shine;
    roundedRectPath(ctx, 14, 10, 10, height - 22, 5);
    ctx.fill();

    ctx.fillStyle = "#64788c";
    roundedRectPath(ctx, 3, height - 8, width - 6, 10, 5);
    ctx.fill();
  }

  drawPaperRevision(ctx, x, y, number, scale = 1) {
    const label = `Изм ${number}`;
    const fontSize = Math.max(8, Math.round(8.6 * scale));
    ctx.save();
    ctx.font = `700 ${fontSize}px Arial`;
    const width = Math.ceil(ctx.measureText(label).width) + 8;
    const height = fontSize + 4;
    ctx.fillStyle = "rgba(255, 245, 190, 0.98)";
    ctx.strokeStyle = "#bf8500";
    ctx.lineWidth = 1;
    roundedRectPath(ctx, x - 2, y - 1, width, height, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#7a1f10";
    ctx.textBaseline = "top";
    ctx.fillText(label, x + 2, y + 1);
    ctx.restore();
  }

  drawPaperLines(ctx, x, y, width, height) {
    ctx.fillStyle = "rgba(133, 167, 209, 0.58)";
    for (let lineY = y + 10; lineY < y + height - 4; lineY += 5) {
      ctx.fillRect(x + 6, lineY, width - 16, 1.1);
    }
  }

  drawFlyingPapers(ctx, time) {
    const bob = Math.sin(time * 8 + this.phase) * 4;
    const sway = Math.sin(time * 3.2 + this.phase) * 3;
    ctx.translate(sway, bob);

    ctx.fillStyle = "rgba(40, 70, 100, 0.12)";
    ctx.beginPath();
    ctx.ellipse(28, 34, 28, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(i * 20, i * 4);
      ctx.rotate((Math.sin(time * 7 + this.phase + i) * 14 - 8) * Math.PI / 180);
      ctx.fillStyle = i === 0 ? "#ffffff" : "#f4f8fd";
      ctx.strokeStyle = "#bed0e4";
      ctx.lineWidth = 1.5;
      roundedRectPath(ctx, 0, 0, 36, 24, 4);
      ctx.fill();
      ctx.stroke();
      this.drawPaperLines(ctx, 0, 0, 36, 24);
      this.drawPaperRevision(ctx, 4, 3, this.paperLabels[i] || 1, 0.92);
      ctx.beginPath();
      ctx.moveTo(27, 0);
      ctx.lineTo(36, 9);
      ctx.lineTo(27, 9);
      ctx.closePath();
      ctx.fillStyle = "#eef4fb";
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }
}

class ObstacleManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = 0.9;
    this.lastType = null;
    this.types = [
      {
        kind: "houseLow",
        width: 64,
        height: 50,
        minGap: 250,
        difficulty: 0,
        behavior: "jump",
        hitInsetX: 10,
        hitInsetY: 8,
      },
      {
        kind: "houseTall",
        width: 74,
        height: 78,
        minGap: 304,
        difficulty: 0.18,
        behavior: "jump",
        hitInsetX: 10,
        hitInsetY: 8,
      },
      {
        kind: "towerSlim",
        width: 58,
        height: 94,
        minGap: 338,
        difficulty: 0.32,
        behavior: "jump",
        hitInsetX: 9,
        hitInsetY: 8,
      },
      {
        kind: "paperHigh",
        width: 66,
        height: 38,
        minGap: 280,
        difficulty: 0.16,
        behavior: "duck",
        offsetY: -86,
        hitInsetX: 5,
        hitInsetY: 2,
      },
    ];
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 0.9;
    this.lastType = null;
  }

  chooseType() {
    const level = this.game.speed / CONFIG.baseSpeed;
    let pool = this.types.filter((t) => t.difficulty <= level * 0.55 + 0.35);
    if (!pool.length) pool = this.types.slice();

    if (Math.random() < 0.34) {
      const duckOnly = pool.filter((t) => t.behavior === "duck");
      if (duckOnly.length) pool = duckOnly.concat(pool);
    }

    const available = pool.filter((t) => t.kind !== this.lastType);
    const source = available.length ? available : pool;
    const next = source[Math.floor(Math.random() * source.length)] || pool[0];
    this.lastType = next.kind;
    return next;
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const type = this.chooseType();
      this.items.push(new Obstacle(this.game, type, this.game.worldWidth + 40));
      const speedFactor = this.game.speed / CONFIG.baseSpeed;
      const baseGap = type.minGap / Math.max(1, speedFactor * 0.86);
      const randomGap = 90 + Math.random() * 145;
      const gapDistance = Math.max(225, baseGap + randomGap);
      this.cooldown = gapDistance / this.game.speed / CONFIG.obstacleFrequency;
    }

    for (const item of this.items) item.update(dt);
    this.items = this.items.filter((item) => item.x + item.width > -40);
  }

  draw(ctx) {
    for (const item of this.items) item.draw(ctx);
  }
}

class BeveragePickup {
  constructor(game, kind, x) {
    this.game = game;
    this.kind = kind;
    this.x = x;
    this.phase = Math.random() * Math.PI * 2;
    if (kind === "teapot") {
      this.width = 70;
      this.height = 56;
      this.y = game.groundY - 162 - Math.random() * 22;
    } else {
      this.width = 62;
      this.height = 52;
      this.y = game.groundY - 154 - Math.random() * 18;
    }
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    const inset = this.kind === "teapot" ? 8 : 10;
    return {
      x: this.x + inset,
      y: this.y + inset,
      width: this.width - inset * 2,
      height: this.height - inset * 2,
    };
  }

  draw(ctx, time) {
    const bob = Math.sin(time * 5.5 + this.phase) * 4;
    const pulse = 0.85 + Math.sin(time * 4 + this.phase) * 0.15;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.setLineDash([]);

    const glow = ctx.createRadialGradient(
      this.width * 0.5,
      this.height * 0.52,
      4,
      this.width * 0.5,
      this.height * 0.52,
      Math.max(this.width, this.height) * 0.62 * pulse
    );
    glow.addColorStop(0, this.kind === "teapot" ? "rgba(255,210,110,0.35)" : "rgba(255,255,255,0.38)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(this.width * 0.5, this.height * 0.52, Math.max(this.width, this.height) * 0.62 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(this.width * 0.5, this.height * 0.5);
    ctx.rotate(Math.sin(time * 1.8 + this.phase) * 0.06);
    ctx.translate(-this.width * 0.5, -this.height * 0.5);

    const art = getGameArt(this.kind);
    if (!drawContainedImage(ctx, art, 0, 0, this.width, this.height)) {
      if (this.kind === "teapot") {
        this.drawTeapot(ctx);
      } else {
        this.drawCup(ctx);
      }
    }
    ctx.restore();

    ctx.strokeStyle = this.kind === "teapot" ? "rgba(255, 200, 90, 0.45)" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(this.width * 0.5, this.height * 0.52, 18 + Math.sin(time * 5 + this.phase) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawCup(ctx) {
    ctx.fillStyle = "#f8eed8";
    roundedRectPath(ctx, 11, 14, 21, 16, 7);
    ctx.fill();
    ctx.strokeStyle = "#b69a71";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = "#cf8a30";
    roundedRectPath(ctx, 13, 16, 17, 7, 3);
    ctx.fill();

    ctx.strokeStyle = "#e7dac0";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(33, 22, 5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = "#6d8b62";
    ctx.beginPath();
    ctx.ellipse(22, 25, 3, 5, 0.7, 0, Math.PI * 2);
    ctx.ellipse(18, 24, 2.5, 4.2, -0.4, 0, Math.PI * 2);
    ctx.ellipse(26, 24, 2.5, 4.2, 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(17, 11);
    ctx.bezierCurveTo(14, 7, 15, 4, 17, 1);
    ctx.moveTo(23, 11);
    ctx.bezierCurveTo(20, 7, 21, 4, 23, 1);
    ctx.stroke();
  }

  drawTeapot(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.24)";
    ctx.beginPath();
    ctx.ellipse(24, 45, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const body = ctx.createLinearGradient(0, 10, 0, 48);
    body.addColorStop(0, "rgba(255, 245, 220, 0.95)");
    body.addColorStop(1, "rgba(255, 201, 82, 0.9)");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(14, 16);
    ctx.quadraticCurveTo(12, 10, 20, 8);
    ctx.lineTo(30, 8);
    ctx.quadraticCurveTo(40, 10, 39, 18);
    ctx.lineTo(39, 34);
    ctx.quadraticCurveTo(38, 44, 28, 45);
    ctx.lineTo(18, 45);
    ctx.quadraticCurveTo(8, 44, 8, 34);
    ctx.lineTo(8, 18);
    ctx.quadraticCurveTo(8, 11, 14, 16);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(160, 120, 45, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(13, 18);
    ctx.bezierCurveTo(6, 18, 2, 17, 2, 15);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(41, 26, 8, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = "#c98d24";
    ctx.beginPath();
    ctx.arc(24, 26, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 221, 118, 0.8)";
    ctx.beginPath();
    ctx.arc(24, 26, 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#cc9a4c";
    roundedRectPath(ctx, 18, 2, 12, 6, 4);
    ctx.fill();
  }
}

class BeverageManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = this.randomCooldown();
  }

  randomCooldown() {
    return CONFIG.beverageSpawnMin + Math.random() * (CONFIG.beverageSpawnMax - CONFIG.beverageSpawnMin);
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 2.3;
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      const kind = Math.random() < 0.72 ? "cup" : "teapot";
      this.items.push(new BeveragePickup(this.game, kind, this.game.worldWidth + 40));
      this.cooldown = this.randomCooldown();
    }

    for (const item of this.items) item.update(dt);
    this.items = this.items.filter((item) => item.x + item.width > -30);
  }

  draw(ctx) {
    for (const item of this.items) item.draw(ctx, this.game.time);
  }
}

class CartPickup {
  constructor(game, x) {
    this.game = game;
    this.x = x;
    this.width = 124;
    this.height = 76;
    this.y = game.groundY - this.height + 2;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    return {
      x: this.x + 4,
      y: this.y + 6,
      width: this.width - 8,
      height: this.height - 8,
    };
  }

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(time * 8 + this.phase) * 1.5);
    drawCartIllustration(ctx, 0, 0, this.width, this.height);
    ctx.restore();
  }
}

function drawCartIllustration(ctx, x, y, width, height) {
  ctx.save();
  ctx.translate(x, y);
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.beginPath();
  ctx.ellipse(width * 0.5, height + 5, width * 0.42, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const art = getGameArt("cart");
  if (!drawContainedImage(ctx, art, 0, 0, width, height)) {
    const body = ctx.createLinearGradient(0, 8, 0, height - 8);
    body.addColorStop(0, "#5b6476");
    body.addColorStop(1, "#252b37");
    ctx.fillStyle = body;
    roundedRectPath(ctx, 14, 10, width - 26, height - 20, 10);
    ctx.fill();

    ctx.strokeStyle = "#111823";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#2f3746";
    roundedRectPath(ctx, 20, 4, width - 34, 12, 6);
    ctx.fill();

    ctx.fillStyle = "#252b37";
    roundedRectPath(ctx, 18, height - 15, width - 30, 11, 6);
    ctx.fill();

    ctx.fillStyle = "#f6b21f";
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(31 + i * 14, 32);
      ctx.rotate(-0.5);
      ctx.fillRect(0, 0, 8, 16);
      ctx.restore();
    }

    ctx.strokeStyle = "#2a2f3b";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(12, 26);
    ctx.lineTo(3, 26);
    ctx.lineTo(3, 40);
    ctx.stroke();

    ctx.fillStyle = "#2c2f3a";
    ctx.beginPath();
    ctx.arc(28, height - 2, 9, 0, Math.PI * 2);
    ctx.arc(width - 28, height - 2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#7e8596";
    ctx.beginPath();
    ctx.arc(28, height - 2, 4.5, 0, Math.PI * 2);
    ctx.arc(width - 28, height - 2, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

class CartManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = this.randomCooldown();
  }

  randomCooldown() {
    return CONFIG.cartSpawnMin + Math.random() * (CONFIG.cartSpawnMax - CONFIG.cartSpawnMin);
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 17.0;
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.items.push(new CartPickup(this.game, this.game.worldWidth + 80));
      this.cooldown = this.randomCooldown();
    }
    for (const item of this.items) item.update(dt);
    this.items = this.items.filter((item) => item.x + item.width > -60);
  }

  draw(ctx) {
    for (const item of this.items) item.draw(ctx, this.game.time);
  }
}

class InputController {
  constructor(game) {
    this.game = game;
    this.touchStartY = null;
    this.bindKeyboard();
    this.bindPointer();
    this.bindUIButtons();
  }

  restartIfEnded() {
    if (this.game.state === "gameover" || this.game.state === "win") {
      this.game.restart();
      return true;
    }
    return false;
  }

  bindKeyboard() {
    window.addEventListener("keydown", (e) => {
      if (isTypingTarget(e.target)) return;

      if (["Space", "ArrowUp", "ArrowDown", "Enter"].includes(e.code)) {
        e.preventDefault();
      }

      if (["Space", "ArrowUp"].includes(e.code)) {
        this.game.userGesture();
        if (this.restartIfEnded()) return;
        if (!this.game.start()) return;
        this.game.player.jump();
      }

      if (e.code === "ArrowDown") {
        this.game.userGesture();
        if (!this.game.start()) return;
        this.game.player.startSlide();
      }

      if (e.code === "Enter" && (this.game.state === "gameover" || this.game.state === "win")) {
        this.game.restart();
      }

      if (e.code === "KeyP") {
        this.game.togglePause();
      }
    });
  }

  bindPointer() {
    const onTap = () => {
      this.game.userGesture();
      if (this.restartIfEnded()) return;
      if (!this.game.start()) return;
      this.game.player.jump();
    };

    this.game.canvas.addEventListener("pointerdown", (e) => {
      this.touchStartY = e.clientY;
      onTap();
    });

    this.game.canvas.addEventListener("pointermove", (e) => {
      if (this.touchStartY == null) return;
      const delta = e.clientY - this.touchStartY;
      if (delta > 38) {
        this.game.userGesture();
        if (!this.game.start()) return;
        this.game.player.startSlide();
        this.touchStartY = null;
      }
    });

    const resetTouch = () => {
      this.touchStartY = null;
    };

    this.game.canvas.addEventListener("pointerup", resetTouch);
    this.game.canvas.addEventListener("pointercancel", resetTouch);

    const duckBtn = document.getElementById("duckBtn");
    if (duckBtn) {
      duckBtn.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        this.game.userGesture();
        if (!this.game.start()) return;
        this.game.player.startSlide();
      });
    }
  }

  bindUIButtons() {
    document.getElementById("restartBtn")?.addEventListener("click", () => {
      this.game.userGesture();
      this.game.restart();
    });

    document.getElementById("pauseBtn")?.addEventListener("click", () => {
      this.game.userGesture();
      this.game.togglePause();
    });

    document.getElementById("fullscreenBtn")?.addEventListener("click", () => {
      try {
        const shell = document.querySelector(".game-shell");
        if (!document.fullscreenElement) {
          if (shell?.requestFullscreen) shell.requestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      } catch {
        // no-op
      }
    });
  }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.worldWidth = canvas.width;
    this.worldHeight = canvas.height;
    this.groundY = this.worldHeight - CONFIG.groundHeight;

    this.audio = new AudioEngine();
    this.fx = new ParticleSystem();
    this.background = new Background(this);
    this.player = new Player(this);
    this.obstacles = new ObstacleManager(this);
    this.beverages = new BeverageManager(this);
    this.carts = new CartManager(this);
    this.input = new InputController(this);

    this.state = "select";
    this.time = 0;
    this.lastFrame = performance.now();
    this.distance = 0;
    this.score = 0;
    this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);
    this.speed = CONFIG.baseSpeed;
    this.hitFlash = 0;
    this.shake = 0;
    this.lastScoreMilestone = 0;
    this.healthUnits = CONFIG.maxHealthUnits;
    this.invulnerabilityTimer = 0;
    this.slowTimer = 0;
    this.cartRideTimer = 0;
    this.cupCount = 0;
    this.teapotCount = 0;
    this.healPulse = 0;
    this.scorePop = 0;

    this.playerNameInput = document.getElementById("playerNameInput");
    this.leaderboardList = document.getElementById("leaderboardList");
    this.leaderboardStatus = document.getElementById("leaderboardStatus");
    this.playerName = normalizePlayerName(localStorage.getItem(PLAYER_NAME_KEY) || "Игрок");
    this.leaderboardRows = this.loadLocalLeaderboard();
    this.leaderboardRef = null;
    this.firebaseReady = false;
    this.characterStatus = document.getElementById("characterStatus");
    this.characterGrid = document.getElementById("characterGrid");
    this.currentCharacterId = localStorage.getItem(CHARACTER_STORAGE_KEY) || CHARACTERS[0].id;

    if (this.playerNameInput) {
      this.playerNameInput.value = this.playerName;
      this.playerNameInput.addEventListener("input", () => {
        this.playerName = normalizePlayerName(this.playerNameInput.value);
        localStorage.setItem(PLAYER_NAME_KEY, this.playerName);
      });
    }

    this.updateLeaderboardUI();
    this.initOnlineLeaderboard();
    this.setupCharacterSelect();

    this.onResize();
    window.addEventListener("resize", this.onResize.bind(this));

    requestAnimationFrame(this.loop.bind(this));
  }

  isRidingCart() {
    return this.cartRideTimer > 0;
  }

  isInvulnerable() {
    return this.invulnerabilityTimer > 0 || this.isRidingCart();
  }

  setCharacterStatus(text) {
    if (this.characterStatus) this.characterStatus.textContent = text;
  }

  setupCharacterSelect() {
    if (!this.characterGrid) return;
    this.characterGrid.innerHTML = CHARACTERS.map((character) => `
      <button class="character-card" type="button" data-character-id="${character.id}">
        <img src="${character.preview}" alt="${character.name}" loading="lazy" />
        <span>
          <strong>${character.name}</strong>
          <span>${character.description}</span>
        </span>
      </button>
    `).join("");

    this.characterGrid.addEventListener("click", (event) => {
      const card = event.target.closest(".character-card");
      if (!card) return;
      this.selectCharacter(card.dataset.characterId);
    });

    this.updateCharacterCards(this.currentCharacterId, this.currentCharacterId);
    this.selectCharacter(this.currentCharacterId);
  }

  updateCharacterCards(activeId, loadingId = null) {
    if (!this.characterGrid) return;
    this.characterGrid.querySelectorAll(".character-card").forEach((card) => {
      const id = card.dataset.characterId;
      card.classList.toggle("active", id === activeId);
      card.classList.toggle("loading", id === loadingId);
    });
  }

  selectCharacter(characterId) {
    const character = getCharacterById(characterId);
    this.currentCharacterId = character.id;
    this.setCharacterStatus(`Загружается персонаж: ${character.name}...`);
    this.updateCharacterCards(character.id, character.id);

    loadPlayerSprites(character.id)
      .then((spriteSet) => {
        if (!spriteSet || !spriteSet.isReady()) {
          this.setCharacterStatus("Не удалось загрузить спрайты персонажа. Проверь папку assets/characters/.");
          this.updateCharacterCards(null, null);
          return;
        }
        this.player.spriteSet = spriteSet;
        localStorage.setItem(CHARACTER_STORAGE_KEY, character.id);
        this.state = "ready";
        this.updateCharacterCards(character.id, null);
        this.setCharacterStatus(`Выбран персонаж: ${character.name}. Нажми Space или ↑ для старта.`);
      })
      .catch(() => {
        this.setCharacterStatus("Ошибка загрузки персонажа. Проверь структуру папок и имена PNG-файлов.");
        this.updateCharacterCards(null, null);
      });
  }

  userGesture() {
    this.audio.ensure();
    if (this.audio.ctx?.resume) {
      this.audio.ctx.resume();
    }
  }

  onResize() {
    const ratio = this.worldWidth / this.worldHeight;
    const maxW = Math.min(window.innerWidth - 36, 1240);
    const w = Math.max(320, maxW);
    const h = w / ratio;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  start() {
    if (this.state === "ready") {
      this.state = "running";
      return true;
    }
    return this.state === "running";
  }

  restart() {
    this.state = "running";
    this.time = 0;
    this.distance = 0;
    this.score = 0;
    this.speed = CONFIG.baseSpeed;
    this.hitFlash = 0;
    this.shake = 0;
    this.lastScoreMilestone = 0;
    this.healthUnits = CONFIG.maxHealthUnits;
    this.invulnerabilityTimer = 0;
    this.slowTimer = 0;
    this.cartRideTimer = 0;
    this.cupCount = 0;
    this.teapotCount = 0;
    this.healPulse = 0;
    this.scorePop = 0;
    this.player.reset();
    this.obstacles.reset();
    this.beverages.reset();
    this.carts.reset();
    this.fx.reset();
  }

  togglePause() {
    if (this.state === "running") {
      this.state = "paused";
    } else if (this.state === "paused") {
      this.state = "running";
    }
  }

  gameOver() {
    if (this.state !== "running") return;
    this.state = "gameover";
    this.hitFlash = 1;
    this.shake = 14;
    this.audio.hit();
    this.saveBest();
  }

  finishDay() {
    if (this.state !== "running") return;
    this.state = "win";
    this.audio.win();
    this.saveBest();
  }

  loadLocalLeaderboard() {
    try {
      const raw = localStorage.getItem(LEADERBOARD_KEY);
      const data = raw ? JSON.parse(raw) : [];
      return mergeLeaderboardRows(Array.isArray(data) ? data : []).slice(0, 10);
    } catch {
      return [];
    }
  }

  saveLocalLeaderboard(rows) {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(mergeLeaderboardRows(rows).slice(0, 10)));
  }

  setLeaderboardStatus(text) {
    if (this.leaderboardStatus) this.leaderboardStatus.textContent = text;
  }

  initOnlineLeaderboard() {
    try {
      if (!window.firebase || !window.firebase.database) {
        this.setLeaderboardStatus("Локальная таблица: Firebase SDK не загрузился");
        return;
      }

      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(FIREBASE_CONFIG);
      }

      this.leaderboardRef = window.firebase.database().ref(LEADERBOARD_PATH);
      this.firebaseReady = true;
      this.setLeaderboardStatus("Онлайн-таблица подключается...");

      this.leaderboardRef
        .orderByChild("score")
        .limitToLast(10)
        .on(
          "value",
          (snapshot) => {
            const rows = [];
            snapshot.forEach((child) => {
              const row = child.val() || {};
              rows.push({
                name: normalizePlayerName(row.name),
                score: Number(row.score || 0),
                tea: Number(row.tea || 0),
                date: row.date || "",
              });
            });
            this.leaderboardRows = mergeLeaderboardRows(rows).slice(0, 10);
            this.saveLocalLeaderboard(this.leaderboardRows);
            this.updateLeaderboardUI();
            this.setLeaderboardStatus("Общая онлайн-таблица лидеров");
          },
          () => {
            this.firebaseReady = false;
            this.setLeaderboardStatus("Нет доступа к Firebase, показана локальная таблица");
            this.leaderboardRows = this.loadLocalLeaderboard();
            this.updateLeaderboardUI();
          }
        );
    } catch {
      this.firebaseReady = false;
      this.setLeaderboardStatus("Нет подключения к онлайн-таблице, показана локальная таблица");
    }
  }

  updateLeaderboardUI() {
    if (!this.leaderboardList) return;
    const rows = mergeLeaderboardRows(this.leaderboardRows || []).slice(0, 10);
    if (!rows.length) {
      this.leaderboardList.innerHTML = '<li class="leaderboard-empty">Пока нет результатов</li>';
      return;
    }

    this.leaderboardList.innerHTML = rows
      .map((row, index) => {
        const name = escapeHtml(normalizePlayerName(row.name));
        const score = Number(row.score || 0);
        return `<li><span>${index + 1}. ${name}</span><strong>${score}</strong></li>`;
      })
      .join("");
  }

  saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(STORAGE_KEY, String(this.best));
    }

    const inputName = this.playerNameInput && this.playerNameInput.value;
    this.playerName = normalizePlayerName(inputName || this.playerName || "Игрок");
    localStorage.setItem(PLAYER_NAME_KEY, this.playerName);

    const result = {
      name: this.playerName,
      score: Number(this.score || 0),
      tea: Number(this.cupCount + this.teapotCount * 2 || 0),
      date: new Date().toISOString(),
    };

    const localRows = mergeLeaderboardRows([...this.loadLocalLeaderboard(), result]);
    this.saveLocalLeaderboard(localRows);

    if (this.firebaseReady && this.leaderboardRef) {
      const entryKey = leaderboardNameKey(this.playerName);
      this.leaderboardRef
        .child(entryKey)
        .transaction((current) => {
          const currentScore = Number((current && current.score) || 0);
          if (!current || result.score > currentScore) {
            return result;
          }
          return current;
        })
        .catch(() => {
          this.setLeaderboardStatus("Результат сохранён локально, но не отправился онлайн");
          this.leaderboardRows = localRows.slice(0, 10);
          this.updateLeaderboardUI();
        });
    } else {
      this.leaderboardRows = localRows.slice(0, 10);
      this.updateLeaderboardUI();
    }
  }

  collectBeverage(index) {
    const item = this.beverages.items[index];
    if (!item) return;
    this.beverages.items.splice(index, 1);
    const cx = item.x + item.width * 0.5;
    const cy = item.y + item.height * 0.5;
    if (item.kind === "teapot") {
      this.teapotCount += 1;
      this.healthUnits = Math.min(CONFIG.maxHealthUnits, this.healthUnits + CONFIG.teapot.healUnits);
      this.speed = Math.max(CONFIG.baseSpeed * CONFIG.teapot.minSpeedFactor, this.speed - CONFIG.teapot.slowdownAmount);
      this.slowTimer = Math.max(this.slowTimer, CONFIG.teapot.slowDuration);
      this.fx.burstSparkles(cx, cy, true);
    } else {
      this.cupCount += 1;
      this.healthUnits = Math.min(CONFIG.maxHealthUnits, this.healthUnits + CONFIG.cup.healUnits);
      this.speed = Math.max(CONFIG.baseSpeed * CONFIG.cup.minSpeedFactor, this.speed - CONFIG.cup.slowdownAmount);
      this.slowTimer = Math.max(this.slowTimer, CONFIG.cup.slowDuration);
      this.fx.burstSparkles(cx, cy, false);
    }
    this.healPulse = 1;
    this.audio.tea();
  }

  takeDamage() {
    if (this.isInvulnerable()) return;
    this.healthUnits = Math.max(0, this.healthUnits - CONFIG.damageUnits);
    this.invulnerabilityTimer = CONFIG.invulnerabilityDuration;
    this.hitFlash = 0.75;
    this.shake = 10;
    this.player.hurtFlash = 1;
    const bounds = this.player.getBounds();
    this.fx.burstHit(bounds.x + bounds.width * 0.5, bounds.y + bounds.height * 0.4);
    this.audio.hit();
    if (this.healthUnits <= 0) {
      this.gameOver();
    }
  }

  activateCartRide(index) {
    const cart = this.carts.items[index];
    this.carts.items.splice(index, 1);
    this.cartRideTimer = CONFIG.cartRideDuration;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.ducking = false;
    if (cart) {
      this.fx.burstSparkles(cart.x + cart.width * 0.5, cart.y + cart.height * 0.4, true);
      this.fx.burstDust(cart.x + cart.width * 0.5, this.groundY - 2, 1.2);
    }
    this.audio.powerup();
  }

  loop(now) {
    const rawDt = (now - this.lastFrame) / 1000;
    const dt = Math.min(CONFIG.maxDt, Math.max(0, rawDt));
    this.lastFrame = now;

    if (this.state === "running") this.update(dt);
    else {
      this.time += dt * 0.35;
      this.background.update(dt * 0.25);
      this.fx.update(dt);
      this.healPulse = Math.max(0, this.healPulse - dt);
      this.scorePop = Math.max(0, this.scorePop - dt);
    }
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt) {
    this.time += dt;
    this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);
    this.healPulse = Math.max(0, this.healPulse - dt * 1.8);
    this.scorePop = Math.max(0, this.scorePop - dt * 2.4);

    if (this.slowTimer > 0) {
      this.slowTimer = Math.max(0, this.slowTimer - dt);
      this.speed += CONFIG.speedGrowth * 0.22 * dt;
    } else {
      this.speed += CONFIG.speedGrowth * dt;
    }

    if (this.cartRideTimer > 0) {
      this.cartRideTimer = Math.max(0, this.cartRideTimer - dt);
      this.speed = Math.max(this.speed, CONFIG.baseSpeed * 1.08);
    }

    this.distance += this.speed * dt;
    this.score = Math.floor(this.distance / 10);

    if (this.score >= this.lastScoreMilestone + 100) {
      this.lastScoreMilestone = this.score;
      this.scorePop = 1;
      this.audio.score();
    }

    this.background.update(dt);
    this.player.update(dt);
    this.obstacles.update(dt);
    this.beverages.update(dt);
    this.carts.update(dt);
    this.fx.update(dt);

    for (let i = this.beverages.items.length - 1; i >= 0; i--) {
      if (this.intersects(this.player.getBounds(), this.beverages.items[i].getBounds())) {
        this.collectBeverage(i);
      }
    }

    if (!this.isRidingCart()) {
      for (let i = this.carts.items.length - 1; i >= 0; i--) {
        if (this.intersects(this.player.getBounds(), this.carts.items[i].getBounds())) {
          this.activateCartRide(i);
          break;
        }
      }
    }

    if (!this.isRidingCart()) {
      for (const obs of this.obstacles.items) {
        if (this.intersectsObstacle(this.player.getBounds(), obs.getBounds(), obs)) {
          this.takeDamage();
          break;
        }
      }
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 26);
  }

  intersects(a, b) {
    return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
  }

  intersectsObstacle(a, b, obstacle = null) {
    const left = Math.max(a.x, b.x);
    const right = Math.min(a.x + a.width, b.x + b.width);
    const top = Math.max(a.y, b.y);
    const bottom = Math.min(a.y + a.height, b.y + b.height);
    const overlapX = right - left;
    const overlapY = bottom - top;

    if (overlapX <= 10 || overlapY <= 10) return false;

    const needsSlide = obstacle && obstacle.type && obstacle.type.behavior === "duck";
    if (needsSlide) {
      // Верхние листы должны задевать стоящего персонажа и пропускать только реальное скольжение.
      if (this.player.ducking && this.player.grounded) return false;
      return overlapX > 14 && overlapY > 4;
    }

    const playerFeet = a.y + a.height;
    const obstacleTop = b.y;
    // Для нижних препятствий оставляем мягкую проверку: если персонаж явно перелетел верх,
    // удар не засчитывается из-за пары пикселей пересечения хитбоксов.
    if (!this.player.grounded && playerFeet <= obstacleTop + 12) return false;

    return true;
  }

  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.worldWidth, this.worldHeight);
    ctx.setLineDash([]);

    if (this.shake > 0) {
      const magnitude = this.shake * 0.35;
      ctx.translate((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
    }

    this.background.draw(ctx);
    this.beverages.draw(ctx);
    this.obstacles.draw(ctx);
    this.carts.draw(ctx);
    this.fx.draw(ctx);
    if (this.isRidingCart()) {
      drawCartIllustration(ctx, this.player.x - 12, this.groundY - 76, 124, 76);
    }
    if (this.invulnerabilityTimer > 0 && !this.isRidingCart()) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(this.time * 32) * 0.25;
      this.player.draw(ctx);
      ctx.restore();
    } else {
      this.player.draw(ctx);
    }

    if (this.isRidingCart()) {
      this.drawCartTimer(ctx);
    }

    if (this.healPulse > 0) {
      ctx.fillStyle = `rgba(80, 210, 140, ${this.healPulse * 0.18})`;
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    }

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,80,80,${this.hitFlash * 0.25})`;
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    }

    this.drawHUD(ctx);
    this.drawStateMessage(ctx);
    ctx.restore();
  }

  drawCartTimer(ctx) {
    const total = CONFIG.cartRideDuration;
    const value = clamp(this.cartRideTimer / total, 0, 1);
    const w = 176;
    const h = 58;
    const x = 454;
    const y = this.groundY + 18;

    ctx.save();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundedRectPath(ctx, x, y, w, h, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(31,93,76,0.22)";
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, x, y, w, h, 12);
    ctx.stroke();

    ctx.fillStyle = "#1f5d4c";
    ctx.font = "800 14px Inter, sans-serif";
    ctx.fillText("Тележка активна", x + 12, y + 18);

    ctx.fillStyle = "#335a7a";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText(`Осталось: ${this.cartRideTimer.toFixed(1)}с`, x + 12, y + 37);

    ctx.fillStyle = "rgba(35, 92, 77, 0.16)";
    roundedRectPath(ctx, x + 12, y + 43, w - 24, 8, 5);
    ctx.fill();

    const bar = ctx.createLinearGradient(x + 12, 0, x + w - 12, 0);
    bar.addColorStop(0, value > 0.33 ? "#2aa36f" : "#e17c35");
    bar.addColorStop(1, value > 0.33 ? "#4fd18f" : "#f0a45a");
    ctx.fillStyle = bar;
    roundedRectPath(ctx, x + 12, y + 43, (w - 24) * value, 8, 5);
    ctx.fill();
    ctx.restore();
  }

  drawHUD(ctx) {
    ctx.save();
    const panelW = 400;
    const panelH = 96;
    const panelX = 16;
    const panelY = 12;
    const scoreBump = 1 + this.scorePop * 0.08;

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, panelX, panelY, panelW, panelH, 16);
    ctx.fill();
    ctx.strokeStyle = "rgba(25, 71, 118, 0.12)";
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, panelX, panelY, panelW, panelH, 16);
    ctx.stroke();

    const accent = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
    accent.addColorStop(0, "rgba(13, 138, 229, 0.12)");
    accent.addColorStop(1, "rgba(13, 138, 229, 0)");
    ctx.fillStyle = accent;
    roundedRectPath(ctx, panelX, panelY, 8, panelH, 16);
    ctx.fill();

    ctx.fillStyle = "#213a58";
    ctx.font = `800 ${Math.round(22 * scoreBump)}px Inter, sans-serif`;
    ctx.fillText(`Счёт: ${this.score}`, panelX + 18, panelY + 28);

    ctx.font = "600 14px Inter, sans-serif";
    ctx.fillStyle = "#446387";
    ctx.fillText(`Рекорд: ${this.best}`, panelX + 18, panelY + 50);
    ctx.fillText(`Кружки: ${this.cupCount}`, panelX + 130, panelY + 50);
    ctx.fillText(`Чайники: ${this.teapotCount}`, panelX + 236, panelY + 50);

    this.drawHearts(ctx, panelX + 18, panelY + 70);

    const workProgress = clamp(this.distance / 2200, 0, 1);
    ctx.fillStyle = "#446387";
    ctx.font = "600 13px Inter, sans-serif";
    ctx.fillText(`Скорость: ${(this.speed / 100).toFixed(2)}x`, panelX + 150, panelY + 78);
    ctx.fillText(formatWorkTime(workProgress), panelX + 300, panelY + 78);

    ctx.fillStyle = "rgba(13, 138, 229, 0.12)";
    roundedRectPath(ctx, panelX + 150, panelY + 84, 230, 5, 3);
    ctx.fill();
    ctx.fillStyle = "#2f92d6";
    roundedRectPath(ctx, panelX + 150, panelY + 84, 230 * workProgress, 5, 3);
    ctx.fill();

    ctx.restore();
  }

  drawHearts(ctx, x, y) {
    for (let i = 0; i < 3; i++) {
      const units = clamp(this.healthUnits - i * 2, 0, 2);
      const pulse = this.healPulse > 0 && units > 0 ? 1 + this.healPulse * 0.18 : 1;
      this.drawHeart(ctx, x + i * 38, y, units, pulse);
    }
  }

  drawHeart(ctx, x, y, units, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    ctx.fillStyle = "rgba(120, 152, 193, 0.22)";
    this.heartPath(ctx, 0, 0, 14);
    ctx.fill();

    if (units > 0) {
      ctx.save();
      this.heartPath(ctx, 0, 0, 14);
      ctx.clip();
      ctx.fillStyle = units >= 2 ? "#e74359" : "#ff8a9b";
      const fillW = units >= 2 ? 32 : 16;
      ctx.fillRect(-16, -15, fillW, 31);
      ctx.restore();
      if (this.healPulse > 0.2) {
        ctx.strokeStyle = `rgba(255, 180, 190, ${this.healPulse})`;
        ctx.lineWidth = 2;
        this.heartPath(ctx, 0, 0, 14);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = "rgba(91, 45, 60, 0.45)";
    ctx.lineWidth = 1.5;
    this.heartPath(ctx, 0, 0, 14);
    ctx.stroke();
    ctx.restore();
  }

  heartPath(ctx, x, y, size) {
    ctx.beginPath();
    ctx.moveTo(x, y + size * 0.72);
    ctx.bezierCurveTo(x - size * 1.35, y - size * 0.1, x - size * 0.72, y - size * 1.05, x, y - size * 0.45);
    ctx.bezierCurveTo(x + size * 0.72, y - size * 1.05, x + size * 1.35, y - size * 0.1, x, y + size * 0.72);
    ctx.closePath();
  }

  drawStateMessage(ctx) {
    const pulse = 0.58 + Math.sin(this.time * 2.8) * 0.14;

    if (this.state === "ready") {
      this.drawOverlayText(
        ctx,
        "Нажми пробел или тапни",
        "У тебя 3 сердца. Кружка восстанавливает половину сердца, чайник — целое сердце, тележка даёт 4 секунды защиты с таймером.",
        pulse
      );
    }

    if (this.state === "paused") {
      this.drawOverlayText(ctx, "Пауза", "Нажми кнопку Пауза или P для продолжения", 0.92);
    }

    if (this.state === "gameover") {
      this.drawOverlayText(ctx, "Столкновение", "Enter / Space / клик / тап — рестарт", 0.96, true);
    }

  }

  wrapText(ctx, text, maxWidth) {
    const words = String(text).split(" ");
    const lines = [];
    let line = "";
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  drawOverlayText(ctx, title, subtitle, alpha, danger = false, success = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15, 35, 60, 0.58)";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    const boxW = 720;
    const boxH = 164;
    const boxX = this.worldWidth / 2 - boxW / 2;
    const boxY = this.worldHeight / 2 - boxH / 2;
    const floatY = Math.sin(this.time * 2.2) * 3;

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(20, 50, 90, 0.18)";
    roundedRectPath(ctx, boxX + 6, boxY + 10 + floatY, boxW, boxH, 20);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.97)";
    roundedRectPath(ctx, boxX, boxY + floatY, boxW, boxH, 20);
    ctx.fill();

    const rim = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY);
    rim.addColorStop(0, danger ? "rgba(214,40,40,0.55)" : success ? "rgba(31,141,90,0.55)" : "rgba(13,138,229,0.45)");
    rim.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = rim;
    roundedRectPath(ctx, boxX, boxY + floatY, boxW, 6, 20);
    ctx.fill();

    ctx.fillStyle = danger ? "#d62828" : success ? "#1f8d5a" : "#194776";
    ctx.font = "800 30px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.worldWidth / 2, boxY + 50 + floatY);

    ctx.fillStyle = "#365a80";
    ctx.font = "600 17px Inter, sans-serif";
    const lines = this.wrapText(ctx, subtitle, boxW - 70).slice(0, 3);
    lines.forEach((line, index) => {
      ctx.fillText(line, this.worldWidth / 2, boxY + 88 + floatY + index * 24);
    });

    ctx.textAlign = "start";
    ctx.restore();
  }
}

(function init() {
  const canvas = document.getElementById("gameCanvas");
  if (!canvas) return;
  new Game(canvas);
})();
