"use strict";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDjs3ZU1vPYraihsEUhHdC_yGKGVBXfZN8",
  authDomain: "runner-bb9a8.firebaseapp.com",
  databaseURL: "https://runner-bb9a8-default-rtdb.firebaseio.com",
  projectId: "runner-bb9a8",
  storageBucket: "runner-bb9a8.firebasestorage.app",
  messagingSenderId: "36209569924",
  appId: "1:36209569924:web:f44e0b9bf1c3c818b492d1",
};

const DUEL_PATH = "archeryRooms";
const NAME_KEY = "gip-archery-name";
const CHARACTER_KEY = "gip-archery-character";

const CHARACTERS = [
  {
    id: "gip",
    name: "ГИП",
    path: "assets/characters/gip",
    preview: "assets/characters/gip/preview.png",
  },
  {
    id: "alexey",
    name: "Alexey",
    path: "assets/characters/alexey",
    preview: "assets/characters/alexey/preview.png",
  },
];

const DUEL = {
  gravity: 620,
  groundY: 430,
  maxHp: 100,
  p1X: 178,
  p2X: 942,
  charW: 126,
  charH: 158,
  arrowLifeMs: 1180,
  maxPull: 155,
  minPullToShoot: 24,
  trailLength: 10,
  shakeDecay: 0.86,
};

const HIT_COLORS = {
  head: ["#ff6b6b", "#ffd166", "#fff1c1"],
  body: ["#ff8f5a", "#ffc857", "#ffe8a3"],
  arm: ["#7ec8ff", "#b8e0ff", "#fff"],
  leg: ["#7ec8ff", "#b8e0ff", "#fff"],
  miss: ["#9bb4c9", "#d7e6f2", "#fff"],
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalizeName(value) {
  return String(value || "Игрок")
    .trim()
    .replace(/[\n\r\t<>]/g, "")
    .slice(0, 18) || "Игрок";
}

function randomRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

function getCharacter(id) {
  return CHARACTERS.find((c) => c.id === id) || CHARACTERS[0];
}

function loadImage(path) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = path;
  });
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

class SpriteCache {
  constructor() {
    this.cache = new Map();
  }

  async get(characterId) {
    if (this.cache.has(characterId)) return this.cache.get(characterId);
    const character = getCharacter(characterId);
    const frames = ["run1", "run2", "run3", "run4", "jump", "land", "slide", "hurt", "preview"];
    const loaded = {};
    for (const frame of frames) {
      loaded[frame] = await loadImage(`${character.path}/${frame}.png`);
    }
    this.cache.set(characterId, loaded);
    return loaded;
  }
}

class ArcheryGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = canvas.width;
    this.height = canvas.height;
    this.cache = new SpriteCache();
    this.sprites = {};

    this.nameInput = document.getElementById("duelPlayerName");
    this.characterSelect = document.getElementById("duelCharacterSelect");
    this.roomCodeInput = document.getElementById("roomCodeInput");
    this.statusEl = document.getElementById("duelStatus");
    this.roomCodeEl = document.getElementById("roomCodeLabel");
    this.angleValue = document.getElementById("angleValue");
    this.powerValue = document.getElementById("powerValue");

    this.roomCode = "";
    this.role = "p1";
    this.roomRef = null;
    this.room = null;
    this.online = false;
    this.localMode = false;
    this.lastShotId = null;
    this.shotAnimation = null;
    this.dragging = false;
    this.dragPointerId = null;
    this.aim = null;
    this.lastAim = { angle: 36, power: 58 };
    this.idleTime = 0;
    this.lastFrameTime = 0;

    this.particles = [];
    this.floatTexts = [];
    this.stuckArrows = [];
    this.shake = 0;
    this.hitFlash = 0;
    this.fxTriggeredForShot = null;
    this.clouds = this.createClouds();

    this.playerName = normalizeName(localStorage.getItem(NAME_KEY) || "Игрок");
    this.characterId = localStorage.getItem(CHARACTER_KEY) || CHARACTERS[0].id;

    this.setupUI();
    this.initFirebase();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    requestAnimationFrame((time) => this.loop(time));
  }

  createClouds() {
    return [
      { x: 90, y: 78, s: 1.1, speed: 8 },
      { x: 340, y: 54, s: 0.85, speed: 5.5 },
      { x: 620, y: 92, s: 1.25, speed: 6.8 },
      { x: 880, y: 48, s: 0.95, speed: 4.2 },
      { x: 1040, y: 110, s: 0.7, speed: 7.4 },
    ];
  }

  setupUI() {
    if (this.nameInput) {
      this.nameInput.value = this.playerName;
      this.nameInput.addEventListener("input", () => {
        this.playerName = normalizeName(this.nameInput.value);
        localStorage.setItem(NAME_KEY, this.playerName);
      });
    }

    if (this.characterSelect) {
      this.characterSelect.innerHTML = CHARACTERS.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
      this.characterSelect.value = this.characterId;
      this.characterSelect.addEventListener("change", () => {
        this.characterId = this.characterSelect.value;
        localStorage.setItem(CHARACTER_KEY, this.characterId);
      });
    }

    document.getElementById("createRoomBtn")?.addEventListener("click", () => this.createRoom());
    document.getElementById("joinRoomBtn")?.addEventListener("click", () => this.joinRoom());
    document.getElementById("localDuelBtn")?.addEventListener("click", () => this.startLocal());

    this.bindAimInput();
    this.updateAimReadout(null);
  }

  bindAimInput() {
    this.canvas.addEventListener("pointerdown", (event) => {
      if (!this.canControlShot()) return;
      event.preventDefault();
      this.dragging = true;
      this.dragPointerId = event.pointerId;
      this.canvas.setPointerCapture?.(event.pointerId);
      this.updateDragAim(event);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging || event.pointerId !== this.dragPointerId) return;
      event.preventDefault();
      this.updateDragAim(event);
    });

    const release = (event) => {
      if (!this.dragging || event.pointerId !== this.dragPointerId) return;
      event.preventDefault();
      const aim = this.aim;
      this.dragging = false;
      this.dragPointerId = null;
      this.canvas.releasePointerCapture?.(event.pointerId);
      if (aim && aim.pull >= DUEL.minPullToShoot && this.canControlShot()) {
        this.shootWithAim(aim.angle, aim.power);
      }
      this.aim = null;
      this.updateAimReadout(null);
    };

    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("pointerleave", (event) => {
      if (this.dragging && event.pointerId === this.dragPointerId) release(event);
    });
  }

  getCanvasPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.width / Math.max(1, rect.width);
    const sy = this.height / Math.max(1, rect.height);
    return {
      x: (event.clientX - rect.left) * sx,
      y: (event.clientY - rect.top) * sy,
    };
  }

  canControlShot() {
    if (!this.room || this.room.phase !== "playing" || this.shotAnimation) return false;
    if (!this.localMode && this.room.turn !== this.role) return false;
    if (this.localMode && this.room.turn !== "p1") return false;
    return true;
  }

  currentShooterRole() {
    return this.localMode ? this.room?.turn || "p1" : this.role;
  }

  updateDragAim(event) {
    const role = this.currentShooterRole();
    const start = this.getShotStart(role);
    const point = this.getCanvasPoint(event);
    const rawVx = start.x - point.x;
    const rawVy = start.y - point.y;
    const facingForward = rawVx * start.facing;
    const allowedX = clamp(facingForward, 0, DUEL.maxPull);
    const allowedY = clamp(rawVy, -DUEL.maxPull * 0.95, DUEL.maxPull * 0.35);
    const pull = Math.sqrt(allowedX * allowedX + allowedY * allowedY);
    const power = clamp(Math.round((pull / DUEL.maxPull) * 100), 0, 100);
    let angle = Math.round((Math.atan2(-allowedY, Math.max(1, allowedX)) * 180) / Math.PI);
    angle = clamp(angle, 8, 72);

    const drawVx = allowedX * start.facing;
    const drawVy = allowedY;
    this.aim = {
      angle,
      power,
      pull,
      startX: start.x,
      startY: start.y,
      endX: start.x - drawVx,
      endY: start.y - drawVy,
      facing: start.facing,
    };
    this.lastAim = { angle, power };
    this.updateAimReadout(this.aim);
  }

  updateAimReadout(aim) {
    if (this.angleValue) this.angleValue.textContent = aim ? `${aim.angle}°` : "—";
    if (this.powerValue) this.powerValue.textContent = aim ? `${aim.power}%` : "—";
  }

  initFirebase() {
    try {
      if (!window.firebase || !window.firebase.database) {
        this.setStatus("Firebase SDK не загрузился. Онлайн-режим недоступен, но работает локальная тренировка.");
        return;
      }
      if (!window.firebase.apps || !window.firebase.apps.length) {
        window.firebase.initializeApp(FIREBASE_CONFIG);
      }
      this.online = true;
    } catch {
      this.online = false;
      this.setStatus("Firebase не подключился. Онлайн-режим недоступен, но работает локальная тренировка.");
    }
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  setRoomCode(text) {
    if (this.roomCodeEl) this.roomCodeEl.textContent = text;
  }

  getLocalPlayerData(role = this.role) {
    return {
      name: this.playerName,
      character: this.characterId,
      hp: DUEL.maxHp,
      connected: true,
      role,
    };
  }

  createInitialRoom(p1, p2 = null) {
    return {
      createdAt: Date.now(),
      phase: p2 ? "playing" : "waiting",
      turn: "p1",
      wind: Math.round((Math.random() * 2 - 1) * 28),
      winner: "",
      players: {
        p1,
        p2: p2 || null,
      },
      lastShot: null,
      shotIndex: 0,
    };
  }

  async createRoom() {
    if (!this.online) {
      this.setStatus("Онлайн недоступен. Запусти локальную тренировку или проверь Firebase.");
      return;
    }
    this.localMode = false;
    this.role = "p1";
    this.roomCode = randomRoomCode();
    this.roomRef = window.firebase.database().ref(`${DUEL_PATH}/${this.roomCode}`);
    await this.roomRef.set(this.createInitialRoom(this.getLocalPlayerData("p1")));
    this.watchRoom();
    this.setRoomCode(`Код комнаты: ${this.roomCode}`);
    this.setStatus("Комната создана. Отправь код второму игроку и жди подключения.");
  }

  async joinRoom() {
    if (!this.online) {
      this.setStatus("Онлайн недоступен. Запусти локальную тренировку или проверь Firebase.");
      return;
    }
    const code = String(this.roomCodeInput?.value || "").trim().toUpperCase();
    if (!code) {
      this.setStatus("Введи код комнаты.");
      return;
    }
    this.localMode = false;
    this.role = "p2";
    this.roomCode = code;
    this.roomRef = window.firebase.database().ref(`${DUEL_PATH}/${this.roomCode}`);
    const snapshot = await this.roomRef.get();
    if (!snapshot.exists()) {
      this.setStatus("Комната не найдена. Проверь код.");
      return;
    }
    await this.roomRef.transaction((room) => {
      if (!room) return room;
      room.players = room.players || {};
      room.players.p2 = this.getLocalPlayerData("p2");
      room.phase = "playing";
      if (!room.turn) room.turn = "p1";
      if (typeof room.wind !== "number") room.wind = Math.round((Math.random() * 2 - 1) * 28);
      return room;
    });
    this.watchRoom();
    this.setRoomCode(`Код комнаты: ${this.roomCode}`);
    this.setStatus("Ты подключился. Игра начинается.");
  }

  startLocal() {
    this.localMode = true;
    this.role = "p1";
    const p1 = this.getLocalPlayerData("p1");
    const enemyCharacter = this.characterId === "gip" ? "alexey" : "gip";
    const p2 = {
      name: "Соперник",
      character: enemyCharacter,
      hp: DUEL.maxHp,
      connected: true,
      role: "p2",
    };
    this.room = this.createInitialRoom(p1, p2);
    this.room.phase = "playing";
    this.setRoomCode("Локальная тренировка");
    this.setStatus("Локальная тренировка запущена. После твоего выстрела соперник стреляет автоматически.");
    this.ensureSprites();
  }

  watchRoom() {
    if (!this.roomRef) return;
    this.roomRef.off();
    this.roomRef.on("value", (snapshot) => {
      this.room = snapshot.val();
      this.ensureSprites();
      if (!this.room) {
        this.setStatus("Комната удалена или недоступна.");
        return;
      }
      if (this.room.lastShot && this.room.lastShot.id !== this.lastShotId) {
        this.lastShotId = this.room.lastShot.id;
        this.shotAnimation = {
          shot: this.ensureShotImpact(this.room.lastShot),
          start: performance.now(),
        };
      }
      this.updateStatusFromRoom();
    });
  }

  updateStatusFromRoom() {
    if (!this.room) return;
    if (this.room.phase === "waiting") {
      this.setStatus("Ждём второго игрока. Отправь ему код комнаты.");
      return;
    }
    if (this.room.phase === "finished") {
      const winner = this.room.winner === this.role ? "Ты победил" : this.room.winner ? "Ты проиграл" : "Игра окончена";
      this.setStatus(`${winner}. Создай новую комнату для реванша.`);
      return;
    }
    if (this.room.turn === this.role) {
      this.setStatus("Твой ход: зажми поле, оттяни назад от персонажа и отпусти для выстрела.");
    } else {
      this.setStatus("Ход соперника. Ждём выстрел.");
    }
  }

  async ensureSprites() {
    if (!this.room?.players) return;
    const ids = [this.room.players.p1?.character, this.room.players.p2?.character].filter(Boolean);
    for (const id of ids) {
      if (!this.sprites[id]) this.sprites[id] = await this.cache.get(id);
    }
  }

  onResize() {
    const ratio = this.width / this.height;
    const maxW = Math.min(window.innerWidth - 32, 1240);
    const w = Math.max(320, maxW);
    const h = w / ratio;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  getAim() {
    return this.aim || this.lastAim || { angle: 36, power: 58 };
  }

  getPlayerPosition(role) {
    return role === "p1"
      ? { x: DUEL.p1X, y: DUEL.groundY, facing: 1 }
      : { x: DUEL.p2X, y: DUEL.groundY, facing: -1 };
  }

  getShotStart(role) {
    const pos = this.getPlayerPosition(role);
    return {
      x: pos.x + pos.facing * 58,
      y: pos.y - 106,
      facing: pos.facing,
    };
  }

  makeShot(role, angle, power) {
    const start = this.getShotStart(role);
    const speed = 330 + power * 6.1;
    const radians = (angle * Math.PI) / 180;
    return {
      startX: start.x,
      startY: start.y,
      vx: Math.cos(radians) * speed * start.facing,
      vy: -Math.sin(radians) * speed,
      wind: Number(this.room?.wind || 0),
      shooter: role,
    };
  }

  simulateShot(room, role, angle, power) {
    const shot = this.makeShot(role, angle, power);
    const targetRole = role === "p1" ? "p2" : "p1";
    const target = this.getTargetZones(targetRole);
    let lastPoint = { x: shot.startX, y: shot.startY };
    let hit = null;
    let impactT = 2.4;
    let impactX = shot.startX;
    let impactY = shot.startY;

    for (let t = 0; t <= 2.4; t += 0.018) {
      const x = shot.startX + shot.vx * t + shot.wind * t * t;
      const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
      const point = { x, y };
      hit = this.checkHit(lastPoint, point, target);
      if (hit) {
        impactT = t;
        impactX = x;
        impactY = y;
        break;
      }
      if (y >= DUEL.groundY) {
        impactT = t;
        impactX = x;
        impactY = DUEL.groundY;
        break;
      }
      if (y > DUEL.groundY + 60 || x < -120 || x > this.width + 120) {
        impactT = t;
        impactX = x;
        impactY = y;
        break;
      }
      lastPoint = point;
    }

    const result = hit || { part: "miss", damage: 0, label: "мимо" };
    return {
      ...shot,
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      angle,
      power,
      target: targetRole,
      hitPart: result.part,
      damage: result.damage,
      hitLabel: result.label,
      impactT,
      impactX,
      impactY,
    };
  }

  checkHit(a, b, zones) {
    for (const zone of zones) {
      if (zone.type === "circle" && this.segmentHitsCircle(a, b, zone)) {
        return zone;
      }
      if (zone.type === "rect" && this.segmentHitsRect(a, b, zone)) {
        return zone;
      }
    }
    return null;
  }

  segmentHitsCircle(a, b, circle) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const acx = circle.x - a.x;
    const acy = circle.y - a.y;
    const ab2 = abx * abx + aby * aby || 1;
    const t = clamp((acx * abx + acy * aby) / ab2, 0, 1);
    const px = a.x + abx * t;
    const py = a.y + aby * t;
    const dx = px - circle.x;
    const dy = py - circle.y;
    return dx * dx + dy * dy <= circle.r * circle.r;
  }

  segmentHitsRect(a, b, rect) {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return true;
    }
    return false;
  }

  getTargetZones(role) {
    const pos = this.getPlayerPosition(role);
    const centerX = pos.x;
    return [
      { type: "circle", part: "head", label: "голова", damage: 35, x: centerX, y: pos.y - 126, r: 26 },
      { type: "rect", part: "body", label: "тело", damage: 24, x: centerX - 28, y: pos.y - 104, w: 56, h: 58 },
      { type: "rect", part: "arm", label: "рука", damage: 14, x: centerX - 48, y: pos.y - 106, w: 96, h: 28 },
      { type: "rect", part: "leg", label: "нога", damage: 14, x: centerX - 34, y: pos.y - 48, w: 68, h: 46 },
    ];
  }

  async shootWithAim(angle, power) {
    if (!this.room || this.room.phase !== "playing") return;
    if (!this.localMode && this.room.turn !== this.role) return;
    if (this.localMode && this.room.turn !== "p1") return;

    const shooter = this.localMode ? this.room.turn : this.role;
    const shot = this.simulateShot(this.room, shooter, angle, power);
    const targetRole = shot.target;

    if (this.localMode) {
      this.applyShotLocal(shot);
      if (this.room.phase === "playing" && this.room.turn === "p2") {
        window.setTimeout(() => this.enemyShootLocal(), 900);
      }
      return;
    }

    await this.roomRef.transaction((room) => {
      if (!room || room.phase !== "playing" || room.turn !== this.role) return room;
      return this.applyShotToRoom(room, shot, targetRole);
    });
  }

  enemyShootLocal() {
    if (!this.room || this.room.phase !== "playing" || this.room.turn !== "p2") return;
    const angle = 18 + Math.floor(Math.random() * 34);
    const power = 46 + Math.floor(Math.random() * 44);
    const shot = this.simulateShot(this.room, "p2", angle, power);
    this.applyShotLocal(shot);
  }

  applyShotLocal(shot) {
    this.room = this.applyShotToRoom(this.room, shot, shot.target);
    if (this.room.lastShot && this.room.lastShot.id !== this.lastShotId) {
      this.lastShotId = this.room.lastShot.id;
      this.shotAnimation = {
        shot: this.ensureShotImpact(this.room.lastShot),
        start: performance.now(),
      };
    }
    this.updateStatusFromRoom();
  }

  ensureShotImpact(shot) {
    if (!shot) return shot;
    if (typeof shot.impactT === "number" && typeof shot.impactX === "number") return shot;
    const wind = Number(shot.wind || 0);
    let impactT = 1.2;
    let impactX = shot.startX;
    let impactY = shot.startY;
    for (let t = 0; t <= 2.4; t += 0.018) {
      const x = shot.startX + shot.vx * t + wind * t * t;
      const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
      impactT = t;
      impactX = x;
      impactY = y;
      if (shot.damage > 0) {
        const zones = this.getTargetZones(shot.target);
        const prev = {
          x: shot.startX + shot.vx * Math.max(0, t - 0.018) + wind * Math.max(0, t - 0.018) ** 2,
          y: shot.startY + shot.vy * Math.max(0, t - 0.018) + 0.5 * DUEL.gravity * Math.max(0, t - 0.018) ** 2,
        };
        if (this.checkHit(prev, { x, y }, zones)) break;
      } else if (y >= DUEL.groundY || x < -120 || x > this.width + 120) {
        if (y >= DUEL.groundY) impactY = DUEL.groundY;
        break;
      }
    }
    return { ...shot, impactT, impactX, impactY };
  }

  applyShotToRoom(room, shot, targetRole) {
    const next = JSON.parse(JSON.stringify(room));
    const target = next.players?.[targetRole];
    if (!target) return room;

    target.hp = clamp(Number(target.hp || 0) - Number(shot.damage || 0), 0, DUEL.maxHp);
    next.lastShot = shot;
    next.shotIndex = Number(next.shotIndex || 0) + 1;
    next.wind = Math.round((Math.random() * 2 - 1) * 32);

    if (target.hp <= 0) {
      next.phase = "finished";
      next.winner = shot.shooter;
    } else {
      next.turn = targetRole;
    }

    return next;
  }

  loop(time) {
    const dt = this.lastFrameTime ? Math.min(0.05, (time - this.lastFrameTime) / 1000) : 0.016;
    this.lastFrameTime = time;
    this.now = time;
    this.idleTime = time / 1000;
    this.updateFx(dt);
    this.render(time);
    requestAnimationFrame((next) => this.loop(next));
  }

  updateFx(dt) {
    this.shake *= DUEL.shakeDecay;
    if (this.shake < 0.15) this.shake = 0;
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.8);

    for (const cloud of this.clouds) {
      cloud.x += cloud.speed * dt;
      if (cloud.x > this.width + 140) cloud.x = -160;
    }

    this.particles = this.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.vx *= 0.985;
      return p.life > 0;
    });

    this.floatTexts = this.floatTexts.filter((f) => {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= 0.98;
      f.opacity = clamp(f.life / f.maxLife, 0, 1);
      return f.life > 0;
    });

    this.stuckArrows = this.stuckArrows.filter((a) => {
      a.life -= dt;
      return a.life > 0;
    });
  }

  spawnHitFx(shot) {
    if (!shot || this.fxTriggeredForShot === shot.id) return;
    this.fxTriggeredForShot = shot.id;

    const x = Number(shot.impactX ?? shot.startX);
    const y = Number(shot.impactY ?? shot.startY);
    const isHit = Number(shot.damage || 0) > 0;
    const part = shot.hitPart || "miss";
    const colors = HIT_COLORS[part] || HIT_COLORS.miss;
    const count = isHit ? (part === "head" ? 22 : 14) : 8;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const speed = (isHit ? 120 : 70) + Math.random() * (isHit ? 180 : 90);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        gravity: 420,
        life: 0.35 + Math.random() * 0.45,
        size: 2.5 + Math.random() * (isHit ? 4.5 : 2.5),
        color: colors[i % colors.length],
        shape: Math.random() > 0.55 ? "spark" : "dot",
      });
    }

    if (isHit) {
      this.shake = part === "head" ? 9 : 5.5;
      this.hitFlash = part === "head" ? 0.55 : 0.32;
      this.floatTexts.push({
        text: `-${shot.damage}`,
        sub: shot.hitLabel || "",
        x,
        y: y - 18,
        vy: -70,
        life: 1.15,
        maxLife: 1.15,
        opacity: 1,
        color: part === "head" ? "#d62828" : "#c45c26",
      });
    } else {
      this.floatTexts.push({
        text: "Мимо",
        sub: "",
        x,
        y: y - 12,
        vy: -42,
        life: 0.9,
        maxLife: 0.9,
        opacity: 1,
        color: "#446387",
      });
      if (y >= DUEL.groundY - 8) {
        const facing = shot.vx >= 0 ? 1 : -1;
        this.stuckArrows.push({
          x,
          y: DUEL.groundY,
          angle: facing > 0 ? 0.55 : Math.PI - 0.55,
          life: 4.5,
        });
        if (this.stuckArrows.length > 6) this.stuckArrows.shift();
      }
    }
  }

  getArrowPose(shot, t) {
    const wind = Number(shot.wind || 0);
    const x = shot.startX + shot.vx * t + wind * t * t;
    const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
    const nextT = t + 0.02;
    const nx = shot.startX + shot.vx * nextT + wind * nextT * nextT;
    const ny = shot.startY + shot.vy * nextT + 0.5 * DUEL.gravity * nextT * nextT;
    return { x, y, angle: Math.atan2(ny - y, nx - x) };
  }

  render(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const shakeX = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    const shakeY = this.shake ? (Math.random() - 0.5) * this.shake * 2 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawBackground(ctx);

    if (!this.room) {
      this.drawCenterMessage(ctx, "Дуэль из лука", "Создай комнату или подключись по коду.");
      ctx.restore();
      return;
    }

    this.drawStuckArrows(ctx);
    this.drawHUD(ctx);
    this.drawPlayer(ctx, "p1");
    this.drawPlayer(ctx, "p2");
    this.drawAiming(ctx);
    this.drawShot(ctx, time);
    this.drawParticles(ctx);
    this.drawFloatTexts(ctx);
    this.drawRoomState(ctx);
    this.drawVictoryOverlay(ctx);

    if (this.hitFlash > 0) {
      ctx.fillStyle = `rgba(255, 120, 80, ${this.hitFlash * 0.22})`;
      ctx.fillRect(-20, -20, this.width + 40, this.height + 40);
    }

    ctx.restore();
  }

  drawBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#dff4ff");
    sky.addColorStop(0.45, "#cfe8ff");
    sky.addColorStop(1, "#b7d7f4");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    // Soft sun glow
    const sun = ctx.createRadialGradient(920, 70, 8, 920, 70, 120);
    sun.addColorStop(0, "rgba(255, 236, 170, 0.95)");
    sun.addColorStop(0.35, "rgba(255, 220, 140, 0.35)");
    sun.addColorStop(1, "rgba(255, 220, 140, 0)");
    ctx.fillStyle = sun;
    ctx.beginPath();
    ctx.arc(920, 70, 120, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud.x, cloud.y, cloud.s);
    }

    // Distant hills
    ctx.fillStyle = "rgba(120, 168, 205, 0.28)";
    ctx.beginPath();
    ctx.moveTo(0, DUEL.groundY - 38);
    ctx.quadraticCurveTo(180, DUEL.groundY - 92, 360, DUEL.groundY - 44);
    ctx.quadraticCurveTo(560, DUEL.groundY - 110, 760, DUEL.groundY - 40);
    ctx.quadraticCurveTo(940, DUEL.groundY - 88, this.width, DUEL.groundY - 52);
    ctx.lineTo(this.width, DUEL.groundY + 8);
    ctx.lineTo(0, DUEL.groundY + 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(141, 178, 211, 0.42)";
    for (let x = 20; x < this.width; x += 112) {
      const h = 82 + ((x / 112) % 4) * 25;
      const top = DUEL.groundY - 170 - h * 0.3;
      roundedRectPath(ctx, x, top, 74, h, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.42)";
      for (let wy = top + 14; wy < DUEL.groundY - 80; wy += 18) {
        for (let wx = x + 12; wx < x + 62; wx += 18) {
          const blink = (Math.sin(this.idleTime * 1.4 + wx * 0.08 + wy * 0.05) + 1) * 0.5;
          if (blink > 0.35) ctx.fillRect(wx, wy, 7, 10);
        }
      }
      ctx.fillStyle = "rgba(141, 178, 211, 0.42)";
    }

    const ground = ctx.createLinearGradient(0, DUEL.groundY, 0, this.height);
    ground.addColorStop(0, "#8fbeda");
    ground.addColorStop(0.35, "#7aabcc");
    ground.addColorStop(1, "#6a98bc");
    ctx.fillStyle = ground;
    ctx.fillRect(0, DUEL.groundY, this.width, this.height - DUEL.groundY);

    ctx.fillStyle = "#6e9bc4";
    ctx.fillRect(0, DUEL.groundY + 18, this.width, 12);

    ctx.strokeStyle = "rgba(255,255,255,0.38)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < this.width; x += 48) {
      const wobble = Math.sin(this.idleTime * 0.8 + x * 0.04) * 1.5;
      ctx.moveTo(x, DUEL.groundY + 45 + wobble);
      ctx.lineTo(x + 18, DUEL.groundY + 54 + wobble);
    }
    ctx.stroke();

    // Soft ground highlight under arena
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.ellipse(this.width / 2, DUEL.groundY + 8, 360, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCloud(ctx, x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.arc(22, -6, 24, 0, Math.PI * 2);
    ctx.arc(48, 2, 16, 0, Math.PI * 2);
    ctx.arc(28, 10, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawHUD(ctx) {
    const p1 = this.room.players?.p1 || {};
    const p2 = this.room.players?.p2 || {};
    this.drawHpPanel(ctx, 18, 16, p1, "p1");
    this.drawHpPanel(ctx, this.width - 318, 16, p2, "p2");

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, this.width / 2 - 128, 16, 256, 78, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(33, 88, 140, 0.12)";
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, this.width / 2 - 128, 16, 256, 78, 14);
    ctx.stroke();

    ctx.fillStyle = "#213a58";
    ctx.font = "800 17px Inter, sans-serif";
    ctx.textAlign = "center";
    const turnName = this.room.turn === "p1" ? p1.name || "Игрок 1" : p2.name || "Игрок 2";
    ctx.fillText(`Ход: ${turnName}`, this.width / 2, 40);

    const wind = Number(this.room.wind || 0);
    this.drawWindGlyph(ctx, this.width / 2, 68, wind);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawWindGlyph(ctx, cx, cy, wind) {
    const strength = Math.abs(wind);
    const dir = wind === 0 ? 0 : wind > 0 ? 1 : -1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "#446387";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`Ветер ${strength || "0"}`, 0, 18);

    ctx.strokeStyle = strength ? "rgba(47, 146, 214, 0.95)" : "rgba(100, 130, 160, 0.45)";
    ctx.fillStyle = strength ? "rgba(47, 146, 214, 0.95)" : "rgba(100, 130, 160, 0.45)";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";

    const len = 18 + Math.min(34, strength * 1.1);
    if (!dir) {
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(12, -4);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(-dir * len * 0.5, -4);
      ctx.lineTo(dir * len * 0.5, -4);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(dir * len * 0.5, -4);
      ctx.lineTo(dir * len * 0.5 - dir * 8, -10);
      ctx.lineTo(dir * len * 0.5 - dir * 8, 2);
      ctx.closePath();
      ctx.fill();

      // Feather marks to sell "wind"
      for (let i = 0; i < Math.min(3, Math.ceil(strength / 12)); i++) {
        const fx = -dir * len * 0.35 + dir * i * 10;
        ctx.globalAlpha = 0.45;
        ctx.beginPath();
        ctx.moveTo(fx, -4);
        ctx.quadraticCurveTo(fx + dir * 4, -12 - i, fx + dir * 10, -8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawHpPanel(ctx, x, y, player, role) {
    const hp = clamp(Number(player?.hp ?? DUEL.maxHp), 0, DUEL.maxHp);
    const active = this.room?.phase === "playing" && this.room.turn === role;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, x, y, 300, 72, 14);
    ctx.fill();
    if (active) {
      ctx.strokeStyle = "rgba(13, 138, 229, 0.55)";
      ctx.lineWidth = 2.5;
      roundedRectPath(ctx, x, y, 300, 72, 14);
      ctx.stroke();
    }
    ctx.fillStyle = "#213a58";
    ctx.font = "800 18px Inter, sans-serif";
    ctx.fillText(`${role === "p1" ? "1" : "2"}. ${player?.name || "Ожидание"}`, x + 12, y + 25);
    ctx.fillStyle = "rgba(190,70,70,0.18)";
    roundedRectPath(ctx, x + 12, y + 42, 276, 12, 7);
    ctx.fill();
    const hpColor = hp > 40 ? "#2fa56c" : hp > 18 ? "#e1a22f" : "#d94d4d";
    ctx.fillStyle = hpColor;
    roundedRectPath(ctx, x + 12, y + 42, Math.max(0, 276 * (hp / DUEL.maxHp)), 12, 7);
    ctx.fill();
    if (hp > 0 && hp <= 18) {
      ctx.globalAlpha = 0.35 + Math.sin(this.idleTime * 8) * 0.2;
      ctx.fillStyle = "#ff6b6b";
      roundedRectPath(ctx, x + 12, y + 42, Math.max(0, 276 * (hp / DUEL.maxHp)), 12, 7);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#365a80";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText(`${hp} / ${DUEL.maxHp}`, x + 12, y + 66);
    ctx.restore();
  }

  getVisualFrame(role) {
    if (!this.room?.players?.[role]) return "preview";
    if (this.room.phase === "finished") {
      if (this.room.winner === role) {
        const frames = ["jump", "run2", "run3", "run4"];
        return frames[Math.floor(this.idleTime * 6) % frames.length];
      }
      return "hurt";
    }
    if (this.shotAnimation?.shot?.target === role && Number(this.shotAnimation.shot.damage || 0) > 0) {
      const shot = this.shotAnimation.shot;
      const elapsed = (this.now || 0) - this.shotAnimation.start;
      const visualT = (elapsed / DUEL.arrowLifeMs) * 1.55;
      if (visualT >= Number(shot.impactT ?? 0)) return "hurt";
    }
    if (this.room.phase === "playing" && this.room.turn === role) {
      if (this.dragging && this.currentShooterRole() === role) return "land";
      const frames = ["run1", "run2", "run3", "run4"];
      return frames[Math.floor(this.idleTime * 7) % frames.length];
    }
    const frames = ["run1", "run2", "run3", "run4"];
    return frames[Math.floor(this.idleTime * 4.5 + (role === "p1" ? 0 : 1.7)) % frames.length];
  }

  drawPlayer(ctx, role) {
    const player = this.room.players?.[role];
    if (!player) {
      if (role === "p2") this.drawWaitingSilhouette(ctx);
      return;
    }

    const pos = this.getPlayerPosition(role);
    const characterId = player.character || "gip";
    const sprites = this.sprites[characterId] || {};
    const frame = this.getVisualFrame(role);
    const image = sprites[frame] || sprites.run1 || sprites.preview;
    const w = DUEL.charW;
    const h = frame === "land" ? DUEL.charH * 0.92 : frame === "jump" ? DUEL.charH * 1.04 : DUEL.charH;
    const bob = Math.sin(this.idleTime * 3.2 + (role === "p1" ? 0 : Math.PI)) * 2.2;
    const victoryLift = this.room.phase === "finished" && this.room.winner === role
      ? Math.abs(Math.sin(this.idleTime * 6)) * 10
      : 0;

    ctx.save();
    ctx.fillStyle = "rgba(35,64,92,0.18)";
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 48 - victoryLift * 0.4, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (image) {
      ctx.translate(pos.x, pos.y + bob - victoryLift);
      if (role === "p2") ctx.scale(-1, 1);
      const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      ctx.drawImage(image, -drawW / 2, -drawH, drawW, drawH);
      if (this.room.phase !== "finished") this.drawBowOverlay(ctx, role, drawW, drawH);
    } else {
      ctx.fillStyle = role === "p1" ? "#1f5d8c" : "#8c4b1f";
      roundedRectPath(ctx, pos.x - 24, pos.y - 112, 48, 90, 16);
      ctx.fill();
      ctx.fillStyle = "#efc49e";
      ctx.beginPath();
      ctx.arc(pos.x, pos.y - 128, 22, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBowOverlay(ctx, role, drawW, drawH) {
    const active = this.room?.phase === "playing" && this.room.turn === role && this.canControlShot();
    const localAim = active && this.dragging && this.currentShooterRole() === role ? this.aim : null;
    const tension = localAim ? clamp(localAim.power / 100, 0, 1) : 0.25 + Math.sin(this.idleTime * 4) * 0.035;
    const bowX = drawW * 0.34;
    const bowY = -drawH * 0.54;
    const bowH = 54;
    const pull = 12 + tension * 28;
    const charged = tension > 0.78;

    ctx.save();
    if (charged) {
      ctx.shadowColor = "rgba(255, 170, 60, 0.85)";
      ctx.shadowBlur = 14;
    }

    ctx.strokeStyle = charged ? "rgba(170, 78, 18, 0.98)" : "rgba(86, 45, 22, 0.95)";
    ctx.lineWidth = charged ? 5 : 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bowX, bowY - bowH / 2);
    ctx.quadraticCurveTo(bowX + 18, bowY, bowX, bowY + bowH / 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = charged ? "rgba(80, 40, 10, 0.9)" : "rgba(32, 32, 36, 0.82)";
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(bowX, bowY - bowH / 2);
    ctx.lineTo(bowX - pull, bowY);
    ctx.lineTo(bowX, bowY + bowH / 2);
    ctx.stroke();

    if (localAim) {
      // Hide nocked arrow while aiming — flying arrow will appear on release
      ctx.restore();
      return;
    }

    ctx.strokeStyle = "rgba(246, 235, 193, 0.95)";
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(bowX - pull - 8, bowY);
    ctx.lineTo(bowX + 26, bowY);
    ctx.stroke();

    ctx.fillStyle = "#d79b35";
    ctx.beginPath();
    ctx.moveTo(bowX + 29, bowY);
    ctx.lineTo(bowX + 17, bowY - 5);
    ctx.lineTo(bowX + 17, bowY + 5);
    ctx.closePath();
    ctx.fill();

    // Fletching
    ctx.fillStyle = "rgba(62, 126, 184, 0.9)";
    ctx.beginPath();
    ctx.moveTo(bowX - pull - 4, bowY);
    ctx.lineTo(bowX - pull - 12, bowY - 5);
    ctx.lineTo(bowX - pull - 8, bowY);
    ctx.lineTo(bowX - pull - 12, bowY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawWaitingSilhouette(ctx) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.52)";
    roundedRectPath(ctx, DUEL.p2X - 72, DUEL.groundY - 160, 144, 156, 20);
    ctx.fill();
    ctx.fillStyle = "#4d6c8a";
    ctx.font = "800 15px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Ждём игрока", DUEL.p2X, DUEL.groundY - 78);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawAiming(ctx) {
    if (!this.room || this.room.phase !== "playing") return;
    if (!this.canControlShot()) return;

    const role = this.currentShooterRole();
    const start = this.getShotStart(role);
    const aim = this.aim;

    ctx.save();
    ctx.setLineDash([]);

    if (!aim) {
      const pulse = 0.62 + Math.sin(this.idleTime * 3.5) * 0.12;
      ctx.fillStyle = `rgba(255,255,255,${pulse})`;
      roundedRectPath(ctx, start.x - 92, start.y + 34, 184, 34, 10);
      ctx.fill();
      ctx.fillStyle = "#365a80";
      ctx.font = "700 13px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Зажми и оттяни назад", start.x, start.y + 56);
      ctx.textAlign = "left";
      ctx.restore();
      return;
    }

    this.drawTrajectoryPreview(ctx, role, aim);

    const visiblePull = Math.min(64, aim.pull);
    const dirLen = Math.max(1, Math.sqrt((aim.startX - aim.endX) ** 2 + (aim.startY - aim.endY) ** 2));
    const ux = (aim.endX - aim.startX) / dirLen;
    const uy = (aim.endY - aim.startY) / dirLen;
    const px = aim.startX + ux * visiblePull;
    const py = aim.startY + uy * visiblePull;

    ctx.strokeStyle = aim.power > 78 ? "rgba(213, 129, 46, 0.7)" : "rgba(25, 71, 118, 0.5)";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(aim.startX, aim.startY);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.fillStyle = aim.power > 78 ? "rgba(213, 129, 46, 0.95)" : "rgba(47, 146, 214, 0.95)";
    ctx.beginPath();
    ctx.arc(px, py, 5.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundedRectPath(ctx, aim.startX - 62, aim.startY + 42, 124, 48, 10);
    ctx.fill();
    ctx.fillStyle = "#194776";
    ctx.font = "800 13px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`${aim.angle}° / ${aim.power}%`, aim.startX, aim.startY + 60);
    ctx.fillStyle = "rgba(25,71,118,0.18)";
    roundedRectPath(ctx, aim.startX - 48, aim.startY + 68, 96, 7, 4);
    ctx.fill();
    ctx.fillStyle = aim.power > 78 ? "#d5812e" : "#2f92d6";
    roundedRectPath(ctx, aim.startX - 48, aim.startY + 68, 96 * (aim.power / 100), 7, 4);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawTrajectoryPreview(ctx, role, aim) {
    const draft = this.makeShot(role, aim.angle, aim.power);
    ctx.save();
    for (let i = 1; i <= 18; i++) {
      const t = i * 0.045;
      const pose = this.getArrowPose(draft, t);
      if (pose.y > DUEL.groundY + 4 || pose.x < -40 || pose.x > this.width + 40) break;
      const alpha = 0.42 * (1 - i / 20);
      ctx.fillStyle = aim.power > 78
        ? `rgba(213, 129, 46, ${alpha})`
        : `rgba(47, 146, 214, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, Math.max(1.6, 3.2 - i * 0.08), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawShot(ctx, time) {
    if (!this.shotAnimation) return;
    const elapsed = time - this.shotAnimation.start;
    const shot = this.shotAnimation.shot;
    const impactT = Number(shot.impactT ?? 1.2);
    const visualT = (elapsed / DUEL.arrowLifeMs) * 1.55;
    const flying = visualT < impactT;

    if (!flying && this.fxTriggeredForShot !== shot.id) {
      this.spawnHitFx(shot);
    }

    if (elapsed > DUEL.arrowLifeMs + 280) {
      this.shotAnimation = null;
      return;
    }

    if (!flying) return;

    // Motion trail
    ctx.save();
    for (let i = DUEL.trailLength; i >= 1; i--) {
      const trailT = Math.max(0, visualT - i * 0.018);
      const pose = this.getArrowPose(shot, trailT);
      const alpha = 0.08 + (1 - i / DUEL.trailLength) * 0.28;
      ctx.strokeStyle = `rgba(92, 60, 31, ${alpha})`;
      ctx.lineWidth = 2 + (1 - i / DUEL.trailLength) * 2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pose.x, pose.y);
      const next = this.getArrowPose(shot, trailT + 0.012);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }

    // Soft glow smear
    const tip = this.getArrowPose(shot, visualT);
    const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 18);
    glow.addColorStop(0, "rgba(255, 220, 140, 0.35)");
    glow.addColorStop(1, "rgba(255, 220, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawArrowSprite(ctx, tip.x, tip.y, tip.angle);
  }

  drawArrowSprite(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.strokeStyle = "#5c3c1f";
    ctx.lineWidth = 3.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-26, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();

    ctx.fillStyle = "#c78a2e";
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.lineTo(14, -6);
    ctx.lineTo(14, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#3e7eb8";
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-30, -6);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-30, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d94d4d";
    ctx.beginPath();
    ctx.moveTo(-18, 0);
    ctx.lineTo(-26, -5);
    ctx.lineTo(-22, 0);
    ctx.lineTo(-26, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawStuckArrows(ctx) {
    for (const arrow of this.stuckArrows) {
      const alpha = clamp(arrow.life / 1.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      this.drawArrowSprite(ctx, arrow.x, arrow.y - 4, arrow.angle);
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      const alpha = clamp(p.life * 2.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y);
      if (p.shape === "spark") {
        ctx.rotate(p.life * 8);
        ctx.fillRect(-p.size * 0.35, -p.size, p.size * 0.7, p.size * 2);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawFloatTexts(ctx) {
    for (const f of this.floatTexts) {
      ctx.save();
      ctx.globalAlpha = f.opacity;
      ctx.textAlign = "center";
      ctx.font = "900 28px Inter, sans-serif";
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.fillText(f.text, f.x + 1, f.y + 2);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      if (f.sub) {
        ctx.font = "700 13px Inter, sans-serif";
        ctx.fillStyle = "#365a80";
        ctx.fillText(f.sub, f.x, f.y + 18);
      }
      ctx.textAlign = "left";
      ctx.restore();
    }
  }

  drawVictoryOverlay(ctx) {
    if (!this.room || this.room.phase !== "finished") return;
    const winnerRole = this.room.winner;
    const winner = this.room.players?.[winnerRole];
    const title = winnerRole === this.role || (this.localMode && winnerRole === "p1")
      ? "Победа!"
      : this.localMode
        ? "Поражение"
        : winnerRole
          ? "Поражение"
          : "Конец дуэли";
    const subtitle = winner?.name ? `Победитель: ${winner.name}` : "Дуэль завершена";
    const pulse = 0.88 + Math.sin(this.idleTime * 3) * 0.06;

    ctx.save();
    ctx.fillStyle = `rgba(18, 42, 68, ${0.18 + Math.sin(this.idleTime * 2) * 0.03})`;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    roundedRectPath(ctx, this.width / 2 - 210, 150, 420, 110, 18);
    ctx.fill();
    ctx.strokeStyle = "rgba(13, 138, 229, 0.35)";
    ctx.lineWidth = 2;
    roundedRectPath(ctx, this.width / 2 - 210, 150, 420, 110, 18);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.fillStyle = title === "Победа!" ? "#1f8a4c" : "#194776";
    ctx.font = "900 36px Inter, sans-serif";
    ctx.fillText(title, this.width / 2, 198);
    ctx.fillStyle = "#446387";
    ctx.font = "700 16px Inter, sans-serif";
    ctx.fillText(subtitle, this.width / 2, 230);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawRoomState(ctx) {
    if (!this.room?.lastShot || this.room.phase === "finished") return;
    const shot = this.room.lastShot;
    const text = shot.damage > 0 ? `Попадание: ${shot.hitLabel}, -${shot.damage} HP` : "Промах";
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, this.width / 2 - 170, this.height - 76, 340, 46, 12);
    ctx.fill();
    ctx.fillStyle = shot.damage > 0 ? "#b43636" : "#365a80";
    ctx.font = "800 16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, this.width / 2, this.height - 48);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawCenterMessage(ctx, title, subtitle) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, this.width / 2 - 290, this.height / 2 - 70, 580, 140, 18);
    ctx.fill();
    ctx.fillStyle = "#194776";
    ctx.font = "800 30px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.width / 2, this.height / 2 - 18);
    ctx.fillStyle = "#446387";
    ctx.font = "600 17px Inter, sans-serif";
    ctx.fillText(subtitle, this.width / 2, this.height / 2 + 24);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

(function init() {
  const canvas = document.getElementById("archeryCanvas");
  if (!canvas) return;
  new ArcheryGame(canvas);
})();
