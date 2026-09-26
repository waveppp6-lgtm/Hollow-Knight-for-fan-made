// ============================================================
// HOLLOW SHADE ENGINE v2 - Enhanced Core Systems
// ============================================================
'use strict';

const HK = {
    TILE_SIZE: 32,
    CANVAS_W: 960,
    CANVAS_H: 544,
    // Physics - tuned for floaty Hollow Knight feel
    GRAVITY_UP: 0.55,      // Rising gravity (lower = more hang time)
    GRAVITY_DOWN: 0.7,     // Falling gravity
    GRAVITY_APEX: 0.3,     // Apex gravity (near vy=0, very floaty)
    APEX_THRESHOLD: 2.0,    // vy threshold for apex zone
    MAX_FALL: 10,
    GRAVITY: 0.6,
    gameState: 'title',
    canvas: null,
    ctx: null,
    deltaTime: 0,
    lastTime: 0,
    frameCount: 0,
    transitionAlpha: 0,
    transitionTarget: null,
    transitionSpawnId: null,
    areaNameTimer: 0,
    areaName: '',
    deathTimer: 0,
    hitStop: 0,
    hitStopMax: 0,
    bossDefeated: {},
    player: null,
    enemies: [],
    geoDrops: [],
    projectiles: [],
    currentRoom: null,
    currentRoomId: null,
    rooms: {},
    lastBenchRoom: 'room1',
    lastBenchSpawn: 'start',
    screenFlash: 0,
    screenFlashColor: '#fff',
};

// ============================================================
// UTILITIES
// ============================================================
HK.lerp = (a, b, t) => a + (b - a) * t;
HK.clamp = (v, min, max) => Math.max(min, Math.min(max, v));
HK.dist = (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
HK.sign = (x) => x > 0 ? 1 : x < 0 ? -1 : 0;
HK.randRange = (min, max) => min + Math.random() * (max - min);
HK.randInt = (min, max) => Math.floor(HK.randRange(min, max + 1));
HK.approach = (current, target, step) => {
    if (current < target) return Math.min(current + step, target);
    if (current > target) return Math.max(current - step, target);
    return target;
};

// Adaptive gravity based on vertical velocity
HK.getGravity = (vy, holdingJump) => {
    if (Math.abs(vy) < HK.APEX_THRESHOLD) return HK.GRAVITY_APEX;
    if (vy < 0 && holdingJump) return HK.GRAVITY_UP;
    return HK.GRAVITY_DOWN;
};

// ============================================================
// INPUT MANAGER
// ============================================================
HK.Input = {
    keys: {},
    _justPressed: {},
    _justReleased: {},
    init() {
        window.addEventListener('keydown', (e) => {
            if (!this.keys[e.code]) this._justPressed[e.code] = true;
            this.keys[e.code] = true;
            if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;
            this._justReleased[e.code] = true;
        });
    },
    update() { this._justPressed = {}; this._justReleased = {}; },
    isDown(code) { return !!this.keys[code]; },
    isPressed(code) { return !!this._justPressed[code]; },
    isReleased(code) { return !!this._justReleased[code]; },
};

// ============================================================
// AUDIO MANAGER
// ============================================================
HK.Audio = {
    ctx: null, initialized: false,
    init() {
        if (this.initialized) return;
        try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); this.initialized = true; } catch(e) {}
    },
    _noise(dur) {
        const ac = this.ctx, len = ac.sampleRate * dur;
        const buf = ac.createBuffer(1, len, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    },
    play(name) {
        if (!this.ctx) this.init();
        if (!this.ctx) return;
        const ac = this.ctx, t = ac.currentTime;
        try {
            switch(name) {
                case 'nail_swing': {
                    const s = ac.createBufferSource(); s.buffer = this._noise(0.1);
                    const bp = ac.createBiquadFilter(); bp.type='bandpass'; bp.frequency.value=2500; bp.Q.value=1.5;
                    const g = ac.createGain(); g.gain.setValueAtTime(0.18, t); g.gain.exponentialRampToValueAtTime(0.001, t+0.08);
                    s.connect(bp).connect(g).connect(ac.destination); s.start(t); s.stop(t+0.1);
                    break;
                }
                case 'nail_hit': {
                    // Meaty thud + click
                    const o = ac.createOscillator(); o.type='square'; o.frequency.setValueAtTime(200,t); o.frequency.exponentialRampToValueAtTime(40,t+0.12);
                    const g = ac.createGain(); g.gain.setValueAtTime(0.25,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
                    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.12);
                    // High click
                    const o2 = ac.createOscillator(); o2.type='sine'; o2.frequency.value=800;
                    const g2 = ac.createGain(); g2.gain.setValueAtTime(0.1,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.04);
                    o2.connect(g2).connect(ac.destination); o2.start(t); o2.stop(t+0.04);
                    break;
                }
                case 'player_damage': {
                    const o = ac.createOscillator(); o.type='sawtooth'; o.frequency.setValueAtTime(80,t); o.frequency.exponentialRampToValueAtTime(25,t+0.35);
                    const g = ac.createGain(); g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.35);
                    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.35);
                    break;
                }
                case 'heal': {
                    const o = ac.createOscillator(); o.type='sine';
                    o.frequency.setValueAtTime(400,t); o.frequency.linearRampToValueAtTime(800,t+0.5);
                    const g = ac.createGain(); g.gain.setValueAtTime(0.1,t); g.gain.linearRampToValueAtTime(0.14,t+0.3); g.gain.exponentialRampToValueAtTime(0.001,t+0.5);
                    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.5);
                    // Harmony
                    const o2 = ac.createOscillator(); o2.type='sine';
                    o2.frequency.setValueAtTime(600,t); o2.frequency.linearRampToValueAtTime(1000,t+0.5);
                    const g2 = ac.createGain(); g2.gain.setValueAtTime(0.05,t); g2.gain.exponentialRampToValueAtTime(0.001,t+0.5);
                    o2.connect(g2).connect(ac.destination); o2.start(t); o2.stop(t+0.5);
                    break;
                }
                case 'jump': {
                    const o = ac.createOscillator(); o.type='sine'; o.frequency.setValueAtTime(220,t); o.frequency.exponentialRampToValueAtTime(440,t+0.08);
                    const g = ac.createGain(); g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.1);
                    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.1);
                    break;
                }
                case 'dash': {
                    const s = ac.createBufferSource(); s.buffer = this._noise(0.18);
                    const hp = ac.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=1200;
                    const g = ac.createGain(); g.gain.setValueAtTime(0.14,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.18);
                    s.connect(hp).connect(g).connect(ac.destination); s.start(t); s.stop(t+0.18);
                    break;
                }
                case 'geo_collect': {
                    const o = ac.createOscillator(); o.type='sine'; o.frequency.value=1200+Math.random()*400;
                    const g = ac.createGain(); g.gain.setValueAtTime(0.07,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
                    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.06);
                    break;
                }
                case 'enemy_death': {
                    const s = ac.createBufferSource(); s.buffer = this._noise(0.25);
                    const lp = ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.setValueAtTime(900,t); lp.frequency.exponentialRampToValueAtTime(80,t+0.25);
                    const g = ac.createGain(); g.gain.setValueAtTime(0.18,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.25);
                    s.connect(lp).connect(g).connect(ac.destination); s.start(t); s.stop(t+0.25);
                    break;
                }
                case 'boss_roar': {
                    const o = ac.createOscillator(); o.type='sawtooth'; o.frequency.value=55;
                    const lfo = ac.createOscillator(); lfo.frequency.value=7;
                    const lg = ac.createGain(); lg.gain.value=25;
                    lfo.connect(lg).connect(o.frequency);
                    const g = ac.createGain(); g.gain.setValueAtTime(0.22,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.6);
                    o.connect(g).connect(ac.destination); o.start(t); lfo.start(t); o.stop(t+0.6); lfo.stop(t+0.6);
                    break;
                }
                case 'menu_select': {
                    const o = ac.createOscillator(); o.type='sine'; o.frequency.value=600;
                    const g = ac.createGain(); g.gain.setValueAtTime(0.1,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.12);
                    o.connect(g).connect(ac.destination); o.start(t); o.stop(t+0.12);
                    break;
                }
                case 'bench_sit': {
                    [400,500,600,750].forEach((f,i) => {
                        const o = ac.createOscillator(); o.type='sine'; o.frequency.value=f;
                        const g = ac.createGain(); g.gain.setValueAtTime(0,t+i*0.12);
                        g.gain.linearRampToValueAtTime(0.07,t+i*0.12+0.06);
                        g.gain.exponentialRampToValueAtTime(0.001,t+0.6);
                        o.connect(g).connect(ac.destination); o.start(t+i*0.12); o.stop(t+0.6);
                    });
                    break;
                }
                case 'land': {
                    const s = ac.createBufferSource(); s.buffer = this._noise(0.06);
                    const lp = ac.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=400;
                    const g = ac.createGain(); g.gain.setValueAtTime(0.08,t); g.gain.exponentialRampToValueAtTime(0.001,t+0.06);
                    s.connect(lp).connect(g).connect(ac.destination); s.start(t); s.stop(t+0.06);
                    break;
                }
            }
        } catch(e) {}
    }
};

