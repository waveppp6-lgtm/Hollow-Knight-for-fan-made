// ============================================================
// HOLLOW SHADE - Game Logic
// ============================================================
'use strict';

// ============================================================
// GEO DROP
// ============================================================
class GeoDrop {
    constructor(x, y, value) {
        this.x = x; this.y = y;
        this.width = 8; this.height = 8;
        this.vx = HK.randRange(-2, 2);
        this.vy = HK.randRange(-4, -1);
        this.value = value || 1;
        this.life = 600;
        this.collected = false;
        this.onGround = false;
    }
    update(tiles) {
        if (this.collected) return;
        this.life--;
        if (!this.onGround) {
            this.vy += HK.GRAVITY * 0.5;
            this.vy = Math.min(this.vy, 6);
            this.y += this.vy;
            this.x += this.vx;
            this.vx *= 0.95;
            // Simple ground check
            const col = Math.floor((this.x + 4) / HK.TILE_SIZE);
            const row = Math.floor((this.y + 8) / HK.TILE_SIZE);
            const tile = HK.Collision.getTile(tiles, col, row);
            if (HK.Collision.isSolid(tile)) {
                this.y = (row) * HK.TILE_SIZE - this.height;
                this.vy = 0; this.vx = 0;
                this.onGround = true;
            }
        }
        // Attract to player
        const p = HK.player;
        if (p) {
            const dx = (p.x + p.width / 2) - (this.x + 4);
            const dy = (p.y + p.height / 2) - (this.y + 4);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 60) {
                const spd = (60 - dist) / 60 * 4;
                this.x += (dx / dist) * spd;
                this.y += (dy / dist) * spd;
            }
            if (dist < 15) {
                this.collected = true;
                p.collectGeo(this.value);
            }
        }
    }
    draw(ctx) {
        if (this.collected) return;
        const alpha = this.life < 60 ? this.life / 60 : 1;
        ctx.globalAlpha = alpha;
        HK.Sprite.drawGeo(ctx, this.x, this.y, HK.frameCount);
        ctx.globalAlpha = 1;
    }
}

