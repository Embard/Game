"use strict";

const CONFIG = {
  gravity: 2180,
  jumpForce: 800,
  baseSpeed: 315,
  speedGrowth: 6.2,
  obstacleFrequency: 1.0,
  maxDt: 0.033,
  groundHeight: 82,
  workdayDuration: 60.0,
  teaSpawnMin: 3.6,
  teaSpawnMax: 5.1,
  teaTimeRewind: 2.3,
  teaSlowdownAmount: 34,
  teaMinSpeedFactor: 0.84,
  teaSlowdownDuration: 2.8,
  photo: {
    path: "assets/player-photo.jpg",
    focusX: 0.15,
    focusY: 0.26,
    zoom: 1.0,
    saturation: 1.08,
    contrast: 1.07,
    brightness: 1.02,
  },
};

const STORAGE_KEY = "gip-runner-best";
const LEADERBOARD_KEY = "gip-runner-leaderboard";
const PLAYER_NAME_KEY = "gip-runner-player-name";
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDjs3ZU1vPYraihsEUhHdC_yGKGVBXfZN8",
  authDomain: "runner-bb9a8.firebaseapp.com",
  databaseURL: "https://runner-bb9a8-default-rtdb.firebaseio.com",
  projectId: "runner-bb9a8",
  storageBucket: "runner-bb9a8.firebasestorage.app",
  messagingSenderId: "36209569924",
  appId: "1:36209569924:web:f44e0b9bf1c3c818b492d1"
};
const LEADERBOARD_PATH = "leaderboard";

const RUN_LEG_CYCLE = [
  { t: 0.0, x: 22, y: 0, foot: -4 },
  { t: 0.125, x: 14, y: 0, foot: -1 },
  { t: 0.25, x: 4, y: -1, foot: 4 },
  { t: 0.375, x: -8, y: -2, foot: 14 },
  { t: 0.5, x: -20, y: -6, foot: 26 },
  { t: 0.625, x: -12, y: -22, foot: 18 },
  { t: 0.75, x: 4, y: -30, foot: 6 },
  { t: 0.875, x: 18, y: -16, foot: -3 },
  { t: 1.0, x: 22, y: 0, foot: -4 },
];

const RUN_ARM_CYCLE = [
  { t: 0.0, upper: 28, fore: 56 },
  { t: 0.125, upper: 16, fore: 40 },
  { t: 0.25, upper: 4, fore: 24 },
  { t: 0.375, upper: -10, fore: 6 },
  { t: 0.5, upper: -26, fore: -8 },
  { t: 0.625, upper: -14, fore: 10 },
  { t: 0.75, upper: 0, fore: 24 },
  { t: 0.875, upper: 18, fore: 46 },
  { t: 1.0, upper: 28, fore: 56 },
];

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

function sampleFrame(frames, phase) {
  const p = wrap01(phase);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (p >= a.t && p <= b.t) {
      const rawT = (p - a.t) / Math.max(0.0001, b.t - a.t);
      const localT = rawT * rawT * (3 - 2 * rawT);
      const result = {};
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const key of keys) {
        if (key === "t") continue;
        const av = typeof a[key] === "number" ? a[key] : 0;
        const bv = typeof b[key] === "number" ? b[key] : av;
        result[key] = lerp(av, bv, localT);
      }
      return result;
    }
  }

  const fallback = {};
  for (const key of Object.keys(frames[0])) {
    if (key !== "t") fallback[key] = frames[0][key];
  }
  return fallback;
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
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
  return String(value || "Игрок")
    .trim()
    .replace(/[\n\r\t<>]/g, "")
    .slice(0, 18) || "Игрок";
}


function leaderboardNameKey(value) {
  return normalizePlayerName(value)
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[.#$\[\]\/]/g, "_")
    .slice(0, 32) || "igrok";
}

function mergeLeaderboardRows(rows) {
  const map = new Map();
  for (const raw of Array.isArray(rows) ? rows : []) {
    const name = normalizePlayerName(raw && raw.name);
    const score = Number((raw && raw.score) || 0);
    const tea = Number((raw && raw.tea) || 0);
    const date = raw && raw.date ? String(raw.date) : "";
    const key = name.toLowerCase();
    const existing = map.get(key);
    if (!existing || score > existing.score || (score === existing.score && date > existing.date)) {
      map.set(key, { name, score, tea, date });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)));
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || !!target.isContentEditable;
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
    this.ping("triangle", 580, 0.08, 0.07);
  }

  score() {
    this.ping("sine", 760, 0.06, 0.04);
  }

  hit() {
    this.ping("sawtooth", 150, 0.17, 0.08);
  }

  tea() {
    this.ping("sine", 950, 0.08, 0.05);
    window.setTimeout(() => this.ping("triangle", 700, 0.06, 0.04), 55);
  }

  win() {
    this.ping("triangle", 660, 0.09, 0.06);
    window.setTimeout(() => this.ping("triangle", 880, 0.13, 0.055), 90);
  }
}

class PortraitTexture {
  constructor(image) {
    this.ready = false;
    this.image = image;
    this.canvas = null;
    this.build();
  }