// ============================================================
// CAMERA - Enhanced with look-ahead & deadzone
// ============================================================
HK.Camera = {
    x: 0, y: 0,
    targetX: 0, targetY: 0,
    shakeX: 0, shakeY: 0,
    shakeIntensity: 0,
    shakeTimer: 0,
    shakeMaxTimer: 0,
    lookAheadX: 0,
    lookAheadY: 0,
    smoothSpeed: 0.06,

    follow(target, roomWidth, roomHeight) {
        // Look-ahead based on facing and velocity
        const targetLookX = target.facing * 40 + target.vx * 8;
        const targetLookY = target.vy > 2 ? target.vy * 6 : target.vy < -2 ? target.vy * 3 : 0;
        this.lookAheadX = HK.lerp(this.lookAheadX, targetLookX, 0.03);
        this.lookAheadY = HK.lerp(this.lookAheadY, targetLookY, 0.04);

        this.targetX = target.x + target.width / 2 - HK.CANVAS_W / 2 + this.lookAheadX;
        this.targetY = target.y + target.height / 2 - HK.CANVAS_H / 2 + this.lookAheadY;
        this.targetX = HK.clamp(this.targetX, 0, Math.max(0, roomWidth - HK.CANVAS_W));
        this.targetY = HK.clamp(this.targetY, 0, Math.max(0, roomHeight - HK.CANVAS_H));

        // Smooth lerp with variable speed
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const speed = dist > 100 ? 0.12 : this.smoothSpeed;

        this.x = HK.lerp(this.x, this.targetX, speed);
        this.y = HK.lerp(this.y, this.targetY, speed);
    },

    shake(intensity, frames) {
        if (intensity > this.shakeIntensity) {
            this.shakeIntensity = intensity;
            this.shakeTimer = frames;
            this.shakeMaxTimer = frames;
        }
    },

    update() {
        if (this.shakeTimer > 0) {
            this.shakeTimer--;
            const ratio = this.shakeTimer / this.shakeMaxTimer;
            const ease = ratio * ratio;
            this.shakeX = (Math.random() - 0.5) * this.shakeIntensity * ease * 2;
            this.shakeY = (Math.random() - 0.5) * this.shakeIntensity * ease * 2;
        } else {
            this.shakeX = 0; this.shakeY = 0;
            this.shakeIntensity = 0;
        }
    },

    apply(ctx) {
        ctx.save();
        ctx.translate(Math.round(-this.x + this.shakeX), Math.round(-this.y + this.shakeY));
    },
    reset(ctx) { ctx.restore(); },

    snapTo(x, y) { this.x = x; this.y = y; this.targetX = x; this.targetY = y; this.lookAheadX = 0; this.lookAheadY = 0; }
};

// ============================================================
// PARTICLE SYSTEM - Enhanced with more options
// ============================================================
HK.Particles = {
    list: [],
    emit(x, y, opts = {}) {
        const count = opts.count || 5;
        const color = opts.color || '#fff';
        const speed = opts.speed || 2;
        const life = opts.life || 30;
        const size = opts.size || 3;
        const gravity = opts.gravity || 0;
        const spread = opts.spread || Math.PI * 2;
        const angle = opts.angle || 0;
        const fadeStyle = opts.fade || 'linear'; // linear, late
        const shape = opts.shape || 'rect'; // rect, circle

        for (let i = 0; i < count; i++) {
            const a = angle + (Math.random() - 0.5) * spread;
            const s = speed * (0.3 + Math.random() * 0.7);
            this.list.push({
                x: x + (Math.random() - 0.5) * 8,
                y: y + (Math.random() - 0.5) * 8,
                vx: Math.cos(a) * s,
                vy: Math.sin(a) * s,
                life: life * (0.7 + Math.random() * 0.3),
                maxLife: life,
                size: size * (0.4 + Math.random() * 0.6),
                color, gravity, alpha: 1, fadeStyle, shape
            });
        }
    },
    update() {
        for (let i = this.list.length - 1; i >= 0; i--) {
            const p = this.list[i];
            p.x += p.vx; p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.98;
            p.life--;
            if (p.fadeStyle === 'late') {
                p.alpha = p.life < p.maxLife * 0.3 ? p.life / (p.maxLife * 0.3) : 1;
            } else {
                p.alpha = p.life / p.maxLife;
            }
            if (p.life <= 0) this.list.splice(i, 1);
        }
    },
    draw(ctx) {
        for (const p of this.list) {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = p.color;
            if (p.shape === 'circle') {
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
            }
        }
        ctx.globalAlpha = 1;
    },
    clear() { this.list = []; }
};