// ============================================================
// PLAYER
// ============================================================
class Player {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.width = 26; this.height = 32;
        this.vx = 0; this.vy = 0;
        this.facing = 1;
        this.onGround = false;
        this.touchingWall = false;
        this.wallDir = 0;
        this.health = 5; this.maxHealth = 5;
        this.soul = 0; this.maxSoul = 99;
        this.geo = 0;
        this.moveSpeed = 2.8;
        this.jumpForce = -7.8;
        this.state = 'idle';
        this.attackDir = 'right';
        this.attackTimer = 0; this.attackDuration = 12;
        this.attackHitbox = null;
        this.attackHit = false;
        this.dashTimer = 0; this.dashDuration = 10;
        this.dashSpeed = 11; this.dashCooldown = 0; this.dashCooldownMax = 20;
        this.iFrames = 0; this.iFrameMax = 60;
        this.healTimer = 0; this.healDuration = 35;
        this.coyoteTime = 0; this.coyoteMax = 6;
        this.jumpBuffer = 0; this.jumpBufferMax = 6;
        this.hasDoubleJump = false;
        this.usedDoubleJump = false;
        this.hasDash = true;
        this.hasWallJump = false;
        this.animFrame = 0;
        this.hurtTimer = 0;
        this.squashTimer = 0;
        this._prevVY = 0;
    }

    update(tiles) {
        if (this.iFrames > 0) this.iFrames--;
        if (this.state === 'dead') return;
        if (this.dashCooldown > 0) this.dashCooldown--;

        // Hurt state
        if (this.state === 'hurt') {
            this.hurtTimer--;
            this.vy += HK.GRAVITY;
            this.x += this.vx;
            HK.Collision.resolveX(this, tiles);
            this.y += this.vy;
            HK.Collision.resolveY(this, tiles);
            if (this.hurtTimer <= 0) this.state = 'idle';
            return;
        }

        // Coyote time
        if (this._wasOnGround && !this.onGround && this.vy >= 0 && this.state !== 'jump') {
            this.coyoteTime = this.coyoteMax;
        }
        this._wasOnGround = this.onGround;
        if (this.coyoteTime > 0) this.coyoteTime--;

        // Jump buffer
        if (HK.Input.isPressed('KeyZ') || HK.Input.isPressed('Space')) {
            this.jumpBuffer = this.jumpBufferMax;
        }
        if (this.jumpBuffer > 0) this.jumpBuffer--;

        // --- DASH ---
        if (this.state === 'dash') {
            this.dashTimer--;
            this.vx = this.facing * this.dashSpeed;
            this.vy = 0;
            this.iFrames = Math.max(this.iFrames, 2);
            HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
                count: 1, color: '#8888aa', speed: 1, life: 10, size: 3
            });
            if (this.dashTimer <= 0) {
                this.state = 'fall';
                this.vx = this.facing * 2;
            }
            this.x += this.vx;
            HK.Collision.resolveX(this, tiles);
            this.y += this.vy;
            HK.Collision.resolveY(this, tiles);
            this.animFrame++;
            return;
        }

        // --- HEAL ---
        if (this.state === 'heal') {
            this.vx = 0;
            this.vy += HK.GRAVITY;
            if ((HK.Input.isDown('KeyF') || HK.Input.isDown('KeyK')) && this.soul >= 33 && this.health < this.maxHealth && this.onGround) {
                this.healTimer++;
                HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
                    count: 1, color: '#c8e0ff', speed: 1.5, life: 15, size: 2, gravity: -0.05
                });
                if (this.healTimer >= this.healDuration) {
                    this.health = Math.min(this.health + 1, this.maxHealth);
                    this.soul -= 33;
                    this.healTimer = 0;
                    HK.Audio.play('heal');
                    HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
                        count: 15, color: '#ffffff', speed: 3, life: 20, size: 3, gravity: -0.05
                    });
                    if (this.soul < 33 || this.health >= this.maxHealth) {
                        this.state = 'idle';
                    }
                }
            } else {
                this.healTimer = 0;
                this.state = 'idle';
            }
            this.x += this.vx;
            HK.Collision.resolveX(this, tiles);
            this.y += this.vy;
            HK.Collision.resolveY(this, tiles);
            this.animFrame++;
            return;
        }

        // --- GRAVITY ---
        const grav = HK.getGravity(this.vy, HK.Input.isDown('KeyZ') || HK.Input.isDown('Space'));
        this.vy += grav;
        if (this.vy > HK.MAX_FALL) this.vy = HK.MAX_FALL;

        // --- MOVEMENT ---
        if (this.attackTimer <= 0) {
            if (HK.Input.isDown('ArrowLeft') || HK.Input.isDown('KeyA')) {
                this.vx = -this.moveSpeed;
                this.facing = -1;
            } else if (HK.Input.isDown('ArrowRight') || HK.Input.isDown('KeyD')) {
                this.vx = this.moveSpeed;
                this.facing = 1;
            } else {
                this.vx = 0;
            }
        }

        // --- JUMP ---
        if (this.jumpBuffer > 0) {
            if (this.onGround || this.coyoteTime > 0) {
                this.vy = this.jumpForce;
                this.state = 'jump';
                this.jumpBuffer = 0;
                this.coyoteTime = 0;
                HK.Audio.play('jump');
            } else if (this.hasWallJump && this.touchingWall && !this.onGround) {
                this.vx = -this.wallDir * 5;
                this.facing = -this.wallDir;
                this.vy = this.jumpForce * 0.85;
                this.jumpBuffer = 0;
                this.state = 'jump';
                HK.Audio.play('jump');
            } else if (this.hasDoubleJump && !this.usedDoubleJump && !this.onGround) {
                this.vy = this.jumpForce * 0.8;
                this.usedDoubleJump = true;
                this.jumpBuffer = 0;
                this.state = 'jump';
                HK.Audio.play('jump');
                HK.Particles.emit(this.x + this.width / 2, this.y + this.height, {
                    count: 8, color: '#aaaacc', speed: 2, life: 15, size: 3, gravity: 0.1
                });
            }
        }

        // Variable jump
        if ((!HK.Input.isDown('KeyZ') && !HK.Input.isDown('Space')) && this.vy < -2.5) {
            this.vy = -2.5;
        }

        // --- WALL SLIDE ---
        if (this.hasWallJump && this.touchingWall && !this.onGround && this.vy > 0) {
            this.vy = Math.min(this.vy, 2);
            this.state = 'wall_slide';
        }

        // --- DASH ---
        if ((HK.Input.isPressed('KeyX') || HK.Input.isPressed('ShiftLeft') || HK.Input.isPressed('ShiftRight')) && this.hasDash && this.dashCooldown <= 0) {
            this.state = 'dash';
            this.dashTimer = this.dashDuration;
            this.dashCooldown = this.dashCooldownMax;
            this.vy = 0;
            HK.Audio.play('dash');
        }

        // --- ATTACK ---
        if ((HK.Input.isPressed('KeyC') || HK.Input.isPressed('KeyJ')) && this.attackTimer <= 0 && this.state !== 'heal') {
            if (HK.Input.isDown('ArrowUp') || HK.Input.isDown('KeyW')) {
                this.attackDir = 'up';
            } else if ((HK.Input.isDown('ArrowDown') || HK.Input.isDown('KeyS')) && !this.onGround) {
                this.attackDir = 'down';
            } else {
                this.attackDir = this.facing > 0 ? 'right' : 'left';
            }
            this.attackTimer = this.attackDuration;
            this.attackHit = false;
            HK.Audio.play('nail_swing');

            switch (this.attackDir) {
                case 'right':
                    this.attackHitbox = { x: this.x + this.width, y: this.y - 4, width: 45, height: this.height + 8 };
                    break;
                case 'left':
                    this.attackHitbox = { x: this.x - 45, y: this.y - 4, width: 45, height: this.height + 8 };
                    break;
                case 'up':
                    this.attackHitbox = { x: this.x - 10, y: this.y - 40, width: this.width + 20, height: 40 };
                    break;
                case 'down':
                    this.attackHitbox = { x: this.x - 10, y: this.y + this.height, width: this.width + 20, height: 40 };
                    break;
            }
        }

        // --- HEAL START ---
        if ((HK.Input.isPressed('KeyF') || HK.Input.isPressed('KeyK')) && this.soul >= 33 && this.onGround && this.health < this.maxHealth && this.attackTimer <= 0) {
            this.state = 'heal';
            this.healTimer = 0;
        }

        // Attack timer
        if (this.attackTimer > 0) {
            this.attackTimer--;
            if (this.attackTimer <= 0) {
                this.attackHitbox = null;
            }
        }

        // --- RESOLVE ---
        this.x += this.vx;
        HK.Collision.resolveX(this, tiles);
        this.y += this.vy;
        const result = HK.Collision.resolveY(this, tiles);
        if (result === 'spike') {
            this.takeDamage(1);
        }

        // Landed
        if (this.onGround && this._prevVY > 5) {
            this.squashTimer = 8; // frames of squash
            HK.Audio.play('land');
            HK.Particles.emit(this.x + this.width / 2, this.y + this.height, {
                count: 4, color: '#666688', speed: 1.5, life: 10, size: 2, gravity: 0.05
            });
        }
        if (this.onGround) {
            this.usedDoubleJump = false;
        }
        this._prevVY = this.vy;

        // --- STATE UPDATE ---
        if (this.state !== 'dash' && this.state !== 'heal' && this.state !== 'hurt' && this.attackTimer <= 0) {
            if (this.onGround) {
                this.state = Math.abs(this.vx) > 0.1 ? 'run' : 'idle';
            } else if (this.touchingWall && this.hasWallJump && this.vy > 0) {
                this.state = 'wall_slide';
            } else {
                this.state = this.vy < 0 ? 'jump' : 'fall';
            }
        } else if (this.attackTimer > 0 && this.state !== 'dash' && this.state !== 'heal') {
            this.state = 'attack';
        }

        this.animFrame++;

        // Clamp to room
        if (HK.currentRoom) {
            this.x = HK.clamp(this.x, 0, HK.currentRoom.width - this.width);
            if (this.y > HK.currentRoom.height + 50) {
                this.takeDamage(1);
                if (this.state !== 'dead') {
                    // Respawn at room spawn
                    const spawn = HK.currentRoom.spawns && HK.currentRoom.spawns['start'];
                    if (spawn) { this.x = spawn.x; this.y = spawn.y; }
                    this.vy = 0;
                }
            }
        }
    }

    takeDamage(amount) {
        if (this.iFrames > 0 || this.state === 'dead') return;
        this.health -= amount;
        this.iFrames = this.iFrameMax;
        this.state = 'hurt';
        this.hurtTimer = 15;
        this.vx = -this.facing * 4;
        this.vy = -3;
        this.attackTimer = 0;
        this.attackHitbox = null;
        this.healTimer = 0;
        HK.Audio.play('player_damage');
        HK.Camera.shake(6, 12);
        HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
            count: 12, color: '#ffaaaa', speed: 4, life: 20, size: 3, gravity: 0.1
        });
        if (this.health <= 0) this.die();
    }

    die() {
        this.state = 'dead';
        this.vx = 0; this.vy = 0;
        HK.gameState = 'dead';
        HK.deathTimer = 120;
        HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
            count: 30, color: '#ffffff', speed: 5, life: 40, size: 4, gravity: 0.05
        });
    }

    collectSoul(amount) {
        this.soul = Math.min(this.soul + amount, this.maxSoul);
    }

    collectGeo(amount) {
        this.geo += amount;
        HK.Audio.play('geo_collect');
    }

    draw(ctx) {
        if (this.state === 'dead') return;
        if (this.iFrames > 0 && HK.frameCount % 4 < 2) return;
        
        const extra = {};
        if (this.squashTimer > 0) {
            extra.squash = this.squashTimer / 8;
            this.squashTimer--;
        }
        if (this.vy < -3) extra.stretch = Math.min(1, Math.abs(this.vy) / 10);
        HK.Sprite.drawKnight(ctx, this.x, this.y, this.facing, this.state, this.animFrame, extra);
        
        if (this.attackTimer > 0 && this.attackHitbox) {
            HK.Sprite.drawNailSlash(ctx,
                this.attackHitbox.x, this.attackHitbox.y,
                this.attackHitbox.width, this.attackHitbox.height,
                this.attackDir, this.attackTimer, this.attackDuration
            );
        }
    }
}

