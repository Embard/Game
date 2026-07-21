"use strict";

const CHARACTERS = [
  {
    id: "gip",
    name: "ГИП",
    path: "assets/characters/gip/fight",
    specialName: "Утверждаю!",
    color: "#1f6fad",
  },
  {
    id: "alexey",
    name: "Alexey",
    path: "assets/characters/alexey/fight",
    specialName: "Есть замечания!",
    color: "#8a5a2b",
  },
];

const CFG = {
  width: 1120,
  height: 520,
  groundY: 435,
  gravity: 2400,
  walkSpeed: 280,
  jumpForce: 860,
  maxHp: 100,
  roundsToWin: 2,
  charW: 128,
  charH: 168,
  roundIntroMs: 1400,
  roundEndMs: 1600,
};

const ATTACKS = {
  punch: { startup: 0.08, active: 0.12, recovery: 0.18, damage: 8, range: 78, height: 36, y: -108, knock: 220, meter: 12 },
  kick: { startup: 0.14, active: 0.14, recovery: 0.28, damage: 14, range: 98, height: 34, y: -70, knock: 340, meter: 18 },
  special: { startup: 0.18, active: 0.2, recovery: 0.42, damage: 22, range: 110, height: 70, y: -100, knock: 460, meter: 0, cost: 100 },
};

const KEYS = {
  p1: { left: "KeyA", right: "KeyD", jump: "KeyW", punch: "KeyJ", kick: "KeyK", block: "KeyL", special: "KeyI" },
  p2: { left: "ArrowLeft", right: "ArrowRight", jump: "ArrowUp", punch: "Digit1", kick: "Digit2", block: "Digit3", special: "Digit4" },
};

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
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

function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

class SpriteBank {
  constructor() {
    this.cache = new Map();
  }

  async get(characterId) {
    if (this.cache.has(characterId)) return this.cache.get(characterId);
    const character = getCharacter(characterId);
    const names = ["idle", "walk1", "walk2", "walk3", "punch", "kick", "block", "special", "hurt", "jump", "win"];
    const frames = {};
    await Promise.all(
      names.map(async (name) => {
        frames[name] = await loadImage(`${character.path}/${name}.png`);
      })
    );
    if (!frames.idle) frames.idle = frames.walk1;
    this.cache.set(characterId, frames);
    return frames;
  }
}

class Fighter {
  constructor(role, characterId, x) {
    this.role = role;
    this.characterId = characterId;
    this.character = getCharacter(characterId);
    this.x = x;
    this.y = CFG.groundY;
    this.vx = 0;
    this.vy = 0;
    this.facing = role === "p1" ? 1 : -1;
    this.hp = CFG.maxHp;
    this.meter = 0;
    this.state = "idle";
    this.stateTime = 0;
    this.attack = null;
    this.hitDone = false;
    this.invuln = 0;
    this.hitFlash = 0;
    this.comboLock = 0;
    this.roundsWon = 0;
    this.input = {
      left: false,
      right: false,
      jump: false,
      punch: false,
      kick: false,
      block: false,
      special: false,
      jumpPressed: false,
      punchPressed: false,
      kickPressed: false,
      specialPressed: false,
    };
  }

  resetForRound(x) {
    this.x = x;
    this.y = CFG.groundY;
    this.vx = 0;
    this.vy = 0;
    this.hp = CFG.maxHp;
    this.meter = Math.min(40, this.meter);
    this.state = "idle";
    this.stateTime = 0;
    this.attack = null;
    this.hitDone = false;
    this.invuln = 0.4;
    this.comboLock = 0;
    this.facing = this.role === "p1" ? 1 : -1;
  }

  grounded() {
    return this.y >= CFG.groundY - 0.5;
  }

  busy() {
    return ["punch", "kick", "special", "hurt", "ko", "win"].includes(this.state);
  }

  setState(name) {
    this.state = name;
    this.stateTime = 0;
  }

  startAttack(kind) {
    if (this.busy() || !this.grounded()) return false;
    if (kind === "special" && this.meter < ATTACKS.special.cost) return false;
    if (kind === "special") this.meter = 0;
    this.attack = kind;
    this.hitDone = false;
    this.setState(kind);
    return true;
  }