// ============================================================
// COLLISION SYSTEM
// ============================================================
HK.Collision = {
    rectRect(a, b) {
        return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
    },
    getTile(tiles, col, row) {
        if (row < 0 || row >= tiles.length || col < 0 || col >= tiles[0].length) return 0;
        return tiles[row][col];
    },
    isSolid(tile) { return tile === 1 || tile === 4; },
    isSpike(tile) { return tile === 3; },
    isPlatform(tile) { return tile === 2; },

    resolveX(entity, tiles) {
        const T = HK.TILE_SIZE;
        const left = Math.floor(entity.x / T);
        const right = Math.floor((entity.x + entity.width - 1) / T);
        const top = Math.floor(entity.y / T);
        const bottom = Math.floor((entity.y + entity.height - 1) / T);
        entity.touchingWall = false;
        entity.wallDir = 0;
        for (let row = top; row <= bottom; row++) {
            for (let col = left; col <= right; col++) {
                if (this.isSolid(this.getTile(tiles, col, row))) {
                    if (entity.vx > 0) { entity.x = col * T - entity.width; entity.touchingWall = true; entity.wallDir = 1; }
                    else if (entity.vx < 0) { entity.x = (col + 1) * T; entity.touchingWall = true; entity.wallDir = -1; }
                    entity.vx = 0;
                }
            }
        }
    },
    resolveY(entity, tiles) {
        const T = HK.TILE_SIZE;
        const left = Math.floor(entity.x / T);
        const right = Math.floor((entity.x + entity.width - 1) / T);
        const top = Math.floor(entity.y / T);
        const bottom = Math.floor((entity.y + entity.height - 1) / T);
        entity.onGround = false;
        let hitSpike = false;
        for (let row = top; row <= bottom; row++) {
            for (let col = left; col <= right; col++) {
                const tile = this.getTile(tiles, col, row);
                if (this.isSolid(tile)) {
                    if (entity.vy > 0) { entity.y = row * T - entity.height; entity.onGround = true; }
                    else if (entity.vy < 0) { entity.y = (row + 1) * T; }
                    entity.vy = 0;
                } else if (this.isPlatform(tile) && entity.vy > 0) {
                    const platTop = row * T;
                    const prevBot = entity.y + entity.height - entity.vy;
                    if (prevBot <= platTop + 2) {
                        entity.y = platTop - entity.height;
                        entity.vy = 0;
                        entity.onGround = true;
                    }
                }
                if (this.isSpike(tile)) hitSpike = true;
            }
        }
        return hitSpike ? 'spike' : null;
    }
};