// ============================================================
// ENEMIES
// ============================================================
class Enemy {
    constructor(x, y, w, h) {
        this.x = x; this.y = y;
        this.width = w || 30; this.height = h || 20;
        this.vx = 0; this.vy = 0;
        this.facing = 1;
        this.onGround = false;
        this.touchingWall = false;
        this.wallDir = 0;
        this.health = 1; this.maxHealth = 1;
        this.damage = 1;
        this.alive = true;
        this.geoValue = 3;
        this.iFrames = 0;
        this.animFrame = 0;
        this.knockbackTimer = 0;
    }
    update(tiles) {
        if (!this.alive) return;
        if (this.iFrames > 0) this.iFrames--;
        this.animFrame++;
    }
    takeDamage(amount, fromDir) {
        if (this.iFrames > 0) return;
        this.health -= amount;
        this.iFrames = 12;
        this.vx = fromDir * 3;
        this.vy = -2;
        this.knockbackTimer = 8;
        HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
            count: 6, color: '#ffaa55', speed: 3, life: 12, size: 3, gravity: 0.1
        });
        HK.Audio.play('nail_hit');
        HK.Camera.shake(3, 5);
        if (this.health <= 0) this.die();
    }
    die() {
        this.alive = false;
        HK.Audio.play('enemy_death');
        HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
            count: 15, color: '#ff8844', speed: 4, life: 25, size: 4, gravity: 0.1
        });
        // Drop geo
        for (let i = 0; i < this.geoValue; i++) {
            HK.geoDrops.push(new GeoDrop(this.x + this.width / 2, this.y + this.height / 2, 1));
        }
    }
    draw(ctx) {}
}

class Crawlid extends Enemy {
    constructor(x, y) {
        super(x, y, 30, 20);
        this.health = 1; this.maxHealth = 1;
        this.geoValue = 3;
        this.moveSpeed = 1;
        this.facing = Math.random() > 0.5 ? 1 : -1;
    }
    update(tiles) {
        super.update(tiles);
        if (!this.alive) return;
        if (this.knockbackTimer > 0) {
            this.knockbackTimer--;
            this.vy += HK.GRAVITY;
            this.x += this.vx;
            HK.Collision.resolveX(this, tiles);
            this.y += this.vy;
            HK.Collision.resolveY(this, tiles);
            this.vx *= 0.8;
            return;
        }
        this.vx = this.facing * this.moveSpeed;
        this.vy += HK.GRAVITY;
        if (this.vy > HK.MAX_FALL) this.vy = HK.MAX_FALL;

        this.x += this.vx;
        HK.Collision.resolveX(this, tiles);
        this.y += this.vy;
        HK.Collision.resolveY(this, tiles);

        // Turn at walls
        if (this.touchingWall) {
            this.facing *= -1;
        }
        // Turn at edges
        if (this.onGround) {
            const checkX = this.facing > 0 ? this.x + this.width + 2 : this.x - 2;
            const checkRow = Math.floor((this.y + this.height + 2) / HK.TILE_SIZE);
            const checkCol = Math.floor(checkX / HK.TILE_SIZE);
            const tileBelow = HK.Collision.getTile(tiles, checkCol, checkRow);
            if (!HK.Collision.isSolid(tileBelow)) {
                this.facing *= -1;
            }
        }
    }
    draw(ctx) {
        if (!this.alive) return;
        if (this.iFrames > 0 && HK.frameCount % 3 < 1) return;
        HK.Sprite.drawCrawlid(ctx, this.x, this.y, this.facing, this.animFrame);
    }
}

class Vengefly extends Enemy {
    constructor(x, y) {
        super(x, y, 28, 28);
        this.health = 2; this.maxHealth = 2;
        this.geoValue = 5;
        this.homeX = x; this.homeY = y;
        this.aggroRange = 200;
        this.speed = 2;
    }
    update(tiles) {
        super.update(tiles);
        if (!this.alive) return;
        if (this.knockbackTimer > 0) {
            this.knockbackTimer--;
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.85;
            this.vy *= 0.85;
            return;
        }
        const p = HK.player;
        if (p && p.state !== 'dead') {
            const dx = (p.x + p.width / 2) - (this.x + this.width / 2);
            const dy = (p.y + p.height / 2) - (this.y + this.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < this.aggroRange) {
                const spd = this.speed;
                this.vx += (dx / dist) * 0.15;
                this.vy += (dy / dist) * 0.15;
                const mag = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (mag > spd) {
                    this.vx = (this.vx / mag) * spd;
                    this.vy = (this.vy / mag) * spd;
                }
                this.facing = dx > 0 ? 1 : -1;
            } else {
                // Hover
                this.vx *= 0.95;
                this.vy = Math.sin(this.animFrame * 0.04) * 0.5;
                // Return home
                const hx = this.homeX - this.x;
                const hy = this.homeY - this.y;
                this.vx += hx * 0.005;
                this.vy += hy * 0.005;
            }
        }
        this.x += this.vx;
        this.y += this.vy;
    }
    draw(ctx) {
        if (!this.alive) return;
        if (this.iFrames > 0 && HK.frameCount % 3 < 1) return;
        HK.Sprite.drawVengefly(ctx, this.x, this.y, this.animFrame);
    }
}

class HuskGuard extends Enemy {
    constructor(x, y) {
        super(x, y, 28, 38);
        this.health = 3; this.maxHealth = 3;
        this.geoValue = 8;
        this.moveSpeed = 1.2;
        this.facing = -1;
        this.patrolTimer = 0;
        this.pauseTimer = 0;
    }
    update(tiles) {
        super.update(tiles);
        if (!this.alive) return;
        if (this.knockbackTimer > 0) {
            this.knockbackTimer--;
            this.vy += HK.GRAVITY;
            this.x += this.vx;
            HK.Collision.resolveX(this, tiles);
            this.y += this.vy;
            HK.Collision.resolveY(this, tiles);
            this.vx *= 0.8;
            return;
        }
        if (this.pauseTimer > 0) {
            this.pauseTimer--;
            this.vx = 0;
            this.vy += HK.GRAVITY;
            this.y += this.vy;
            HK.Collision.resolveY(this, tiles);
            return;
        }

        const p = HK.player;
        let chasing = false;
        if (p && p.state !== 'dead') {
            const dx = (p.x + p.width / 2) - (this.x + this.width / 2);
            const dy = (p.y + p.height / 2) - (this.y + this.height / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 180) {
                chasing = true;
                this.facing = dx > 0 ? 1 : -1;
                this.vx = this.facing * this.moveSpeed * 1.5;
            }
        }
        if (!chasing) {
            this.patrolTimer++;
            if (this.patrolTimer > 120) {
                this.facing *= -1;
                this.patrolTimer = 0;
                this.pauseTimer = 30;
            }
            this.vx = this.facing * this.moveSpeed;
        }
        this.vy += HK.GRAVITY;
        if (this.vy > HK.MAX_FALL) this.vy = HK.MAX_FALL;
        this.x += this.vx;
        HK.Collision.resolveX(this, tiles);
        this.y += this.vy;
        HK.Collision.resolveY(this, tiles);

        if (this.touchingWall) {
            this.facing *= -1;
            this.patrolTimer = 0;
        }
        if (this.onGround) {
            const checkX = this.facing > 0 ? this.x + this.width + 2 : this.x - 2;
            const checkRow = Math.floor((this.y + this.height + 2) / HK.TILE_SIZE);
            const checkCol = Math.floor(checkX / HK.TILE_SIZE);
            if (!HK.Collision.isSolid(HK.Collision.getTile(tiles, checkCol, checkRow))) {
                this.facing *= -1;
                this.patrolTimer = 0;
            }
        }
    }
    draw(ctx) {
        if (!this.alive) return;
        if (this.iFrames > 0 && HK.frameCount % 3 < 1) return;
        HK.Sprite.drawHuskGuard(ctx, this.x, this.y, this.facing, this.animFrame);
    }
}