  build() {
    if (!this.image) return;

    const size = 256;
    const buffer = document.createElement("canvas");
    buffer.width = size;
    buffer.height = size;

    const ctx = buffer.getContext("2d");
    const iw = this.image.naturalWidth || this.image.width;
    const ih = this.image.naturalHeight || this.image.height;
    if (!iw || !ih) return;

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.filter = `saturate(${CONFIG.photo.saturation}) contrast(${CONFIG.photo.contrast}) brightness(${CONFIG.photo.brightness})`;

    // Важно: больше не вырезаем лицо агрессивным кропом.
    // Масштабируем всю картинку внутрь круга, чтобы голова не обрезалась.
    const padding = 4;
    const scale = Math.min((size - padding * 2) / iw, (size - padding * 2) / ih);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (size - dw) / 2;
    const dy = (size - dh) / 2;
    ctx.drawImage(this.image, dx, dy, dw, dh);
    ctx.restore();

    this.canvas = buffer;
    this.ready = true;
  }

  draw(ctx, x, y, w, h) {
    if (!this.ready || !this.canvas) return false;
    ctx.drawImage(this.canvas, x, y, w, h);
    return true;
  }
}

class Background {
  constructor(game) {
    this.game = game;
    this.clouds = [];
    this.spawnCloud(10);
  }

  spawnCloud(minX = this.game.worldWidth + 40) {
    const y = 30 + Math.random() * 120;
    const scale = 0.6 + Math.random() * 0.9;
    this.clouds.push({
      x: minX + Math.random() * 220,
      y,
      scale,
      speedMul: 0.18 + Math.random() * 0.18,
    });
  }

  update(dt) {
    for (const cloud of this.clouds) {
      cloud.x -= this.game.speed * cloud.speedMul * dt;
    }
    this.clouds = this.clouds.filter((c) => c.x > -160);
    while (this.clouds.length < 9) this.spawnCloud();
  }

  draw(ctx) {
    const { worldWidth: w, worldHeight: h, groundY } = this.game;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#f7fbff");
    sky.addColorStop(1, "#dceeff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud.x, cloud.y, cloud.scale);
    }

    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#8eb7de";
    const t = this.game.time * 0.12;
    for (let i = 0; i < 5; i++) {
      const x = ((i * 260 - t * 100) % (w + 380)) - 120;
      ctx.beginPath();
      ctx.moveTo(x, groundY);
      ctx.quadraticCurveTo(x + 70, groundY - 44, x + 140, groundY);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    ctx.fillStyle = "#9ec3e8";
    ctx.fillRect(0, groundY, w, h - groundY);

    const stride = 36;
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = -stride; x < w + stride; x += stride) {
      const sx = x - (this.game.distance * 0.8) % stride;
      ctx.moveTo(sx, groundY + 12);
      ctx.lineTo(sx + 12, groundY + 18);
    }
    ctx.stroke();

    ctx.fillStyle = "#84afd8";
    ctx.fillRect(0, groundY - 4, w, 4);
  }

  drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.arc(0, 18, 22, 0, Math.PI * 2);
    ctx.arc(22, 10, 28, 0, Math.PI * 2);
    ctx.arc(52, 18, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class Player {
  constructor(game, portraitTexture) {
    this.game = game;
    this.portraitTexture = portraitTexture;
    this.usePhoto = !!(portraitTexture && portraitTexture.ready);

    this.x = 160;
    this.width = 86;
    this.standHeight = 126;
    this.slideHeight = 62;

    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.runTime = 0;
    this.squash = 0;
    this.lastGrounded = true;
    this.landingDust = 0;
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
    this.squash = 0;
    this.lastGrounded = true;
    this.landingDust = 0;
  }

  jump() {
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
    if (!this.grounded) return;
    if (this.ducking || this.slideCooldown > 0) return;
    this.ducking = true;
    this.slideTimer = 0.62;
    this.height = this.slideHeight;
    this.y = this.game.groundY - this.height;
  }

  setDuck(isDown) {
    if (isDown) this.startSlide();
  }

  update(dt) {
    this.runTime += dt * (this.game.speed / CONFIG.baseSpeed);
    this.slideCooldown = Math.max(0, this.slideCooldown - dt);

    if (this.ducking) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.ducking = false;
        this.slideTimer = 0;
        this.slideCooldown = 0.16;
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
        this.squash = 1;
        this.landingDust = 1;
      }
      this.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.ducking = false;
      this.height = this.standHeight;
    }

    this.lastGrounded = this.grounded;
    this.squash = Math.max(0, this.squash - dt * 7);
    this.landingDust = Math.max(0, this.landingDust - dt * 4);
  }

  getBounds() {
    if (this.ducking && this.grounded) {
      return {
        x: this.x + 6,
        y: this.y + 16,
        width: this.width - 8,
        height: this.height - 16,
      };
    }

    return {
      x: this.x + 14,
      y: this.y + 8,
      width: this.width - 28,
      height: this.height - 10,
    };
  }

