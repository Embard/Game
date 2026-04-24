"use strict";

// Быстрая настройка баланса игры
const CONFIG = {
  gravity: 2080,
  jumpForce: 760,
  baseSpeed: 335,
  speedGrowth: 8.8,
  obstacleFrequency: 1.08,
  maxDt: 0.033,
  groundHeight: 82,
  workdayDuration: 15, // 8:00 -> 17:30 за 15 секунд активной игры
  teaSpawnMin: 4.8,
  teaSpawnMax: 7.2,
  teaTimeRewind: 1.25, // откат игрового рабочего времени при сборе кружки
  teaSlowdownFactor: 0.9,
  teaSlowdownDuration: 2.2,
  // Настройка использования фото (для лучшего попадания по лицу)
  photo: {
    path: "assets/player-photo.jpg",
    focusX: 0.15, // 0..1 (сдвиг центра кадра по X)
    focusY: 0.26, // 0..1 (сдвиг центра кадра по Y, лицо обычно выше центра)
    zoom: 1.1, // >1 приближает лицо
    saturation: 1.08,
    contrast: 1.07,
    brightness: 1.02,
  },
};

const STORAGE_KEY = "photo-runner-best";

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
    this.ping("sine", 920, 0.07, 0.045);
    window.setTimeout(() => this.ping("triangle", 680, 0.06, 0.035), 55);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function formatWorkTime(progress) {
  const start = 8 * 60;
  const end = 17 * 60 + 30;
  const total = end - start;
  const minutes = Math.min(total, Math.max(0, Math.round(progress * total)));
  const current = start + minutes;
  const h = Math.floor(current / 60);
  const m = current % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
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
    const speed = this.game.speed;
    for (const cloud of this.clouds) {
      cloud.x -= speed * cloud.speedMul * dt;
    }
    this.clouds = this.clouds.filter(function (c) {
      return c.x > -160;
    });
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

    // Дальний слой
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

    // Земля
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
    this.width = 74;
    this.standHeight = 116;
    this.duckHeight = 84;

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

    this.ducking = isDown;
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
    return {
      x: this.x + 11,
      y: this.y + 12,
      width: this.width - 22,
      height: this.height - 15,
    };
  }

  draw(ctx) {
    ctx.save();
    const bob = this.grounded ? Math.sin(this.runTime * 12) * 1.4 : 0;
    const tilt = this.grounded ? 0 : Math.max(-0.23, Math.min(0.23, this.vy / 1750));
    const marioStretch = this.grounded ? 1 - this.squash * 0.12 : 1 + Math.min(0.08, Math.abs(this.vy) / 2200);
    const marioWidth = this.grounded ? 1 + this.squash * 0.16 : 1 - Math.min(0.06, Math.abs(this.vy) / 2600);

    ctx.translate(this.x + this.width / 2, this.y + this.height / 2 + bob);
    ctx.rotate(tilt);
    ctx.scale(marioWidth, marioStretch);

    this.drawBody(ctx);
    this.drawHead(ctx);

    ctx.restore();
  }

  drawBody(ctx) {
    const w = this.width;
    const h = this.height;
    const torsoTop = -h * 0.1;
    const torsoBottom = h * 0.29;
    const phase = this.runTime * 18;

    // Ноги рисуются до торса, чтобы тело аккуратно перекрывало бедра.
    const leftCycle = Math.sin(phase);
    const rightCycle = Math.sin(phase + Math.PI);
    this.drawLeg(ctx, -w * 0.085, torsoBottom - 2, leftCycle);
    this.drawLeg(ctx, w * 0.085, torsoBottom - 2, rightCycle);

    // Торс в клетчатой рубашке как на референсе, но с более аккуратным силуэтом раннера.
    ctx.save();
    roundedRectPath(ctx, -w * 0.23, torsoTop, w * 0.46, torsoBottom - torsoTop, 13);
    ctx.clip();

    const shirt = ctx.createLinearGradient(0, torsoTop, 0, torsoBottom);
    shirt.addColorStop(0, "#245b91");
    shirt.addColorStop(1, "#153b62");
    ctx.fillStyle = shirt;
    ctx.fillRect(-w * 0.3, torsoTop - 2, w * 0.6, torsoBottom - torsoTop + 4);

    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = "#6d95bf";
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

    // Небольшая центральная тень делает торс менее плоским.
    ctx.fillStyle = "rgba(10, 30, 55, 0.16)";
    roundedRectPath(ctx, -2, torsoTop + 2, 4, torsoBottom - torsoTop - 4, 4);
    ctx.fill();

    const armSwing = this.grounded ? Math.sin(phase + Math.PI / 2) * 20 : 4;
    this.drawArm(ctx, -w * 0.24, torsoTop + 12, 24, armSwing, false);
    this.drawArm(ctx, w * 0.24, torsoTop + 12, 24, -armSwing, true);
  }

  drawLeg(ctx, hipX, hipY, cycle) {
    ctx.save();
    ctx.translate(hipX, hipY);
    ctx.strokeStyle = "#174a78";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const airborne = !this.grounded;
    const forward = cycle >= 0;
    const lift = this.grounded ? Math.max(0, cycle) : 0.55;

    // Персонаж бежит вправо: поднятое колено всегда уходит вперед, а не назад.
    const kneeX = airborne ? 8 : (forward ? 10 + lift * 9 : -7 + cycle * 2);
    const kneeY = airborne ? 22 : (forward ? 17 - lift * 4 : 25);
    const footX = airborne ? 16 : (forward ? 18 + lift * 11 : -13 + cycle * 5);
    const footY = airborne ? 37 : (forward ? 37 - lift * 3 : 43);

    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(kneeX * 0.35, kneeY * 0.45, kneeX, kneeY);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(kneeX, kneeY);
    ctx.quadraticCurveTo((kneeX + footX) * 0.5, kneeY + 11, footX, footY);
    ctx.stroke();

    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(footX - 1, footY);
    ctx.lineTo(footX + (forward ? 17 : 10), footY + 2);
    ctx.stroke();
    ctx.restore();
  }

  drawArm(ctx, x, y, len, swing, mirror) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((swing * Math.PI) / 180);
    ctx.strokeStyle = "#1b5b94";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(mirror ? 7 : -7, len * 0.45, mirror ? 13 : -13, len);
    ctx.stroke();
    ctx.restore();
  }

  drawHead(ctx) {
    const headRadius = 28;
    const cx = 0;
    const cy = -this.height * 0.3;

    // Тень под головой
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + headRadius + 17, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    // Шея
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

    // Светлый контур вокруг головы, чтобы герой читался на любом фоне
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
    this.passed = false;
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
    ctx.save();
    ctx.translate(this.x, this.y);

    if (this.type.kind === "paperPile") {
      this.drawPaperPile(ctx);
    }

    if (this.type.kind === "paperStack") {
      this.drawPaperStack(ctx);
    }

    if (this.type.kind === "flyingDoc") {
      const bob = Math.sin(time * 7 + this.phase) * 3;
      ctx.translate(0, bob);
      this.drawFlyingDoc(ctx);
    }

    ctx.restore();
  }

  drawPaperSheet(ctx, x, y, w, h, angle, lineCount = 3) {
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(angle);
    ctx.fillStyle = "rgba(25, 54, 89, 0.16)";
    roundedRectPath(ctx, -w / 2 + 2, -h / 2 + 3, w, h, 4);
    ctx.fill();
    ctx.fillStyle = "#fffdfa";
    roundedRectPath(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = "#cfddec";
    ctx.lineWidth = 1.2;
    roundedRectPath(ctx, -w / 2, -h / 2, w, h, 4);
    ctx.stroke();
    ctx.strokeStyle = "#7ea0c0";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < lineCount; i++) {
      const yy = -h * 0.22 + i * 6;
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, yy);
      ctx.lineTo(w * (0.2 + (i % 2) * 0.08), yy);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawPaperPile(ctx) {
    this.drawPaperSheet(ctx, 1, 10, this.width - 4, this.height - 14, -0.22, 3);
    this.drawPaperSheet(ctx, 7, 5, this.width - 8, this.height - 13, 0.18, 3);
    this.drawPaperSheet(ctx, 2, 0, this.width - 7, this.height - 12, -0.04, 4);
  }

  drawPaperStack(ctx) {
    for (let i = 0; i < 5; i++) {
      this.drawPaperSheet(ctx, 4 + (i % 2) * 2, this.height - 12 - i * 8, this.width - 8, 18, (i - 2) * 0.035, 1);
    }
    ctx.fillStyle = "rgba(27, 91, 148, 0.45)";
    roundedRectPath(ctx, this.width * 0.28, this.height * 0.16, this.width * 0.44, 5, 3);
    ctx.fill();
  }

  drawFlyingDoc(ctx) {
    this.drawPaperSheet(ctx, 0, 0, this.width, this.height, -0.15, 2);
    ctx.strokeStyle = "rgba(13, 138, 229, 0.42)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-18, this.height * 0.45);
    ctx.lineTo(-5, this.height * 0.45);
    ctx.moveTo(-24, this.height * 0.65);
    ctx.lineTo(-8, this.height * 0.65);
    ctx.stroke();
  }
}