class GruzMother extends Enemy {
    constructor(x, y) {
        super(x, y, 64, 56);
        this.health = 10; this.maxHealth = 10;
        this.geoValue = 50; this.damage = 2;
        this.phase = 1;
        this.aiTimer = 0;
        this.aiState = 'float'; // float, charge, slam, bounce, pause
        this.targetX = 0; this.targetY = 0;
        this.chargeSpeed = 6;
        this.activated = false;
    }
    update(tiles) {
        super.update(tiles);
        if (!this.alive || !this.activated) return;
        if (this.knockbackTimer > 0) {
            this.knockbackTimer--;
            this.x += this.vx;
            this.y += this.vy;
            this.vx *= 0.9; this.vy *= 0.9;
            return;
        }

        this.phase = this.health > 5 ? 1 : 2;
        this.aiTimer++;
        const p = HK.player;
        if (!p || p.state === 'dead') return;

        const roomW = HK.currentRoom ? HK.currentRoom.width : HK.CANVAS_W;
        const roomH = HK.currentRoom ? HK.currentRoom.height : HK.CANVAS_H;

        if (this.phase === 1) {
            switch (this.aiState) {
                case 'float': {
                    const dx = (p.x + p.width / 2) - (this.x + this.width / 2);
                    const dy = (p.y + p.height / 2 - 40) - (this.y + this.height / 2);
                    this.vx += dx * 0.002;
                    this.vy += dy * 0.002;
                    this.vx *= 0.98; this.vy *= 0.98;
                    if (this.aiTimer > 120) {
                        this.aiState = 'charge';
                        this.aiTimer = 0;
                        this.targetX = p.x + p.width / 2;
                        this.targetY = p.y + p.height / 2;
                        HK.Audio.play('boss_roar');
                    }
                    break;
                }
                case 'charge': {
                    const dx = this.targetX - (this.x + this.width / 2);
                    const dy = this.targetY - (this.y + this.height / 2);
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 5) {
                        this.vx = (dx / dist) * this.chargeSpeed;
                        this.vy = (dy / dist) * this.chargeSpeed;
                    }
                    if (this.aiTimer > 30 || dist < 10) {
                        this.aiState = 'pause';
                        this.aiTimer = 0;
                        this.vx *= 0.3; this.vy *= 0.3;
                    }
                    break;
                }
                case 'pause': {
                    this.vx *= 0.92; this.vy *= 0.92;
                    if (this.aiTimer > 60) {
                        this.aiState = 'float';
                        this.aiTimer = 0;
                    }
                    break;
                }
            }
        } else {
            // Phase 2 - bouncing
            switch (this.aiState) {
                case 'float':
                case 'bounce': {
                    if (this.aiState === 'float') {
                        const dx = (p.x + p.width / 2) - (this.x + this.width / 2);
                        const dy = (p.y + p.height / 2) - (this.y + this.height / 2);
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        this.vx = (dx / dist) * 5;
                        this.vy = (dy / dist) * 5;
                        this.aiState = 'bounce';
                        this.aiTimer = 0;
                    }
                    // Bounce off walls
                    const T = HK.TILE_SIZE;
                    const nextX = this.x + this.vx;
                    const nextY = this.y + this.vy;
                    // Wall checks
                    if (nextX <= T || nextX + this.width >= roomW - T) {
                        this.vx *= -1;
                        HK.Camera.shake(3, 5);
                    }
                    if (nextY <= T || nextY + this.height >= roomH - T * 2) {
                        this.vy *= -1;
                        HK.Camera.shake(3, 5);
                    }
                    if (this.aiTimer > 180) {
                        this.aiState = 'slam';
                        this.aiTimer = 0;
                        this.vx = 0; this.vy = -8;
                    }
                    break;
                }
                case 'slam': {
                    if (this.aiTimer < 20) {
                        this.vy = -4;
                        this.vx *= 0.9;
                    } else {
                        this.vy = 8;
                        this.vx = 0;
                    }
                    if (this.y + this.height >= roomH - T * 2) {
                        this.y = roomH - T * 2 - this.height;
                        this.vy = 0;
                        HK.Camera.shake(8, 15);
                        HK.Audio.play('nail_hit');
                        HK.Particles.emit(this.x + this.width / 2, this.y + this.height, {
                            count: 20, color: '#aaaacc', speed: 5, life: 20, size: 4, gravity: 0.1
                        });
                        this.aiState = 'pause';
                        this.aiTimer = 0;
                    }
                    break;
                }
                case 'pause': {
                    this.vx *= 0.9; this.vy *= 0.9;
                    if (this.aiTimer > 40) {
                        this.aiState = 'float';
                        this.aiTimer = 0;
                    }
                    break;
                }
            }
        }

        this.x += this.vx;
        this.y += this.vy;
        // Keep in room bounds
        this.x = HK.clamp(this.x, HK.TILE_SIZE, roomW - this.width - HK.TILE_SIZE);
        this.y = HK.clamp(this.y, HK.TILE_SIZE, roomH - this.height - HK.TILE_SIZE * 2);
    }
    die() {
        super.die();
        HK.bossDefeated['gruz_mother'] = true;
        HK.Camera.shake(10, 30);
        HK.Particles.emit(this.x + this.width / 2, this.y + this.height / 2, {
            count: 40, color: '#ffcc44', speed: 6, life: 40, size: 5, gravity: 0.05
        });
    }
    draw(ctx) {
        if (!this.alive) return;
        if (this.iFrames > 0 && HK.frameCount % 3 < 1) return;
        HK.Sprite.drawGruzMother(ctx, this.x, this.y, this.animFrame, this.health, this.maxHealth);
    }
}