  getAttackPhase() {
    if (!this.attack) return "none";
    const data = ATTACKS[this.attack];
    if (this.stateTime < data.startup) return "startup";
    if (this.stateTime < data.startup + data.active) return "active";
    return "recovery";
  }

  getHitbox() {
    if (!this.attack || this.getAttackPhase() !== "active" || this.hitDone) return null;
    const data = ATTACKS[this.attack];
    const x = this.facing > 0 ? this.x + 18 : this.x - 18 - data.reach;
    return {
      x,
      y: this.y + data.y,
      w: data.reach,
      h: data.height,
      damage: data.damage,
      knock: data.knock,
      meter: data.meter,
      kind: this.attack,
    };
  }

  getHurtbox() {
    return {
      x: this.x - 28,
      y: this.y - 150,
      w: 56,
      h: 150,
    };
  }

  takeHit(hit, fromFacing) {
    if (this.invuln > 0 || this.state === "ko") return false;
    const blocking = this.state === "block" || (this.input.block && !this.busy());
    let damage = hit.damage;
    let knock = hit.knock;
    if (blocking && this.grounded()) {
      damage = Math.max(2, Math.round(damage * 0.35));
      knock *= 0.35;
      this.setState("block");
    } else {
      this.setState("hurt");
      this.attack = null;
      this.comboLock = 0.12;
    }
    this.hp = clamp(this.hp - damage, 0, CFG.maxHp);
    this.vx = fromFacing * knock;
    this.vy = hit.kind === "kick" || hit.kind === "special" ? -220 : -80;
    this.hitFlash = 1;
    this.invuln = blocking ? 0.08 : 0.18;
    if (this.hp <= 0) {
      this.hp = 0;
      this.setState("ko");
      this.vy = -360;
      this.vx = fromFacing * 420;
    }
    return true;
  }
}

class FightGame {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.width = CFG.width;
    this.height = CFG.height;
    this.bank = new SpriteBank();
    this.sprites = {};
    this.keys = new Set();
    this.touch = {};
    this.mode = null;
    this.phase = "menu";
    this.phaseTime = 0;
    this.round = 1;
    this.p1 = null;
    this.p2 = null;
    this.projectiles = [];
    this.particles = [];
    this.shake = 0;
    this.announcer = "";
    this.last = performance.now();
    this.statusEl = document.getElementById("fightStatus");
    this.p1Select = document.getElementById("p1Character");
    this.p2Select = document.getElementById("p2Character");
    this.touchRoot = document.getElementById("fightTouch");

