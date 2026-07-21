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
  groundY: 438,
  maxHp: 100,
  p1X: 168,
  p2X: 952,
  charW: 152,
  charH: 192,
  arrowLifeMs: 1180,
  maxPull: 155,
  minPullToShoot: 24,
  trailLength: 12,
  shakeDecay: 0.84,
};

const HIT_COLORS = {
  head: ["#ff5d5d", "#ffb347", "#ffe7a8"],
  body: ["#ff8a4c", "#ffc45c", "#ffe6b0"],
  arm: ["#e8a86a", "#f3d2a4", "#fff4e4"],
  leg: ["#e8a86a", "#f3d2a4", "#fff4e4"],
  miss: ["#c4b39a", "#ebe0cf", "#fff"],
};

const FONT_DISPLAY = '"Russo One", "Arial Black", sans-serif';
const FONT_UI = '"Manrope", "Segoe UI", sans-serif';

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
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.width = canvas.width;
    this.height = canvas.height;
    this.cache = new SpriteCache();
    this.sprites = {};
    if (this.ctx) {
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.imageSmoothingQuality = "high";
    }

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
    this.hitFlashColor = "rgba(220, 60, 40,";
    this.fxTriggeredForShot = null;
    this.hitReactUntil = { p1: 0, p2: 0 };
    this.recoilUntil = { p1: 0, p2: 0 };
    this.clouds = this.createClouds();
    this.grassBlades = this.createGrass();

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
      { x: 90, y: 78, s: 1.15, speed: 6.5, alpha: 0.55 },
      { x: 340, y: 54, s: 0.9, speed: 4.2, alpha: 0.4 },
      { x: 620, y: 88, s: 1.35, speed: 5.5, alpha: 0.5 },
      { x: 880, y: 48, s: 1.0, speed: 3.6, alpha: 0.38 },
      { x: 1040, y: 110, s: 0.75, speed: 5.8, alpha: 0.45 },
    ];
  }

  createGrass() {
    const blades = [];
    for (let x = 0; x < this.width; x += 7) {
      blades.push({
        x,
        h: 5 + ((x * 17) % 11),
        phase: (x * 0.07) % Math.PI,
        shade: (x * 13) % 3,
      });
    }
    return blades;
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
        const shot = this.ensureShotImpact(this.room.lastShot);
        this.shotAnimation = {
          shot,
          start: performance.now(),
        };
        if (shot?.shooter) {
          this.recoilUntil[shot.shooter] = performance.now() + 280;
        }
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
      x: pos.x + pos.facing * 62,
      y: pos.y - 118,
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
      { type: "circle", part: "head", label: "голова", damage: 35, x: centerX, y: pos.y - 148, r: 30 },
      { type: "rect", part: "body", label: "тело", damage: 24, x: centerX - 32, y: pos.y - 122, w: 64, h: 66 },
      { type: "rect", part: "arm", label: "рука", damage: 14, x: centerX - 54, y: pos.y - 124, w: 108, h: 32 },
      { type: "rect", part: "leg", label: "нога", damage: 14, x: centerX - 38, y: pos.y - 56, w: 76, h: 52 },
    ];
  }

  async shootWithAim(angle, power) {
    if (!this.room || this.room.phase !== "playing") return;
    if (!this.localMode && this.room.turn !== this.role) return;
    if (this.localMode && this.room.turn !== "p1") return;

    const shooter = this.localMode ? this.room.turn : this.role;
    this.recoilUntil[shooter] = (this.now || performance.now()) + 280;
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
    this.recoilUntil.p2 = (this.now || performance.now()) + 280;
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
    const count = isHit ? (part === "head" ? 26 : 16) : 9;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.45;
      const speed = (isHit ? 140 : 80) + Math.random() * (isHit ? 200 : 100);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 50,
        gravity: 460,
        life: 0.4 + Math.random() * 0.5,
        size: 2.8 + Math.random() * (isHit ? 5 : 2.8),
        color: colors[i % colors.length],
        shape: Math.random() > 0.5 ? "spark" : "dot",
      });
    }

    if (isHit) {
      this.shake = part === "head" ? 10 : 6;
      this.hitFlash = part === "head" ? 0.7 : 0.42;
      this.hitFlashColor = part === "head" ? "rgba(210, 35, 35," : "rgba(220, 110, 40,";
      this.hitReactUntil[shot.target] = (this.now || performance.now()) + 720;
      this.floatTexts.push({
        text: `-${shot.damage}`,
        sub: shot.hitLabel || "",
        x,
        y: y - 22,
        vy: -78,
        life: 1.2,
        maxLife: 1.2,
        opacity: 1,
        color: part === "head" ? "#ffd0d0" : "#ffe0c2",
      });
    } else {
      this.floatTexts.push({
        text: "Мимо",
        sub: "",
        x,
        y: y - 14,
        vy: -46,
        life: 0.95,
        maxLife: 0.95,
        opacity: 1,
        color: "#f0e6d4",
      });
      if (y >= DUEL.groundY - 8) {
        const facing = shot.vx >= 0 ? 1 : -1;
        this.stuckArrows.push({
          x,
          y: DUEL.groundY,
          angle: facing > 0 ? 0.55 : Math.PI - 0.55,
          life: 5,
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
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

    this.drawArenaMarkers(ctx);
    this.drawStuckArrows(ctx);
    this.drawPlayer(ctx, "p1");
    this.drawPlayer(ctx, "p2");
    this.drawAiming(ctx);
    this.drawShot(ctx, time);
    this.drawParticles(ctx);
    this.drawFloatTexts(ctx);
    this.drawHUD(ctx);
    this.drawRoomState(ctx);
    this.drawVictoryOverlay(ctx);

    if (this.hitFlash > 0) {
      ctx.fillStyle = `${this.hitFlashColor} ${this.hitFlash * 0.38})`;
      ctx.fillRect(-20, -20, this.width + 40, this.height + 40);
    }

    // Soft vignette for focus on arena
    const vig = ctx.createRadialGradient(this.width / 2, DUEL.groundY - 40, 180, this.width / 2, DUEL.groundY - 40, 720);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(20, 10, 8, 0.28)");
    ctx.fillStyle = vig;
    ctx.fillRect(-20, -20, this.width + 40, this.height + 40);

    ctx.restore();
  }

  drawBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#24182f");
    sky.addColorStop(0.22, "#5a3044");
    sky.addColorStop(0.48, "#c25a3c");
    sky.addColorStop(0.72, "#e39a52");
    sky.addColorStop(1, "#efc07a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    // Sun disc + glow
    const sunX = 930;
    const sunY = 98;
    const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 160);
    glow.addColorStop(0, "rgba(255, 230, 160, 0.95)");
    glow.addColorStop(0.35, "rgba(255, 170, 90, 0.35)");
    glow.addColorStop(1, "rgba(255, 140, 70, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 160, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffe7a8";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 28, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of this.clouds) {
      this.drawCloud(ctx, cloud.x, cloud.y, cloud.s, cloud.alpha);
    }

    // Far ridge
    ctx.fillStyle = "rgba(72, 42, 48, 0.55)";
    ctx.beginPath();
    ctx.moveTo(0, DUEL.groundY - 28);
    ctx.quadraticCurveTo(160, DUEL.groundY - 110, 340, DUEL.groundY - 42);
    ctx.quadraticCurveTo(560, DUEL.groundY - 128, 760, DUEL.groundY - 36);
    ctx.quadraticCurveTo(940, DUEL.groundY - 104, this.width, DUEL.groundY - 48);
    ctx.lineTo(this.width, DUEL.groundY + 10);
    ctx.lineTo(0, DUEL.groundY + 10);
    ctx.closePath();
    ctx.fill();

    // City silhouettes
    for (let x = 10; x < this.width; x += 108) {
      const h = 70 + ((x / 108) % 5) * 22;
      const top = DUEL.groundY - 150 - h * 0.28;
      ctx.fillStyle = "rgba(38, 24, 34, 0.72)";
      roundedRectPath(ctx, x, top, 70, h, 5);
      ctx.fill();
      for (let wy = top + 12; wy < DUEL.groundY - 70; wy += 16) {
        for (let wx = x + 10; wx < x + 58; wx += 16) {
          const lit = (Math.sin(this.idleTime * 1.1 + wx * 0.09 + wy * 0.04) + 1) * 0.5;
          if (lit > 0.55) {
            ctx.fillStyle = `rgba(255, 190, 110, ${0.25 + lit * 0.45})`;
            ctx.fillRect(wx, wy, 6, 8);
          }
        }
      }
    }

    // Ground
    const ground = ctx.createLinearGradient(0, DUEL.groundY, 0, this.height);
    ground.addColorStop(0, "#5d7a3d");
    ground.addColorStop(0.22, "#4a6432");
    ground.addColorStop(0.55, "#3a4f2a");
    ground.addColorStop(1, "#2c3b22");
    ctx.fillStyle = ground;
    ctx.fillRect(0, DUEL.groundY, this.width, this.height - DUEL.groundY);

    // Dirt strip
    ctx.fillStyle = "#6b5338";
    ctx.fillRect(0, DUEL.groundY, this.width, 10);
    ctx.fillStyle = "rgba(255, 210, 140, 0.18)";
    ctx.fillRect(0, DUEL.groundY, this.width, 3);

    // Grass blades
    for (const blade of this.grassBlades) {
      const sway = Math.sin(this.idleTime * 2.2 + blade.phase) * 2.2;
      const colors = ["#6f9148", "#587838", "#7ea352"];
      ctx.strokeStyle = colors[blade.shade];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(blade.x, DUEL.groundY + 1);
      ctx.quadraticCurveTo(blade.x + sway, DUEL.groundY - blade.h * 0.5, blade.x + sway * 1.4, DUEL.groundY - blade.h);
      ctx.stroke();
    }

    // Arena soft light pool
    const pool = ctx.createRadialGradient(this.width / 2, DUEL.groundY, 40, this.width / 2, DUEL.groundY, 420);
    pool.addColorStop(0, "rgba(255, 210, 140, 0.16)");
    pool.addColorStop(1, "rgba(255, 210, 140, 0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, DUEL.groundY - 30, this.width, 80);
  }

  drawCloud(ctx, x, y, scale, alpha = 0.5) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = `rgba(255, 220, 190, ${alpha})`;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.arc(24, -8, 26, 0, Math.PI * 2);
    ctx.arc(52, 2, 17, 0, Math.PI * 2);
    ctx.arc(28, 10, 18, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawArenaMarkers(ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(255, 230, 180, 0.18)";
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(this.width / 2, DUEL.groundY - 8);
    ctx.lineTo(this.width / 2, DUEL.groundY + 28);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const role of ["p1", "p2"]) {
      if (!this.room?.players?.[role]) continue;
      const pos = this.getPlayerPosition(role);
      const active = this.room.phase === "playing" && this.room.turn === role;
      ctx.fillStyle = active ? "rgba(255, 180, 80, 0.28)" : "rgba(20, 30, 18, 0.22)";
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y + 6, active ? 64 : 54, active ? 14 : 11, 0, 0, Math.PI * 2);
      ctx.fill();
      if (active) {
        ctx.strokeStyle = "rgba(255, 190, 90, 0.55)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(pos.x, pos.y + 6, 64 + Math.sin(this.idleTime * 4) * 2, 14, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  drawHUD(ctx) {
    const p1 = this.room.players?.p1 || {};
    const p2 = this.room.players?.p2 || {};
    this.drawHpPanel(ctx, 16, 14, p1, "p1");
    this.drawHpPanel(ctx, this.width - 316, 14, p2, "p2");

    ctx.save();
    this.drawGlassPanel(ctx, this.width / 2 - 132, 14, 264, 76);
    ctx.fillStyle = "#f7efe2";
    ctx.font = `800 15px ${FONT_UI}`;
    ctx.textAlign = "center";
    const turnName = this.room.turn === "p1" ? p1.name || "Игрок 1" : p2.name || "Игрок 2";
    const turnLabel = this.room.phase === "finished" ? "Дуэль окончена" : `Ход: ${turnName}`;
    ctx.fillText(turnLabel, this.width / 2, 38);
    const wind = Number(this.room.wind || 0);
    this.drawWindGlyph(ctx, this.width / 2, 62, wind);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawGlassPanel(ctx, x, y, w, h) {
    ctx.fillStyle = "rgba(18, 12, 16, 0.72)";
    roundedRectPath(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 210, 150, 0.18)";
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, x, y, w, h, 14);
    ctx.stroke();
  }

  drawWindGlyph(ctx, cx, cy, wind) {
    const strength = Math.abs(wind);
    const dir = wind === 0 ? 0 : wind > 0 ? 1 : -1;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.fillStyle = "rgba(247, 239, 226, 0.85)";
    ctx.font = `700 12px ${FONT_UI}`;
    ctx.textAlign = "center";
    ctx.fillText(`Ветер ${strength || "0"}`, 0, 18);

    ctx.strokeStyle = strength ? "rgba(255, 186, 92, 0.95)" : "rgba(180, 160, 140, 0.55)";
    ctx.fillStyle = strength ? "rgba(255, 186, 92, 0.95)" : "rgba(180, 160, 140, 0.55)";
    ctx.lineWidth = 2.6;
    ctx.lineCap = "round";

    const len = 18 + Math.min(36, strength * 1.15);
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
    }
    ctx.restore();
  }

  drawHpPanel(ctx, x, y, player, role) {
    const hp = clamp(Number(player?.hp ?? DUEL.maxHp), 0, DUEL.maxHp);
    const active = this.room?.phase === "playing" && this.room.turn === role;
    ctx.save();
    this.drawGlassPanel(ctx, x, y, 300, 72);
    if (active) {
      ctx.strokeStyle = "rgba(255, 180, 80, 0.75)";
      ctx.lineWidth = 2.4;
      roundedRectPath(ctx, x + 1, y + 1, 298, 70, 13);
      ctx.stroke();
    }
    ctx.fillStyle = "#f7efe2";
    ctx.font = `800 16px ${FONT_UI}`;
    ctx.fillText(`${role === "p1" ? "1" : "2"}. ${player?.name || "Ожидание"}`, x + 14, y + 26);

    ctx.fillStyle = "rgba(255,255,255,0.12)";
    roundedRectPath(ctx, x + 14, y + 40, 272, 12, 6);
    ctx.fill();
    const hpColor = hp > 40 ? "#4ecf84" : hp > 18 ? "#f0b44a" : "#ef5b5b";
    ctx.fillStyle = hpColor;
    roundedRectPath(ctx, x + 14, y + 40, Math.max(0, 272 * (hp / DUEL.maxHp)), 12, 6);
    ctx.fill();
    if (hp > 0 && hp <= 18) {
      ctx.globalAlpha = 0.4 + Math.sin(this.idleTime * 8) * 0.25;
      ctx.fillStyle = "#ff8080";
      roundedRectPath(ctx, x + 14, y + 40, Math.max(0, 272 * (hp / DUEL.maxHp)), 12, 6);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "rgba(247, 239, 226, 0.75)";
    ctx.font = `700 12px ${FONT_UI}`;
    ctx.fillText(`${hp} / ${DUEL.maxHp}`, x + 14, y + 66);
    ctx.restore();
  }

  getVisualFrame(role) {
    if (!this.room?.players?.[role]) return "preview";
    const now = this.now || 0;

    if (this.room.phase === "finished") {
      if (this.room.winner === role) {
        const frames = ["jump", "run2", "run3", "run4"];
        return frames[Math.floor(this.idleTime * 5.5) % frames.length];
      }
      return "hurt";
    }

    if ((this.hitReactUntil[role] || 0) > now) return "hurt";
    if (this.shotAnimation?.shot?.target === role && Number(this.shotAnimation.shot.damage || 0) > 0) {
      const shot = this.shotAnimation.shot;
      const elapsed = now - this.shotAnimation.start;
      const visualT = (elapsed / DUEL.arrowLifeMs) * 1.55;
      if (visualT >= Number(shot.impactT ?? 0)) return "hurt";
    }

    if ((this.recoilUntil[role] || 0) > now) return "land";

    if (this.room.phase === "playing" && this.room.turn === role) {
      if (this.dragging && this.currentShooterRole() === role) return "land";
      // Alert idle — keep face frames stable, avoid jogging-in-place
      return Math.sin(this.idleTime * 2.4) > 0.82 ? "run2" : "preview";
    }

    // Calm idle with rare micro-shift between standing frames
    return Math.sin(this.idleTime * 1.6 + (role === "p1" ? 0 : 1.3)) > 0.88 ? "run1" : "preview";
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
    const image = sprites[frame] || sprites.preview || sprites.run1;
    const phase = this.idleTime * (role === "p1" ? 1 : 1.07);
    const aiming = this.dragging && this.currentShooterRole() === role && this.room.turn === role;
    const hitReact = (this.hitReactUntil[role] || 0) > (this.now || 0);
    const victory = this.room.phase === "finished" && this.room.winner === role;

    const breath = 1 + Math.sin(phase * 2.6) * 0.012;
    const bob = aiming ? 1.5 : Math.sin(phase * 2.8) * 1.6;
    const sway = aiming ? 0 : Math.sin(phase * 1.3) * 1.4;
    const lean = aiming ? -0.045 * (this.aim?.power || 40) / 100 : Math.sin(phase * 1.1) * 0.012;
    const crouch = aiming ? 0.94 : frame === "land" ? 0.96 : 1;
    const victoryLift = victory ? Math.abs(Math.sin(this.idleTime * 5.5)) * 12 : 0;
    const hitNudge = hitReact ? Math.sin(this.idleTime * 40) * 2.2 : 0;

    const w = DUEL.charW;
    const h = DUEL.charH * crouch * (frame === "jump" ? 1.03 : 1);

    ctx.save();
    // Contact shadow (extra soft under feet; sprite may already include a small one)
    ctx.fillStyle = "rgba(20, 16, 10, 0.28)";
    ctx.beginPath();
    ctx.ellipse(pos.x + sway * 0.3, pos.y + 5, 56 - victoryLift * 0.5, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    if (image) {
      ctx.translate(pos.x + sway + hitNudge, pos.y + bob - victoryLift);
      ctx.rotate(lean * (role === "p2" ? -1 : 1));
      if (role === "p2") ctx.scale(-1, 1);
      ctx.scale(breath, 2 - breath);

      const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;

      // Warm key-light plate behind character (does not alter face pixels)
      const backlight = ctx.createRadialGradient(0, -drawH * 0.55, 8, 0, -drawH * 0.45, drawW * 0.85);
      backlight.addColorStop(0, "rgba(255, 190, 120, 0.22)");
      backlight.addColorStop(1, "rgba(255, 190, 120, 0)");
      ctx.fillStyle = backlight;
      ctx.beginPath();
      ctx.ellipse(0, -drawH * 0.5, drawW * 0.55, drawH * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.drawImage(image, -drawW / 2, -drawH, drawW, drawH);

      if (hitReact) {
        const flash = ctx.createRadialGradient(0, -drawH * 0.45, 6, 0, -drawH * 0.4, drawW * 0.7);
        flash.addColorStop(0, "rgba(220, 50, 40, 0.28)");
        flash.addColorStop(1, "rgba(220, 50, 40, 0)");
        ctx.fillStyle = flash;
        ctx.beginPath();
        ctx.ellipse(0, -drawH * 0.42, drawW * 0.42, drawH * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.room.phase !== "finished") this.drawBowOverlay(ctx, role, drawW, drawH, aiming);
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

  drawBowOverlay(ctx, role, drawW, drawH, aiming) {
    const localAim = aiming ? this.aim : null;
    const tension = localAim ? clamp(localAim.power / 100, 0, 1) : 0.22 + Math.sin(this.idleTime * 3.2) * 0.03;
    const bowX = drawW * 0.38;
    const bowY = -drawH * 0.5;
    const bowH = 62;
    const pull = 10 + tension * 32;
    const charged = tension > 0.78;
    const stringSag = aiming ? 0 : 5;

    ctx.save();
    if (charged) {
      ctx.shadowColor = "rgba(255, 170, 60, 0.9)";
      ctx.shadowBlur = 16;
    }

    // Bow limb
    const limb = ctx.createLinearGradient(bowX - 4, bowY, bowX + 20, bowY);
    limb.addColorStop(0, charged ? "#8a3a12" : "#5a2c14");
    limb.addColorStop(1, charged ? "#d4893a" : "#a56834");
    ctx.strokeStyle = limb;
    ctx.lineWidth = charged ? 5.5 : 4.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(bowX, bowY - bowH / 2);
    ctx.quadraticCurveTo(bowX + 22, bowY, bowX, bowY + bowH / 2);
    ctx.stroke();

    // Tips
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#d7b16a";
    ctx.beginPath();
    ctx.arc(bowX, bowY - bowH / 2, 2.4, 0, Math.PI * 2);
    ctx.arc(bowX, bowY + bowH / 2, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // String with natural curve
    ctx.strokeStyle = charged ? "rgba(70, 40, 20, 0.92)" : "rgba(40, 32, 28, 0.82)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bowX, bowY - bowH / 2);
    ctx.quadraticCurveTo(bowX - pull, bowY + stringSag * 0.2, bowX - pull, bowY);
    ctx.quadraticCurveTo(bowX - pull, bowY - stringSag * 0.2, bowX, bowY + bowH / 2);
    ctx.stroke();

    if (localAim) {
      ctx.restore();
      return;
    }

    // Nocked arrow
    ctx.strokeStyle = "#e8d7a8";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(bowX - pull - 6, bowY);
    ctx.lineTo(bowX + 30, bowY);
    ctx.stroke();

    ctx.fillStyle = "#e0a23a";
    ctx.beginPath();
    ctx.moveTo(bowX + 34, bowY);
    ctx.lineTo(bowX + 20, bowY - 5.5);
    ctx.lineTo(bowX + 20, bowY + 5.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#3f7fb6";
    ctx.beginPath();
    ctx.moveTo(bowX - pull - 2, bowY);
    ctx.lineTo(bowX - pull - 11, bowY - 5);
    ctx.lineTo(bowX - pull - 7, bowY);
    ctx.lineTo(bowX - pull - 11, bowY + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawWaitingSilhouette(ctx) {
    const x = DUEL.p2X;
    const y = DUEL.groundY;
    const pulse = 0.28 + Math.sin(this.idleTime * 2.4) * 0.08;
    ctx.save();
    ctx.fillStyle = "rgba(20, 16, 12, 0.25)";
    ctx.beginPath();
    ctx.ellipse(x, y + 5, 52, 11, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = pulse + 0.25;
    ctx.fillStyle = "rgba(230, 210, 185, 0.55)";
    // Body ghost
    roundedRectPath(ctx, x - 26, y - 118, 52, 78, 18);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y - 140, 24, 0, Math.PI * 2);
    ctx.fill();
    roundedRectPath(ctx, x - 34, y - 40, 28, 40, 10);
    ctx.fill();
    roundedRectPath(ctx, x + 6, y - 40, 28, 40, 10);
    ctx.fill();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = "#f3e7d4";
    ctx.font = `800 14px ${FONT_UI}`;
    ctx.textAlign = "center";
    ctx.fillText("Ждём игрока", x, y - 168);
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
    if (!aim) {
      const pulse = 0.55 + Math.sin(this.idleTime * 3.2) * 0.15;
      ctx.fillStyle = `rgba(18, 12, 16, ${pulse})`;
      roundedRectPath(ctx, start.x - 96, start.y + 36, 192, 34, 10);
      ctx.fill();
      ctx.fillStyle = "#f7efe2";
      ctx.font = `700 13px ${FONT_UI}`;
      ctx.textAlign = "center";
      ctx.fillText("Зажми и оттяни назад", start.x, start.y + 58);
      ctx.textAlign = "left";
      ctx.restore();
      return;
    }

    this.drawTrajectoryPreview(ctx, role, aim);

    const visiblePull = Math.min(68, aim.pull);
    const dirLen = Math.max(1, Math.sqrt((aim.startX - aim.endX) ** 2 + (aim.startY - aim.endY) ** 2));
    const ux = (aim.endX - aim.startX) / dirLen;
    const uy = (aim.endY - aim.startY) / dirLen;
    const px = aim.startX + ux * visiblePull;
    const py = aim.startY + uy * visiblePull;

    ctx.strokeStyle = aim.power > 78 ? "rgba(255, 170, 70, 0.8)" : "rgba(255, 220, 160, 0.55)";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(aim.startX, aim.startY);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.fillStyle = aim.power > 78 ? "#ffb24a" : "#ffe2b0";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    // Readout without bulky white card
    ctx.textAlign = "center";
    ctx.font = `800 16px ${FONT_UI}`;
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(20, 12, 10, 0.7)";
    ctx.fillStyle = "#fff4e4";
    const label = `${aim.angle}°  ${aim.power}%`;
    ctx.strokeText(label, aim.startX, aim.startY + 58);
    ctx.fillText(label, aim.startX, aim.startY + 58);

    ctx.fillStyle = "rgba(255,255,255,0.16)";
    roundedRectPath(ctx, aim.startX - 48, aim.startY + 68, 96, 7, 4);
    ctx.fill();
    ctx.fillStyle = aim.power > 78 ? "#ffb24a" : "#7ad0ff";
    roundedRectPath(ctx, aim.startX - 48, aim.startY + 68, 96 * (aim.power / 100), 7, 4);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawTrajectoryPreview(ctx, role, aim) {
    const draft = this.makeShot(role, aim.angle, aim.power);
    ctx.save();
    for (let i = 1; i <= 20; i++) {
      const t = i * 0.042;
      const pose = this.getArrowPose(draft, t);
      if (pose.y > DUEL.groundY + 4 || pose.x < -40 || pose.x > this.width + 40) break;
      const alpha = 0.5 * (1 - i / 22);
      ctx.fillStyle = aim.power > 78
        ? `rgba(255, 178, 74, ${alpha})`
        : `rgba(255, 230, 180, ${alpha})`;
      ctx.beginPath();
      ctx.arc(pose.x, pose.y, Math.max(1.5, 3.1 - i * 0.07), 0, Math.PI * 2);
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

    if (elapsed > DUEL.arrowLifeMs + 320) {
      this.shotAnimation = null;
      return;
    }

    if (!flying) return;

    ctx.save();
    for (let i = DUEL.trailLength; i >= 1; i--) {
      const trailT = Math.max(0, visualT - i * 0.016);
      const pose = this.getArrowPose(shot, trailT);
      const next = this.getArrowPose(shot, trailT + 0.01);
      const alpha = 0.06 + (1 - i / DUEL.trailLength) * 0.34;
      ctx.strokeStyle = `rgba(255, 210, 140, ${alpha})`;
      ctx.lineWidth = 1.5 + (1 - i / DUEL.trailLength) * 2.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pose.x, pose.y);
      ctx.lineTo(next.x, next.y);
      ctx.stroke();
    }

    const tip = this.getArrowPose(shot, visualT);
    const glow = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 20);
    glow.addColorStop(0, "rgba(255, 220, 140, 0.45)");
    glow.addColorStop(1, "rgba(255, 220, 140, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    this.drawArrowSprite(ctx, tip.x, tip.y, tip.angle);
  }

  drawArrowSprite(ctx, x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.strokeStyle = "#6a4422";
    ctx.lineWidth = 3.4;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();

    ctx.strokeStyle = "rgba(255, 230, 180, 0.35)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-24, -1);
    ctx.lineTo(18, -1);
    ctx.stroke();

    ctx.fillStyle = "#e0a23a";
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.lineTo(15, -6.5);
    ctx.lineTo(15, 6.5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#3f7fb6";
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-31, -6);
    ctx.lineTo(-26, 0);
    ctx.lineTo(-31, 6);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#d94d4d";
    ctx.beginPath();
    ctx.moveTo(-17, 0);
    ctx.lineTo(-26, -5);
    ctx.lineTo(-22, 0);
    ctx.lineTo(-26, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawStuckArrows(ctx) {
    for (const arrow of this.stuckArrows) {
      const alpha = clamp(arrow.life / 1.3, 0, 1);
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
      ctx.font = `900 34px ${FONT_DISPLAY}`;
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(20, 10, 8, 0.75)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
      if (f.sub) {
        ctx.font = `700 13px ${FONT_UI}`;
        ctx.lineWidth = 3;
        ctx.strokeText(f.sub, f.x, f.y + 18);
        ctx.fillStyle = "#f3e7d4";
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

    ctx.save();
    ctx.fillStyle = `rgba(12, 8, 10, ${0.28 + Math.sin(this.idleTime * 2) * 0.03})`;
    ctx.fillRect(0, 0, this.width, this.height);

    this.drawGlassPanel(ctx, this.width / 2 - 220, 142, 440, 118);
    ctx.textAlign = "center";
    ctx.font = `900 40px ${FONT_DISPLAY}`;
    ctx.fillStyle = title === "Победа!" ? "#ffd27a" : "#f0e2d0";
    ctx.fillText(title, this.width / 2, 198);
    ctx.fillStyle = "rgba(247, 239, 226, 0.82)";
    ctx.font = `700 16px ${FONT_UI}`;
    ctx.fillText(subtitle, this.width / 2, 232);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawRoomState(ctx) {
    if (!this.room?.lastShot || this.room.phase === "finished") return;
    const shot = this.room.lastShot;
    const text = shot.damage > 0 ? `Попадание: ${shot.hitLabel}, -${shot.damage} HP` : "Промах";
    ctx.save();
    this.drawGlassPanel(ctx, this.width / 2 - 180, this.height - 74, 360, 46);
    ctx.fillStyle = shot.damage > 0 ? "#ffb4a4" : "#f0e2d0";
    ctx.font = `800 15px ${FONT_UI}`;
    ctx.textAlign = "center";
    ctx.fillText(text, this.width / 2, this.height - 46);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawCenterMessage(ctx, title, subtitle) {
    ctx.save();
    this.drawGlassPanel(ctx, this.width / 2 - 290, this.height / 2 - 72, 580, 144);
    ctx.fillStyle = "#ffe2b0";
    ctx.font = `900 34px ${FONT_DISPLAY}`;
    ctx.textAlign = "center";
    ctx.fillText(title, this.width / 2, this.height / 2 - 12);
    ctx.fillStyle = "rgba(247, 239, 226, 0.85)";
    ctx.font = `600 16px ${FONT_UI}`;
    ctx.fillText(subtitle, this.width / 2, this.height / 2 + 28);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

(function init() {
  const canvas = document.getElementById("archeryCanvas");
  if (!canvas) return;
  new ArcheryGame(canvas);
})();