// ============================================================
// ROOM DEFINITIONS
// ============================================================
function defineRooms() {
    const _ = 0, W = 1, P = 2, S = 3, B = 5, H = 7;

    // Room 0: The Hollow's Rest (25x17)
    const r0tiles = [];
    for (let r = 0; r < 17; r++) {
        const row = [];
        for (let c = 0; c < 25; c++) {
            if (r === 0 || r === 16) { row.push(W); }
            else if (c === 0) { row.push(W); }
            else if (c === 24) { row.push(r >= 11 ? W : _); } // right exit
            else { row.push(_); }
        }
        r0tiles.push(row);
    }
    // Ground
    for (let c = 0; c < 25; c++) {
        r0tiles[14][c] = W; r0tiles[15][c] = W;
    }
    // Opening for right transition
    r0tiles[14][24] = _; r0tiles[15][24] = _; r0tiles[16][24] = W;
    // Add platforms
    for (let c = 6; c < 10; c++) r0tiles[11][c] = W;
    for (let c = 13; c < 17; c++) r0tiles[8][c] = W;

    HK.rooms['room0'] = {
        name: "The Hollow's Rest",
        type: 'cave',
        tiles: r0tiles,
        enemies: [],
        transitions: [
            { x: 24 * 32, y: 352, width: 32, height: 96, targetRoom: 'room1', spawnId: 'from_room0' },
        ],
        spawns: {
            start: { x: 64, y: 416 },
            from_room1: { x: 23 * 32, y: 416 },
        },
        benches: [{ x: 4 * 32, y: 14 * 32 - 30 }],
        width: 25 * 32,
        height: 17 * 32,
    };

    // Room 1: King's Pass (30x17)
    HK.rooms['room1'] = {
        name: "King's Pass",
        type: 'cave',
        tiles: [
            [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,W,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,W,W,W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,_,_,_,_,_,_,_,_,_,W],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [_,_,_,_,W,W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
            [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W,W,_,_,_,_,_,_,_],
            [_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_],
            [W,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,_,W],
            [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
            [W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W,W],
        ],
        enemies: [
            { type: 'Crawlid', x: 320, y: 448 },
            { type: 'Crawlid', x: 600, y: 448 },
        ],
        transitions: [
            { x: 0, y: 352, width: 16, height: 96, targetRoom: 'room0', spawnId: 'from_room1' },
            { x: 928, y: 352, width: 32, height: 96, targetRoom: 'room3', spawnId: 'from_room1' },
        ],
        spawns: {
            start: { x: 64, y: 416 },
            from_room0: { x: 48, y: 416 },
            from_room3: { x: 880, y: 416 },
        },
        benches: [],
        width: 30 * 32,
        height: 17 * 32,
    };

    // Room 2: Forgotten Crossroads Upper (30x25)
    const r2tiles = [];
    for (let r = 0; r < 25; r++) {
        const row = [];
        for (let c = 0; c < 30; c++) {
            if (c === 0 || c === 29) { row.push(W); }
            else if (r === 0) { row.push(W); }
            else if (r === 24) { row.push(r >= 23 ? W : _); }
            else { row.push(_); }
        }
        r2tiles.push(row);
    }
    // Add platforms for vertical navigation
    // Bottom ground
    for (let c = 0; c < 30; c++) { r2tiles[24][c] = W; r2tiles[23][c] = W; }
    // Opening at bottom for transition
    r2tiles[23][14] = _; r2tiles[23][15] = _; r2tiles[23][16] = _;
    r2tiles[24][14] = _; r2tiles[24][15] = _; r2tiles[24][16] = _;
    // Platforms going up
    for (let c = 4; c < 10; c++) r2tiles[20][c] = W;
    for (let c = 16; c < 24; c++) r2tiles[17][c] = W;
    for (let c = 5; c < 13; c++) r2tiles[14][c] = W;
    for (let c = 18; c < 26; c++) r2tiles[11][c] = W;
    for (let c = 3; c < 11; c++) r2tiles[8][c] = W;
    for (let c = 15; c < 22; c++) r2tiles[5][c] = W;
    for (let c = 8; c < 16; c++) r2tiles[2][c] = W;

    HK.rooms['room2'] = {
        name: 'Forgotten Crossroads - Upper',
        type: 'crossroads',
        tiles: r2tiles,
        enemies: [
            { type: 'Vengefly', x: 200, y: 500 },
            { type: 'Vengefly', x: 500, y: 300 },
            { type: 'Vengefly', x: 350, y: 150 },
        ],
        transitions: [
            { x: 14 * 32, y: 24 * 32 - 16, width: 96, height: 32, targetRoom: 'room3', spawnId: 'from_room2' },
        ],
        spawns: {
            start: { x: 5 * 32, y: 21 * 32 },
            from_room3: { x: 14 * 32, y: 21 * 32 },
        },
        benches: [],
        width: 30 * 32,
        height: 25 * 32,
    };

    // Room 3: Crossroads Hub (45x17) - wider, scrolling
    const r3tiles = [];
    for (let r = 0; r < 17; r++) {
        const row = [];
        for (let c = 0; c < 45; c++) {
            if (r === 0) { row.push(W); }
            else if (r >= 15) { row.push(W); }
            else if (c === 0 || c === 44) { row.push(W); }
            else { row.push(_); }
        }
        r3tiles.push(row);
    }
    // Ceiling opening for room2 (around col 10-12)
    r3tiles[0][10] = _; r3tiles[0][11] = _; r3tiles[0][12] = _;
    // Floor opening for room5 (around col 30-32)
    r3tiles[15][30] = _; r3tiles[15][31] = _; r3tiles[15][32] = _;
    r3tiles[16][30] = _; r3tiles[16][31] = _; r3tiles[16][32] = _;
    // Some platforms
    for (let c = 6; c < 10; c++) r3tiles[10][c] = W;
    for (let c = 15; c < 19; c++) r3tiles[8][c] = W;
    for (let c = 25; c < 29; c++) r3tiles[10][c] = W;
    for (let c = 35; c < 39; c++) r3tiles[8][c] = W;
    // Small ground variation
    for (let c = 12; c < 16; c++) r3tiles[14][c] = W;
    for (let c = 20; c < 23; c++) r3tiles[12][c] = W;

    HK.rooms['room3'] = {
        name: 'Forgotten Crossroads',
        type: 'crossroads',
        tiles: r3tiles,
        enemies: [
            { type: 'Crawlid', x: 200, y: 448 },
            { type: 'Crawlid', x: 600, y: 448 },
            { type: 'HuskGuard', x: 900, y: 410 },
        ],
        transitions: [
            { x: 0, y: 320, width: 16, height: 128, targetRoom: 'room1', spawnId: 'from_room3' },
            { x: 10 * 32, y: 0, width: 96, height: 16, targetRoom: 'room2', spawnId: 'from_room3' },
            { x: 44 * 32, y: 320, width: 16, height: 128, targetRoom: 'room4', spawnId: 'from_room3' },
            { x: 30 * 32, y: 16 * 32 - 8, width: 96, height: 16, targetRoom: 'room5', spawnId: 'from_room3' },
        ],
        spawns: {
            start: { x: 64, y: 420 },
            from_room1: { x: 48, y: 420 },
            from_room2: { x: 10 * 32, y: 64 },
            from_room4: { x: 43 * 32, y: 420 },
            from_room5: { x: 30 * 32, y: 420 },
        },
        benches: [{ x: 22 * 32, y: 14 * 32 - 30 }],
        width: 45 * 32,
        height: 17 * 32,
    };

    // Room 4: Boss Arena (30x17)
    const r4tiles = [];
    for (let r = 0; r < 17; r++) {
        const row = [];
        for (let c = 0; c < 30; c++) {
            if (r === 0 || r === 1) { row.push(W); }
            else if (r >= 15) { row.push(W); }
            else if (c === 0 || c === 29) { row.push(W); }
            else { row.push(_); }
        }
        r4tiles.push(row);
    }

    HK.rooms['room4'] = {
        name: 'Gruz Mother\'s Den',
        type: 'boss',
        tiles: r4tiles,
        enemies: [
            { type: 'GruzMother', x: 400, y: 200 },
        ],
        transitions: [
            { x: 0, y: 320, width: 16, height: 128, targetRoom: 'room3', spawnId: 'from_room4' },
        ],
        spawns: {
            start: { x: 64, y: 416 },
            from_room3: { x: 64, y: 416 },
        },
        benches: [],
        width: 30 * 32,
        height: 17 * 32,
    };

    // Room 5: Hot Springs (25x17)
    const r5tiles = [];
    for (let r = 0; r < 17; r++) {
        const row = [];
        for (let c = 0; c < 25; c++) {
            if (r === 0) { row.push(W); }
            else if (r >= 15) { row.push(W); }
            else if (c === 0 || c === 24) { row.push(W); }
            else { row.push(_); }
        }
        r5tiles.push(row);
    }
    // Ceiling opening for room3 (around col 12-14)
    r5tiles[0][12] = _; r5tiles[0][13] = _; r5tiles[0][14] = _;
    // Hot spring pool in lower area
    for (let c = 5; c < 20; c++) { r5tiles[14][c] = H; }
    // Small platform
    for (let c = 8; c < 12; c++) r5tiles[10][c] = W;

    HK.rooms['room5'] = {
        name: 'Hot Springs',
        type: 'springs',
        tiles: r5tiles,
        enemies: [],
        transitions: [
            { x: 12 * 32, y: 0, width: 96, height: 16, targetRoom: 'room3', spawnId: 'from_room5' },
        ],
        spawns: {
            start: { x: 12 * 32, y: 64 },
            from_room3: { x: 12 * 32, y: 64 },
        },
        benches: [{ x: 4 * 32, y: 14 * 32 - 30 }],
        width: 25 * 32,
        height: 17 * 32,
    };
}

// ============================================================
// ROOM LOADING
// ============================================================
function loadRoom(roomId, spawnId) {
    const room = HK.rooms[roomId];
    if (!room) return;
    HK.currentRoom = room;
    HK.currentRoomId = roomId;
    HK.enemies = [];
    HK.geoDrops = [];
    HK.Particles.clear();

    // Spawn enemies
    for (const e of room.enemies) {
        let enemy;
        switch (e.type) {
            case 'Crawlid': enemy = new Crawlid(e.x, e.y); break;
            case 'Vengefly': enemy = new Vengefly(e.x, e.y); break;
            case 'HuskGuard': enemy = new HuskGuard(e.x, e.y); break;
            case 'GruzMother':
                if (HK.bossDefeated['gruz_mother']) continue;
                enemy = new GruzMother(e.x, e.y);
                break;
            default: continue;
        }
        HK.enemies.push(enemy);
    }

    // Position player
    const spawn = room.spawns[spawnId] || room.spawns['start'];
    if (spawn && HK.player) {
        HK.player.x = spawn.x;
        HK.player.y = spawn.y;
        HK.player.vx = 0;
        HK.player.vy = 0;
    }

    // Camera snap
    if (HK.player) {
        const tx = HK.player.x + HK.player.width / 2 - HK.CANVAS_W / 2;
        const ty = HK.player.y + HK.player.height / 2 - HK.CANVAS_H / 2;
        HK.Camera.snapTo(
            HK.clamp(tx, 0, Math.max(0, room.width - HK.CANVAS_W)),
            HK.clamp(ty, 0, Math.max(0, room.height - HK.CANVAS_H))
        );
    }

    // Area name
    HK.areaName = room.name;
    HK.areaNameTimer = 120;

    // Boss intro
    const hasBoss = HK.enemies.some(e => e instanceof GruzMother);
    if (hasBoss) {
        HK.gameState = 'boss_intro';
        HK.bossIntroTimer = 90;
        const boss = HK.enemies.find(e => e instanceof GruzMother);
        if (boss) boss.activated = false;
    }
}

// ============================================================
// UI
// ============================================================
const UI = {
    titleParticles: [],

    drawHUD(ctx) {
        const p = HK.player;
        if (!p) return;

        // Health masks
        for (let i = 0; i < p.maxHealth; i++) {
            HK.Sprite.drawMask(ctx, 30 + i * 28, 15, i < p.health);
        }

        // Soul vessel
        HK.Sprite.drawSoulVessel(ctx, 15, 55, p.soul, p.maxSoul);

        // Geo counter
        ctx.fillStyle = '#ffcc00';
        ctx.beginPath();
        const gx = 50, gy = 125;
        ctx.moveTo(gx, gy - 5);
        ctx.lineTo(gx + 5, gy);
        ctx.lineTo(gx, gy + 5);
        ctx.lineTo(gx - 5, gy);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px Georgia';
        ctx.textAlign = 'left';
        ctx.fillText(p.geo.toString(), gx + 12, gy + 5);
    },

    drawTitleScreen(ctx) {
        // Background
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);

        // Floating particles
        if (this.titleParticles.length < 30) {
            this.titleParticles.push({
                x: Math.random() * HK.CANVAS_W,
                y: HK.CANVAS_H + 10,
                speed: 0.3 + Math.random() * 0.5,
                size: 1 + Math.random() * 2,
                alpha: 0.1 + Math.random() * 0.2,
            });
        }
        for (let i = this.titleParticles.length - 1; i >= 0; i--) {
            const tp = this.titleParticles[i];
            tp.y -= tp.speed;
            tp.x += Math.sin(tp.y * 0.01) * 0.3;
            if (tp.y < -10) { this.titleParticles.splice(i, 1); continue; }
            ctx.globalAlpha = tp.alpha;
            ctx.fillStyle = '#aabbdd';
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, tp.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        // Title glow
        ctx.shadowColor = '#6688cc';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#e0e4f0';
        ctx.font = 'bold 64px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('HOLLOW SHADE', HK.CANVAS_W / 2, 160);
        ctx.shadowBlur = 0;

        // Silhouette of knight
        if (HK.Sprite && HK.Sprite.drawKnight) {
            ctx.filter = 'brightness(0)';
            HK.Sprite.drawKnight(ctx, HK.CANVAS_W / 2 - 13, 190, 1, 'idle', HK.frameCount);
            ctx.filter = 'none';
        }

        // Subtitle
        ctx.fillStyle = '#667788';
        ctx.font = '18px Georgia';
        ctx.fillText('A Fan Game', HK.CANVAS_W / 2, 260);

        // START Button
        const btnY = 320;
        const btnW = 200;
        const btnH = 40;
        const btnX = HK.CANVAS_W / 2 - btnW / 2;
        
        // Pulse glow
        const pulse = Math.sin(HK.frameCount * 0.05) * 0.5 + 0.5;
        ctx.shadowColor = '#88aadd';
        ctx.shadowBlur = 10 + pulse * 15;
        
        // Hover/Selected state box
        ctx.fillStyle = 'rgba(100, 120, 150, 0.2)';
        ctx.strokeStyle = '#aabbcc';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.fillRect(btnX, btnY, btnW, btnH);
        ctx.strokeRect(btnX, btnY, btnW, btnH);
        
        ctx.shadowBlur = 0;

        // Button Text
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 20px Georgia';
        ctx.fillText('START GAME', HK.CANVAS_W / 2, btnY + 28);
        
        // Selector (Nail / Arrow)
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(btnX - 25, btnY + 15);
        ctx.lineTo(btnX - 10, btnY + 20);
        ctx.lineTo(btnX - 25, btnY + 25);
        ctx.fill();

        // Controls
        ctx.fillStyle = '#445566';
        ctx.font = '12px Georgia';
        const controls = [
            'Arrow Keys / WASD - Move',
            'Z / Space - Jump',
            'X / Shift - Dash',
            'C / J - Attack',
            'F / K - Focus (Heal)',
            'P - Pause',
        ];
        controls.forEach((text, i) => {
            ctx.fillText(text, HK.CANVAS_W / 2, 400 + i * 18);
        });

        ctx.textAlign = 'left';
    },

    drawDeathScreen(ctx) {
        const alpha = Math.min(1, (120 - HK.deathTimer) / 60);
        ctx.fillStyle = `rgba(0, 0, 0, ${alpha * 0.8})`;
        ctx.fillRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);

        if (alpha > 0.5) {
            ctx.fillStyle = `rgba(180, 60, 60, ${(alpha - 0.5) * 2})`;
            ctx.font = 'bold 36px Georgia';
            ctx.textAlign = 'center';
            ctx.fillText('SHADE CONSUMED', HK.CANVAS_W / 2, HK.CANVAS_H / 2 - 20);

            if (HK.deathTimer <= 0) {
                if (Math.floor(HK.frameCount / 40) % 2 === 0) {
                    ctx.fillStyle = '#aaaaaa';
                    ctx.font = '16px Georgia';
                    ctx.fillText('Press Z to return', HK.CANVAS_W / 2, HK.CANVAS_H / 2 + 40);
                }
            }
            ctx.textAlign = 'left';
        }
    },

    drawPauseScreen(ctx) {
        ctx.fillStyle = 'rgba(0, 0, 10, 0.7)';
        ctx.fillRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);

        ctx.fillStyle = '#ccccdd';
        ctx.font = 'bold 32px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', HK.CANVAS_W / 2, HK.CANVAS_H / 2 - 40);

        ctx.fillStyle = '#8888aa';
        ctx.font = '14px Georgia';
        ctx.fillText('Press P to resume', HK.CANVAS_W / 2, HK.CANVAS_H / 2 + 10);

        const p = HK.player;
        if (p) {
            ctx.fillStyle = '#667788';
            ctx.fillText(`Geo: ${p.geo}  |  Health: ${p.health}/${p.maxHealth}  |  Soul: ${p.soul}/${p.maxSoul}`, HK.CANVAS_W / 2, HK.CANVAS_H / 2 + 50);
        }
        ctx.textAlign = 'left';
    },

    drawAreaName(ctx) {
        if (HK.areaNameTimer <= 0) return;
        let alpha;
        if (HK.areaNameTimer > 100) alpha = (120 - HK.areaNameTimer) / 20;
        else if (HK.areaNameTimer < 20) alpha = HK.areaNameTimer / 20;
        else alpha = 1;

        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ccccdd';
        ctx.font = '24px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText(HK.areaName, HK.CANVAS_W / 2, HK.CANVAS_H / 2);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    },

    drawBossHealth(ctx, boss) {
        if (!boss || !boss.alive) return;
        const barW = 300, barH = 6;
        const bx = (HK.CANVAS_W - barW) / 2;
        const by = HK.CANVAS_H - 40;

        // Name
        ctx.fillStyle = '#ccaa88';
        ctx.font = '14px Georgia';
        ctx.textAlign = 'center';
        ctx.fillText('Gruz Mother', HK.CANVAS_W / 2, by - 8);
        ctx.textAlign = 'left';

        // Bar background
        ctx.fillStyle = '#222233';
        ctx.fillRect(bx, by, barW, barH);
        // Bar fill
        const fill = (boss.health / boss.maxHealth) * barW;
        ctx.fillStyle = '#dd6644';
        ctx.fillRect(bx, by, fill, barH);
        // Bar border
        ctx.strokeStyle = '#555566';
        ctx.lineWidth = 1;
        ctx.strokeRect(bx, by, barW, barH);
    },

    drawTransition(ctx) {
        if (HK.transitionAlpha > 0) {
            ctx.fillStyle = `rgba(0, 0, 0, ${HK.transitionAlpha})`;
            ctx.fillRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);
        }
    }
};