// ============================================================
// FOG / ATMOSPHERE SYSTEM
// ============================================================
HK.Fog = {
    layers: [],
    init() {
        this.layers = [];
        for (let i = 0; i < 3; i++) {
            this.layers.push({
                offset: Math.random() * 1000,
                speed: 0.1 + i * 0.08,
                y: 0.3 + i * 0.25,
                alpha: 0.04 - i * 0.01,
                scale: 80 + i * 40,
            });
        }
    },
    draw(ctx, roomWidth, roomHeight, type) {
        if (this.layers.length === 0) this.init();
        for (const layer of this.layers) {
            layer.offset += layer.speed;
            const baseAlpha = type === 'springs' ? layer.alpha * 1.5 : type === 'boss' ? layer.alpha * 0.7 : layer.alpha;
            const fogColor = type === 'springs' ? '100,160,180' : type === 'boss' ? '120,40,30' : '80,90,130';

            for (let i = -1; i < Math.ceil(roomWidth / layer.scale) + 2; i++) {
                const fx = i * layer.scale + Math.sin(layer.offset * 0.01 + i) * 30 - (HK.Camera.x * (0.1 + this.layers.indexOf(layer) * 0.05)) % layer.scale;
                const fy = roomHeight * layer.y + Math.sin(layer.offset * 0.008 + i * 2) * 40;
                ctx.fillStyle = `rgba(${fogColor}, ${baseAlpha + Math.sin(HK.frameCount * 0.01 + i) * 0.01})`;
                ctx.beginPath();
                ctx.ellipse(fx, fy, layer.scale * 1.5, layer.scale * 0.6, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }
};

// ============================================================
// SPRITE DRAWING - Enhanced animations
// ============================================================
HK.Sprite = {
    // ---- KNIGHT ----
    drawKnight(ctx, x, y, facing, state, frame, extra) {
        extra = extra || {};
        ctx.save();
        const cx = x + 13, cy = y + 16;
        ctx.translate(cx, cy);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.translate(-13, -16);

        let bobY = 0, leanX = 0, legRot = 0, armPos = 0;
        let isJump = state === 'jump', isFall = state === 'fall';
        let isDash = state === 'dash', isWall = state === 'wall_slide';
        let isHeal = state === 'heal', isHurt = state === 'hurt';
        let isAttack = state === 'attack';

        if (state === 'idle') bobY = Math.sin(frame * 0.07) * 1.5;
        if (state === 'run') { bobY = Math.sin(frame * 0.4) * 2.5; leanX = 2; legRot = Math.sin(frame * 0.4) * 0.5; }
        if (isJump) { bobY = -2; leanX = 1; armPos = 1; }
        if (isFall) { bobY = -1; armPos = -1; }
        if (isDash) { bobY = 2; leanX = 6; }
        if (isWall) { leanX = -3; bobY = 0; }
        if (isHeal) { bobY = 4 + Math.sin(frame * 0.1) * 1; leanX = 0; }
        if (isHurt) { leanX = -4; bobY = -2; }
        if (isAttack) { leanX = 4; }

        ctx.translate(leanX, bobY);

        // Dashboard trail
        if (isDash) {
            for(let i=1; i<=3; i++) {
                ctx.globalAlpha = 0.4 / i;
                ctx.fillStyle = '#222233';
                ctx.beginPath(); ctx.ellipse(13 - i * 12, 16, 8, 14, -Math.PI/4, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }

        // Heal Aura
        if (isHeal) {
            const glow = 0.3 + Math.sin(frame * 0.1) * 0.2;
            ctx.fillStyle = `rgba(220, 240, 255, ${glow})`;
            ctx.beginPath(); ctx.ellipse(13, 16, 20, 20, 0, 0, Math.PI*2); ctx.fill();
            // particles
            for(let i=0; i<3; i++) {
                let pa = frame*0.1 + i*Math.PI*0.6;
                let pr = 20 - (frame + i*10)%20;
                ctx.fillStyle = '#fff';
                ctx.beginPath(); ctx.arc(13 + Math.cos(pa)*pr, 16 + Math.sin(pa)*pr, 1.5, 0, Math.PI*2); ctx.fill();
            }
        }

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(13, 33 - bobY, 12, 3, 0, 0, Math.PI * 2); ctx.fill();

        // Cape
        ctx.fillStyle = '#1c1c28';
        ctx.beginPath();
        if (isJump || isFall) {
            ctx.moveTo(4, 13);
            ctx.quadraticCurveTo(-2, 20, 4, 30 + (isFall?-4:4));
            ctx.lineTo(8, 33 + (isFall?-2:2));
            ctx.lineTo(15, 30);
            ctx.quadraticCurveTo(18, 20, 20, 13);
        } else if (isDash) {
            ctx.moveTo(4, 13);
            ctx.lineTo(-8, 18);
            ctx.lineTo(-12, 22);
            ctx.lineTo(0, 26);
            ctx.lineTo(15, 22);
            ctx.lineTo(20, 13);
        } else if (isWall) {
            ctx.moveTo(-2, 13); ctx.lineTo(-4, 32); ctx.lineTo(12, 34); ctx.lineTo(18, 13);
        } else if (isHeal) {
            ctx.moveTo(2, 13); ctx.quadraticCurveTo(-5, 28, 5, 33); ctx.lineTo(21, 33); ctx.quadraticCurveTo(31, 28, 24, 13);
        } else {
            // idle, run
            ctx.moveTo(4, 13);
            ctx.quadraticCurveTo(2 - legRot*2, 22, 3 - legRot*5, 31);
            ctx.lineTo(8, 33); ctx.lineTo(13, 34); ctx.lineTo(18, 33);
            ctx.lineTo(23 + legRot*3, 31);
            ctx.quadraticCurveTo(24, 22, 22, 13);
        }
        ctx.closePath();
        ctx.fill();

        // Cape highlight/fold
        ctx.fillStyle = '#2c2c3e';
        ctx.beginPath();
        if (isDash) {
            ctx.moveTo(4, 14); ctx.lineTo(-6, 20); ctx.lineTo(5, 24); ctx.lineTo(12, 15);
        } else {
            ctx.moveTo(8, 15); ctx.quadraticCurveTo(7, 23, 8, 30); ctx.lineTo(14, 32); ctx.lineTo(15, 15);
        }
        ctx.closePath();
        ctx.fill();

        // Nail (sword)
        if (isAttack) {
            ctx.fillStyle = '#d0d8e8';
            ctx.beginPath(); ctx.moveTo(22, 18); ctx.lineTo(40, 14); ctx.lineTo(42, 16); ctx.lineTo(22, 20); ctx.fill();
        }

        // Head Mask
        ctx.fillStyle = '#eef0f8';
        if (isHeal) ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        if (isDash) ctx.ellipse(17, 12, 11, 8, 0.2, 0, Math.PI*2);
        else ctx.ellipse(13, 10, 10, 11, 0, 0, Math.PI*2);
        ctx.fill();

        // Head Shading
        ctx.fillStyle = 'rgba(0,0,0,0.08)';
        ctx.beginPath(); ctx.ellipse(15, 12, 7, 8, 0.2, 0, Math.PI*2); ctx.fill();

        // Horns
        let hx = isDash ? 4 : 0, hy = isDash ? 2 : 0;
        ctx.fillStyle = '#eef0f8';
        ctx.beginPath(); ctx.moveTo(6+hx, 4+hy); ctx.quadraticCurveTo(-2+hx, -8+hy, 1+hx, -12+hy); ctx.quadraticCurveTo(6+hx, -6+hy, 9+hx, 2+hy); ctx.fill();
        ctx.beginPath(); ctx.moveTo(18+hx, 4+hy); ctx.quadraticCurveTo(28+hx, -8+hy, 25+hx, -12+hy); ctx.quadraticCurveTo(20+hx, -6+hy, 17+hx, 2+hy); ctx.fill();

        // Eyes (Void)
        ctx.fillStyle = '#080812';
        if (isHurt) {
            ctx.beginPath(); ctx.ellipse(10+hx, 11+hy, 3, 2, -0.2, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(17+hx, 11+hy, 3, 2, 0.2, 0, Math.PI*2); ctx.fill();
        } else {
            ctx.beginPath(); ctx.ellipse(9+hx, 10+hy, 3.5, 4.5, -0.15, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(17+hx, 10+hy, 3.5, 4.5, 0.15, 0, Math.PI*2); ctx.fill();
        }

        ctx.restore();
    },

    // Slash effect - arc-based
    drawNailSlash(ctx, x, y, w, h, dir, timer, maxTimer) {
        const progress = 1 - timer / maxTimer;
        ctx.save();

        const intensity = timer / maxTimer;
        ctx.globalAlpha = intensity * 0.85;

        const cx = x + w / 2, cy = y + h / 2;
        const radius = 35;

        // Outer glow
        ctx.strokeStyle = 'rgba(200, 210, 230, 0.3)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';

        let startA, sweepA;
        if (dir === 'right') { startA = -1.2; sweepA = 2.4 * progress; }
        else if (dir === 'left') { startA = Math.PI - 1.2; sweepA = 2.4 * progress; }
        else if (dir === 'up') { startA = -Math.PI * 0.8; sweepA = Math.PI * 0.6 * progress; }
        else { startA = Math.PI * 0.2; sweepA = Math.PI * 0.6 * progress; }

        ctx.beginPath();
        ctx.arc(dir === 'right' ? x : dir === 'left' ? x + w : cx,
                dir === 'up' ? y + h : dir === 'down' ? y : cy,
                radius + 4, startA, startA + sweepA);
        ctx.stroke();

        // Main slash
        ctx.strokeStyle = '#d0d8e8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(dir === 'right' ? x : dir === 'left' ? x + w : cx,
                dir === 'up' ? y + h : dir === 'down' ? y : cy,
                radius, startA, startA + sweepA);
        ctx.stroke();

        // Inner bright line
        ctx.strokeStyle = '#eef0ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(dir === 'right' ? x : dir === 'left' ? x + w : cx,
                dir === 'up' ? y + h : dir === 'down' ? y : cy,
                radius - 3, startA, startA + sweepA);
        ctx.stroke();

        ctx.restore();
    },

    // Hit flash effect
    drawHitFlash(ctx, x, y, w, h, timer) {
        if (timer <= 0) return;
        ctx.save();
        ctx.globalAlpha = timer * 0.2;
        ctx.fillStyle = '#ffffff';
        const cx = x + w / 2, cy = y + h / 2;
        const r = Math.max(w, h) * 0.8;
        ctx.beginPath();
        ctx.ellipse(cx, cy, r, r * 0.8, 0, 0, Math.PI * 2);
        ctx.fill();
        // Radial lines
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + timer * 0.5;
            ctx.beginPath();
            ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
            ctx.lineTo(cx + Math.cos(a) * r * (0.6 + timer * 0.1), cy + Math.sin(a) * r * (0.6 + timer * 0.1));
            ctx.stroke();
        }
        ctx.restore();
    },

    // ---- CRAWLID ----
    drawCrawlid(ctx, x, y, facing, frame) {
        ctx.save();
        ctx.translate(x + 15, y + 10);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.translate(-15, -10);

        let walk = Math.sin(frame * 0.4);
        let walk2 = Math.cos(frame * 0.4);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(15, 19, 12, 3, 0, 0, Math.PI*2); ctx.fill();

        // Legs (Articulated)
        ctx.strokeStyle = '#222'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
        for (let i = 0; i < 4; i++) {
            let lx = 5 + i * 6, ly = 14;
            let m = (i%2===0) ? walk : -walk;
            let m2 = (i%2===0) ? walk2 : -walk2;
            ctx.beginPath();
            ctx.moveTo(lx, ly);
            ctx.lineTo(lx - 2 + m*3, ly + 3 - m2*1.5);
            ctx.lineTo(lx + m*4, 20);
            ctx.stroke();
        }

        // Body Shell Segments
        let bY = Math.abs(walk) * -1;
        ctx.translate(0, bY);
        
        ctx.fillStyle = '#b84a2a';
        ctx.beginPath(); ctx.ellipse(15, 10, 14, 9, 0, 0, Math.PI*2); ctx.fill();
        
        // Segments
        ctx.fillStyle = '#9c3010';
        ctx.beginPath(); ctx.ellipse(10, 10, 5, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(15, 9.5, 5, 8.5, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(20, 10, 5, 8, 0, 0, Math.PI*2); ctx.fill();

        // Shell highlight
        ctx.fillStyle = 'rgba(255, 150, 100, 0.4)';
        ctx.beginPath(); ctx.ellipse(15, 6, 8, 3, 0, 0, Math.PI*2); ctx.fill();

        // Eye
        ctx.fillStyle = '#ffaa44';
        ctx.beginPath(); ctx.arc(24, 7, 3, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#331100';
        ctx.beginPath(); ctx.arc(25, 7, 1.5, 0, Math.PI*2); ctx.fill();
        
        // Antennae
        ctx.strokeStyle = '#442211'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(26, 5);
        ctx.quadraticCurveTo(32, 0, 29 + walk*3, -3); ctx.stroke();
        
        ctx.restore();
    },

    // ---- VENGEFLY ----
    drawVengefly(ctx, x, y, frame) {
        ctx.save();
        ctx.translate(x + 14, y + 14);
        const wf = Math.sin(frame * 0.8) * 22; // Faster wings
        const pulse = Math.sin(frame * 0.1) * 0.5;

        // Wing shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(0, 20, 12 + pulse*2, 4, 0, 0, Math.PI*2); ctx.fill();

        // Wings
        ctx.fillStyle = 'rgba(200, 220, 230, 0.7)';
        ctx.beginPath(); ctx.ellipse(-12, -4 + wf * 0.3, 14, 7, -0.3 + wf * 0.02, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(12, -4 + wf * 0.3, 14, 7, 0.3 - wf * 0.02, 0, Math.PI*2); ctx.fill();
        
        // Wing veins
        ctx.strokeStyle = 'rgba(100, 120, 140, 0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(-4, -4 + wf*0.3); ctx.quadraticCurveTo(-15, -10 + wf*0.3, -22, -2 + wf*0.3); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(4, -4 + wf*0.3); ctx.quadraticCurveTo(15, -10 + wf*0.3, 22, -2 + wf*0.3); ctx.stroke();

        ctx.scale(1 + pulse*0.05, 1 - pulse*0.05);

        // Body
        ctx.fillStyle = '#222';
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 13, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#333';
        ctx.beginPath(); ctx.ellipse(0, -2, 9, 10, 0, 0, Math.PI*2); ctx.fill();
        
        // Fur/Fuzz
        ctx.fillStyle = '#444';
        for(let i=0; i<8; i++) {
            let a = i * Math.PI/4;
            ctx.beginPath(); ctx.arc(Math.cos(a)*10, Math.sin(a)*12, 2, 0, Math.PI*2); ctx.fill();
        }

        // Eyes (Angry Glow)
        ctx.fillStyle = '#ff1111';
        ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 8;
        ctx.beginPath(); ctx.ellipse(-5, -4, 4, 5, -0.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(5, -4, 4, 5, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        // Pupils
        ctx.fillStyle = '#ffeebb';
        ctx.beginPath(); ctx.arc(-5, -4, 1.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(5, -4, 1.5, 0, Math.PI*2); ctx.fill();

        // Mandibles (open/close)
        let mand = Math.abs(Math.sin(frame * 0.2)) * 3;
        ctx.fillStyle = '#aaaaaa';
        ctx.beginPath(); ctx.moveTo(-3 - mand, 9); ctx.lineTo(-8 - mand, 16); ctx.lineTo(-1 - mand, 12); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(3 + mand, 9); ctx.lineTo(8 + mand, 16); ctx.lineTo(1 + mand, 12); ctx.closePath(); ctx.fill();

        ctx.restore();
    },

    // ---- HUSK GUARD ----
    drawHuskGuard(ctx, x, y, facing, frame) {
        ctx.save();
        ctx.translate(x + 14, y + 19);
        if (facing < 0) ctx.scale(-1, 1);
        ctx.translate(-14, -19);

        let walk = Math.sin(frame * 0.15) * 4;
        
        // Shield bobbing
        let sBob = Math.sin(frame * 0.2) * 2;
        let lean = Math.sin(frame * 0.1) * 2; // general lean
        
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(14, 38, 14, 4, 0, 0, Math.PI*2); ctx.fill();

        // Legs
        ctx.fillStyle = '#222228';
        ctx.beginPath(); ctx.moveTo(7, 32); ctx.lineTo(7, 37 + walk); ctx.lineTo(12, 38 + walk); ctx.lineTo(12, 32); ctx.fill();
        ctx.beginPath(); ctx.moveTo(16, 32); ctx.lineTo(16, 37 - walk); ctx.lineTo(21, 38 - walk); ctx.lineTo(21, 32); ctx.fill();

        ctx.translate(lean, Math.abs(walk)*-0.5);

        // Body Armored Segments
        ctx.fillStyle = '#4a4a55';
        ctx.beginPath(); ctx.ellipse(14, 21, 11, 12, 0, 0, Math.PI*2); ctx.fill();
        
        ctx.fillStyle = '#555566';
        ctx.beginPath(); ctx.ellipse(14, 15, 12, 8, 0, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(14, 25, 10, 6, 0, 0, Math.PI*2); ctx.fill();

        // Head
        ctx.fillStyle = '#3a3a44';
        ctx.beginPath(); ctx.ellipse(16, 8, 9, 10, 0.2, 0, Math.PI*2); ctx.fill();
        // Helmet top
        ctx.fillStyle = '#5a5a6a';
        ctx.beginPath(); ctx.ellipse(16, 4, 9, 6, 0.1, 0, Math.PI*2); ctx.fill();

        // Eyes (Glowing Amber)
        ctx.fillStyle = '#ffaa00';
        ctx.shadowColor = '#ff8800'; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.ellipse(12, 9, 3, 4, -0.2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(20, 9, 3, 4, 0.2, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        // Shield
        ctx.translate(sBob, -sBob);
        ctx.fillStyle = '#3a3a4a';
        ctx.beginPath();
        ctx.moveTo(22, 6); ctx.lineTo(28, 10); ctx.lineTo(30, 25); ctx.lineTo(26, 36); ctx.lineTo(20, 28);
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#222230'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(25, 8); ctx.lineTo(26, 32); ctx.stroke();

        ctx.restore();
    },

    // ---- GRUZ MOTHER ----
    drawGruzMother(ctx, x, y, frame, health, maxHealth) {
        ctx.save();
        ctx.translate(x + 32, y + 28);

        const rage = 1 - health / maxHealth;
        const pulse = Math.sin(frame * (0.08 + rage*0.1)) * (3 + rage*2);
        const wBuzz = Math.sin(frame * 1.5) * (10 + rage*5);
        
        let p2 = rage > 0.5;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(0, 32, 28 + pulse*0.5, 6, 0, 0, Math.PI*2); ctx.fill();

        // Wings
        ctx.fillStyle = p2 ? 'rgba(255, 150, 100, 0.6)' : 'rgba(200, 180, 150, 0.5)';
        ctx.beginPath(); ctx.ellipse(-25, -18 + wBuzz, 20, 12, -0.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(25, -18 + wBuzz, 20, 12, 0.5, 0, Math.PI*2); ctx.fill();
        
        ctx.strokeStyle = p2 ? 'rgba(200, 50, 20, 0.5)' : 'rgba(100, 80, 60, 0.4)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-15, -15 + wBuzz); ctx.lineTo(-40, -25 + wBuzz); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(15, -15 + wBuzz); ctx.lineTo(40, -25 + wBuzz); ctx.stroke();

        // Body inflate/deflate
        const r = p2 ? 220 : 160;
        const g = p2 ? 80 : 120;
        const b = p2 ? 40 : 80;
        
        // Body Glow (Phase 2)
        if (p2) {
            ctx.fillStyle = `rgba(255, 100, 0, ${0.2 + Math.sin(frame*0.2)*0.1})`;
            ctx.beginPath(); ctx.ellipse(0, 0, 38+pulse, 34+pulse, 0, 0, Math.PI*2); ctx.fill();
        }

        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.beginPath(); ctx.ellipse(0, 0, 34+pulse, 30+pulse, 0, 0, Math.PI*2); ctx.fill();
        
        // Shading
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath(); ctx.ellipse(5, 5, 28+pulse, 24+pulse, 0.2, 0, Math.PI*2); ctx.fill();

        // Patterns
        ctx.strokeStyle = p2 ? 'rgba(150, 20, 0, 0.6)' : 'rgba(80, 40, 20, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(0, 8, 24+pulse, 18+pulse, 0, 0, Math.PI); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(0, -2, 18+pulse, 12+pulse, 0, 0, Math.PI); ctx.stroke();

        // Eyes
        ctx.fillStyle = p2 ? '#ff0000' : '#ff8800';
        ctx.shadowColor = p2 ? '#ff5500' : '#ffcc00'; ctx.shadowBlur = 12;
        ctx.beginPath(); ctx.ellipse(-12, -8, 7, 8, -0.1, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(12, -8, 7, 8, 0.1, 0, Math.PI*2); ctx.fill();
        ctx.shadowBlur = 0;
        
        ctx.fillStyle = '#110000';
        ctx.beginPath(); ctx.arc(-12, -8, 2.5, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(12, -8, 2.5, 0, Math.PI*2); ctx.fill();

        // Mouth / Mandibles
        ctx.fillStyle = '#2a0a00';
        ctx.beginPath(); ctx.ellipse(0, 12, 12, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = '#eeddcc';
        for(let i=-2; i<=2; i++) {
            ctx.beginPath(); ctx.moveTo(i*5-2, 9); ctx.lineTo(i*5, 14); ctx.lineTo(i*5+2, 9); ctx.fill();
        }

        ctx.restore();
    },

    // ---- GEO ----
    drawGeo(ctx, x, y, frame) {
        ctx.save();
        ctx.translate(x + 4, y + 4);
        const s = Math.sin(frame * 0.15) * 0.3 + 0.7;
        const bob = Math.sin(frame * 0.08) * 2;
        ctx.translate(0, bob);
        ctx.globalAlpha = s + 0.3;

        // Glow
        ctx.fillStyle = 'rgba(255, 200, 50, 0.15)';
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI*2); ctx.fill();

        // Diamond
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath(); ctx.moveTo(0,-5); ctx.lineTo(5,0); ctx.lineTo(0,5); ctx.lineTo(-5,0); ctx.closePath(); ctx.fill();
        // Highlight
        ctx.fillStyle = '#ffee55';
        ctx.beginPath(); ctx.moveTo(0,-3); ctx.lineTo(2,0); ctx.lineTo(0,1); ctx.lineTo(-2,0); ctx.closePath(); ctx.fill();

        ctx.restore();
    },

    // ---- BENCH ----
    drawBench(ctx, x, y) {
        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(x+16, y+30, 24, 4, 0, 0, Math.PI*2); ctx.fill();
        
        // Curved Metal Frame
        ctx.strokeStyle = '#222228'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        
        // Back frame
        ctx.beginPath();
        ctx.moveTo(x+2, y+18);
        ctx.quadraticCurveTo(x-2, y+4, x+8, y+2);
        ctx.lineTo(x+24, y+2);
        ctx.quadraticCurveTo(x+34, y+4, x+30, y+18);
        ctx.stroke();

        // Legs
        ctx.beginPath(); ctx.moveTo(x+4, y+18); ctx.quadraticCurveTo(x+2, y+26, x, y+30); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(x+28, y+18); ctx.quadraticCurveTo(x+30, y+26, x+32, y+30); ctx.stroke();

        // Seat boards
        ctx.fillStyle = '#3a3a45';
        ctx.beginPath(); ctx.roundRect(x, y+12, 32, 4, 2); ctx.fill();
        ctx.beginPath(); ctx.roundRect(x+2, y+16, 28, 3, 2); ctx.fill();

        // Lumafly Lantern
        let lx = x - 12, ly = y + 8;
        // Lantern hook
        ctx.strokeStyle = '#1a1a20'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.quadraticCurveTo(lx+4, ly-6, x, ly-2); ctx.stroke();
        
        // Lantern glass
        ctx.fillStyle = 'rgba(255, 255, 200, 0.4)';
        ctx.beginPath(); ctx.ellipse(lx, ly+4, 4, 6, 0, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.beginPath(); ctx.arc(lx, ly+4, 1.5, 0, Math.PI*2); ctx.fill();
        
        // Lantern frame
        ctx.fillStyle = '#222';
        ctx.fillRect(lx-3, ly-2, 6, 2);
        ctx.fillRect(lx-4, ly, 8, 1);
        ctx.fillRect(lx-3, ly+9, 6, 2);

        // Soft light pool
        const glow = 0.5 + Math.sin(HK.frameCount * 0.03) * 0.1;
        let grad = ctx.createRadialGradient(lx, ly+4, 0, lx, ly+4, 60);
        grad.addColorStop(0, `rgba(200, 220, 255, ${glow * 0.2})`);
        grad.addColorStop(1, 'rgba(200, 220, 255, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(lx, ly+4, 60, 0, Math.PI*2); ctx.fill();
    },

    // ---- LAYERED BACKGROUND ----
    drawBackground(ctx, roomWidth, roomHeight, type) {
        // Base gradient
        const grad = ctx.createLinearGradient(0, 0, 0, roomHeight);
        switch(type) {
            case 'cave':
                grad.addColorStop(0, '#060610'); grad.addColorStop(0.5, '#0a0a18'); grad.addColorStop(1, '#0c0c1a'); break;
            case 'crossroads':
                grad.addColorStop(0, '#050710'); grad.addColorStop(0.5, '#070a18'); grad.addColorStop(1, '#0a0d1e'); break;
            case 'boss':
                grad.addColorStop(0, '#100404'); grad.addColorStop(0.5, '#160606'); grad.addColorStop(1, '#1a0808'); break;
            case 'springs':
                grad.addColorStop(0, '#060b10'); grad.addColorStop(0.5, '#081014'); grad.addColorStop(1, '#0a1418'); break;
        }
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, roomWidth, roomHeight);

        const camX = HK.Camera.x, camY = HK.Camera.y;
        const seed = type.charCodeAt(0);

        // Parallax layer 0 - Runic patterns on far wall
        ctx.strokeStyle = `rgba(255, 255, 255, 0.02)`; ctx.lineWidth = 2;
        for(let i=0; i<10; i++) {
            let rx = (seed*11 + i*173) % roomWidth - camX*0.05;
            let ry = (seed*23 + i*97) % roomHeight;
            ctx.beginPath(); ctx.arc(rx, ry, 20, 0, Math.PI*1.5); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx-15, ry+15); ctx.stroke();
        }

        // Parallax layer 1 - distant cave formations & chains
        ctx.fillStyle = type === 'boss' ? '#160606' : type === 'springs' ? '#0a0f12' : '#0a0a15';
        for (let i = 0; i < 12; i++) {
            const bx = (seed * 137 + i * 293) % (roomWidth + 200) - 100;
            const by = (seed * 89 + i * 197) % roomHeight;
            const px = bx - camX * 0.15;
            ctx.beginPath();
            ctx.ellipse(px + camX, by, 40 + (i % 3) * 20, 25 + (i % 4) * 15, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        
        // Chains
        ctx.strokeStyle = 'rgba(10, 10, 15, 0.4)'; ctx.lineWidth = 3;
        for (let i=0; i<5; i++) {
            const cx = (seed * 77 + i * 211) % roomWidth - camX*0.2;
            ctx.beginPath(); ctx.moveTo(cx + camX, 0); ctx.lineTo(cx + camX, 100 + i*20); ctx.stroke();
            // chain links
            ctx.fillStyle = 'rgba(15, 15, 20, 0.3)';
            for(let j=0; j<10; j++) {
                ctx.beginPath(); ctx.ellipse(cx + camX, j*10 + 5, 3, 5, 0, 0, Math.PI*2); ctx.fill();
                ctx.stroke();
            }
        }

        // Parallax layer 2 - mid stalactites/stalagmites & mushrooms
        ctx.fillStyle = type === 'boss' ? '#1a0808' : type === 'springs' ? '#0d1316' : '#0e0e1a';
        for (let i = 0; i < 15; i++) {
            const sx = (seed * 53 + i * 331) % (roomWidth + 100) - 50;
            const px = sx - camX * 0.25;
            const sLen = 40 + (i * 17 % 60);
            
            // Stalactite
            ctx.beginPath();
            ctx.moveTo(px + camX - 10, 0);
            ctx.quadraticCurveTo(px + camX, sLen, px + camX + 10, 0);
            ctx.fill();
            
            // Stalagmite
            if (i % 2 === 0) {
                const smx = (seed * 71 + i * 197) % roomWidth;
                const px2 = smx - camX * 0.25;
                ctx.beginPath();
                ctx.moveTo(px2 + camX - 10, roomHeight);
                ctx.quadraticCurveTo(px2 + camX, roomHeight - sLen, px2 + camX + 10, roomHeight);
                ctx.fill();
                
                // Glowing Mushrooms on stalagmites
                if (type === 'crossroads' && i % 4 === 0) {
                    ctx.fillStyle = 'rgba(100, 255, 200, 0.1)';
                    ctx.beginPath(); ctx.arc(px2 + camX, roomHeight - sLen*0.5, 20, 0, Math.PI*2); ctx.fill();
                    ctx.fillStyle = 'rgba(150, 255, 220, 0.8)';
                    ctx.beginPath(); ctx.ellipse(px2 + camX, roomHeight - sLen*0.5, 6, 4, 0, 0, Math.PI); ctx.fill();
                }
            }
        }

        // Ambient light spots
        for (let i = 0; i < 25; i++) {
            const lx = (seed * 173 + i * 251) % roomWidth;
            const ly = (seed * 97 + i * 163) % roomHeight;
            const brightness = 0.03 + Math.sin(HK.frameCount * 0.015 + i * 1.7) * 0.02;
            const sz = 1.5 + (i % 4);
            const color = type === 'springs' ? `rgba(80,160,190,${brightness})`
                        : type === 'boss' ? `rgba(180,50,40,${brightness})`
                        : `rgba(100,110,170,${brightness})`;
            ctx.fillStyle = color;
            ctx.beginPath(); ctx.arc(lx, ly, sz, 0, Math.PI*2); ctx.fill();
        }

        // Floating Spore/Dust particles (Parallax 3)
        for (let i = 0; i < 15; i++) {
            const dx = ((seed * 41 + i * 419) % (roomWidth*2)) - camX*0.6;
            const baseY = (seed * 67 + i * 313) % roomHeight;
            const dy = baseY + Math.sin(HK.frameCount * 0.005 + i * 3) * 40 - camY*0.1;
            const dAlpha = 0.1 + Math.sin(HK.frameCount * 0.02 + i * 2) * 0.05;
            ctx.fillStyle = `rgba(200, 210, 240, ${dAlpha})`;
            ctx.beginPath(); ctx.arc(dx, dy, 1.5 + (i%2), 0, Math.PI*2); ctx.fill();
        }

        // Fog layers
        HK.Fog.draw(ctx, roomWidth, roomHeight, type);
    },

    // ---- TILES ----
    drawTile(ctx, x, y, type) {
        const T = HK.TILE_SIZE;
        switch(type) {
            case 1: {
                // Organic Solid Tile
                ctx.fillStyle = '#14141e';
                ctx.fillRect(x, y, T, T);
                
                // Rocky rough edges
                ctx.fillStyle = '#1e1e2d';
                ctx.beginPath();
                ctx.moveTo(x, y+2); ctx.lineTo(x+T, y+1); ctx.lineTo(x+T, y+5); ctx.lineTo(x, y+4); ctx.fill();
                ctx.beginPath();
                ctx.moveTo(x, y); ctx.lineTo(x+3, y+T); ctx.lineTo(x+1, y+T); ctx.lineTo(x-1, y); ctx.fill();

                // Moss hints
                ctx.fillStyle = '#222d22';
                ctx.beginPath(); ctx.ellipse(x+6, y+4, 4, 2, 0, 0, Math.PI*2); ctx.fill();
                
                // Deep cracks
                ctx.strokeStyle = '#0a0a10'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x+10, y+8); ctx.lineTo(x+15, y+20); ctx.lineTo(x+12, y+28); ctx.stroke();
                
                // Small protruding details
                ctx.fillStyle = '#181825';
                ctx.fillRect(x - 2, y + 10, 2, 4);
                ctx.fillRect(x + T, y + 18, 2, 5);
                ctx.fillRect(x + 12, y + T, 5, 2);
                break;
            }
            case 2: {
                // Platforms - thin ledges
                ctx.fillStyle = '#1e1e28';
                ctx.beginPath(); ctx.roundRect(x, y, T, 6, 2); ctx.fill();
                
                // Highlight
                ctx.fillStyle = '#282835';
                ctx.fillRect(x+1, y+1, T-2, 2);

                // Stalactite drips under platform
                ctx.fillStyle = '#14141a';
                ctx.beginPath(); ctx.moveTo(x+6, y+6); ctx.lineTo(x+8, y+12); ctx.lineTo(x+10, y+6); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x+20, y+6); ctx.lineTo(x+21, y+10); ctx.lineTo(x+22, y+6); ctx.fill();
                break;
            }
            case 3: {
                // Organic bone-like spikes
                ctx.fillStyle = '#6a707a'; // Lighter bone color
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(x + i*8 + 1, y+T);
                    ctx.quadraticCurveTo(x + i*8 + 3, y+T-8, x + i*8 + 4, y+T-16);
                    ctx.quadraticCurveTo(x + i*8 + 5, y+T-8, x + i*8 + 7, y+T);
                    ctx.closePath(); ctx.fill();
                }
                // Spike highlight/core
                ctx.fillStyle = '#8a909a';
                for (let i = 0; i < 4; i++) {
                    ctx.beginPath();
                    ctx.moveTo(x + i*8 + 3, y+T);
                    ctx.quadraticCurveTo(x + i*8 + 3.5, y+T-6, x + i*8 + 4, y+T-12);
                    ctx.quadraticCurveTo(x + i*8 + 4.5, y+T-6, x + i*8 + 5, y+T);
                    ctx.closePath(); ctx.fill();
                }
                break;
            }
            case 4: {
                // Cracked wall with light
                ctx.fillStyle = '#1a1a25';
                ctx.fillRect(x, y, T, T);
                
                // Light seeping through
                ctx.strokeStyle = '#e0f0ff'; ctx.lineWidth = 1.5; ctx.shadowColor = '#80b0ff'; ctx.shadowBlur = 6;
                ctx.beginPath();
                ctx.moveTo(x+4, y+4); ctx.lineTo(x+16, y+16); ctx.lineTo(x+10, y+28);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(x+24, y+6); ctx.lineTo(x+16, y+16); ctx.lineTo(x+26, y+26);
                ctx.stroke();
                ctx.shadowBlur = 0;
                
                // Chunks
                ctx.fillStyle = '#101018';
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x+6, y); ctx.lineTo(x, y+6); ctx.fill();
                ctx.beginPath(); ctx.moveTo(x+T, y+T); ctx.lineTo(x+T-8, y+T); ctx.lineTo(x+T, y+T-8); ctx.fill();
                break;
            }
            case 7: {
                // Water - atmospheric gradient
                const wave = Math.sin(HK.frameCount * 0.04 + x * 0.08) * 3;
                
                let wGrad = ctx.createLinearGradient(0, y, 0, y+T);
                wGrad.addColorStop(0, 'rgba(30, 90, 140, 0.6)');
                wGrad.addColorStop(1, 'rgba(10, 30, 60, 0.8)');
                ctx.fillStyle = wGrad;
                ctx.fillRect(x, y + 6 + wave, T, T - 6 - wave);
                
                // Surface tension line
                ctx.fillStyle = 'rgba(80, 180, 220, 0.5)';
                ctx.fillRect(x, y + 4 + wave, T, 3);
                
                // Bubble particles
                ctx.fillStyle = 'rgba(150, 200, 255, 0.4)';
                let bY1 = y + T - ((HK.frameCount + x) % T);
                let bY2 = y + T - ((HK.frameCount*1.5 + x*2) % T);
                if (bY1 > y + 6 + wave) ctx.beginPath(), ctx.arc(x+8, bY1, 1.5, 0, Math.PI*2), ctx.fill();
                if (bY2 > y + 6 + wave) ctx.beginPath(), ctx.arc(x+20, bY2, 2, 0, Math.PI*2), ctx.fill();
                
                // Atmosphere vapor
                const steamA = 0.08 + Math.sin(HK.frameCount * 0.03 + x * 0.1) * 0.04;
                ctx.fillStyle = `rgba(180, 220, 250, ${steamA})`;
                ctx.beginPath();
                ctx.ellipse(x + T/2, y - 2 + Math.sin(HK.frameCount * 0.02 + x) * 4, 14, 8, 0, 0, Math.PI*2);
                ctx.fill();
                break;
            }
        }
    },

    // ---- HUD ELEMENTS (HK Style) ----
    drawMask(ctx, x, y, filled) {
        ctx.save();
        ctx.translate(x, y);

        if (filled) {
            // Glow
            ctx.fillStyle = 'rgba(230, 230, 240, 0.08)';
            ctx.beginPath(); ctx.ellipse(10, 10, 14, 15, 0, 0, Math.PI*2); ctx.fill();

            // Mask shape - more angular like HK
            ctx.fillStyle = '#e8e8f0';
            ctx.beginPath();
            ctx.moveTo(10, -1);
            ctx.quadraticCurveTo(22, 2, 21, 12);
            ctx.quadraticCurveTo(20, 22, 10, 22);
            ctx.quadraticCurveTo(0, 22, -1, 12);
            ctx.quadraticCurveTo(-2, 2, 10, -1);
            ctx.closePath();
            ctx.fill();

            // Shading
            ctx.fillStyle = 'rgba(0,0,0,0.06)';
            ctx.beginPath(); ctx.ellipse(12, 12, 7, 8, 0.2, 0, Math.PI*2); ctx.fill();

            // Eyes
            ctx.fillStyle = '#1a1a2e';
            ctx.beginPath(); ctx.ellipse(6.5, 9, 2.5, 3.5, -0.15, 0, Math.PI*2); ctx.fill();
            ctx.beginPath(); ctx.ellipse(13.5, 9, 2.5, 3.5, 0.15, 0, Math.PI*2); ctx.fill();
        } else {
            // Empty mask - outline only
            ctx.strokeStyle = '#2a2a3a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.quadraticCurveTo(21, 2, 20, 12);
            ctx.quadraticCurveTo(19, 21, 10, 21);
            ctx.quadraticCurveTo(1, 21, 0, 12);
            ctx.quadraticCurveTo(-1, 2, 10, 0);
            ctx.closePath();
            ctx.stroke();
            // Empty eyes
            ctx.strokeStyle = '#1a1a28';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(6.5, 9, 2, 3, 0, 0, Math.PI*2); ctx.stroke();
            ctx.beginPath(); ctx.ellipse(13.5, 9, 2, 3, 0, 0, Math.PI*2); ctx.stroke();
        }
        ctx.restore();
    },

    drawSoulVessel(ctx, x, y, soul, maxSoul) {
        ctx.save();
        ctx.translate(x, y);
        const fill = soul / maxSoul;
        const h = 55, w = 22;

        // Vessel outer glow
        if (fill > 0) {
            ctx.fillStyle = `rgba(170, 200, 255, ${0.05 + fill * 0.05})`;
            ctx.beginPath(); ctx.roundRect(-3, -3, w+6, h+6, 8); ctx.fill();
        }

        // Vessel background
        ctx.fillStyle = '#0c0c18';
        ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.fill();

        // Vessel border
        ctx.strokeStyle = '#2a2a40';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(0, 0, w, h, 6); ctx.stroke();

        // Fill
        if (fill > 0) {
            const fillH = (h - 6) * fill;
            const glow = 0.5 + Math.sin(HK.frameCount * 0.04) * 0.15;

            // Inner glow
            ctx.fillStyle = `rgba(150, 180, 255, ${glow * 0.3})`;
            ctx.beginPath(); ctx.roundRect(3, h - fillH - 1, w-6, fillH, 3); ctx.fill();

            // Main fill
            ctx.fillStyle = `rgba(200, 220, 255, ${glow})`;
            ctx.beginPath(); ctx.roundRect(4, h - fillH, w-8, fillH - 2, 3); ctx.fill();

            // Surface shimmer
            ctx.fillStyle = `rgba(230, 240, 255, ${glow * 0.6})`;
            ctx.fillRect(5, h - fillH, w - 10, 2);
        }

        // Notch marks at 33 and 66
        ctx.strokeStyle = '#333350';
        ctx.lineWidth = 1;
        const n1 = h * (33 / maxSoul), n2 = h * (66 / maxSoul);
        ctx.beginPath();
        ctx.moveTo(1, h - n1); ctx.lineTo(w - 1, h - n1);
        ctx.moveTo(1, h - n2); ctx.lineTo(w - 1, h - n2);
        ctx.stroke();

        // Decorative dots at vessel edges
        ctx.fillStyle = '#3a3a55';
        ctx.beginPath(); ctx.arc(w/2, -2, 2, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(w/2, h+2, 2, 0, Math.PI*2); ctx.fill();

        ctx.restore();
    }
};

// ============================================================
// CANVAS INIT
// ============================================================
HK.initCanvas = function() {
    HK.canvas = document.getElementById('gameCanvas');
    HK.ctx = HK.canvas.getContext('2d');
    HK.canvas.width = HK.CANVAS_W;
    HK.canvas.height = HK.CANVAS_H;
    function resize() {
        const s = Math.min(window.innerWidth / HK.CANVAS_W, window.innerHeight / HK.CANVAS_H);
        HK.canvas.style.width = (HK.CANVAS_W * s) + 'px';
        HK.canvas.style.height = (HK.CANVAS_H * s) + 'px';
    }
    resize();
    window.addEventListener('resize', resize);
    document.getElementById('loading').style.display = 'none';
    HK.Fog.init();
};