  draw(ctx) {
    ctx.save();

    const phase = wrap01(this.runTime * 1.6);
    const bodyBob = this.grounded && !this.ducking ? Math.sin(phase * Math.PI * 2) * 1.1 : 0;
    const squashY = this.grounded ? 1 - this.squash * 0.07 : 1 + Math.min(0.045, Math.abs(this.vy) / 3000);
    const squashX = this.grounded ? 1 + this.squash * 0.07 : 1 - Math.min(0.025, Math.abs(this.vy) / 3000);

    ctx.translate(this.x + this.width / 2, this.y + this.height / 2 + bodyBob);
    ctx.scale(squashX, squashY);

    this.drawGroundShadow(ctx);
    if (this.ducking && this.grounded) {
      this.drawSlideFigure(ctx);
    } else {
      this.drawRunFigure(ctx, phase);
    }
    this.drawLandingDust(ctx);

    ctx.restore();
  }

  drawGroundShadow(ctx) {
    const alpha = this.grounded ? 0.16 : clamp(0.13 - Math.abs(this.vy) / 9000, 0.05, 0.13);
    ctx.save();
    ctx.fillStyle = `rgba(35, 64, 92, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(4, this.height / 2 - 2, this.ducking ? 44 : 31, this.ducking ? 7 : 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawLandingDust(ctx) {
    if (this.landingDust <= 0) return;
    ctx.save();
    ctx.globalAlpha = this.landingDust * 0.28;
    ctx.fillStyle = "#ffffff";
    const y = this.height / 2 - 8;
    ctx.beginPath();
    ctx.ellipse(-16 - (1 - this.landingDust) * 12, y, 9, 3, 0, 0, Math.PI * 2);
    ctx.ellipse(16 + (1 - this.landingDust) * 12, y + 1, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  sampleLegPose(phase) {
    return sampleFrame(RUN_LEG_CYCLE, phase);
  }

  sampleArmPose(phase) {
    return sampleFrame(RUN_ARM_CYCLE, phase);
  }

  solveLegIK(hipX, hipY, ankleX, ankleY, bendSign = -1) {
    const thighLen = 29;
    const shinLen = 30;
    const dx = ankleX - hipX;
    const dy = ankleY - hipY;
    const distanceRaw = Math.max(0.001, Math.hypot(dx, dy));
    const distance = Math.min(distanceRaw, thighLen + shinLen - 0.001);
    const dirX = dx / distanceRaw;
    const dirY = dy / distanceRaw;

    const a = (thighLen * thighLen - shinLen * shinLen + distance * distance) / (2 * distance);
    const lift = Math.sqrt(Math.max(0, thighLen * thighLen - a * a));

    const baseX = hipX + dirX * a;
    const baseY = hipY + dirY * a;
    const perpX = -dirY;
    const perpY = dirX;

    const kneeX = baseX + perpX * lift * bendSign;
    const kneeY = baseY + perpY * lift * bendSign;

    return { hipX, hipY, kneeX, kneeY, ankleX, ankleY };
  }

  solveArm(shoulderX, shoulderY, upperDeg, foreDeg) {
    const upperLen = 21;
    const foreLen = 18;

    const upperTheta = degToRad(90 - upperDeg);
    const elbowX = shoulderX + Math.cos(upperTheta) * upperLen;
    const elbowY = shoulderY + Math.sin(upperTheta) * upperLen;

    const foreTheta = degToRad(90 - foreDeg);
    const handX = elbowX + Math.cos(foreTheta) * foreLen;
    const handY = elbowY + Math.sin(foreTheta) * foreLen;

    return { shoulderX, shoulderY, elbowX, elbowY, handX, handY };
  }

  drawRunFigure(ctx, phase) {
    const h = this.height;
    const floorY = h / 2 - 4;
    const pelvisBob = this.grounded ? Math.sin(phase * Math.PI * 2) * 1.8 : 0;

    const torsoTop = -34 + pelvisBob * 0.15;
    const torsoHeight = 54;
    const torsoBottom = torsoTop + torsoHeight;
    const shoulderY = torsoTop + 8;
    const hipY = torsoBottom - 3;

    const leftHipX = -9;
    const rightHipX = 9;
    const leftShoulderX = -16;
    const rightShoulderX = 16;

    let leftLeg;
    let rightLeg;
    let leftArm;
    let rightArm;

    if (!this.grounded) {
      if (this.vy < 0) {
        leftLeg = this.solveLegIK(leftHipX, hipY, 14, floorY - 26, -1);
        rightLeg = this.solveLegIK(rightHipX, hipY, -22, floorY - 7, -1);
        leftArm = this.solveArm(leftShoulderX, shoulderY, 24, 42);
        rightArm = this.solveArm(rightShoulderX, shoulderY, -12, 10);
      } else {
        leftLeg = this.solveLegIK(leftHipX, hipY, 18, floorY - 10, -1);
        rightLeg = this.solveLegIK(rightHipX, hipY, -10, floorY - 18, -1);
        leftArm = this.solveArm(leftShoulderX, shoulderY, 14, 28);
        rightArm = this.solveArm(rightShoulderX, shoulderY, -4, 10);
      }
    } else {
      const leftFoot = this.sampleLegPose(phase);
      const rightFoot = this.sampleLegPose(phase + 0.5);
      const leftArmPose = this.sampleArmPose(phase + 0.5);
      const rightArmPose = this.sampleArmPose(phase);

      leftLeg = this.solveLegIK(leftHipX, hipY, leftFoot.x, floorY + leftFoot.y, -1);
      rightLeg = this.solveLegIK(rightHipX, hipY, rightFoot.x, floorY + rightFoot.y, -1);
      leftArm = this.solveArm(leftShoulderX, shoulderY, leftArmPose.upper, leftArmPose.fore);
      rightArm = this.solveArm(rightShoulderX, shoulderY, rightArmPose.upper, rightArmPose.fore);
    }

    const legs = [leftLeg, rightLeg].sort((a, b) => a.ankleX - b.ankleX);
    const arms = [leftArm, rightArm].sort((a, b) => a.handX - b.handX);

    this.drawArmLimb(ctx, arms[0], true);
    this.drawLegLimb(ctx, legs[0], true);

    ctx.save();
    ctx.rotate(degToRad(11));
    this.drawTorso(ctx, torsoTop, torsoHeight);
    ctx.restore();

    this.drawLegLimb(ctx, legs[1], false);
    this.drawArmLimb(ctx, arms[1], false);
    this.drawHead(ctx, 8, -52 + pelvisBob * 0.2, 23);
  }

  drawSlideFigure(ctx) {
    const h = this.height;
    const floorY = h / 2 - 2;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#7baed7";
    ctx.beginPath();
    ctx.ellipse(-10, floorY + 2, 48, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(2, -4);
    ctx.rotate(degToRad(14));

    // задняя рука — уходит назад, но остается цельной с силуэтом
    ctx.strokeStyle = "#25547e";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(-18, -3);
    ctx.lineTo(-30, 2);
    ctx.lineTo(-42, 8);
    ctx.stroke();

    // задняя нога — согнута под корпусом
    ctx.strokeStyle = "#22486e";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(-12, 14);
    ctx.lineTo(-24, 24);
    ctx.lineTo(-10, 30);
    ctx.stroke();

    // корпус как единая капсула
    roundedRectPath(ctx, -30, -15, 64, 29, 14);
    const shirt = ctx.createLinearGradient(-30, -15, 34, 14);
    shirt.addColorStop(0, "#102b44");
    shirt.addColorStop(1, "#17466c");
    ctx.fillStyle = shirt;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#7cb0df";
    ctx.lineWidth = 1;
    for (let x = -27; x <= 30; x += 7) {
      ctx.beginPath();
      ctx.moveTo(x, -18);
      ctx.lineTo(x, 16);
      ctx.stroke();
    }
    for (let y = -12; y <= 13; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-32, y);
      ctx.lineTo(36, y);
      ctx.stroke();
    }
    ctx.restore();

    // передняя рука — низко и вперед, как в скольжении Vector
    ctx.strokeStyle = "#1d5684";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(6, -4);
    ctx.lineTo(22, 0);
    ctx.lineTo(36, 5);
    ctx.stroke();

    // передняя нога — вытянута вперед почти вдоль земли
    ctx.strokeStyle = "#173f63";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(4, 14);
    ctx.lineTo(24, 21);
    ctx.lineTo(44, 20);
    ctx.stroke();

    ctx.restore();

    // Голова ближе к корпусу и чуть выше, чтобы не казалась оторванной.
    this.drawHead(ctx, 30, -35, 22);
  }

  drawTorso(ctx, torsoTop, torsoHeight) {
    const w = this.width;
    const torsoBottom = torsoTop + torsoHeight;

    ctx.save();
    roundedRectPath(ctx, -w * 0.17, torsoTop, w * 0.34, torsoHeight, 14);
    ctx.clip();

    const shirt = ctx.createLinearGradient(0, torsoTop, 0, torsoBottom);
    shirt.addColorStop(0, "#163957");
    shirt.addColorStop(1, "#0f2a42");
    ctx.fillStyle = shirt;
    ctx.fillRect(-w * 0.24, torsoTop - 2, w * 0.48, torsoHeight + 4);

    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = "#7cb0df";
    ctx.lineWidth = 1;
    for (let x = -w * 0.22; x <= w * 0.22; x += 6) {
      ctx.beginPath();
      ctx.moveTo(x, torsoTop - 2);
      ctx.lineTo(x, torsoBottom + 2);
      ctx.stroke();
    }
    for (let y = torsoTop - 2; y <= torsoBottom + 2; y += 6) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.22, y);
      ctx.lineTo(w * 0.22, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "#10283f";
    roundedRectPath(ctx, -w * 0.13, torsoBottom - 5, w * 0.26, 10, 5);
    ctx.fill();
  }

  drawLegLimb(ctx, limb, back) {
    ctx.strokeStyle = back ? "#234a71" : "#173f63";
    ctx.lineWidth = back ? 7 : 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(limb.hipX, limb.hipY);
    ctx.lineTo(limb.kneeX, limb.kneeY);
    ctx.lineTo(limb.ankleX, limb.ankleY);
    ctx.stroke();

    ctx.fillStyle = back ? "#234a71" : "#173f63";
    ctx.beginPath();
    ctx.arc(limb.kneeX, limb.kneeY, back ? 2.3 : 2.9, 0, Math.PI * 2);
    ctx.arc(limb.ankleX, limb.ankleY, back ? 1.8 : 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  drawArmLimb(ctx, limb, back) {
    ctx.strokeStyle = back ? "#2a608f" : "#1d5684";
    ctx.lineWidth = back ? 5 : 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(limb.shoulderX, limb.shoulderY);
    ctx.lineTo(limb.elbowX, limb.elbowY);
    ctx.lineTo(limb.handX, limb.handY);
    ctx.stroke();

    ctx.fillStyle = back ? "#2a608f" : "#1d5684";
    ctx.beginPath();
    ctx.arc(limb.handX, limb.handY, back ? 1.8 : 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHead(ctx, cx, cy, headRadius = 22) {
    ctx.fillStyle = "#d6a787";
    roundedRectPath(ctx, cx - 5, cy + headRadius - 2, 10, 12, 5);
    ctx.fill();

    if (this.usePhoto) {
      this.drawPhotoHead(ctx, cx, cy, headRadius);
    } else {
      this.drawFallbackHead(ctx, cx, cy, headRadius);
    }
  }

  drawPhotoHead(ctx, cx, cy, headRadius) {
    ctx.save();
    ctx.translate(cx - headRadius, cy - headRadius);
    const drew = this.portraitTexture.draw(ctx, 0, 0, headRadius * 2, headRadius * 2);
    if (!drew) {
      ctx.restore();
      this.drawFallbackHead(ctx, cx, cy, headRadius);
      return;
    }
    ctx.restore();
  }

  drawFallbackHead(ctx, cx, cy, headRadius) {
    const grad = ctx.createLinearGradient(0, cy - headRadius, 0, cy + headRadius);
    grad.addColorStop(0, "#ffd9bf");
    grad.addColorStop(1, "#efb88f");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, headRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#4e3a2f";
    ctx.beginPath();
    ctx.arc(cx - 6, cy - 3, 2, 0, Math.PI * 2);
    ctx.arc(cx + 6, cy - 3, 2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a3f30";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 6, 0, Math.PI);
    ctx.stroke();
  }
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

    if (type.kind === "paperPile") {
      this.paperLabels = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * 50));
    } else if (type.kind === "paperHigh") {
      this.paperLabels = Array.from({ length: 2 }, () => 1 + Math.floor(Math.random() * 50));
    }
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

  draw(ctx, time) {
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.type.kind === "paperPile") {
      this.drawPaperPile(ctx);
    } else if (this.type.kind === "paperHigh") {
      this.drawFlyingPapers(ctx, time);
    } else if (this.type.kind === "customer") {
      this.drawCustomer(ctx, time);
    }

    ctx.restore();
  }

  drawPaperRevision(ctx, x, y, number, scale = 1) {
    ctx.save();
    ctx.fillStyle = "#7c8ea7";
    ctx.font = `${Math.round(6.5 * scale)}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillText(`Изм ${number}`, x, y);
    ctx.restore();
  }

