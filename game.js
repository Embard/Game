"use strict";

// Быстрая настройка баланса игры
const CONFIG = {
  gravity: 2100,
  jumpForce: 760,
  baseSpeed: 340,
  speedGrowth: 9,
  obstacleFrequency: 1.1,
  maxDt: 0.033,
  groundHeight: 82,
};

const STORAGE_KEY = "photo-runner-best";

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
    this.clouds = this.clouds.filter((c) => c.x > -160);
    while (this.clouds.length < 9) this.spawnCloud();
  }

  draw(ctx) {
    const { worldWidth: w, worldHeight: h, groundY } = this.game;

    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, "#f6fbff");
    sky.addColorStop(1, "#ddecff");
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
  constructor(game, image) {
    this.game = game;
    this.photo = image;
    this.usePhoto = !!image;
    this.x = 160;
    this.width = 72;
    this.standHeight = 112;
    this.duckHeight = 82;
    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.runTime = 0;
  }

  reset() {
    this.height = this.standHeight;
    this.y = this.game.groundY - this.height;
    this.vy = 0;
    this.grounded = true;
    this.ducking = false;
    this.runTime = 0;
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
      this.y = floor;
      this.vy = 0;
      this.grounded = true;
    } else {
      this.grounded = false;
      this.ducking = false;
      this.height = this.standHeight;
    }
  }

  getBounds() {
    return {
      x: this.x + 10,
      y: this.y + 10,
      width: this.width - 20,
      height: this.height - 12,
    };
  }

  draw(ctx) {
    ctx.save();
    const bob = this.grounded ? Math.sin(this.runTime * 12) * 1.5 : 0;
    const tilt = this.grounded ? 0 : Math.max(-0.25, Math.min(0.25, this.vy / 1700));

    ctx.translate(this.x + this.width / 2, this.y + this.height / 2 + bob);
    ctx.rotate(tilt);

    this.drawBody(ctx);
    this.drawHead(ctx);
    ctx.restore();
  }

  drawBody(ctx) {
    const w = this.width;
    const h = this.height;
    const torsoTop = -h * 0.1;
    const torsoBottom = h * 0.28;

    ctx.save();
    ctx.fillStyle = this.ducking ? "#1e7ec9" : "#2189dc";
    ctx.beginPath();
    ctx.roundRect(-w * 0.2, torsoTop, w * 0.4, torsoBottom - torsoTop, 14);
    ctx.fill();

    const legSwing = this.grounded ? Math.sin(this.runTime * 16) * 8 : 2;
    this.drawLeg(ctx, -w * 0.08, torsoBottom - 2, 26, legSwing);
    this.drawLeg(ctx, w * 0.08, torsoBottom - 2, 26, -legSwing);

    const armSwing = this.grounded ? Math.sin(this.runTime * 16 + Math.PI / 2) * 9 : 2;
    this.drawArm(ctx, -w * 0.22, torsoTop + 10, 24, armSwing, false);
    this.drawArm(ctx, w * 0.22, torsoTop + 10, 24, -armSwing, true);
    ctx.restore();
  }

  drawLeg(ctx, x, y, len, swing) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((swing * Math.PI) / 180);
    ctx.strokeStyle = "#194a79";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, len);
    ctx.stroke();

    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(0, len);
    ctx.lineTo(10, len + 10);
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
    ctx.lineTo(mirror ? 12 : -12, len);
    ctx.stroke();
    ctx.restore();
  }

  drawHead(ctx) {
    const headRadius = 27;
    const cx = 0;
    const cy = -this.height * 0.28;

    // Тень под головой
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy + headRadius + 16, 18, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, headRadius, headRadius * 1.04, 0, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (this.usePhoto) {
      const iw = this.photo.naturalWidth || this.photo.width;
      const ih = this.photo.naturalHeight || this.photo.height;
      const side = Math.min(iw, ih);
      const sx = (iw - side) / 2;
      const sy = ih * 0.1;
      const cropH = Math.min(side, ih - sy);
      ctx.drawImage(
        this.photo,
        sx,
        sy,
        side,
        cropH,
        cx - headRadius,
        cy - headRadius,
        headRadius * 2,
        headRadius * 2
      );
    } else {
      const grad = ctx.createLinearGradient(0, cy - headRadius, 0, cy + headRadius);
      grad.addColorStop(0, "#ffd7ba");
      grad.addColorStop(1, "#f1b78e");
      ctx.fillStyle = grad;
      ctx.fillRect(cx - headRadius, cy - headRadius, headRadius * 2, headRadius * 2);

      // fallback-лицо
      ctx.strokeStyle = "#5a3f30";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx - 8, cy - 3, 2.7, 0, Math.PI * 2);
      ctx.arc(cx + 8, cy - 3, 2.7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx, cy + 7, 8, 0, Math.PI);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(cx, cy, headRadius, headRadius * 1.04, 0, 0, Math.PI * 2);
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

    if (this.type.kind === "crate") {
      ctx.fillStyle = "#7f552d";
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.strokeStyle = "#b07a43";
      ctx.lineWidth = 3;
      ctx.strokeRect(2, 2, this.width - 4, this.height - 4);
      ctx.beginPath();
      ctx.moveTo(4, 4);
      ctx.lineTo(this.width - 4, this.height - 4);
      ctx.moveTo(this.width - 4, 4);
      ctx.lineTo(4, this.height - 4);
      ctx.stroke();
    }

    if (this.type.kind === "cone") {
      ctx.fillStyle = "#ff8947";
      ctx.beginPath();
      ctx.moveTo(this.width / 2, 0);
      ctx.lineTo(this.width, this.height);
      ctx.lineTo(0, this.height);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(this.width * 0.18, this.height * 0.48, this.width * 0.64, 5);
    }

    if (this.type.kind === "drone") {
      const bob = Math.sin(time * 7 + this.phase) * 3;
      ctx.translate(0, bob);
      ctx.fillStyle = "#606a86";
      ctx.beginPath();
      ctx.roundRect(0, 0, this.width, this.height, 10);
      ctx.fill();
      ctx.fillStyle = "#ffa44f";
      ctx.beginPath();
      ctx.arc(this.width * 0.35, this.height * 0.5, 6, 0, Math.PI * 2);
      ctx.arc(this.width * 0.7, this.height * 0.5, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }
}

class ObstacleManager {
  constructor(game) {
    this.game = game;
    this.items = [];
    this.cooldown = 0.85;
    this.lastType = null;
    this.types = [
      { kind: "cone", width: 30, height: 46, minGap: 260, difficulty: 0 },
      { kind: "crate", width: 40, height: 52, minGap: 300, difficulty: 0.2 },
      { kind: "drone", width: 48, height: 30, minGap: 330, offsetY: -50, difficulty: 0.5 },
    ];
  }

  reset() {
    this.items.length = 0;
    this.cooldown = 0.85;
    this.lastType = null;
  }

  chooseType() {
    const level = this.game.speed / CONFIG.baseSpeed;
    const pool = this.types.filter((t) => t.difficulty <= level * 0.5 + 0.2);
    const available = pool.filter((t) => t.kind !== this.lastType) || pool;
    const next = available[Math.floor(Math.random() * available.length)] || pool[0];
    this.lastType = next.kind;
    return next;
  }

  update(dt) {
    this.cooldown -= dt;

    if (this.cooldown <= 0) {
      const type = this.chooseType();
      const x = this.game.worldWidth + 24;
      this.items.push(new Obstacle(this.game, type, x));
      const speedFactor = this.game.speed / CONFIG.baseSpeed;
      const baseGap = type.minGap / Math.max(1, speedFactor * 0.9);
      const randomGap = 80 + Math.random() * 170;
      const gapDistance = Math.max(190, baseGap + randomGap);
      this.cooldown = gapDistance / this.game.speed / CONFIG.obstacleFrequency;
    }

    for (const obs of this.items) {
      obs.update(dt);
    }
    this.items = this.items.filter((o) => o.x + o.width > -10);
  }

  draw(ctx) {
    for (const obs of this.items) {
      obs.draw(ctx, this.game.time);
    }
  }
}

class InputController {
  constructor(game) {
    this.game = game;
    this.duckPressed = false;
    this.touchStartY = null;

    this.bindKeyboard();
    this.bindPointer();
    this.bindUIButtons();
  }

  bindKeyboard() {
    window.addEventListener("keydown", (e) => {
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
        this.duckPressed = true;
        this.game.player.setDuck(true);
      }

      if (e.code === "Enter" && this.game.state === "gameover") {
        this.game.restart();
      }

      if (e.code === "KeyP") {
        this.game.togglePause();
      }
    });

    window.addEventListener("keyup", (e) => {
      if (["ArrowDown", "KeyS"].includes(e.code)) {
        this.duckPressed = false;
        this.game.player.setDuck(false);
      }
    });
  }

  bindPointer() {
    const onTap = () => {
      this.game.userGesture();
      if (this.game.state === "gameover") {
        this.game.restart();
        return;
      }
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

    document.getElementById("fullscreenBtn").addEventListener("click", async () => {
      try {
        const shell = document.querySelector(".game-shell");
        if (!document.fullscreenElement) {
          await shell.requestFullscreen?.();
        } else {
          await document.exitFullscreen?.();
        }
      } catch {
        // Fullscreen может быть ограничен браузером, игра продолжит работать.
      }
    });
  }
}

class Game {
  constructor(canvas, playerPhoto) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");

    this.worldWidth = canvas.width;
    this.worldHeight = canvas.height;
    this.groundY = this.worldHeight - CONFIG.groundHeight;

    this.audio = new AudioEngine();
    this.background = new Background(this);
    this.player = new Player(this, playerPhoto);
    this.obstacles = new ObstacleManager(this);

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

    this.onResize();
    window.addEventListener("resize", () => this.onResize());

    requestAnimationFrame((t) => this.loop(t));
  }

  userGesture() {
    this.audio.ensure();
    this.audio.ctx?.resume?.();
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
    if (this.state === "ready") {
      this.state = "running";
    }
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
    if (this.score > this.best) {
      this.best = this.score;
      localStorage.setItem(STORAGE_KEY, String(this.best));
    }
  }

  loop(now) {
    const rawDt = (now - this.lastFrame) / 1000;
    const dt = Math.min(CONFIG.maxDt, Math.max(0, rawDt));
    this.lastFrame = now;

    if (this.state === "running") {
      this.update(dt);
    }
    this.render();

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.time += dt;
    this.speed += CONFIG.speedGrowth * dt;

    this.distance += this.speed * dt;
    this.score = Math.floor(this.distance / 10);

    if (this.score >= this.lastScoreMilestone + 100) {
      this.lastScoreMilestone = this.score;
      this.audio.score();
    }

    this.background.update(dt);
    this.player.update(dt);
    this.obstacles.update(dt);

    for (const obs of this.obstacles.items) {
      if (!obs.passed && obs.x + obs.width < this.player.x) {
        obs.passed = true;
      }
      if (this.intersects(this.player.getBounds(), obs.getBounds())) {
        this.gameOver();
        break;
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
    ctx.fillStyle = "rgba(255,255,255,0.84)";
    ctx.beginPath();
    ctx.roundRect(14, 12, 310, 74, 12);
    ctx.fill();

    ctx.fillStyle = "#213a58";
    ctx.font = "700 22px Inter, sans-serif";
    ctx.fillText(`Счёт: ${this.score}`, 28, 42);
    ctx.font = "600 16px Inter, sans-serif";
    ctx.fillStyle = "#446387";
    ctx.fillText(`Рекорд: ${this.best}`, 28, 66);
    ctx.fillText(`Скорость: ${(this.speed / 100).toFixed(2)}x`, 170, 66);
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
      this.drawOverlayText(
        ctx,
        "Game Over",
        "Enter / Space / Клик / Тап — рестарт",
        0.96,
        true
      );
    }
  }

  drawOverlayText(ctx, title, subtitle, alpha, danger = false) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "rgba(15, 35, 60, 0.7)";
    ctx.fillRect(0, 0, this.worldWidth, this.worldHeight);

    ctx.globalAlpha = 1;
    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.beginPath();
    ctx.roundRect(this.worldWidth / 2 - 270, this.worldHeight / 2 - 72, 540, 144, 18);
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
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = "async";
    img.src = "assets/player-photo.jpg";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
  });
}

(async function init() {
  const canvas = document.getElementById("gameCanvas");
  const playerPhoto = await loadPlayerPhoto();
  new Game(canvas, playerPhoto);
})();