// ============================================================
// MAIN GAME
// ============================================================
class Game {
    constructor() {
        HK.initCanvas();
        HK.Input.init();
        defineRooms();
        HK.player = new Player(64, 416);
        this.audioStarted = false;
        this.transitionPhase = 0; // 0=none, 1=fading out, 2=fading in
        this.hotSpringHealTimer = 0;
        this.bossIntroTimer = 0;

        // Start in title
        HK.gameState = 'title';
    }

    startGame() {
        HK.gameState = 'playing';
        loadRoom('room0', 'start');
        HK.player.health = HK.player.maxHealth;
        HK.player.soul = 0;
        HK.player.geo = 0;
        HK.Audio.play('menu_select');
    }

    update() {
        HK.frameCount++;

        // Init audio on first key
        if (!this.audioStarted && Object.keys(HK.Input.keys).length > 0) {
            HK.Audio.init();
            this.audioStarted = true;
        }

        switch (HK.gameState) {
            case 'title':
                if (HK.Input.isPressed('KeyZ') || HK.Input.isPressed('Space')) {
                    this.startGame();
                }
                break;

            case 'playing':
                this.updatePlaying();
                break;

            case 'transition':
                this.updateTransition();
                break;

            case 'dead':
                if (HK.deathTimer > 0) HK.deathTimer--;
                if (HK.deathTimer <= 0 && (HK.Input.isPressed('KeyZ') || HK.Input.isPressed('Space'))) {
                    this.respawn();
                }
                break;

            case 'paused':
                if (HK.Input.isPressed('KeyP')) {
                    HK.gameState = 'playing';
                }
                break;

            case 'boss_intro':
                this.bossIntroTimer--;
                if (this.bossIntroTimer <= 0) {
                    HK.gameState = 'playing';
                    // Activate boss
                    const boss = HK.enemies.find(e => e instanceof GruzMother);
                    if (boss) {
                        boss.activated = true;
                        HK.Audio.play('boss_roar');
                    }
                }
                break;
        }

        HK.Input.update();
    }

