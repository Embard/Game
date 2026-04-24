"use strict";

const CONFIG = {
  gravity: 2180,
  jumpForce: 800,
  baseSpeed: 315,
  speedGrowth: 6.2,
  obstacleFrequency: 1.0,
  maxDt: 0.033,
  groundHeight: 82,
  workdayDuration: 25.0,
  teaSpawnMin: 2.8,
  teaSpawnMax: 4.4,
  teaTimeRewind: 2.2,
  teaSlowdownFactor: 0.84,
  teaSlowdownDuration: 3.2,
  photo: {
    path: "assets/player-photo.jpg",
    focusX: 0.15,
    focusY: 0.26,
    zoom: 1.1,
    saturation: 1.08,
    contrast: 1.07,
    brightness: 1.02,
  },
};

const STORAGE_KEY = "gip-runner-best";

const RUN_CYCLE = [
  { t: 0.0, thigh: 24, shin: 8, foot: -8, upperArm: -28, foreArm: -8 },
  { t: 0.125, thigh: 12, shin: -2, foot: -2, upperArm: -18, foreArm: -2 },
  { t: 0.25, thigh: -4, shin: -20, foot: 8, upperArm: 2, foreArm: 16 },
  { t: 0.375, thigh: -18, shin: -42, foot: 18, upperArm: 18, foreArm: 28 },
  { t: 0.5, thigh: -30, shin: -16, foot: 10, upperArm: 30, foreArm: 18 },
  { t: 0.625, thigh: -14, shin: 8, foot: 2, upperArm: 14, foreArm: 4 },
  { t: 0.75, thigh: 6, shin: 28, foot: -12, upperArm: -2, foreArm: -8 },
  { t: 0.875, thigh: 22, shin: 12, foot: -14, upperArm: -24, foreArm: -10 },
  { t: 1.0, thigh: 24, shin: 8, foot: -8, upperArm: -28, foreArm: -8 },
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

function sampleCycle(frames, phase) {
  const p = wrap01(phase);
  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (p >= a.t && p <= b.t) {
      const localT = (p - a.t) / Math.max(0.0001, b.t - a.t);
      return {
        thigh: lerp(a.thigh, b.thigh, localT),
        shin: lerp(a.shin, b.shin, localT),
        foot: lerp(a.foot, b.foot, localT),
        upperArm: lerp(a.upperArm, b.upperArm, localT),
        foreArm: lerp(a.foreArm, b.foreArm, localT),
      };
    }
  }
  return { ...frames[0] };
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

    const cropSize = Math.min(iw, ih) / CONFIG.photo.zoom;
    const centerX = iw * CONFIG.photo.focusX;
    const centerY = ih * CONFIG.photo.focusY;
    let sx = centerX - cropSize / 2;
    let sy = centerY - cropSize / 2;

    sx = Math.max(0, Math.min(sx, iw - cropSize));
    sy = Math.max(0, Math.min(sy, ih - cropSize));

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 5, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.filter = `saturate(${CONFIG.photo.saturation}) contrast(${CONFIG.photo.contrast}) brightness(${CONFIG.photo.brightness})`;
    ctx.drawImage(this.image, sx, sy, cropSize, cropSize, 0, 0, size, size);
    ctx.restore();

    const rim = ctx.createRadialGradient(size / 2, size / 2, size * 0.15, size / 2, size / 2, size / 2);
    rim.addColorStop(0.8, "rgba(255,255,255,0)");
    rim.addColorStop(1, "rgba(255,255,255,0.55)");
    ctx.fillStyle = rim;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2 - 2, 0, Math.PI * 2);
    ctx.fill();

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
    this.width = 82;
    this.standHeight = 122;
    this.duckHeight = 72;

    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.runTime = 0;
    this.squash = 0;
    this.lastGrounded = true;
  }

  reset() {
    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.runTime = 0;
    this.squash = 0;
    this.lastGrounded = true;
  }

  jump() {
    if (!this.grounded) return;
    this.vy = -CONFIG.jumpForce;
    this.grounded = false;
    this.game.audio.jump();
  }

  setDuck(isDown) {
    if (!this.grounded) {
      this.ducking = false;
      return;
    }

    this.ducking = !!isDown;
    const nextHeight = this.ducking ? this.duckHeight : this.standHeight;
    if (nextHeight !== this.height) {
      this.height = nextHeight;
      this.y = this.game.groundY - this.height;
    }
  }

  update(dt) {
    this.runTime += dt * (this.game.speed / CONFIG.baseSpeed);

    this.vy += CONFIG.gravity * dt;
    this.y += this.vy * dt;

    const floor = this.game.groundY - this.height;
    if (this.y >= floor) {
      if (!this.lastGrounded) {
        this.squash = 1;
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
    this.squash = Math.max(0, this.squash - dt * 6);
  }

  getBounds() {
    if (this.ducking && this.grounded) {
      return {
        x: this.x + 16,
        y: this.y + 16,
        width: this.width - 28,
        height: this.height - 18,
      };
    }

    return {
      x: this.x + 14,
      y: this.y + 10,
      width: this.width - 26,
      height: this.height - 12,
    };
  }

  draw(ctx) {
    ctx.save();

    const bob = this.grounded ? Math.sin(this.runTime * 12) * 1.1 : 0;
    const jumpTilt = this.grounded ? 0 : clamp(this.vy / 2300, -0.12, 0.08);
    const runLean = this.ducking ? -0.2 : -0.12;
    const squashY = this.grounded ? 1 - this.squash * 0.1 : 1 + Math.min(0.06, Math.abs(this.vy) / 2600);
    const squashX = this.grounded ? 1 + this.squash * 0.1 : 1 - Math.min(0.04, Math.abs(this.vy) / 2800);

    ctx.translate(this.x + this.width / 2, this.y + this.height / 2 + bob);
    ctx.rotate(runLean + jumpTilt);
    ctx.scale(squashX, squashY);

    this.drawFigure(ctx);
    ctx.restore();
  }

  getLegPose(phase) {
    if (this.ducking && this.grounded) {
      return { thigh: 35, shin: 82, foot: 8 };
    }

    if (!this.grounded) {
      if (this.vy < -40) {
        return phase < 0.5
          ? { thigh: 22, shin: 42, foot: -16 }
          : { thigh: -30, shin: -12, foot: 14 };
      }
      return phase < 0.5
        ? { thigh: 12, shin: 8, foot: -2 }
        : { thigh: -12, shin: -4, foot: 6 };
    }

    return sampleCycle(RUN_CYCLE, phase);
  }

  getArmPose(phase) {
    if (this.ducking && this.grounded) {
      return { upperArm: 38, foreArm: 68 };
    }

    if (!this.grounded) {
      return phase < 0.5
        ? { upperArm: -12, foreArm: 18 }
        : { upperArm: 22, foreArm: 46 };
    }

    return sampleCycle(RUN_CYCLE, phase);
  }

  computeLeg(hipX, hipY, pose) {
    const thighLen = 26;
    const shinLen = 28;
    const footLen = 14;

    const thighTheta = degToRad(90 - pose.thigh);
    const kneeX = hipX + Math.cos(thighTheta) * thighLen;
    const kneeY = hipY + Math.sin(thighTheta) * thighLen;

    const shinTheta = degToRad(90 - pose.shin);
    const ankleX = kneeX + Math.cos(shinTheta) * shinLen;
    const ankleY = kneeY + Math.sin(shinTheta) * shinLen;

    const footTheta = degToRad(-pose.foot);
    const toeX = ankleX + Math.cos(footTheta) * footLen;
    const toeY = ankleY + Math.sin(footTheta) * footLen;

    return { hipX, hipY, kneeX, kneeY, ankleX, ankleY, toeX, toeY };
  }

  computeArm(shoulderX, shoulderY, pose) {
    const upperLen = 20;
    const foreLen = 17;

    const upperTheta = degToRad(90 - pose.upperArm);
    const elbowX = shoulderX + Math.cos(upperTheta) * upperLen;
    const elbowY = shoulderY + Math.sin(upperTheta) * upperLen;

    const foreTheta = degToRad(90 - pose.foreArm);
    const handX = elbowX + Math.cos(foreTheta) * foreLen;
    const handY = elbowY + Math.sin(foreTheta) * foreLen;

    return { shoulderX, shoulderY, elbowX, elbowY, handX, handY };
  }

  drawFigure(ctx) {
    const w = this.width;
    const h = this.height;
    const phase = wrap01(this.runTime * 1.65);

    const torsoTop = -h * 0.16 + (this.ducking ? 10 : 0);
    const torsoHeight = this.ducking ? 34 : 50;
    const torsoBottom = torsoTop + torsoHeight;
    const shoulderY = torsoTop + 10;
    const hipY = torsoBottom - 2;

    const leftHipX = -w * 0.1;
    const rightHipX = w * 0.06;
    const leftShoulderX = -w * 0.18;
    const rightShoulderX = w * 0.18;

    const leftLeg = this.computeLeg(leftHipX, hipY, this.getLegPose(phase));
    const rightLeg = this.computeLeg(rightHipX, hipY, this.getLegPose(phase + 0.5));
    const leftArm = this.computeArm(leftShoulderX, shoulderY, this.getArmPose(phase + 0.5));
    const rightArm = this.computeArm(rightShoulderX, shoulderY, this.getArmPose(phase));

    const legs = [leftLeg, rightLeg].sort((a, b) => a.toeX - b.toeX);
    const arms = [leftArm, rightArm].sort((a, b) => a.handX - b.handX);

    this.drawArmLimb(ctx, arms[0], true);
    this.drawLegLimb(ctx, legs[0], true);
    this.drawTorso(ctx, torsoTop, torsoHeight);
    this.drawLegLimb(ctx, legs[1], false);
    this.drawArmLimb(ctx, arms[1], false);
    this.drawHead(ctx, 0, -h * 0.34 + (this.ducking ? 8 : 0));
  }

  drawTorso(ctx, torsoTop, torsoHeight) {
    const w = this.width;
    const torsoBottom = torsoTop + torsoHeight;

    ctx.save();
    roundedRectPath(ctx, -w * 0.22, torsoTop, w * 0.44, torsoHeight, 14);
    ctx.clip();

    const shirt = ctx.createLinearGradient(0, torsoTop, 0, torsoBottom);
    shirt.addColorStop(0, "#204f82");
    shirt.addColorStop(1, "#143b61");
    ctx.fillStyle = shirt;
    ctx.fillRect(-w * 0.3, torsoTop - 2, w * 0.6, torsoHeight + 4);

    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = "#4f79a8";
    ctx.lineWidth = 1.1;
    for (let x = -w * 0.3; x <= w * 0.3; x += 5) {
      ctx.beginPath();
      ctx.moveTo(x, torsoTop - 2);
      ctx.lineTo(x, torsoBottom + 2);
      ctx.stroke();
    }
    for (let y = torsoTop - 2; y <= torsoBottom + 2; y += 5) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, y);
      ctx.lineTo(w * 0.3, y);
      ctx.stroke();
    }
    ctx.restore();

    ctx.fillStyle = "#15385f";
    roundedRectPath(ctx, -w * 0.17, torsoBottom - 5, w * 0.34, 11, 6);
    ctx.fill();
  }

  drawLegLimb(ctx, limb, back) {
    ctx.strokeStyle = back ? "#214f7c" : "#1a4a75";
    ctx.lineWidth = back ? 7 : 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(limb.hipX, limb.hipY);
    ctx.lineTo(limb.kneeX, limb.kneeY);
    ctx.lineTo(limb.ankleX, limb.ankleY);
    ctx.stroke();

    ctx.fillStyle = back ? "#244d77" : "#173f65";
    ctx.beginPath();
    ctx.arc(limb.kneeX, limb.kneeY, back ? 2.6 : 3.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#163a5d";
    ctx.lineWidth = back ? 5 : 6;
    ctx.beginPath();
    ctx.moveTo(limb.ankleX, limb.ankleY);
    ctx.lineTo(limb.toeX, limb.toeY);
    ctx.stroke();
  }

  drawArmLimb(ctx, limb, back) {
    ctx.strokeStyle = back ? "#2c679f" : "#1c5a91";
    ctx.lineWidth = back ? 5 : 6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(limb.shoulderX, limb.shoulderY);
    ctx.lineTo(limb.elbowX, limb.elbowY);
    ctx.lineTo(limb.handX, limb.handY);
    ctx.stroke();
  }

  drawHead(ctx, cx, cy) {
    const headRadius = 28;

    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + headRadius + 17, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#d6a787";
    roundedRectPath(ctx, cx - 7, cy + headRadius - 4, 14, 15, 5);
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

    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, headRadius - 1, 0, Math.PI * 2);
    ctx.stroke();
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
    ctx.arc(cx - 8, cy - 3, 2.5, 0, Math.PI * 2);
    ctx.arc(cx + 8, cy - 3, 2.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "#5a3f30";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 6, 8, 0, Math.PI);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.95)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, headRadius - 1, 0, Math.PI * 2);
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
      for (let y = 6; y < 20; y += 5) {
        ctx.fillRect(5, y, 20, 1.2);
      }
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
    this.width = 34;
    this.height = 34;
    this.x = x;
    this.y = game.groundY - 116 - Math.random() * 22;
    this.phase = Math.random() * Math.PI * 2;
  }

  update(dt) {
    this.x -= this.game.speed * dt;
  }

  getBounds() {
    return {
      x: this.x + 4,
      y: this.y + 4,
      width: this.width - 8,
      height: this.height - 8,
    };
  }

  draw(ctx, time) {
    const bob = Math.sin(time * 6 + this.phase) * 4;
    ctx.save();
    ctx.translate(this.x, this.y + bob);

    ctx.fillStyle = "rgba(255,255,255,0.28)";
    ctx.beginPath();
    ctx.arc(this.width / 2, this.height / 2, 18, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    roundedRectPath(ctx, 8, 11, 16, 12, 4);
    ctx.fill();
    ctx.strokeStyle = "#cad8e8";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(25, 17, 5, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = "#c88e4d";
    roundedRectPath(ctx, 9.5, 13, 13, 8, 3);
    ctx.fill();

    ctx.strokeStyle = "rgba(255,255,255,0.75)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(13, 8);
    ctx.quadraticCurveTo(10, 4, 14, 1);
    ctx.moveTo(18, 8);
    ctx.quadraticCurveTo(15, 4, 19, 1);
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
      if (["Space", "ArrowUp", "KeyW", "ArrowDown", "KeyS", "Enter"].includes(e.code)) {
        e.preventDefault();
      }

      if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
        this.game.userGesture();
        if (this.restartIfEnded()) return;
        this.game.start();
        this.game.player.jump();
      }

      if (["ArrowDown", "KeyS"].includes(e.code)) {
        this.game.start();
        this.game.player.setDuck(true);
      }

      if (e.code === "Enter" && (this.game.state === "gameover" || this.game.state === "win")) {
        this.game.restart();
      }

      if (e.code === "KeyP") {
        this.game.togglePause();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (["ArrowDown", "KeyS"].includes(e.code)) {
        this.game.player.setDuck(false);
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
      if (delta > 38) this.game.player.setDuck(true);
    });

    const resetTouch = () => {
      this.touchStartY = null;
      this.game.player.setDuck(false);
    };

    this.game.canvas.addEventListener("pointerup", resetTouch);
    this.game.canvas.addEventListener("pointercancel", resetTouch);

    const duckBtn = document.getElementById("duckBtn");
    duckBtn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      this.game.userGesture();
      this.game.start();
      this.game.player.setDuck(true);
    });
    duckBtn.addEventListener("pointerup", () => this.game.player.setDuck(false));
    duckBtn.addEventListener("pointerleave", () => this.game.player.setDuck(false));
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

  saveBest() {
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(STORAGE_KEY, String(this.best));
    }
  }

  collectTea(index) {
    this.teaManager.items.splice(index, 1);
    this.teaCount += 1;
    this.workProgress = Math.max(0, this.workProgress - CONFIG.teaTimeRewind);
    this.speed = Math.max(CONFIG.baseSpeed * 0.92, this.speed * CONFIG.teaSlowdownFactor);
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
      this.speed += CONFIG.speedGrowth * 0.38 * dt;
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
        "Нажми пробел или тапни, чтобы начать",
        "Прыгай через заказчиков и стопки бумаги, пригибайся под летящими листами и лови чай",
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

  drawOverlayText(ctx, title, subtitle, alpha, danger = false, success = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15, 35, 60, 0.72)";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    roundedRectPath(ctx, this.worldWidth / 2 - 320, this.worldHeight / 2 - 82, 640, 164, 18);
    ctx.fill();

    ctx.fillStyle = danger ? "#d62828" : success ? "#1f8d5a" : "#194776";
    ctx.font = "800 32px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.worldWidth / 2, this.worldHeight / 2 - 14);

    ctx.fillStyle = "#365a80";
    ctx.font = "600 18px Inter, sans-serif";
    ctx.fillText(subtitle, this.worldWidth / 2, this.worldHeight / 2 + 24);

    ctx.textAlign = "start";
    ctx.restore();
  }
}

function loadPlayerPhoto() {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.src = CONFIG.photo.path;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

(async function init() {
  const canvas = document.getElementById("gameCanvas");
  const photo = await loadPlayerPhoto();
  const portraitTexture = new PortraitTexture(photo);
  new Game(canvas, portraitTexture);
})();
