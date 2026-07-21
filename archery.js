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
  charW: 132,
  charH: 168,
  arrowLifeMs: 1180,
  maxPull: 155,
  minPullToShoot: 24,
  shootPoseMs: 520,
  hurtPoseMs: 640,
  winPoseMs: 999999,
};

const DUEL_FRAMES = ["idle", "aim", "shoot", "hurt", "win"];

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
    const loaded = {};
    for (const frame of DUEL_FRAMES) {
      loaded[frame] = await loadImage(`${character.path}/duel/${frame}.png`);
    }
    // Soft fallbacks if a duel frame is missing.
    loaded.preview = await loadImage(character.preview);
    if (!loaded.idle) loaded.idle = loaded.preview;
    if (!loaded.aim) loaded.aim = loaded.idle;
    if (!loaded.shoot) loaded.shoot = loaded.aim;
    if (!loaded.hurt) loaded.hurt = loaded.idle;
    if (!loaded.win) loaded.win = loaded.idle;
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
    this.poseUntil = { p1: 0, p2: 0 };
    this.poseName = { p1: "idle", p2: "idle" };
    this.hitFlash = { p1: 0, p2: 0 };
    this.particles = [];
    this.clouds = Array.from({ length: 6 }, (_, i) => ({
      x: 80 + i * 180 + Math.random() * 40,
      y: 36 + Math.random() * 70,
      scale: 0.55 + Math.random() * 0.7,
      speed: 8 + Math.random() * 12,
    }));

    this.playerName = normalizeName(localStorage.getItem(NAME_KEY) || "Игрок");
    this.characterId = localStorage.getItem(CHARACTER_KEY) || CHARACTERS[0].id;

    this.setupUI();
    this.initFirebase();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    this.preloadDefaultSprites();
    requestAnimationFrame((time) => this.loop(time));
  }

  async preloadDefaultSprites() {
    for (const character of CHARACTERS) {
      if (!this.sprites[character.id]) {
        this.sprites[character.id] = await this.cache.get(character.id);
      }
    }
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
        this.beginShotAnimation(this.room.lastShot);
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
      x: pos.x + pos.facing * 54,
      y: pos.y - 112,
      facing: pos.facing,
    };
  }

  setPose(role, name, durationMs = 0) {
    this.poseName[role] = name;
    this.poseUntil[role] = durationMs > 0 ? performance.now() + durationMs : 0;
  }

  refreshPose(role, now = performance.now()) {
    if (this.room?.phase === "finished") {
      const winner = this.room.winner;
      this.poseName[role] = winner === role ? "win" : "hurt";
      return this.poseName[role];
    }

    if (this.poseUntil[role] && now < this.poseUntil[role]) {
      return this.poseName[role];
    }

    if (this.shotAnimation?.shot?.shooter === role) {
      this.poseName[role] = "shoot";
      return "shoot";
    }

    const aiming =
      this.dragging &&
      this.aim &&
      this.room?.phase === "playing" &&
      this.currentShooterRole() === role;

    if (aiming) {
      this.poseName[role] = "aim";
      return "aim";
    }

    if (this.room?.phase === "playing" && this.room.turn === role) {
      this.poseName[role] = "idle";
      return "idle";
    }

    this.poseName[role] = "idle";
    return "idle";
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

    for (let t = 0; t <= 2.4; t += 0.018) {
      const x = shot.startX + shot.vx * t + shot.wind * t * t;
      const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
      const point = { x, y };
      hit = this.checkHit(lastPoint, point, target);
      if (hit) break;
      if (y > DUEL.groundY + 60 || x < -120 || x > this.width + 120) break;
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
      { type: "circle", part: "head", label: "голова", damage: 35, x: centerX, y: pos.y - 138, r: 24 },
      { type: "rect", part: "body", label: "тело", damage: 24, x: centerX - 26, y: pos.y - 118, w: 52, h: 62 },
      { type: "rect", part: "arm", label: "рука", damage: 14, x: centerX - 52, y: pos.y - 116, w: 104, h: 26 },
      { type: "rect", part: "leg", label: "нога", damage: 14, x: centerX - 30, y: pos.y - 54, w: 60, h: 50 },
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
        window.setTimeout(() => this.enemyShootLocal(), DUEL.arrowLifeMs + 280);
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
      this.beginShotAnimation(this.room.lastShot);
    }
    this.updateStatusFromRoom();
  }

  beginShotAnimation(shot) {
    this.shotAnimation = { shot, start: performance.now(), impactDone: false };
    this.setPose(shot.shooter, "shoot", DUEL.shootPoseMs);
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
    this.idleTime = time / 1000;
    const dt = 0.016;
    this.updateAtmosphere(dt);
    if (this.hitFlash.p1 > 0) this.hitFlash.p1 = Math.max(0, this.hitFlash.p1 - dt * 2.4);
    if (this.hitFlash.p2 > 0) this.hitFlash.p2 = Math.max(0, this.hitFlash.p2 - dt * 2.4);
    this.render(time);
    requestAnimationFrame((next) => this.loop(next));
  }

  updateAtmosphere(dt) {
    for (const cloud of this.clouds) {
      cloud.x -= cloud.speed * dt;
      if (cloud.x < -120) {
        cloud.x = this.width + 80;
        cloud.y = 30 + Math.random() * 80;
      }
    }
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  spawnHitFx(x, y, hit) {
    const count = hit ? 14 : 6;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: 0.25 + Math.random() * 0.35,
        maxLife: 0.5,
        size: 2 + Math.random() * 3,
        color: hit ? "rgba(255,120,100,0.9)" : "rgba(220,230,245,0.8)",
      });
    }
  }

  render(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    this.drawBackground(ctx);

    if (!this.room) {
      this.drawCenterMessage(ctx, "Дуэль из лука", "Создай комнату или подключись по коду.");
      return;
    }

    this.drawHUD(ctx);
    this.drawPlayer(ctx, "p1");
    this.drawPlayer(ctx, "p2");
    this.drawAiming(ctx);
    this.drawShot(ctx, time);
    this.drawParticles(ctx);
    this.drawRoomState(ctx);
  }

  drawBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#e4f4ff");
    sky.addColorStop(0.55, "#d2e8fb");
    sky.addColorStop(1, "#bfdcf5");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    const sunX = this.width * 0.5;
    const sunY = 70;
    const glow = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, 160);
    glow.addColorStop(0, "rgba(255, 244, 210, 0.7)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.fillStyle = "rgba(255, 236, 180, 0.95)";
    ctx.beginPath();
    ctx.arc(sunX, sunY, 16, 0, Math.PI * 2);
    ctx.fill();

    for (const cloud of this.clouds) {
      ctx.save();
      ctx.translate(cloud.x, cloud.y);
      ctx.scale(cloud.scale, cloud.scale);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.beginPath();
      ctx.arc(0, 12, 16, 0, Math.PI * 2);
      ctx.arc(16, 6, 20, 0, Math.PI * 2);
      ctx.arc(38, 12, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let x = 20; x < this.width; x += 112) {
      const h = 82 + ((x / 112) % 4) * 25;
      const by = DUEL.groundY - 170 - h * 0.3;
      ctx.fillStyle = "rgba(30, 55, 85, 0.08)";
      roundedRectPath(ctx, x + 4, DUEL.groundY - 70, 74, 8, 4);
      ctx.fill();
      ctx.fillStyle = "rgba(141, 178, 211, 0.42)";
      roundedRectPath(ctx, x, by, 74, h, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.38)";
      for (let wy = by + 14; wy < DUEL.groundY - 90; wy += 18) {
        for (let wx = x + 12; wx < x + 62; wx += 18) {
          const pulse = 0.35 + Math.sin(this.idleTime * 1.5 + wx * 0.05 + wy * 0.02) * 0.2;
          ctx.globalAlpha = pulse;
          ctx.fillRect(wx, wy, 7, 10);
        }
      }
      ctx.globalAlpha = 1;
    }

    const grass = ctx.createLinearGradient(0, DUEL.groundY - 10, 0, DUEL.groundY + 8);
    grass.addColorStop(0, "#8fbc7a");
    grass.addColorStop(1, "#6f9a5f");
    ctx.fillStyle = grass;
    ctx.fillRect(0, DUEL.groundY - 8, this.width, 12);

    const ground = ctx.createLinearGradient(0, DUEL.groundY, 0, this.height);
    ground.addColorStop(0, "#7eabcf");
    ground.addColorStop(1, "#628fb5");
    ctx.fillStyle = ground;
    ctx.fillRect(0, DUEL.groundY, this.width, this.height - DUEL.groundY);
    ctx.fillStyle = "#6e9bc4";
    ctx.fillRect(0, DUEL.groundY + 18, this.width, 12);
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let x = 0; x < this.width; x += 48) {
      ctx.moveTo(x, DUEL.groundY + 45);
      ctx.lineTo(x + 18, DUEL.groundY + 54);
    }
    ctx.stroke();

    const wind = Number(this.room?.wind || 0);
    if (wind !== 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.18 + Math.min(0.25, Math.abs(wind) / 80)})`;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const y = 110 + i * 42;
        const drift = (this.idleTime * (20 + Math.abs(wind)) + i * 60) % (this.width + 80);
        const x = wind > 0 ? drift - 40 : this.width - drift + 40;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sign(wind) * 28, y);
        ctx.stroke();
      }
    }
  }

  drawHUD(ctx) {
    const p1 = this.room.players?.p1 || {};
    const p2 = this.room.players?.p2 || {};
    this.drawHpPanel(ctx, 18, 16, p1, "p1");
    this.drawHpPanel(ctx, this.width - 318, 16, p2, "p2");

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, this.width / 2 - 118, 16, 236, 74, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(25, 71, 118, 0.12)";
    ctx.lineWidth = 1.5;
    roundedRectPath(ctx, this.width / 2 - 118, 16, 236, 74, 14);
    ctx.stroke();
    ctx.fillStyle = "#213a58";
    ctx.font = "800 17px Manrope, Inter, sans-serif";
    ctx.textAlign = "center";
    const turnName = this.room.turn === "p1" ? p1.name || "Игрок 1" : p2.name || "Игрок 2";
    ctx.fillText(`Ход: ${turnName}`, this.width / 2, 42);
    ctx.font = "700 13px Manrope, Inter, sans-serif";
    ctx.fillStyle = "#446387";
    const wind = Number(this.room.wind || 0);
    ctx.fillText(`Ветер: ${wind > 0 ? "→" : wind < 0 ? "←" : "—"} ${Math.abs(wind)}`, this.width / 2, 64);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawHpPanel(ctx, x, y, player, role) {
    const hp = clamp(Number(player?.hp ?? DUEL.maxHp), 0, DUEL.maxHp);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, x, y, 300, 72, 14);
    ctx.fill();
    ctx.fillStyle = "#213a58";
    ctx.font = "800 18px Manrope, Inter, sans-serif";
    ctx.fillText(`${role === "p1" ? "1" : "2"}. ${player?.name || "Ожидание"}`, x + 12, y + 25);
    ctx.fillStyle = "rgba(190,70,70,0.18)";
    roundedRectPath(ctx, x + 12, y + 42, 276, 12, 7);
    ctx.fill();
    const bar = ctx.createLinearGradient(x + 12, 0, x + 288, 0);
    bar.addColorStop(0, hp > 40 ? "#2fa56c" : hp > 18 ? "#e1a22f" : "#d94d4d");
    bar.addColorStop(1, hp > 40 ? "#55d090" : hp > 18 ? "#f0c05a" : "#f07878");
    ctx.fillStyle = bar;
    roundedRectPath(ctx, x + 12, y + 42, 276 * (hp / DUEL.maxHp), 12, 7);
    ctx.fill();
    ctx.fillStyle = "#365a80";
    ctx.font = "700 13px Manrope, Inter, sans-serif";
    ctx.fillText(`${hp} / ${DUEL.maxHp}`, x + 12, y + 66);
    ctx.restore();
  }

  getVisualFrame(role) {
    if (!this.room?.players?.[role]) return "idle";
    return this.refreshPose(role);
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
    const image = sprites[frame] || sprites.idle || sprites.preview;
    const w = DUEL.charW;
    const h = DUEL.charH;
    const bob = Math.sin(this.idleTime * 2.1 + (role === "p1" ? 0 : 1.4)) * 1.4;
    const breathe = 1 + Math.sin(this.idleTime * 1.8 + (role === "p1" ? 0.4 : 1.1)) * 0.008;
    const active = this.room?.phase === "playing" && this.room.turn === role;
    const aiming = frame === "aim" && this.aim && this.currentShooterRole() === role;
    const aimTilt = aiming ? ((this.aim.angle - 36) / 72) * 0.18 * (role === "p1" ? -1 : 1) : 0;
    const hurtNudge = frame === "hurt" ? (role === "p1" ? -8 : 8) : 0;
    const flash = this.hitFlash[role] || 0;

    ctx.save();
    ctx.fillStyle = "rgba(35,64,92,0.18)";
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 48, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (active && this.room.phase === "playing") {
      ctx.strokeStyle = "rgba(13, 138, 229, 0.28)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y - h * 0.48 + bob, 54, 74, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (image) {
      ctx.translate(pos.x + hurtNudge, pos.y + bob);
      ctx.rotate(aimTilt);
      ctx.scale((role === "p2" ? -1 : 1) * breathe, breathe);
      const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      if (flash > 0) {
        ctx.filter = `brightness(${1 + flash * 0.8}) saturate(${1 + flash})`;
      }
      ctx.drawImage(image, -drawW / 2, -drawH, drawW, drawH);
      ctx.filter = "none";
    } else {
      this.drawFallbackArcher(ctx, pos, role, frame);
    }
    ctx.restore();
  }

  drawFallbackArcher(ctx, pos, role, frame) {
    const facing = role === "p2" ? -1 : 1;
    ctx.translate(pos.x, pos.y);
    ctx.scale(facing, 1);
    ctx.fillStyle = role === "p1" ? "#1f5d8c" : "#8c4b1f";
    roundedRectPath(ctx, -24, -112, 48, 90, 16);
    ctx.fill();
    ctx.fillStyle = "#efc49e";
    ctx.beginPath();
    ctx.arc(0, -128, 22, 0, Math.PI * 2);
    ctx.fill();

    const pull = frame === "aim" ? 34 : frame === "shoot" ? 10 : 16;
    ctx.strokeStyle = "#5a3218";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(28, -138);
    ctx.quadraticCurveTo(48, -112, 28, -86);
    ctx.stroke();
    ctx.strokeStyle = "#222";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(28, -138);
    ctx.lineTo(28 - pull, -112);
    ctx.lineTo(28, -86);
    ctx.stroke();
    if (frame === "aim") {
      ctx.strokeStyle = "#e8d7a8";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(28 - pull, -112);
      ctx.lineTo(54, -112);
      ctx.stroke();
    }
  }

  drawWaitingSilhouette(ctx) {
    const pulse = 0.45 + Math.sin(this.idleTime * 2.5) * 0.08;
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${pulse})`;
    roundedRectPath(ctx, DUEL.p2X - 72, DUEL.groundY - 160, 144, 156, 20);
    ctx.fill();
    ctx.strokeStyle = "rgba(77, 108, 138, 0.25)";
    ctx.setLineDash([6, 6]);
    roundedRectPath(ctx, DUEL.p2X - 72, DUEL.groundY - 160, 144, 156, 20);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#4d6c8a";
    ctx.font = "800 15px Manrope, Inter, sans-serif";
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
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      roundedRectPath(ctx, start.x - 92, start.y + 34, 184, 34, 10);
      ctx.fill();
      ctx.fillStyle = "#365a80";
      ctx.font = "700 13px Manrope, Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Зажми и оттяни назад", start.x, start.y + 56);
      ctx.textAlign = "left";
      ctx.restore();
      return;
    }

    // Pull rope visual
    const visiblePull = Math.min(70, aim.pull);
    const dirLen = Math.max(1, Math.sqrt((aim.startX - aim.endX) ** 2 + (aim.startY - aim.endY) ** 2));
    const ux = (aim.endX - aim.startX) / dirLen;
    const uy = (aim.endY - aim.startY) / dirLen;
    const px = aim.startX + ux * visiblePull;
    const py = aim.startY + uy * visiblePull;

    ctx.strokeStyle = "rgba(25, 71, 118, 0.22)";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(aim.startX, aim.startY);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.strokeStyle = aim.power > 78 ? "rgba(213, 129, 46, 0.92)" : "rgba(47, 146, 214, 0.92)";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(aim.startX, aim.startY);
    ctx.lineTo(px, py);
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(px, py, 5, 0, Math.PI * 2);
    ctx.fill();

    // Predicted ballistic arc
    const preview = this.makeShot(role, aim.angle, aim.power);
    ctx.beginPath();
    ctx.setLineDash([5, 7]);
    ctx.strokeStyle = "rgba(25, 71, 118, 0.45)";
    ctx.lineWidth = 2;
    let started = false;
    for (let t = 0; t <= 1.8; t += 0.04) {
      const x = preview.startX + preview.vx * t + preview.wind * t * t;
      const y = preview.startY + preview.vy * t + 0.5 * DUEL.gravity * t * t;
      if (y > DUEL.groundY + 20 || x < -40 || x > this.width + 40) break;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundedRectPath(ctx, aim.startX - 62, aim.startY + 42, 124, 44, 10);
    ctx.fill();
    ctx.fillStyle = "#194776";
    ctx.font = "800 13px Manrope, Inter, sans-serif";
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

  drawShot(ctx, time) {
    if (!this.shotAnimation) return;
    const elapsed = time - this.shotAnimation.start;
    const shot = this.shotAnimation.shot;
    const progress = elapsed / DUEL.arrowLifeMs;

    if (!this.shotAnimation.impactDone && progress >= 0.82) {
      this.shotAnimation.impactDone = true;
      const hit = Number(shot.damage || 0) > 0;
      if (hit) {
        this.setPose(shot.target, "hurt", DUEL.hurtPoseMs);
        this.hitFlash[shot.target] = 1;
      }
      const t = 1.55 * 0.82;
      const x = shot.startX + shot.vx * t + Number(shot.wind || 0) * t * t;
      const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
      this.spawnHitFx(x, y, hit);
    }

    if (elapsed > DUEL.arrowLifeMs) {
      this.shotAnimation = null;
      return;
    }

    const t = progress * 1.55;
    const x = shot.startX + shot.vx * t + Number(shot.wind || 0) * t * t;
    const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
    const nextT = t + 0.02;
    const nx = shot.startX + shot.vx * nextT + Number(shot.wind || 0) * nextT * nextT;
    const ny = shot.startY + shot.vy * nextT + 0.5 * DUEL.gravity * nextT * nextT;
    const angle = Math.atan2(ny - y, nx - x);

    if (Math.random() < 0.45) {
      this.particles.push({
        x,
        y,
        vx: -Math.cos(angle) * 30,
        vy: -Math.sin(angle) * 30,
        life: 0.18,
        maxLife: 0.18,
        size: 2,
        color: "rgba(255, 220, 150, 0.65)",
      });
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.strokeStyle = "rgba(92, 60, 31, 0.22)";
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-28, 0);
    ctx.lineTo(20, 0);
    ctx.stroke();
    ctx.strokeStyle = "#5c3c1f";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(24, 0);
    ctx.stroke();
    ctx.fillStyle = "#c78a2e";
    ctx.beginPath();
    ctx.moveTo(26, 0);
    ctx.lineTo(14, -6);
    ctx.lineTo(14, 6);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(220, 80, 70, 0.85)";
    ctx.beginPath();
    ctx.moveTo(-24, 0);
    ctx.lineTo(-30, -4);
    ctx.lineTo(-28, 0);
    ctx.lineTo(-30, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.save();
      ctx.globalAlpha = clamp(p.life / (p.maxLife || 0.4), 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  drawRoomState(ctx) {
    if (!this.room?.lastShot) return;
    const shot = this.room.lastShot;
    const text = shot.damage > 0 ? `Попадание: ${shot.hitLabel}, -${shot.damage} HP` : "Промах";
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, this.width / 2 - 170, this.height - 76, 340, 46, 12);
    ctx.fill();
    ctx.fillStyle = shot.damage > 0 ? "#b43636" : "#365a80";
    ctx.font = "800 16px Manrope, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, this.width / 2, this.height - 48);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawCenterMessage(ctx, title, subtitle) {
    ctx.save();
    ctx.fillStyle = "rgba(20, 50, 90, 0.12)";
    roundedRectPath(ctx, this.width / 2 - 284, this.height / 2 - 62, 580, 140, 18);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundedRectPath(ctx, this.width / 2 - 290, this.height / 2 - 70, 580, 140, 18);
    ctx.fill();
    ctx.fillStyle = "#194776";
    ctx.font = "800 30px Manrope, Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(title, this.width / 2, this.height / 2 - 18);
    ctx.fillStyle = "#446387";
    ctx.font = "600 17px Manrope, Inter, sans-serif";
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
