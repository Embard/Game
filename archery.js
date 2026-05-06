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
  charW: 118,
  charH: 148,
  arrowLifeMs: 1050,
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
    const frames = ["run1", "jump", "land", "slide", "hurt", "preview"];
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
    this.angleRange = document.getElementById("angleRange");
    this.powerRange = document.getElementById("powerRange");
    this.angleValue = document.getElementById("angleValue");
    this.powerValue = document.getElementById("powerValue");
    this.shootBtn = document.getElementById("shootBtn");

    this.roomCode = "";
    this.role = "p1";
    this.roomRef = null;
    this.room = null;
    this.online = false;
    this.localMode = false;
    this.lastShotId = null;
    this.shotAnimation = null;

    this.playerName = normalizeName(localStorage.getItem(NAME_KEY) || "Игрок");
    this.characterId = localStorage.getItem(CHARACTER_KEY) || CHARACTERS[0].id;

    this.setupUI();
    this.initFirebase();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    requestAnimationFrame((time) => this.loop(time));
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
    this.shootBtn?.addEventListener("click", () => this.shoot());

    const syncRanges = () => {
      this.angleValue.textContent = `${this.angleRange.value}°`;
      this.powerValue.textContent = `${this.powerRange.value}%`;
    };
    this.angleRange?.addEventListener("input", syncRanges);
    this.powerRange?.addEventListener("input", syncRanges);
    syncRanges();
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
          shot: this.room.lastShot,
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
      this.setStatus("Твой ход: выбери угол, силу и нажми «Выстрел».");
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
    return {
      angle: Number(this.angleRange?.value || 38),
      power: Number(this.powerRange?.value || 70),
    };
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
      { type: "circle", part: "head", label: "голова", damage: 35, x: centerX, y: pos.y - 126, r: 26 },
      { type: "rect", part: "body", label: "тело", damage: 24, x: centerX - 28, y: pos.y - 104, w: 56, h: 58 },
      { type: "rect", part: "arm", label: "рука", damage: 14, x: centerX - 48, y: pos.y - 106, w: 96, h: 28 },
      { type: "rect", part: "leg", label: "нога", damage: 14, x: centerX - 34, y: pos.y - 48, w: 68, h: 46 },
    ];
  }

  async shoot() {
    if (!this.room || this.room.phase !== "playing") return;
    if (!this.localMode && this.room.turn !== this.role) return;
    if (this.localMode && this.room.turn !== "p1") return;

    const { angle, power } = this.getAim();
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
    const angle = 22 + Math.floor(Math.random() * 26);
    const power = 52 + Math.floor(Math.random() * 34);
    const shot = this.simulateShot(this.room, "p2", angle, power);
    this.applyShotLocal(shot);
  }

  applyShotLocal(shot) {
    this.room = this.applyShotToRoom(this.room, shot, shot.target);
    if (this.room.lastShot && this.room.lastShot.id !== this.lastShotId) {
      this.lastShotId = this.room.lastShot.id;
      this.shotAnimation = { shot: this.room.lastShot, start: performance.now() };
    }
    this.updateStatusFromRoom();
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
    this.render(time);
    requestAnimationFrame((next) => this.loop(next));
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
    this.drawRoomState(ctx);
  }

  drawBackground(ctx) {
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#eaf8ff");
    sky.addColorStop(1, "#cfe7ff");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = "rgba(141, 178, 211, 0.35)";
    for (let x = 20; x < this.width; x += 112) {
      const h = 82 + ((x / 112) % 4) * 25;
      roundedRectPath(ctx, x, DUEL.groundY - 170 - h * 0.3, 74, h, 7);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.45)";
      for (let wy = DUEL.groundY - 160 - h * 0.3; wy < DUEL.groundY - 80; wy += 18) {
        for (let wx = x + 12; wx < x + 62; wx += 18) ctx.fillRect(wx, wy, 7, 10);
      }
      ctx.fillStyle = "rgba(141, 178, 211, 0.35)";
    }

    ctx.fillStyle = "#89b6dc";
    ctx.fillRect(0, DUEL.groundY, this.width, this.height - DUEL.groundY);
    ctx.fillStyle = "#6e9bc4";
    ctx.fillRect(0, DUEL.groundY + 18, this.width, 12);
    ctx.strokeStyle = "rgba(255,255,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < this.width; x += 48) {
      ctx.moveTo(x, DUEL.groundY + 45);
      ctx.lineTo(x + 18, DUEL.groundY + 54);
    }
    ctx.stroke();
  }

  drawHUD(ctx) {
    const p1 = this.room.players?.p1 || {};
    const p2 = this.room.players?.p2 || {};
    this.drawHpPanel(ctx, 18, 16, p1, "p1");
    this.drawHpPanel(ctx, this.width - 318, 16, p2, "p2");

    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundedRectPath(ctx, this.width / 2 - 118, 16, 236, 70, 14);
    ctx.fill();
    ctx.fillStyle = "#213a58";
    ctx.font = "800 17px Inter, sans-serif";
    ctx.textAlign = "center";
    const turnName = this.room.turn === "p1" ? p1.name || "Игрок 1" : p2.name || "Игрок 2";
    ctx.fillText(`Ход: ${turnName}`, this.width / 2, 42);
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillStyle = "#446387";
    const wind = Number(this.room.wind || 0);
    ctx.fillText(`Ветер: ${wind > 0 ? "→" : wind < 0 ? "←" : "—"} ${Math.abs(wind)}`, this.width / 2, 64);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawHpPanel(ctx, x, y, player, role) {
    const hp = clamp(Number(player?.hp ?? DUEL.maxHp), 0, DUEL.maxHp);
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
    roundedRectPath(ctx, x, y, 300, 72, 14);
    ctx.fill();
    ctx.fillStyle = "#213a58";
    ctx.font = "800 18px Inter, sans-serif";
    ctx.fillText(`${role === "p1" ? "1" : "2"}. ${player?.name || "Ожидание"}`, x + 12, y + 25);
    ctx.fillStyle = "rgba(190,70,70,0.18)";
    roundedRectPath(ctx, x + 12, y + 42, 276, 12, 7);
    ctx.fill();
    ctx.fillStyle = hp > 40 ? "#2fa56c" : hp > 18 ? "#e1a22f" : "#d94d4d";
    roundedRectPath(ctx, x + 12, y + 42, 276 * (hp / DUEL.maxHp), 12, 7);
    ctx.fill();
    ctx.fillStyle = "#365a80";
    ctx.font = "700 13px Inter, sans-serif";
    ctx.fillText(`${hp} / ${DUEL.maxHp}`, x + 12, y + 66);
    ctx.restore();
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
    const image = sprites.run1 || sprites.preview;
    const w = DUEL.charW;
    const h = DUEL.charH;

    ctx.save();
    ctx.fillStyle = "rgba(35,64,92,0.18)";
    ctx.beginPath();
    ctx.ellipse(pos.x, pos.y + 4, 48, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (image) {
      ctx.translate(pos.x, pos.y);
      if (role === "p2") ctx.scale(-1, 1);
      const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
      const drawW = image.naturalWidth * scale;
      const drawH = image.naturalHeight * scale;
      ctx.drawImage(image, -drawW / 2, -drawH, drawW, drawH);
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
    if (!this.localMode && this.room.turn !== this.role) return;
    if (this.localMode && this.room.turn !== "p1") return;

    const role = this.localMode ? this.room.turn : this.role;
    const { angle, power } = this.getAim();
    const shot = this.makeShot(role, angle, power);
    ctx.save();
    ctx.strokeStyle = "rgba(30, 71, 118, 0.35)";
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(shot.startX, shot.startY);
    for (let t = 0.12; t <= 0.86; t += 0.08) {
      const x = shot.startX + shot.vx * t + Number(this.room.wind || 0) * t * t;
      const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  drawShot(ctx, time) {
    if (!this.shotAnimation) return;
    const elapsed = time - this.shotAnimation.start;
    if (elapsed > DUEL.arrowLifeMs) {
      this.shotAnimation = null;
      return;
    }
    const shot = this.shotAnimation.shot;
    const t = (elapsed / DUEL.arrowLifeMs) * 1.55;
    const x = shot.startX + shot.vx * t + Number(shot.wind || 0) * t * t;
    const y = shot.startY + shot.vy * t + 0.5 * DUEL.gravity * t * t;
    const nextT = t + 0.02;
    const nx = shot.startX + shot.vx * nextT + Number(shot.wind || 0) * nextT * nextT;
    const ny = shot.startY + shot.vy * nextT + 0.5 * DUEL.gravity * nextT * nextT;
    const angle = Math.atan2(ny - y, nx - x);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
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
    ctx.restore();
  }

  drawRoomState(ctx) {
    if (!this.room?.lastShot) return;
    const shot = this.room.lastShot;
    const text = shot.damage > 0 ? `Попадание: ${shot.hitLabel}, -${shot.damage} HP` : "Промах";
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.88)";
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