class TeaBonus {
  constructor(game, x) {
    this.game = game;
    this.x = x;
    this.width = 38;
    this.height = 42;
    this.y = game.groundY - 118 - Math.random() * 54;
    this.phase = Math.random() * Math.PI * 2;
    this.collected = false;
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
    const bob = Math.sin(time * 5 + this.phase) * 4;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.fillStyle = "rgba(20, 50, 80, 0.16)";
    ctx.beginPath();
    ctx.ellipse(this.width * 0.48, this.height + 3, 15, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(110, 195, 255, 0.6)";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      const sx = 10 + i * 7;
      ctx.moveTo(sx, 3);
      ctx.quadraticCurveTo(sx - 5, -5, sx + 1, -11);
      ctx.stroke();
    }

    ctx.fillStyle = "#f6fbff";
    roundedRectPath(ctx, 6, 10, 24, 24, 6);
    ctx.fill();
    ctx.strokeStyle = "#1b5b94";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(30, 21, 8, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    ctx.fillStyle = "#c48a42";
    ctx.beginPath();
    ctx.ellipse(18, 14, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class TeaManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = this.nextCooldown();
  }

  nextCooldown() {
    return CONFIG.teaSpawnMin + Math.random() * (CONFIG.teaSpawnMax - CONFIG.teaSpawnMin);
  }

  reset() {
    this.items.length = 0;
    this.cooldown = this.nextCooldown();
  }

  update(dt) {
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.items.push(new TeaBonus(this.game, this.game.worldWidth + 80));
      this.cooldown = this.nextCooldown();
    }

    for (const item of this.items) item.update(dt);
    this.items = this.items.filter((item) => !item.collected && item.x + item.width > -10);
  }

  draw(ctx) {
    for (const item of this.items) item.draw(ctx, this.game.time);
  }
}

class ObstacleManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = 0.86;
    this.lastType = null;
    this.types = [
      { kind: "paperPile", width: 42, height: 38, minGap: 265, difficulty: 0 },
      { kind: "paperStack", width: 44, height: 52, minGap: 305, difficulty: 0.2 },
      { kind: "flyingDoc", width: 46, height: 34, minGap: 340, offsetY: -54, difficulty: 0.5 },
    ];
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 0.86;
    this.lastType = null;
  }

  chooseType() {
    const level = this.game.speed / CONFIG.baseSpeed;
    const pool = this.types.filter(function (t) {
      return t.difficulty <= level * 0.5 + 0.2;
    });
    const available = pool.filter(function (t) {
      return t.kind !== this.lastType;
    }, this);
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
      const baseGap = type.minGap / Math.max(1, speedFactor * 0.9);
      const randomGap = 80 + Math.random() * 170;
      const gapDistance = Math.max(190, baseGap + randomGap);
      this.cooldown = gapDistance / this.game.speed / CONFIG.obstacleFrequency;
    }

    for (const obs of this.items) obs.update(dt);
    this.items = this.items.filter(function (o) {
      return o.x + o.width > -10;
    });
  }

  draw(ctx) {
    for (const obs of this.items) obs.draw(ctx, this.game.time);
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

  bindKeyboard() {
    window.addEventListener("keydown", function (e) {
      if (["Space", "ArrowUp", "KeyW", "ArrowDown", "KeyS", "Enter"].includes(e.code)) {
        e.preventDefault();
      }

      if (["Space", "ArrowUp", "KeyW"].includes(e.code)) {
        this.game.userGesture();
        if (this.game.state === "gameover") {
          this.game.restart();
          return;
        }
        this.game.start();
        this.game.player.jump();
      }

      if (["ArrowDown", "KeyS"].includes(e.code)) {
        this.game.player.setDuck(true);
      }

      if (e.code === "Enter" && this.game.state === "gameover") {
        this.game.restart();
      }

      if (e.code === "KeyP") {
        this.game.togglePause();
      }
    }.bind(this));

    window.addEventListener("keyup", function (e) {
      if (["ArrowDown", "KeyS"].includes(e.code)) {
        this.game.player.setDuck(false);
      }
    }.bind(this));
  }

  bindPointer() {
    const onTap = function () {
      this.game.userGesture();
      if (this.game.state === "gameover") {
        this.game.restart();
        return;
      }
      this.game.start();
      this.game.player.jump();
    }.bind(this);

    this.game.canvas.addEventListener("pointerdown", function (e) {
      this.touchStartY = e.clientY;
      onTap();
    }.bind(this));

    this.game.canvas.addEventListener("pointermove", function (e) {
      if (this.touchStartY == null) return;
      const delta = e.clientY - this.touchStartY;
      if (delta > 38) this.game.player.setDuck(true);
    }.bind(this));

    const resetTouch = function () {
      this.touchStartY = null;
      this.game.player.setDuck(false);
    }.bind(this);

    this.game.canvas.addEventListener("pointerup", resetTouch);
    this.game.canvas.addEventListener("pointercancel", resetTouch);

    const duckBtn = document.getElementById("duckBtn");
    duckBtn.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      this.game.userGesture();
      this.game.start();
      this.game.player.setDuck(true);
    }.bind(this));
    duckBtn.addEventListener("pointerup", function () {
      this.game.player.setDuck(false);
    }.bind(this));
    duckBtn.addEventListener("pointerleave", function () {
      this.game.player.setDuck(false);
    }.bind(this));
  }

  bindUIButtons() {
    document.getElementById("restartBtn").addEventListener("click", function () {
      this.game.userGesture();
      this.game.restart();
    }.bind(this));

    document.getElementById("pauseBtn").addEventListener("click", function () {
      this.game.userGesture();
      this.game.togglePause();
    }.bind(this));

    document.getElementById("fullscreenBtn").addEventListener("click", function () {
      try {
        const shell = document.querySelector(".game-shell");
        if (!document.fullscreenElement) {
          if (shell.requestFullscreen) {
            shell.requestFullscreen();
          }
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      } catch {
        // Fullscreen может быть ограничен браузером, игра продолжит работать.
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
    this.tea = new TeaManager(this);
    this.input = new InputController(this);

    this.state = "ready"; // ready, running, paused, gameover
    this.time = 0;
    this.lastFrame = performance.now();
    this.distance = 0;
    this.score = 0;
    this.best = Number(localStorage.getItem(STORAGE_KEY) || 0);
    this.speed = CONFIG.baseSpeed;
    this.hitFlash = 0;
    this.shake = 0;
    this.lastScoreMilestone = 0;
    this.workdayElapsed = 0;
    this.teaSlowTimer = 0;
    this.gameOverReason = "hit";

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
    this.player.reset();
    this.obstacles.reset();
    this.tea.reset();
    this.workdayElapsed = 0;
    this.teaSlowTimer = 0;
    this.gameOverReason = "hit";
  }

  togglePause() {
    if (this.state === "running") {
      this.state = "paused";
    } else if (this.state === "paused") {
      this.state = "running";
    }
  }

  gameOver(reason = "hit") {
    if (this.state !== "running") return;
    this.gameOverReason = reason;
    this.state = "gameover";
    this.hitFlash = 1;
    this.shake = 14;
    this.audio.hit();

    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(STORAGE_KEY, String(this.best));
    }
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
    this.workdayElapsed += dt;
    if (this.workdayElapsed >= CONFIG.workdayDuration) {
      this.workdayElapsed = CONFIG.workdayDuration;
      this.gameOver("time");
      return;
    }

    this.teaSlowTimer = Math.max(0, this.teaSlowTimer - dt);
    const speedGrowthMul = this.teaSlowTimer > 0 ? 0.38 : 1;
    this.speed += CONFIG.speedGrowth * speedGrowthMul * dt;

    this.distance += this.speed * dt;
    this.score = Math.floor(this.distance / 10);

    if (this.score >= this.lastScoreMilestone + 100) {
      this.lastScoreMilestone = this.score;
      this.audio.score();
    }

    this.background.update(dt);
    this.player.update(dt);
    this.obstacles.update(dt);
    this.tea.update(dt);

    for (const mug of this.tea.items) {
      if (!mug.collected && this.intersects(this.player.getBounds(), mug.getBounds())) {
        mug.collected = true;
        this.collectTea();
      }
    }

    for (const obs of this.obstacles.items) {
      if (this.intersects(this.player.getBounds(), obs.getBounds())) {
        this.gameOver("hit");
        break;
      }
    }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 26);
  }

  collectTea() {
    this.workdayElapsed = Math.max(0, this.workdayElapsed - CONFIG.teaTimeRewind);
    this.speed = Math.max(CONFIG.baseSpeed * 0.92, this.speed * CONFIG.teaSlowdownFactor);
    this.teaSlowTimer = CONFIG.teaSlowdownDuration;
    this.distance += 150;
    this.score = Math.floor(this.distance / 10);
    this.audio.tea();
  }

  getWorkdayProgress() {
    return clamp(this.workdayElapsed / CONFIG.workdayDuration, 0, 1);
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
    this.obstacles.draw(ctx);
    this.tea.draw(ctx);
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
    ctx.fillStyle = "rgba(255,255,255,0.86)";
    roundedRectPath(ctx, 14, 12, 398, 92, 12);
    ctx.fill();

    ctx.fillStyle = "#213a58";
    ctx.font = "700 22px Inter, sans-serif";
    ctx.fillText(`Счёт: ${this.score}`, 28, 42);

    ctx.font = "600 16px Inter, sans-serif";
    ctx.fillStyle = "#446387";
    ctx.fillText(`Рекорд: ${this.best}`, 28, 67);
    ctx.fillText(`Скорость: ${(this.speed / 100).toFixed(2)}x`, 176, 67);

    const progress = this.getWorkdayProgress();
    const timeLabel = formatWorkTime(progress);
    ctx.fillStyle = "#213a58";
    ctx.font = "800 18px Inter, sans-serif";
    ctx.fillText(`Рабочий день: ${timeLabel}`, 28, 91);

    const barX = 214;
    const barY = 80;
    const barW = 178;
    const barH = 10;
    ctx.fillStyle = "rgba(27, 91, 148, 0.16)";
    roundedRectPath(ctx, barX, barY, barW, barH, 5);
    ctx.fill();
    ctx.fillStyle = progress > 0.78 ? "#d96b4b" : "#0d8ae5";
    roundedRectPath(ctx, barX, barY, barW * progress, barH, 5);
    ctx.fill();

    if (this.teaSlowTimer > 0) {
      ctx.fillStyle = "#0b78c5";
      ctx.font = "700 14px Inter, sans-serif";
      ctx.fillText("☕ чай: темп ниже", 274, 42);
    }
    ctx.restore();
  }

  drawStateMessage(ctx) {
    const pulse = 0.55 + Math.sin(this.time * 2.8) * 0.15;

    if (this.state === "ready") {
      this.drawOverlayText(
        ctx,
        "Нажми пробел или тапни, чтобы начать",
        "Space / ↑ / W / Tap",
        pulse
      );
    }

    if (this.state === "paused") {
      this.drawOverlayText(ctx, "Пауза", "Нажми кнопку Пауза или P для продолжения", 0.92);
    }

    if (this.state === "gameover") {
      const title = this.gameOverReason === "time" ? "Рабочий день закончился" : "Game Over";
      const subtitle = this.gameOverReason === "time"
        ? "ГИП дождался 17:30. Enter / Space / Клик — новый забег"
        : "Enter / Space / Клик / Тап — рестарт";
      this.drawOverlayText(ctx, title, subtitle, 0.96, true);
    }
  }

  drawOverlayText(ctx, title, subtitle, alpha, danger = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15, 35, 60, 0.7)";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    roundedRectPath(ctx, this.worldWidth / 2 - 270, this.worldHeight / 2 - 72, 540, 144, 18);
    ctx.fill();

    ctx.fillStyle = danger ? "#d62828" : "#194776";
    ctx.font = "800 34px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.worldWidth / 2, this.worldHeight / 2 - 10);

    ctx.fillStyle = "#365a80";
    ctx.font = "600 18px Inter, sans-serif";
    ctx.fillText(subtitle, this.worldWidth / 2, this.worldHeight / 2 + 28);

    ctx.textAlign = "start";
    ctx.restore();
  }
}

function loadPlayerPhoto() {
  return new Promise(function (resolve) {
    const img = new Image();
    img.decoding = "async";
    img.src = CONFIG.photo.path;
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      resolve(null);
    };
  });
}

(async function init() {
  const canvas = document.getElementById("gameCanvas");
  const photo = await loadPlayerPhoto();
  const portraitTexture = new PortraitTexture(photo);
  new Game(canvas, portraitTexture);
})();
