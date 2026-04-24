"use strict";

const CONFIG = {
  gravity: 2160,
  jumpForce: 790,
  baseSpeed: 300,
  speedGrowth: 4.4,
  obstacleFrequency: 0.96,
  maxDt: 0.033,
  groundHeight: 96,
  maxHealthUnits: 6,
  damageUnits: 2,
  invulnerabilityDuration: 1.05,
  beverageSpawnMin: 3.6,
  beverageSpawnMax: 5.8,
  cartSpawnMin: 13.5,
  cartSpawnMax: 19.5,
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
  cartRideOffsetY: 28,
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
    this.spawnCloud(0);
    while (this.clouds.length < 8) this.spawnCloud(this.game.worldWidth * Math.random());
  }

  spawnCloud(minX = this.game.worldWidth + 80) {
    const y = 26 + Math.random() * 90;
    const scale = 0.65 + Math.random() * 0.9;
    this.clouds.push({
      x: minX + Math.random() * 180,
      y,
      scale,
      speedMul: 0.12 + Math.random() * 0.12,
    });
  }

  update(dt) {
    for (const cloud of this.clouds) {
      cloud.x -= this.game.speed * cloud.speedMul * dt;
    }
    this.clouds = this.clouds.filter((c) => c.x > -220);
    while (this.clouds.length < 8) this.spawnCloud();
  }

  draw(ctx) {
    const { worldWidth: w, worldHeight: h, groundY } = this.game;
    const t = this.game.distance;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#edf7ff");
    sky.addColorStop(0.62, "#d9ecff");
    sky.addColorStop(1, "#c6e0fa");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    const glow = ctx.createRadialGradient(w * 0.78, 68, 10, w * 0.78, 68, 220);
    glow.addColorStop(0, "rgba(255,255,255,0.55)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud.x, cloud.y, cloud.scale);
    }

    this.drawSkyline(ctx, 0.12, groundY - 140, 90, 180, ["#c4d6ea", "#afc7e0"]);
    this.drawSkyline(ctx, 0.24, groundY - 106, 120, 120, ["#a5bcd8", "#8fb0d2"]);
    this.drawTrees(ctx, 0.38, groundY - 24);

    ctx.fillStyle = "#98bddf";
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.fillStyle = "#84afd8";
    ctx.fillRect(0, groundY - 5, w, 5);

    ctx.fillStyle = "#6e8ea9";
    ctx.fillRect(0, groundY + 12, w, 8);
    ctx.fillStyle = "#7a9ec1";
    ctx.fillRect(0, groundY + 20, w, h - groundY - 20);

    const stride = 42;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -stride; x < w + stride; x += stride) {
      const sx = x - (t * 0.85) % stride;
      ctx.moveTo(sx, groundY + 29);
      ctx.lineTo(sx + 14, groundY + 36);
    }
    ctx.stroke();
  }

  drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(0, 16, 20, 0, Math.PI * 2);
    ctx.arc(20, 9, 26, 0, Math.PI * 2);
    ctx.arc(49, 16, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSkyline(ctx, parallax, baseY, spacing, maxWidth, palette) {
    const w = this.game.worldWidth;
    const drift = (this.game.distance * parallax) % spacing;
    for (let x = -spacing; x < w + spacing; x += spacing) {
      const bx = x - drift;
      const width = maxWidth * (0.48 + ((x / spacing + 5) % 5) * 0.1);
      const height = 48 + (((x / spacing + 3) % 4) + 1) * 26;
      const color = palette[Math.abs(Math.floor(x / spacing)) % palette.length];
      ctx.fillStyle = color;
      roundedRectPath(ctx, bx, baseY - height, width, height, 6);
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.48)";
      const winW = 9;
      const winH = 12;
      for (let iy = 12; iy < height - 10; iy += 18) {
        for (let ix = 10; ix < width - 10; ix += 17) {
          roundedRectPath(ctx, bx + ix, baseY - height + iy, winW, winH, 2);
          ctx.fill();
        }
      }
    }
  }

  drawTrees(ctx, parallax, baseY) {
    const w = this.game.worldWidth;
    const stride = 96;
    const drift = (this.game.distance * parallax) % stride;
    for (let x = -stride; x < w + stride; x += stride) {
      const bx = x - drift;
      ctx.fillStyle = "#7f9a6b";
      ctx.beginPath();
      ctx.arc(bx + 36, baseY - 12, 18, 0, Math.PI * 2);
      ctx.arc(bx + 50, baseY - 18, 14, 0, Math.PI * 2);
      ctx.arc(bx + 60, baseY - 10, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#765d47";
      ctx.fillRect(bx + 46, baseY - 4, 6, 22);
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
    this.game.audio.jump();
  }

  startSlide() {
    if (this.game.isRidingCart()) return;
    if (!this.grounded) return;
    if (this.ducking || this.slideCooldown > 0) return;
    this.ducking = true;
    this.slideTimer = 0.64;
    this.height = this.slideHeight;
    this.y = this.game.groundY - this.height;
  }

  update(dt) {
    this.runTime += dt * (this.game.speed / CONFIG.baseSpeed) * 1.5;

    if (this.game.isRidingCart()) {
      this.ducking = false;
      this.grounded = true;
      this.slideTimer = 0;
      this.slideCooldown = 0;
      this.height = this.standHeight;
      this.vy = 0;
      this.y = this.game.groundY - this.height - CONFIG.cartRideOffsetY;
      this.landingDust = 0;
      this.lastGrounded = true;
      return;
    }

    this.slideCooldown = Math.max(0, this.slideCooldown - dt);

    if (this.ducking) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.ducking = false;
        this.slideTimer = 0;
        this.slideCooldown = 0.18;
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
      }
      this.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.height = this.standHeight;
    }

    this.lastGrounded = this.grounded;
    this.landingDust = Math.max(0, this.landingDust - dt * 4);
  }

  getBounds() {
    if (this.ducking && this.grounded) {
      return {
        x: this.x + 14,
        y: this.y + 20,
        width: this.width - 28,
        height: this.height - 24,
      };
    }
    return {
      x: this.x + 18,
      y: this.y + 12,
      width: this.width - 34,
      height: this.height - 16,
    };
  }

  getSpriteFrameName() {
    if (this.ducking && this.grounded) return "slide";
    if (!this.grounded) return this.vy < 150 ? "jump" : "land";
    const frames = ["run1", "run2", "run3", "run4"];
    const phase = wrap01(this.runTime * 1.3);
    const index = Math.floor(phase * frames.length) % frames.length;
    return frames[index];
  }

  draw(ctx) {
    const centerX = this.x + this.width * 0.5;
    const groundY = this.game.groundY - (this.game.isRidingCart() ? CONFIG.cartRideOffsetY : 0);
    const sliding = this.ducking && this.grounded && !this.game.isRidingCart();
    const airborne = !this.grounded && !this.game.isRidingCart();
    const descending = airborne && this.vy >= 120;
    const runBob = this.grounded && !sliding && !this.game.isRidingCart() ? Math.sin(this.runTime * 13) * 2.2 : 0;

    ctx.save();
    ctx.setLineDash([]);
    const shadowAlpha = this.game.isRidingCart() ? 0 : this.grounded ? 0.13 : 0.08;
    if (shadowAlpha > 0) {
      ctx.fillStyle = `rgba(35, 64, 92, ${shadowAlpha})`;
      ctx.beginPath();
      ctx.ellipse(centerX, this.game.groundY - 4, sliding ? 40 : 28, sliding ? 7 : 6, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (this.landingDust > 0) {
      ctx.globalAlpha = this.landingDust * 0.28;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.ellipse(centerX - 28 - (1 - this.landingDust) * 10, this.game.groundY - 6, 10, 3, 0, 0, Math.PI * 2);
      ctx.ellipse(centerX + 26 + (1 - this.landingDust) * 10, this.game.groundY - 5, 9, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    const sprite = this.spriteSet ? this.spriteSet.get(this.getSpriteFrameName()) : null;
    if (sprite) {
      let drawH = 146;
      let xOffset = 0;
      let yOffset = 0;

      if (sliding) {
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
      const drawX = centerX - drawW * 0.5 + xOffset;
      const drawY = groundY - drawH + yOffset + runBob;
      ctx.drawImage(sprite, drawX, drawY, drawW, drawH);
    } else {
      this.drawFallback(ctx, centerX, groundY, runBob, sliding, airborne);
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

class Obstacle {
  constructor(game, type, x) {
    this.game = game;
    this.type = type;
    this.x = x;
    this.width = type.width;
    this.height = type.height;
    this.y = game.groundY - type.height + (type.offsetY || 0);
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    return {
      x: this.x + (this.type.hitInsetX || 4),
      y: this.y + (this.type.hitInsetY || 4),
      width: this.width - 2 * (this.type.hitInsetX || 4),
      height: this.height - 2 * (this.type.hitInsetY || 4),
    };
  }

  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.setLineDash([]);
    switch (this.type.kind) {
      case "houseLow":
        this.drawBuilding(ctx, 58, 48, 2, 2);
        break;
      case "houseTall":
        this.drawBuilding(ctx, 72, 78, 3, 3);
        break;
      case "towerSlim":
        this.drawTower(ctx);
        break;
      case "skybridge":
        this.drawSkybridge(ctx);
        break;
      default:
        this.drawBuilding(ctx, this.width, this.height, 2, 2);
        break;
    }
    ctx.restore();
  }

  drawBuilding(ctx, width, height, cols, rows) {
    ctx.fillStyle = "#586e83";
    roundedRectPath(ctx, 0, 0, width, height, 8);
    ctx.fill();

    const wall = ctx.createLinearGradient(0, 0, 0, height);
    wall.addColorStop(0, "#8b786d");
    wall.addColorStop(1, "#665048");
    ctx.fillStyle = wall;
    roundedRectPath(ctx, 4, 4, width - 8, height - 8, 6);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let i = 8; i < width - 8; i += 12) {
      ctx.beginPath();
      ctx.moveTo(i, 4);
      ctx.lineTo(i, height - 4);
      ctx.stroke();
    }
    for (let i = 8; i < height - 8; i += 10) {
      ctx.beginPath();
      ctx.moveTo(4, i);
      ctx.lineTo(width - 4, i);
      ctx.stroke();
    }

    ctx.fillStyle = "#2a445c";
    const paddingX = 10;
    const paddingY = 12;
    const gapX = 8;
    const gapY = 8;
    const winW = Math.max(10, Math.floor((width - paddingX * 2 - gapX * (cols - 1)) / cols));
    const winH = Math.max(9, Math.floor((height - paddingY * 2 - gapY * (rows - 1)) / rows));
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x = paddingX + col * (winW + gapX);
        const y = paddingY + row * (winH + gapY);
        roundedRectPath(ctx, x, y, winW, winH, 2);
        ctx.fill();
        ctx.fillStyle = "rgba(170, 212, 255, 0.5)";
        roundedRectPath(ctx, x + 2, y + 2, winW - 4, winH - 4, 2);
        ctx.fill();
        ctx.fillStyle = "#2a445c";
      }
    }

    ctx.fillStyle = "#506578";
    roundedRectPath(ctx, -3, -5, width + 6, 10, 5);
    ctx.fill();
    ctx.fillStyle = "#6b849a";
    roundedRectPath(ctx, -3, height - 8, width + 6, 9, 5);
    ctx.fill();
  }

  drawTower(ctx) {
    const width = this.width;
    const height = this.height;
    ctx.fillStyle = "#5a7084";
    roundedRectPath(ctx, 8, 0, width - 16, height, 10);
    ctx.fill();

    const glass = ctx.createLinearGradient(0, 0, width, 0);
    glass.addColorStop(0, "#334455");
    glass.addColorStop(0.5, "#7db5da");
    glass.addColorStop(1, "#334455");
    ctx.fillStyle = glass;
    roundedRectPath(ctx, 14, 8, width - 28, height - 16, 9);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.18)";
    for (let y = 14; y < height - 14; y += 16) {
      ctx.fillRect(18, y, width - 36, 3);
    }

    ctx.fillStyle = "#6c849a";
    roundedRectPath(ctx, 4, height - 8, width - 8, 10, 5);
    ctx.fill();
  }

  drawSkybridge(ctx) {
    const width = this.width;
    const height = this.height;
    ctx.fillStyle = "#61768a";
    roundedRectPath(ctx, 0, 0, width, height, 8);
    ctx.fill();

    const wall = ctx.createLinearGradient(0, 0, 0, height);
    wall.addColorStop(0, "#8e7c70");
    wall.addColorStop(1, "#6e584f");
    ctx.fillStyle = wall;
    roundedRectPath(ctx, 4, 4, width - 8, height - 8, 6);
    ctx.fill();

    ctx.fillStyle = "#33506a";
    for (let x = 12; x < width - 12; x += 18) {
      roundedRectPath(ctx, x, 11, 12, 12, 2);
      ctx.fill();
      ctx.fillStyle = "rgba(160, 210, 255, 0.45)";
      roundedRectPath(ctx, x + 2, 13, 8, 8, 2);
      ctx.fill();
      ctx.fillStyle = "#33506a";
    }

    ctx.fillStyle = "#556b80";
    roundedRectPath(ctx, -2, height - 10, width + 4, 10, 5);
    ctx.fill();
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
        width: 58,
        height: 48,
        minGap: 250,
        difficulty: 0,
        behavior: "jump",
        hitInsetX: 6,
        hitInsetY: 6,
      },
      {
        kind: "houseTall",
        width: 72,
        height: 78,
        minGap: 290,
        difficulty: 0.18,
        behavior: "jump",
        hitInsetX: 6,
        hitInsetY: 6,
      },
      {
        kind: "towerSlim",
        width: 54,
        height: 96,
        minGap: 336,
        difficulty: 0.30,
        behavior: "jump",
        hitInsetX: 5,
        hitInsetY: 6,
      },
      {
        kind: "skybridge",
        width: 104,
        height: 36,
        minGap: 300,
        difficulty: 0.14,
        behavior: "duck",
        offsetY: -88,
        hitInsetX: 6,
        hitInsetY: 4,
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
      const randomGap = 90 + Math.random() * 140;
      const gapDistance = Math.max(220, baseGap + randomGap);
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
      this.width = 54;
      this.height = 54;
      this.y = game.groundY - 154 - Math.random() * 20;
    } else {
      this.width = 42;
      this.height = 42;
      this.y = game.groundY - 146 - Math.random() * 18;
    }
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    return {
      x: this.x + 5,
      y: this.y + 6,
      width: this.width - 10,
      height: this.height - 12,
    };
  }

  draw(ctx, time) {
    const bob = Math.sin(time * 5.5 + this.phase) * 4;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.setLineDash([]);
    ctx.fillStyle = this.kind === "teapot" ? "rgba(255,233,180,0.17)" : "rgba(255,255,255,0.23)";
    ctx.beginPath();
    ctx.arc(this.width * 0.5, this.height * 0.5, Math.max(this.width, this.height) * 0.52, 0, Math.PI * 2);
    ctx.fill();

    if (this.kind === "teapot") {
      this.drawTeapot(ctx);
    } else {
      this.drawCup(ctx);
    }
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
    this.width = 98;
    this.height = 58;
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
  ctx.ellipse(width * 0.5, height + 4, width * 0.42, 5, 0, 0, Math.PI * 2);
  ctx.fill();

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
    this.cooldown = 8.5;
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
    this.player.reset();
    this.obstacles.reset();
    this.beverages.reset();
    this.carts.reset();
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
    if (item.kind === "teapot") {
      this.teapotCount += 1;
      this.healthUnits = Math.min(CONFIG.maxHealthUnits, this.healthUnits + CONFIG.teapot.healUnits);
      this.speed = Math.max(CONFIG.baseSpeed * CONFIG.teapot.minSpeedFactor, this.speed - CONFIG.teapot.slowdownAmount);
      this.slowTimer = Math.max(this.slowTimer, CONFIG.teapot.slowDuration);
    } else {
      this.cupCount += 1;
      this.healthUnits = Math.min(CONFIG.maxHealthUnits, this.healthUnits + CONFIG.cup.healUnits);
      this.speed = Math.max(CONFIG.baseSpeed * CONFIG.cup.minSpeedFactor, this.speed - CONFIG.cup.slowdownAmount);
      this.slowTimer = Math.max(this.slowTimer, CONFIG.cup.slowDuration);
    }
    this.audio.tea();
  }

  takeDamage() {
    if (this.isInvulnerable()) return;
    this.healthUnits = Math.max(0, this.healthUnits - CONFIG.damageUnits);
    this.invulnerabilityTimer = CONFIG.invulnerabilityDuration;
    this.hitFlash = 0.75;
    this.shake = 10;
    this.audio.hit();
    if (this.healthUnits <= 0) {
      this.gameOver();
    }
  }

  activateCartRide(index) {
    this.carts.items.splice(index, 1);
    this.cartRideTimer = CONFIG.cartRideDuration;
    this.player.vy = 0;
    this.player.grounded = true;
    this.player.ducking = false;
    this.audio.powerup();
  }

  loop(now) {
    const rawDt = (now - this.lastFrame) / 1000;
    const dt = Math.min(CONFIG.maxDt, Math.max(0, rawDt));
    this.lastFrame = now;

    if (this.state === "running") this.update(dt);
    this.render();
    requestAnimationFrame(this.loop.bind(this));
  }

  update(dt) {
    this.time += dt;
    this.invulnerabilityTimer = Math.max(0, this.invulnerabilityTimer - dt);

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
      this.audio.score();
    }

    this.background.update(dt);
    this.player.update(dt);
    this.obstacles.update(dt);
    this.beverages.update(dt);
    this.carts.update(dt);

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
        if (this.intersects(this.player.getBounds(), obs.getBounds())) {
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
    if (this.isRidingCart()) {
      drawCartIllustration(ctx, this.player.x - 2, this.groundY - 56, 98, 58);
    }
    if (this.invulnerabilityTimer > 0 && !this.isRidingCart()) {
      ctx.save();
      ctx.globalAlpha = 0.55 + Math.sin(this.time * 32) * 0.25;
      this.player.draw(ctx);
      ctx.restore();
    } else {
      this.player.draw(ctx);
    }

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,80,80,${this.hitFlash * 0.25})`;
      ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);
    }

    this.drawHUD(ctx);
    this.drawStateMessage(ctx);
    ctx.restore();
  }

  drawHUD(ctx) {
    ctx.save();
    const panelW = 390;
    const panelH = this.isRidingCart() ? 108 : 88;
    const panelX = 16;
    const panelY = 12;

    ctx.fillStyle = "rgba(255,255,255,0.86)";
    roundedRectPath(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.fill();

    ctx.fillStyle = "#213a58";
    ctx.font = "800 20px Inter, sans-serif";
    ctx.fillText(`Счёт: ${this.score}`, panelX + 14, panelY + 26);

    ctx.font = "600 14px Inter, sans-serif";
    ctx.fillStyle = "#446387";
    ctx.fillText(`Рекорд: ${this.best}`, panelX + 14, panelY + 47);
    ctx.fillText(`Кружки: ${this.cupCount}`, panelX + 122, panelY + 47);
    ctx.fillText(`Чайники: ${this.teapotCount}`, panelX + 228, panelY + 47);

    this.drawHearts(ctx, panelX + 14, panelY + 61);

    ctx.fillStyle = "#446387";
    ctx.font = "600 14px Inter, sans-serif";
    ctx.fillText(`Скорость: ${(this.speed / 100).toFixed(2)}x`, panelX + 150, panelY + 78);

    if (this.isRidingCart()) {
      ctx.fillStyle = "#23725d";
      ctx.fillText(`Тележка: ${this.cartRideTimer.toFixed(1)}с`, panelX + 272, panelY + 78);
    }

    ctx.restore();
  }

  drawHearts(ctx, x, y) {
    for (let i = 0; i < 3; i++) {
      const units = clamp(this.healthUnits - i * 2, 0, 2);
      this.drawHeart(ctx, x + i * 38, y, units);
    }
  }

  drawHeart(ctx, x, y, units) {
    ctx.save();
    ctx.translate(x, y);

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
        "У тебя 3 сердца. Кружка восстанавливает половину сердца, чайник — целое сердце, тележка даёт 4 секунды защиты.",
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
    const boxH = 154;
    const boxX = this.worldWidth / 2 - boxW / 2;
    const boxY = this.worldHeight / 2 - boxH / 2;

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundedRectPath(ctx, boxX, boxY, boxW, boxH, 18);
    ctx.fill();

    ctx.fillStyle = danger ? "#d62828" : success ? "#1f8d5a" : "#194776";
    ctx.font = "800 28px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.worldWidth / 2, boxY + 46);

    ctx.fillStyle = "#365a80";
    ctx.font = "600 17px Inter, sans-serif";
    const lines = this.wrapText(ctx, subtitle, boxW - 70).slice(0, 3);
    lines.forEach((line, index) => {
      ctx.fillText(line, this.worldWidth / 2, boxY + 82 + index * 24);
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