  drawPaperPile(ctx) {
    for (let i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(i * 4, -i * 2);
      ctx.rotate((-6 + i * 4) * Math.PI / 180);
      ctx.fillStyle = i % 2 ? "#ffffff" : "#f7fbff";
      ctx.strokeStyle = "#b7c8df";
      ctx.lineWidth = 1.5;
      roundedRectPath(ctx, 0, 8, this.width - 10, this.height - 14, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(138, 167, 205, 0.6)";
      for (let y = 16; y < this.height - 8; y += 7) {
        ctx.fillRect(6, y, this.width - 22, 1.2);
      }
      this.drawPaperRevision(ctx, 7, 12, this.paperLabels[i] || 1, 1);
      ctx.restore();
    }
  }

  drawFlyingPapers(ctx, time) {
    const bob = Math.sin(time * 8 + this.phase) * 3;
    ctx.translate(0, bob);

    for (let i = 0; i < 2; i++) {
      ctx.save();
      ctx.translate(i * 18, i * 4);
      ctx.rotate((Math.sin(time * 7 + this.phase + i) * 10 - 10) * Math.PI / 180);
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#bed0e4";
      ctx.lineWidth = 1.5;
      roundedRectPath(ctx, 0, 0, 34, 24, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "rgba(139, 167, 199, 0.65)";
      for (let y = 10; y < 20; y += 5) {
        ctx.fillRect(5, y, 20, 1.2);
      }
      this.drawPaperRevision(ctx, 5, 4, this.paperLabels[i] || 1, 0.9);
      ctx.beginPath();
      ctx.moveTo(25, 0);
      ctx.lineTo(34, 9);
      ctx.lineTo(25, 9);
      ctx.closePath();
      ctx.fillStyle = "#edf4fb";
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  drawCustomer(ctx, time) {
    const bounce = Math.sin(time * 7 + this.phase) * 1.5;
    ctx.translate(0, bounce);

    const headX = this.width * 0.52;
    const headY = 16;
    const bodyTop = 29;
    const bodyBottom = this.height - 18;

    ctx.fillStyle = "#6a84aa";
    roundedRectPath(ctx, this.width * 0.26, bodyTop, this.width * 0.5, bodyBottom - bodyTop, 7);
    ctx.fill();

    ctx.strokeStyle = "#556e92";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(this.width * 0.3, bodyTop + 12);
    ctx.lineTo(this.width * 0.08, bodyTop + 26);
    ctx.moveTo(this.width * 0.72, bodyTop + 12);
    ctx.lineTo(this.width * 0.93, bodyTop + 28);
    ctx.moveTo(this.width * 0.4, bodyBottom);
    ctx.lineTo(this.width * 0.28, this.height - 2);
    ctx.moveTo(this.width * 0.62, bodyBottom);
    ctx.lineTo(this.width * 0.8, this.height - 2);
    ctx.stroke();

    ctx.fillStyle = "#f0c9a4";
    ctx.beginPath();
    ctx.arc(headX, headY, 13, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d5a94c";
    ctx.beginPath();
    ctx.arc(headX, headY - 2, 13, Math.PI, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#26384d";
    ctx.fillRect(this.width * 0.38, bodyTop + 10, this.width * 0.25, 4);
  }
}

class ObstacleManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = 0.82;
    this.lastType = null;
    this.types = [
      {
        kind: "paperPile",
        width: 54,
        height: 34,
        minGap: 235,
        difficulty: 0,
        behavior: "jump",
        hitInsetX: 6,
        hitInsetY: 5,
      },
      {
        kind: "paperHigh",
        width: 58,
        height: 30,
        minGap: 265,
        difficulty: 0.12,
        behavior: "duck",
        offsetY: -110,
        hitInsetX: 5,
        hitInsetY: 3,
      },
      {
        kind: "customer",
        width: 48,
        height: 80,
        minGap: 295,
        difficulty: 0.24,
        behavior: "jump",
        hitInsetX: 7,
        hitInsetY: 5,
      },
    ];
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 0.82;
    this.lastType = null;
  }

  chooseType() {
    const level = this.game.speed / CONFIG.baseSpeed;
    let pool = this.types.filter((t) => t.difficulty <= level * 0.55 + 0.35);
    if (!pool.length) pool = this.types.slice();

    if (Math.random() < 0.4) {
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
      this.items.push(new Obstacle(this.game, type, this.game.worldWidth + 24));

      const speedFactor = this.game.speed / CONFIG.baseSpeed;
      const baseGap = type.minGap / Math.max(1, speedFactor * 0.88);
      const randomGap = 80 + Math.random() * 150;
      const gapDistance = Math.max(190, baseGap + randomGap);
      this.cooldown = gapDistance / this.game.speed / CONFIG.obstacleFrequency;
    }

    for (const obs of this.items) obs.update(dt);
    this.items = this.items.filter((o) => o.x + o.width > -20);
  }

  draw(ctx) {
    for (const obs of this.items) obs.draw(ctx, this.game.time);
  }
}

class TeaPickup {
  constructor(game, x) {
    this.game = game;
    this.width = 42;
    this.height = 42;
    this.x = x;
    this.y = game.groundY - 122 - Math.random() * 20;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    return {
      x: this.x + 4,
      y: this.y + 5,
      width: this.width - 8,
      height: this.height - 10,
    };
  }

  draw(ctx, time) {
    const bob = Math.sin(time * 6 + this.phase) * 4;
    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(255,255,255,0.24)";
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height / 2, 21, 0, Math.PI * 2);
    ctx.fill();

    // saucer
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.beginPath();
    ctx.ellipse(21, 29, 14, 4.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#cad8e8";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // cup body
    ctx.fillStyle = "#ffffff";
    roundedRectPath(ctx, 9, 12, 19, 14, 5);
    ctx.fill();
    ctx.strokeStyle = "#c6d8ea";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // tea inside
    ctx.fillStyle = "#be7f33";
    roundedRectPath(ctx, 11, 14, 15, 8, 3);
    ctx.fill();

    // handle
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(30, 19, 5.2, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // steam
    ctx.strokeStyle = "rgba(255,255,255,0.82)";
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(14, 10);
    ctx.bezierCurveTo(11, 6, 12, 3, 15, 1);
    ctx.moveTo(20, 10);
    ctx.bezierCurveTo(17, 6, 18, 3, 21, 1);
    ctx.moveTo(26, 10);
    ctx.bezierCurveTo(23, 6, 24, 3, 27, 1);
    ctx.stroke();

    ctx.restore();
  }
}

class TeaManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = this.randomCooldown();
  }

  randomCooldown() {
    return CONFIG.teaSpawnMin + Math.random() * (CONFIG.teaSpawnMax - CONFIG.teaSpawnMin);
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 1.8;
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.items.push(new TeaPickup(this.game, this.game.worldWidth + 40));
      this.cooldown = this.randomCooldown();
    }

    for (const tea of this.items) tea.update(dt);
    this.items = this.items.filter((t) => t.x + t.width > -20);
  }

  draw(ctx) {
    for (const tea of this.items) tea.draw(ctx, this.game.time);
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
        this.game.start();
        this.game.player.jump();
      }

      if (e.code === "ArrowDown") {
        this.game.userGesture();
        this.game.start();
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
      this.game.start();
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
        this.game.start();
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
    duckBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.game.userGesture();
      this.game.start();
      this.game.player.startSlide();
    });
  }