    updatePlaying() {
        if (HK.hitStop > 0) {
            HK.hitStop--;
            HK.Camera.update();
            return;
        }

        const tiles = HK.currentRoom ? HK.currentRoom.tiles : [];
        const p = HK.player;

        // Update player
        p.update(tiles);

        // Update enemies
        for (const e of HK.enemies) {
            if (!e.alive) continue;
            e.update(tiles);

            // Enemy hits player
            if (p.state !== 'dead' && p.iFrames <= 0 && p.state !== 'dash') {
                if (HK.Collision.rectRect(p, e)) {
                    p.takeDamage(e.damage);
                }
            }

            // Player attack hits enemy
            if (p.attackHitbox && !p.attackHit && e.alive && e.iFrames <= 0) {
                if (HK.Collision.rectRect(p.attackHitbox, e)) {
                    const dir = HK.sign((e.x + e.width / 2) - (p.x + p.width / 2));
                    e.takeDamage(1, dir || 1);
                    p.collectSoul(11);
                    p.attackHit = true;
                    HK.hitStop = 3;

                    // Pogo: downward attack bounces player up
                    if (p.attackDir === 'down') {
                        p.vy = -8;
                    }
                    // Recoil on side attacks
                    if (p.attackDir === 'left' || p.attackDir === 'right') {
                        p.vx = -dir * 3;
                    }
                    // Upward attack pushes player down slightly? No, upward is fine.
                }
            }
        }

        // Remove dead enemies
        // (keep them for drawing death animation, they'll be filtered by alive check)

        // Update geo drops
        for (let i = HK.geoDrops.length - 1; i >= 0; i--) {
            HK.geoDrops[i].update(tiles);
            if (HK.geoDrops[i].collected || HK.geoDrops[i].life <= 0) {
                HK.geoDrops.splice(i, 1);
            }
        }

        // Update particles
        HK.Particles.update();

        // Update camera
        if (HK.currentRoom) {
            HK.Camera.follow(p, HK.currentRoom.width, HK.currentRoom.height);
        }
        HK.Camera.update();

        // Check room transitions
        if (HK.currentRoom && p.state !== 'dead') {
            for (const t of HK.currentRoom.transitions) {
                if (HK.Collision.rectRect(p, t)) {
                    this.startTransition(t.targetRoom, t.spawnId);
                    break;
                }
            }
        }

        // Bench interaction
        if (HK.currentRoom && HK.currentRoom.benches) {
            for (const bench of HK.currentRoom.benches) {
                const benchRect = { x: bench.x, y: bench.y, width: 32, height: 32 };
                if (HK.Collision.rectRect(p, benchRect) && (HK.Input.isPressed('ArrowUp') || HK.Input.isPressed('KeyW'))) {
                    p.health = p.maxHealth;
                    p.soul = p.maxSoul;
                    HK.lastBenchRoom = HK.currentRoomId;
                    HK.lastBenchSpawn = 'start';
                    HK.Audio.play('bench_sit');
                    HK.Particles.emit(p.x + p.width / 2, p.y + p.height / 2, {
                        count: 20, color: '#ffffff', speed: 2, life: 30, size: 2, gravity: -0.03
                    });
                }
            }
        }

        // Hot spring healing
        if (HK.currentRoom) {
            const pcol = Math.floor((p.x + p.width / 2) / HK.TILE_SIZE);
            const prow = Math.floor((p.y + p.height) / HK.TILE_SIZE);
            const tile = HK.Collision.getTile(tiles, pcol, prow);
            if (tile === 7 || HK.Collision.getTile(tiles, pcol, prow - 1) === 7) {
                this.hotSpringHealTimer++;
                if (this.hotSpringHealTimer % 60 === 0 && p.health < p.maxHealth) {
                    p.health++;
                    HK.Particles.emit(p.x + p.width / 2, p.y + p.height / 2, {
                        count: 8, color: '#88ccee', speed: 1, life: 20, size: 2, gravity: -0.05
                    });
                }
                // Also regen soul slowly
                if (this.hotSpringHealTimer % 30 === 0) {
                    p.collectSoul(3);
                }
            } else {
                this.hotSpringHealTimer = 0;
            }
        }

        // Pause
        if (HK.Input.isPressed('KeyP')) {
            HK.gameState = 'paused';
        }

        // Area name timer
        if (HK.areaNameTimer > 0) HK.areaNameTimer--;
    }