    this.setupUI();
    this.bindInput();
    this.onResize();
    window.addEventListener("resize", () => this.onResize());
    this.preload();
    requestAnimationFrame((t) => this.loop(t));
  }

  setupUI() {
    const opts = CHARACTERS.map((c) => `<option value="${c.id}">${c.name}</option>`).join("");
    if (this.p1Select) {
      this.p1Select.innerHTML = opts;
      this.p1Select.value = "gip";
    }
    if (this.p2Select) {
      this.p2Select.innerHTML = opts;
      this.p2Select.value = "alexey";
    }
    document.getElementById("vsCpuBtn")?.addEventListener("click", () => this.startMatch("cpu"));
    document.getElementById("vsLocalBtn")?.addEventListener("click", () => this.startMatch("local"));
    document.getElementById("restartFightBtn")?.addEventListener("click", () => {
      if (this.mode) this.startMatch(this.mode);
    });
  }

  bindInput() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    if (!this.touchRoot) return;
    const setAct = (act, on) => {
      this.touch[act] = on;
    };
    this.touchRoot.querySelectorAll("button[data-act]").forEach((btn) => {
      const act = btn.getAttribute("data-act");
      const start = (e) => {
        e.preventDefault();
        setAct(act, true);
        if (["punch", "kick", "special", "jump"].includes(act)) this.touch[`${act}Pressed`] = true;
      };
      const end = (e) => {
        e.preventDefault();
        setAct(act, false);
      };
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", end);
      btn.addEventListener("pointercancel", end);
      btn.addEventListener("pointerleave", end);
    });
  }

  async preload() {
    for (const c of CHARACTERS) {
      this.sprites[c.id] = await this.bank.get(c.id);
    }
  }

  onResize() {
    const ratio = this.width / this.height;
    const maxW = Math.min(window.innerWidth - 32, 1240);
    const w = Math.max(320, maxW);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${w / ratio}px`;
  }

  setStatus(text) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  startMatch(mode) {
    this.mode = mode;
    const p1Id = this.p1Select?.value || "gip";
    let p2Id = this.p2Select?.value || "alexey";
    if (p1Id === p2Id) p2Id = p1Id === "gip" ? "alexey" : "gip";
    this.p1 = new Fighter("p1", p1Id, 260);
    this.p2 = new Fighter("p2", p2Id, 860);
    this.p1.roundsWon = 0;
    this.p2.roundsWon = 0;
    this.round = 1;
    this.projectiles = [];
    this.particles = [];
    const showTouch =
      mode === "cpu" && (window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 900);
    if (this.touchRoot) this.touchRoot.hidden = !showTouch;
    this.beginRound();
    this.setStatus(mode === "cpu" ? "Бой с ИИ. Утверди проект!" : "Локальный бой. У каждого свой набор клавиш.");
  }

  beginRound() {
    this.p1.resetForRound(260);
    this.p2.resetForRound(860);
    this.projectiles = [];
    this.phase = "intro";
    this.phaseTime = 0;
    this.announcer = `РАУНД ${this.round}`;
    this.shake = 0;
  }

  loop(time) {
    const dt = clamp((time - this.last) / 1000, 0, 0.033);
    this.last = time;
    this.update(dt);
    this.render(time);
    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    if (!this.p1 || !this.p2) return;
    this.phaseTime += dt;
    this.shake = Math.max(0, this.shake - dt * 8);

    if (this.phase === "intro") {
      this.readInputs();
      if (this.phaseTime > 0.55) this.announcer = "СОГЛАСУЙ!";
      if (this.phaseTime >= CFG.roundIntroMs / 1000) {
        this.phase = "fight";
        this.announcer = "";
      }
      this.updateFighterVisualOnly(this.p1, dt);
      this.updateFighterVisualOnly(this.p2, dt);
      this.updateParticles(dt);
      return;
    }

    if (this.phase === "roundEnd" || this.phase === "matchEnd") {
      this.updateFighterVisualOnly(this.p1, dt);
      this.updateFighterVisualOnly(this.p2, dt);
      this.updateParticles(dt);
      if (this.phase === "roundEnd" && this.phaseTime >= CFG.roundEndMs / 1000) {
        if (this.p1.roundsWon >= CFG.roundsToWin || this.p2.roundsWon >= CFG.roundsToWin) {
          this.phase = "matchEnd";
          this.phaseTime = 0;
          const winner = this.p1.roundsWon > this.p2.roundsWon ? this.p1 : this.p2;
          this.announcer = `${winner.character.name} УТВЕРДИЛ!`;
          this.setStatus(`Победа: ${winner.character.name}. Жми «Реванш» для нового матча.`);
          winner.setState("win");
        } else {
          this.round += 1;
          this.beginRound();
        }
      }
      return;
    }

    this.readInputs();
    if (this.mode === "cpu") this.updateAI(dt);
    this.updateFighter(this.p1, this.p2, dt);
    this.updateFighter(this.p2, this.p1, dt);
    this.resolveCombat(this.p1, this.p2);
    this.resolveCombat(this.p2, this.p1);
    this.updateProjectiles(dt);
    this.updateParticles(dt);
    this.faceEachOther();

    if (this.p1.state === "ko" || this.p2.state === "ko") {
      const loser = this.p1.state === "ko" ? this.p1 : this.p2;
      const winner = loser === this.p1 ? this.p2 : this.p1;
      if (this.phase === "fight") {
        winner.roundsWon += 1;
        winner.setState("win");
        this.phase = "roundEnd";
        this.phaseTime = 0;
        this.announcer = winner.roundsWon >= CFG.roundsToWin ? "МАТЧ!" : `${winner.character.name} раунд!`;
        this.shake = 1.2;
      }
    }
  }

  updateFighterVisualOnly(f, dt) {
    f.stateTime += dt;
    f.hitFlash = Math.max(0, f.hitFlash - dt * 3);
    if (!f.grounded()) {
      f.vy += CFG.gravity * dt;
      f.y += f.vy * dt;
      if (f.y >= CFG.groundY) {
        f.y = CFG.groundY;
        f.vy = 0;
        if (f.state !== "ko" && f.state !== "win") f.setState("idle");
      }
    }
  }

  readInputs() {
    this.applyKeys(this.p1, KEYS.p1, true);
    if (this.mode === "local") this.applyKeys(this.p2, KEYS.p2, false);
  }

  applyKeys(fighter, map, includeTouch) {
    const prev = { ...fighter.input };
    const down = (code) => this.keys.has(code);
    fighter.input.left = down(map.left) || (includeTouch && !!this.touch.left);
    fighter.input.right = down(map.right) || (includeTouch && !!this.touch.right);
    fighter.input.jump = down(map.jump) || (includeTouch && !!this.touch.jump);
    fighter.input.punch = down(map.punch) || (includeTouch && !!this.touch.punch);
    fighter.input.kick = down(map.kick) || (includeTouch && !!this.touch.kick);
    fighter.input.block = down(map.block) || (includeTouch && !!this.touch.block);
    fighter.input.special = down(map.special) || (includeTouch && !!this.touch.special);

    fighter.input.jumpPressed = (!prev.jump && fighter.input.jump) || (includeTouch && this.touch.jumpPressed);
    fighter.input.punchPressed = (!prev.punch && fighter.input.punch) || (includeTouch && this.touch.punchPressed);
    fighter.input.kickPressed = (!prev.kick && fighter.input.kick) || (includeTouch && this.touch.kickPressed);
    fighter.input.specialPressed = (!prev.special && fighter.input.special) || (includeTouch && this.touch.specialPressed);

    if (includeTouch) {
      this.touch.jumpPressed = false;
      this.touch.punchPressed = false;
      this.touch.kickPressed = false;
      this.touch.specialPressed = false;
    }
  }

  updateAI(dt) {
    const me = this.p2;
    const foe = this.p1;
    if (me.state === "ko" || me.state === "win") return;
    const dist = foe.x - me.x;
    const abs = Math.abs(dist);
    me.input.left = false;
    me.input.right = false;
    me.input.jump = false;
    me.input.punch = false;
    me.input.kick = false;
    me.input.block = false;
    me.input.special = false;
    me.input.jumpPressed = false;
    me.input.punchPressed = false;
    me.input.kickPressed = false;
    me.input.specialPressed = false;

    if (foe.state === "punch" || foe.state === "kick" || foe.state === "special") {
      if (abs < 130 && Math.random() < 0.65) me.input.block = true;
      else if (Math.random() < 0.2) me.input.jumpPressed = true;
      return;
    }

    if (me.meter >= 100 && abs < 160 && Math.random() < 0.04) {
      me.input.specialPressed = true;
      return;
    }

    if (abs > 120) {
      if (dist < 0) me.input.left = true;
      else me.input.right = true;
      if (Math.random() < 0.008) me.input.jumpPressed = true;
    } else if (abs < 55) {
      if (dist < 0) me.input.right = true;
      else me.input.left = true;
    } else {
      const roll = Math.random();
      if (roll < 0.035) me.input.punchPressed = true;
      else if (roll < 0.055) me.input.kickPressed = true;
      else if (roll < 0.07) me.input.block = true;
    }
  }

  faceEachOther() {
    if (this.p1.state === "ko" || this.p2.state === "ko") return;
    if (!this.p1.busy() || this.p1.state === "block") {
      this.p1.facing = this.p1.x <= this.p2.x ? 1 : -1;
    }
    if (!this.p2.busy() || this.p2.state === "block") {
      this.p2.facing = this.p2.x <= this.p1.x ? 1 : -1;
    }
  }

  updateFighter(f, foe, dt) {
    f.stateTime += dt;
    f.invuln = Math.max(0, f.invuln - dt);
    f.hitFlash = Math.max(0, f.hitFlash - dt * 3);
    f.comboLock = Math.max(0, f.comboLock - dt);

    if (f.state === "ko") {
      f.vy += CFG.gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.96;
      if (f.y >= CFG.groundY) {
        f.y = CFG.groundY;
        f.vy = 0;
        f.vx *= 0.8;
      }
      f.x = clamp(f.x, 70, this.width - 70);
      return;
    }

    if (f.state === "win") return;

    if (f.state === "hurt") {
      f.vy += CFG.gravity * dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.vx *= 0.9;
      if (f.y >= CFG.groundY) {
        f.y = CFG.groundY;
        f.vy = 0;
      }
      if (f.stateTime > 0.28) f.setState("idle");
      f.x = clamp(f.x, 70, this.width - 70);
      return;
    }

    if (["punch", "kick", "special"].includes(f.state)) {
      const data = ATTACKS[f.attack];
      const total = data.startup + data.active + data.recovery;
      if (f.state === "special" && f.getAttackPhase() === "active" && !f.hitDone) {
        this.spawnSpecial(f);
        f.hitDone = true;
      }
      if (f.stateTime >= total) {
        f.attack = null;
        f.setState("idle");
      }
      f.vx *= 0.85;
      f.x += f.vx * dt;
      f.x = clamp(f.x, 70, this.width - 70);
      return;
    }

    if (f.input.block && f.grounded()) {
      f.setState("block");
      f.vx *= 0.7;
      f.x += f.vx * dt;
      f.x = clamp(f.x, 70, this.width - 70);
      return;
    }

    if (f.state === "block" && !f.input.block) f.setState("idle");

    let move = 0;
    if (f.input.left) move -= 1;
    if (f.input.right) move += 1;
    f.vx = move * CFG.walkSpeed;

    if (f.input.jumpPressed && f.grounded()) {
      f.vy = -CFG.jumpForce;
      f.setState("jump");
    }

    if (f.input.punchPressed) this.tryAttack(f, "punch");
    else if (f.input.kickPressed) this.tryAttack(f, "kick");
    else if (f.input.specialPressed) this.tryAttack(f, "special");

    f.vy += CFG.gravity * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.y >= CFG.groundY) {
      f.y = CFG.groundY;
      f.vy = 0;
      if (f.state === "jump") f.setState(move ? "walk" : "idle");
    } else if (f.state !== "jump") {
      f.setState("jump");
    }

    if (f.grounded() && !f.busy()) {
      if (move !== 0) f.setState("walk");
      else if (f.state !== "block") f.setState("idle");
    }

    // Separate fighters
    const minGap = 54;
    const dx = foe.x - f.x;
    if (Math.abs(dx) < minGap && f.grounded() && foe.grounded()) {
      const push = (minGap - Math.abs(dx)) * 0.5;
      f.x -= Math.sign(dx || 1) * push;
      foe.x += Math.sign(dx || 1) * push;
    }

    f.x = clamp(f.x, 70, this.width - 70);
  }

  tryAttack(f, kind) {
    if (f.comboLock > 0) return;
    if (f.startAttack(kind) && kind !== "special") {
      f.vx += f.facing * (kind === "kick" ? 40 : 20);
    }
  }

  rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  resolveCombat(attacker, defender) {
    const hit = attacker.getHitbox();
    if (!hit) return;
    const hurt = defender.getHurtbox();
    if (!this.rectsOverlap(hit, hurt)) return;
    attacker.hitDone = true;
    if (defender.takeHit(hit, attacker.facing)) {
      attacker.meter = clamp(attacker.meter + hit.meter + 8, 0, 100);
      defender.meter = clamp(defender.meter + 6, 0, 100);
      this.shake = Math.max(this.shake, hit.kind === "special" ? 1.1 : 0.55);
      this.spawnHitFx((hit.x + hit.w / 2 + hurt.x + hurt.w / 2) / 2, hit.y + hit.h / 2, hit.kind);
    }
  }

  spawnSpecial(f) {
    if (f.characterId === "gip") {
      this.projectiles.push({
        type: "stamp",
        owner: f.role,
        x: f.x + f.facing * 40,
        y: f.y - 100,
        vx: f.facing * 520,
        life: 0.7,
        damage: 20,
        knock: 480,
        w: 54,
        h: 54,
        facing: f.facing,
      });
      this.spawnBurst(f.x + f.facing * 50, f.y - 100, "rgba(60,150,255,0.9)");
    } else {
      for (let i = 0; i < 3; i++) {
        this.projectiles.push({
          type: "paper",
          owner: f.role,
          x: f.x + f.facing * (30 + i * 8),
          y: f.y - 120 - i * 18,
          vx: f.facing * (380 + i * 40),
          vy: -40 + i * 35,
          life: 0.85,
          damage: 9,
          knock: 260,
          w: 34,
          h: 24,
          facing: f.facing,
          rot: (Math.random() - 0.5) * 0.8,
        });
      }
      this.spawnBurst(f.x + f.facing * 40, f.y - 110, "rgba(240,230,200,0.95)");
    }
  }

  updateProjectiles(dt) {
    const fighters = [this.p1, this.p2];
    for (const p of this.projectiles) {
      p.life -= dt;
      p.x += p.vx * dt;
      if (p.vy != null) {
        p.vy += 400 * dt;
        p.y += p.vy * dt;
      }
      for (const f of fighters) {
        if (f.role === p.owner || f.state === "ko") continue;
        const hurt = f.getHurtbox();
        const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
        if (this.rectsOverlap(box, hurt)) {
          const attacker = f.role === "p1" ? this.p2 : this.p1;
          if (f.takeHit({ damage: p.damage, knock: p.knock, kind: "special" }, p.facing)) {
            attacker.meter = clamp(attacker.meter + 10, 0, 100);
            this.shake = 0.9;
            this.spawnHitFx(p.x, p.y, "special");
          }
          p.life = 0;
        }
      }
    }
    this.projectiles = this.projectiles.filter((p) => p.life > 0 && p.x > -80 && p.x < this.width + 80);
  }

  spawnHitFx(x, y, kind) {
    const n = kind === "special" ? 18 : 10;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 60 + Math.random() * 160;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - 40,
        life: 0.25 + Math.random() * 0.25,
        maxLife: 0.5,
        size: 2 + Math.random() * 3,
        color: kind === "special" ? "rgba(80,170,255,0.9)" : "rgba(255,180,120,0.9)",
      });
    }
  }

  spawnBurst(x, y, color) {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 40 + Math.random() * 120;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: 0.3,
        maxLife: 0.3,
        size: 3,
        color,
      });
    }
  }

  updateParticles(dt) {
    for (const p of this.particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 180 * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  render(time) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.save();
    if (this.shake > 0) {
      ctx.translate((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 8);
    }
    this.drawArena(ctx, time);
    if (!this.p1) {
      this.drawMenu(ctx);
      ctx.restore();
      return;
    }
    this.drawHUD(ctx);
    this.drawFighter(ctx, this.p1, time);
    this.drawFighter(ctx, this.p2, time);
    this.drawProjectiles(ctx);
    this.drawParticles(ctx);
    this.drawAnnouncer(ctx);
    ctx.restore();
  }

  drawMenu(ctx) {
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    roundedRectPath(ctx, this.width / 2 - 300, this.height / 2 - 70, 600, 140, 18);
    ctx.fill();
    ctx.fillStyle = "#194776";
    ctx.font = "800 28px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ГИП Clash", this.width / 2, this.height / 2 - 18);
    ctx.fillStyle = "#446387";
    ctx.font = "600 16px Manrope, sans-serif";
    ctx.fillText("Выбери бой с ИИ или локальный матч вдвоём", this.width / 2, this.height / 2 + 22);
    ctx.textAlign = "left";
  }

  drawArena(ctx, time) {
    const t = time / 1000;
    const sky = ctx.createLinearGradient(0, 0, 0, this.height);
    sky.addColorStop(0, "#f2e6d4");
    sky.addColorStop(0.45, "#e7f0f8");
    sky.addColorStop(1, "#c8dcf0");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.width, this.height);

    // Office towers / site skyline
    for (let i = 0; i < 10; i++) {
      const x = 40 + i * 110;
      const h = 70 + ((i * 37) % 5) * 22;
      const y = CFG.groundY - 40 - h;
      ctx.fillStyle = i % 2 ? "rgba(90,120,150,0.22)" : "rgba(120,95,70,0.18)";
      roundedRectPath(ctx, x, y, 78, h, 6);
      ctx.fill();
      ctx.fillStyle = "rgba(255,240,180,0.35)";
      for (let wy = y + 14; wy < y + h - 20; wy += 18) {
        for (let wx = x + 10; wx < x + 68; wx += 16) {
          ctx.globalAlpha = 0.25 + Math.sin(t + wx * 0.04) * 0.15;
          ctx.fillRect(wx, wy, 7, 9);
        }
      }
      ctx.globalAlpha = 1;
    }

    // Floor
    const floor = ctx.createLinearGradient(0, CFG.groundY - 8, 0, this.height);
    floor.addColorStop(0, "#8aa4bc");
    floor.addColorStop(0.2, "#6f8eab");
    floor.addColorStop(1, "#557693");
    ctx.fillStyle = floor;
    ctx.fillRect(0, CFG.groundY, this.width, this.height - CFG.groundY);
    ctx.fillStyle = "#9eb6cb";
    ctx.fillRect(0, CFG.groundY - 8, this.width, 10);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x < this.width; x += 56) {
      ctx.moveTo(x, CFG.groundY + 28);
      ctx.lineTo(x + 22, CFG.groundY + 40);
    }
    ctx.stroke();

    // Center seal
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.strokeStyle = "#194776";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(this.width / 2, CFG.groundY - 8, 54, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = "800 14px Manrope, sans-serif";
    ctx.fillStyle = "#194776";
    ctx.textAlign = "center";
    ctx.fillText("СОГЛАСОВАНО", this.width / 2, CFG.groundY - 4);
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawHUD(ctx) {
    this.drawFighterHud(ctx, this.p1, 18, false);
    this.drawFighterHud(ctx, this.p2, this.width - 318, true);

    // Round pips
    ctx.save();
    ctx.textAlign = "center";
    ctx.fillStyle = "#194776";
    ctx.font = "800 16px Manrope, sans-serif";
    ctx.fillText(`Раунд ${this.round}`, this.width / 2, 28);
    for (let i = 0; i < CFG.roundsToWin; i++) {
      ctx.fillStyle = i < this.p1.roundsWon ? "#2fa56c" : "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(this.width / 2 - 34 - i * 18, 48, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i < this.p2.roundsWon ? "#2fa56c" : "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(this.width / 2 + 34 + i * 18, 48, 6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = "left";
    ctx.restore();
  }

  drawFighterHud(ctx, f, x, mirror) {
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    roundedRectPath(ctx, x, 14, 300, 78, 14);
    ctx.fill();
    ctx.fillStyle = "#213a58";
    ctx.font = "800 17px Manrope, sans-serif";
    ctx.fillText(f.character.name, x + 12, 36);
    ctx.fillStyle = "rgba(190,70,70,0.16)";
    roundedRectPath(ctx, x + 12, 46, 276, 12, 6);
    ctx.fill();
    const hpRatio = f.hp / CFG.maxHp;
    const grad = ctx.createLinearGradient(x + 12, 0, x + 288, 0);
    grad.addColorStop(0, hpRatio > 0.35 ? "#2fa56c" : "#d94d4d");
    grad.addColorStop(1, hpRatio > 0.35 ? "#55d090" : "#f07878");
    ctx.fillStyle = grad;
    roundedRectPath(ctx, x + 12, 46, 276 * hpRatio, 12, 6);
    ctx.fill();

    ctx.fillStyle = "rgba(25,71,118,0.12)";
    roundedRectPath(ctx, x + 12, 66, 276, 10, 5);
    ctx.fill();
    ctx.fillStyle = "#f0b429";
    roundedRectPath(ctx, x + 12, 66, 276 * (f.meter / 100), 10, 5);
    ctx.fill();
    ctx.fillStyle = "#446387";
    ctx.font = "700 11px Manrope, sans-serif";
    ctx.fillText(f.meter >= 100 ? f.character.specialName : "Согласование", x + 14, 74);
    ctx.restore();
  }

  getFrameName(f, time) {
    if (f.state === "ko") return "hurt";
    if (f.state === "win") return "win";
    if (f.state === "hurt") return "hurt";
    if (f.state === "block") return "block";
    if (f.state === "punch") return "punch";
    if (f.state === "kick") return "kick";
    if (f.state === "special") return "special";
    if (f.state === "jump") return "jump";
    if (f.state === "walk") {
      const frames = ["walk1", "walk2", "walk3", "walk2"];
      return frames[Math.floor(time / 140) % frames.length];
    }
    return "idle";
  }

  drawFighter(ctx, f, time) {
    const frames = this.sprites[f.characterId] || {};
    const name = this.getFrameName(f, time);
    const image = frames[name] || frames.idle;
    const bob = f.state === "idle" ? Math.sin(time / 320) * 1.5 : 0;

    ctx.save();
    ctx.fillStyle = "rgba(30,50,80,0.2)";
    ctx.beginPath();
    ctx.ellipse(f.x, CFG.groundY + 4, 46, 8, 0, 0, Math.PI * 2);
    ctx.fill();

    if (image) {
      ctx.translate(f.x, f.y + bob);
      ctx.scale(f.facing, 1);
      const scale = Math.min(CFG.charW / image.naturalWidth, CFG.charH / image.naturalHeight);
      const dw = image.naturalWidth * scale;
      const dh = image.naturalHeight * scale;
      if (f.hitFlash > 0) ctx.filter = `brightness(${1 + f.hitFlash})`;
      ctx.drawImage(image, -dw / 2, -dh, dw, dh);
      ctx.filter = "none";
    } else {
      ctx.fillStyle = f.character.color;
      roundedRectPath(ctx, f.x - 24, f.y - 120, 48, 100, 14);
      ctx.fill();
    }
    ctx.restore();
  }

  drawProjectiles(ctx) {
    for (const p of this.projectiles) {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      if (p.type === "stamp") {
        ctx.fillStyle = "#1f6fad";
        roundedRectPath(ctx, -24, -24, 48, 48, 8);
        ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.8)";
        ctx.lineWidth = 3;
        ctx.strokeRect(-16, -16, 32, 32);
        ctx.fillStyle = "#fff";
        ctx.font = "800 11px Manrope, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("ОК", 0, 4);
      } else {
        ctx.fillStyle = "#f7f1df";
        ctx.strokeStyle = "#c9b896";
        ctx.lineWidth = 1.5;
        roundedRectPath(ctx, -18, -12, 36, 24, 3);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = "rgba(180,60,60,0.7)";
        ctx.beginPath();
        ctx.moveTo(-10, -4);
        ctx.lineTo(10, -4);
        ctx.moveTo(-8, 3);
        ctx.lineTo(8, 3);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  drawParticles(ctx) {
    for (const p of this.particles) {
      ctx.globalAlpha = clamp(p.life / (p.maxLife || 0.4), 0, 1);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  drawAnnouncer(ctx) {
    if (!this.announcer) return;
    ctx.save();
    ctx.fillStyle = "rgba(20,50,90,0.2)";
    roundedRectPath(ctx, this.width / 2 - 190, this.height / 2 - 42, 380, 84, 16);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.94)";
    roundedRectPath(ctx, this.width / 2 - 196, this.height / 2 - 48, 392, 84, 16);
    ctx.fill();
    ctx.fillStyle = "#194776";
    ctx.font = "800 34px Manrope, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(this.announcer, this.width / 2, this.height / 2 + 10);
    ctx.textAlign = "left";
    ctx.restore();
  }
}

(function init() {
  const canvas = document.getElementById("fightCanvas");
  if (!canvas) return;
  new FightGame(canvas);
})();