  bindUIButtons() {
    document.getElementById("restartBtn").addEventListener("click", () => {
      this.game.userGesture();
      this.game.restart();
    });

    document.getElementById("pauseBtn").addEventListener("click", () => {
      this.game.userGesture();
      this.game.togglePause();
    });

    document.getElementById("fullscreenBtn").addEventListener("click", () => {
      try {
        const shell = document.querySelector(".game-shell");
        if (!document.fullscreenElement) {
          if (shell.requestFullscreen) shell.requestFullscreen();
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        }
      } catch {
        // Fullscreen не обязателен для работы игры.
      }
    });
  }
}

class Game {
  constructor(canvas, portraitTexture) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.worldWidth = canvas.width;
    this.worldHeight = canvas.height;
    this.groundY = this.worldHeight - CONFIG.groundHeight;

    this.audio = new AudioEngine();
    this.background = new Background(this);
    this.player = new Player(this, portraitTexture);
    this.obstacles = new ObstacleManager(this);
    this.teaManager = new TeaManager(this);
    this.input = new InputController(this);

    this.state = "ready";
    this.time = 0;
    this.lastFrame = performance.now();
    this.distance = 0;
    this.score = 0;
    this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);
    this.speed = CONFIG.baseSpeed;
    this.hitFlash = 0;
    this.shake = 0;
    this.lastScoreMilestone = 0;
    this.workProgress = 0;
    this.slowTimer = 0;
    this.teaCount = 0;
    this.playerNameInput = document.getElementById("playerNameInput");
    this.leaderboardList = document.getElementById("leaderboardList");
    this.leaderboardStatus = document.getElementById("leaderboardStatus");
    this.playerName = normalizePlayerName(localStorage.getItem(PLAYER_NAME_KEY) || "Игрок");
    this.leaderboardRows = this.loadLocalLeaderboard();
    this.leaderboardRef = null;
    this.firebaseReady = false;
    if (this.playerNameInput) {
      this.playerNameInput.value = this.playerName;
      this.playerNameInput.addEventListener("input", () => {
        this.playerName = normalizePlayerName(this.playerNameInput.value);
        localStorage.setItem(PLAYER_NAME_KEY, this.playerName);
      });
    }
    this.updateLeaderboardUI();
    this.initOnlineLeaderboard();

    this.onResize();
    window.addEventListener("resize", this.onResize.bind(this));

    requestAnimationFrame(this.loop.bind(this));
  }

  userGesture() {
    this.audio.ensure();
    if (this.audio.ctx && this.audio.ctx.resume) {
      this.audio.ctx.resume();
    }
  }

  onResize() {
    const ratio = this.worldWidth / this.worldHeight;
    const maxW = Math.min(window.innerWidth - 40, 1000);
    const w = Math.max(320, maxW);
    const h = w / ratio;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  start() {
    if (this.state === "ready") this.state = "running";
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
    this.workProgress = 0;
    this.slowTimer = 0;
    this.teaCount = 0;
    this.player.reset();
    this.obstacles.reset();
    this.teaManager.reset();
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
      tea: Number(this.teaCount || 0),
      date: new Date().toISOString(),
    };

    const localRows = mergeLeaderboardRows([...this.loadLocalLeaderboard(), result]);
    this.saveLocalLeaderboard(localRows);

    if (this.firebaseReady && this.leaderboardRef) {
      const entryKey = leaderboardNameKey(this.playerName);
      this.leaderboardRef.child(entryKey).transaction((current) => {
        const currentScore = Number(current && current.score || 0);
        if (!current || result.score > currentScore) {
          return result;
        }
        return current;
      }).catch(() => {
        this.setLeaderboardStatus("Результат сохранён локально, но не отправился онлайн");
        this.leaderboardRows = localRows.slice(0, 10);
        this.updateLeaderboardUI();
      });
    } else {
      this.leaderboardRows = localRows.slice(0, 10);
      this.updateLeaderboardUI();
    }
  }

  collectTea(index) {
    this.teaManager.items.splice(index, 1);
    this.teaCount += 1;
    this.workProgress = Math.max(0, this.workProgress - CONFIG.teaTimeRewind);
    const minTeaSpeed = CONFIG.baseSpeed * CONFIG.teaMinSpeedFactor;
    this.speed = Math.max(minTeaSpeed, this.speed - CONFIG.teaSlowdownAmount);
    this.slowTimer = Math.max(this.slowTimer, CONFIG.teaSlowdownDuration);
    this.audio.tea();
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
    this.workProgress += dt;
    if (this.workProgress >= CONFIG.workdayDuration) {
      this.workProgress = CONFIG.workdayDuration;
      this.finishDay();
      return;
    }

    if (this.slowTimer > 0) {
      this.slowTimer -= dt;
      this.speed += CONFIG.speedGrowth * 0.25 * dt;
    } else {
      this.speed += CONFIG.speedGrowth * dt;
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
    this.teaManager.update(dt);

    for (const obs of this.obstacles.items) {
      if (this.intersects(this.player.getBounds(), obs.getBounds())) {
        this.gameOver();
        return;
      }
    }

    for (let i = this.teaManager.items.length - 1; i >= 0; i--) {
      if (this.intersects(this.player.getBounds(), this.teaManager.items[i].getBounds())) {
        this.collectTea(i);
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

    if (this.shake > 0) {
      const magnitude = this.shake * 0.35;
      ctx.translate((Math.random() - 0.5) * magnitude, (Math.random() - 0.5) * magnitude);
    }

    this.background.draw(ctx);
    this.teaManager.draw(ctx);
    this.obstacles.draw(ctx);
    this.player.draw(ctx);

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
    const panelW = 458;
    const panelH = 112;
    const panelX = 14;
    const panelY = 12;

    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundedRectPath(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.fill();

    ctx.fillStyle = "#213a58";
    ctx.font = "700 21px Inter, sans-serif";
    ctx.fillText(`Счёт: ${this.score}`, panelX + 14, panelY + 28);

    ctx.font = "600 15px Inter, sans-serif";
    ctx.fillStyle = "#446387";
    ctx.fillText(`Рекорд: ${this.best}`, panelX + 14, panelY + 50);
    ctx.fillText(`Чай: ${this.teaCount}`, panelX + 120, panelY + 50);
    ctx.fillText(`Скорость: ${(this.speed / 100).toFixed(2)}x`, panelX + 194, panelY + 50);

    ctx.fillStyle = "#1e4269";
    ctx.font = "700 16px Inter, sans-serif";
    ctx.fillText("Рабочий день", panelX + 14, panelY + 74);

    ctx.font = "800 20px Inter, sans-serif";
    ctx.fillText(formatWorkTime(this.workProgress / CONFIG.workdayDuration), panelX + 136, panelY + 74);

    const barX = panelX + 14;
    const barY = panelY + 84;
    const barW = panelW - 28;
    const barH = 12;

    ctx.fillStyle = "rgba(120, 152, 193, 0.22)";
    roundedRectPath(ctx, barX, barY, barW, barH, 8);
    ctx.fill();

    ctx.fillStyle = this.slowTimer > 0 ? "#67b7ff" : "#3f78c4";
    roundedRectPath(ctx, barX, barY, barW * clamp(this.workProgress / CONFIG.workdayDuration, 0, 1), barH, 8);
    ctx.fill();

    ctx.restore();
  }

  drawStateMessage(ctx) {
    const pulse = 0.56 + Math.sin(this.time * 2.8) * 0.14;

    if (this.state === "ready") {
      this.drawOverlayText(
        ctx,
        "Нажми пробел или тапни",
        "Прыгай через заказчиков и стопки бумаги. Скользи под летящими листами. Чай продлевает рабочий день.",
        pulse
      );
    }

    if (this.state === "paused") {
      this.drawOverlayText(ctx, "Пауза", "Нажми кнопку Пауза или P для продолжения", 0.92);
    }

    if (this.state === "gameover") {
      this.drawOverlayText(ctx, "Столкновение", "Enter / Space / клик / тап — рестарт", 0.96, true);
    }

    if (this.state === "win") {
      this.drawOverlayText(ctx, "Рабочий день завершён", "17:30! Enter / Space / клик / тап — сыграть ещё", 0.96, false, true);
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
    ctx.fillStyle = "rgba(15, 35, 60, 0.66)";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    const boxW = 700;
    const boxH = 156;
    const boxX = this.worldWidth / 2 - boxW / 2;
    const boxY = this.worldHeight / 2 - boxH / 2;

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundedRectPath(ctx, boxX, boxY, boxW, boxH, 18);
    ctx.fill();

    ctx.fillStyle = danger ? "#d62828" : success ? "#1f8d5a" : "#194776";
    ctx.font = "800 28px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.worldWidth / 2, boxY + 48);

    ctx.fillStyle = "#365a80";
    ctx.font = "600 17px Inter, sans-serif";
    const lines = this.wrapText(ctx, subtitle, boxW - 70).slice(0, 3);
    lines.forEach((line, index) => {
      ctx.fillText(line, this.worldWidth / 2, boxY + 84 + index * 24);
    });

    ctx.textAlign = "start";
    ctx.restore();
  }
}

function loadPlayerPhoto(timeoutMs = 1800) {
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
    img.src = CONFIG.photo.path;
  });
}

(function init() {
  const canvas = document.getElementById("gameCanvas");
  const game = new Game(canvas, null);

  loadPlayerPhoto().then((photo) => {
    if (!photo) return;
    const portraitTexture = new PortraitTexture(photo);
    if (!portraitTexture.ready) return;
    game.player.portraitTexture = portraitTexture;
    game.player.usePhoto = true;
  });
})();