    startTransition(targetRoom, spawnId) {
        HK.gameState = 'transition';
        HK.transitionTarget = targetRoom;
        HK.transitionSpawnId = spawnId;
        this.transitionPhase = 1;
        HK.transitionAlpha = 0;
    }

    updateTransition() {
        if (this.transitionPhase === 1) {
            HK.transitionAlpha += 0.05;
            if (HK.transitionAlpha >= 1) {
                HK.transitionAlpha = 1;
                loadRoom(HK.transitionTarget, HK.transitionSpawnId);
                this.transitionPhase = 2;
            }
        } else if (this.transitionPhase === 2) {
            HK.transitionAlpha -= 0.05;
            if (HK.transitionAlpha <= 0) {
                HK.transitionAlpha = 0;
                HK.gameState = 'playing';
                this.transitionPhase = 0;
            }
        }
    }

    respawn() {
        HK.player = new Player(64, 416);
        HK.player.health = HK.player.maxHealth;
        HK.gameState = 'playing';
        loadRoom(HK.lastBenchRoom, HK.lastBenchSpawn);
    }

    draw() {
        const ctx = HK.ctx;
        ctx.clearRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);
        ctx.fillStyle = '#0a0a12';
        ctx.fillRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);

        switch (HK.gameState) {
            case 'title':
                UI.drawTitleScreen(ctx);
                break;

            case 'playing':
            case 'transition':
            case 'boss_intro':
                this.drawGame(ctx);
                break;

            case 'dead':
                this.drawGame(ctx);
                UI.drawDeathScreen(ctx);
                break;

            case 'paused':
                this.drawGame(ctx);
                UI.drawPauseScreen(ctx);
                break;
        }
    }

    drawGame(ctx) {
        const room = HK.currentRoom;
        if (!room) return;

        HK.Camera.apply(ctx);

        // Background
        HK.Sprite.drawBackground(ctx, room.width, room.height, room.type);

        // Tiles (only visible ones)
        const T = HK.TILE_SIZE;
        const startCol = Math.max(0, Math.floor(HK.Camera.x / T) - 1);
        const endCol = Math.min(room.tiles[0].length, Math.ceil((HK.Camera.x + HK.CANVAS_W) / T) + 1);
        const startRow = Math.max(0, Math.floor(HK.Camera.y / T) - 1);
        const endRow = Math.min(room.tiles.length, Math.ceil((HK.Camera.y + HK.CANVAS_H) / T) + 1);

        for (let r = startRow; r < endRow; r++) {
            for (let c = startCol; c < endCol; c++) {
                const tile = room.tiles[r][c];
                if (tile !== 0 && tile !== 5) {
                    HK.Sprite.drawTile(ctx, c * T, r * T, tile);
                }
            }
        }

        // Benches
        if (room.benches) {
            for (const bench of room.benches) {
                HK.Sprite.drawBench(ctx, bench.x, bench.y);
                // Bench interaction hint
                const p = HK.player;
                if (p) {
                    const dx = Math.abs((p.x + p.width / 2) - (bench.x + 16));
                    const dy = Math.abs((p.y + p.height / 2) - (bench.y + 16));
                    if (dx < 40 && dy < 40) {
                        ctx.fillStyle = '#667788';
                        ctx.font = '10px Georgia';
                        ctx.textAlign = 'center';
                        ctx.fillText('↑ Rest', bench.x + 16, bench.y - 10);
                        ctx.textAlign = 'left';
                    }
                }
            }
        }

        // Geo drops
        for (const g of HK.geoDrops) g.draw(ctx);

        // Enemies
        for (const e of HK.enemies) e.draw(ctx);

        // Player
        if (HK.player) HK.player.draw(ctx);

        // Particles
        HK.Particles.draw(ctx);

        HK.Camera.reset(ctx);

        // HUD (screen space)
        UI.drawHUD(ctx);

        // Area name
        UI.drawAreaName(ctx);

        // Boss health bar
        const boss = HK.enemies.find(e => e instanceof GruzMother && e.alive);
        if (boss) UI.drawBossHealth(ctx, boss);

        // Boss intro overlay
        if (HK.gameState === 'boss_intro') {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
            ctx.fillRect(0, 0, HK.CANVAS_W, HK.CANVAS_H);
        }

        // Transition overlay
        UI.drawTransition(ctx);
    }

    gameLoop = (timestamp) => {
        if (HK.lastTime === 0) HK.lastTime = timestamp;
        HK.deltaTime = Math.min((timestamp - HK.lastTime) / 16.67, 3);
        HK.lastTime = timestamp;

        this.update();
        this.draw();

        requestAnimationFrame(this.gameLoop);
    }

    start() {
        requestAnimationFrame(this.gameLoop);
    }
}

// ============================================================
// BOOT
// ============================================================
window.addEventListener('load', () => {
    const game = new Game();
    game.start();
});
