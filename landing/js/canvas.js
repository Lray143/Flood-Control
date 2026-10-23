/**
 * Subtle Atmospheric Rainfall & Progressive Flood Accumulation Canvas
 * - Delicate, translucent raindrops (gentle, unobtrusive ambiance)
 * - Progressive rising floodwater from the bottom the longer you stay
 * - Dynamic undulating water surface waves, reflections, and impact ripples
 */

(function () {
    const canvas = document.getElementById('hydro-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;
    let time = 0;
    let mouse = { x: -1000, y: -1000, active: false };
    const pageStartTime = performance.now();

    // Subtle natural storm slant
    const WIND_RATIO = 0.16;

    function resize() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    window.addEventListener('resize', resize);
    resize();

    window.addEventListener('pointermove', (e) => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;

        if (Math.random() < 0.25) {
            createSplash(e.clientX, e.clientY, 2);
        }
    });

    window.addEventListener('pointerleave', () => {
        mouse.active = false;
    });

    // ── SUBTLE RAINDROP PARTICLES (NOT SO VISIBLE) ──────────────────────────
    const RAIN_COUNT = Math.min(150, Math.floor(window.innerWidth * 0.12));
    const raindrops = [];
    const splashes = [];
    const ripples = [];

    // Ambient gentle lightning flicker (very soft & rare)
    let lightningOpacity = 0;
    let nextLightningTime = 14000 + Math.random() * 22000;
    let lastLightningTick = performance.now();

    // ── PROGRESSIVE FLOOD ENGINE ────────────────────────────────────────────
    function getFloodHeight(now) {
        // Starts with 1/6 of the page height already flooded
        const initialFlood = height / 6;
        const elapsedSec = (now - pageStartTime) / 1000;
        // Rises smoothly and caps at the exact level right below the button
        const riseRate = 1.3; // px/sec steady continuous accumulation
        const maxFlood = height * 0.22; // Maximum flood line capped safely below the button
        const target = Math.min(maxFlood, initialFlood + elapsedSec * riseRate);
        return target;
    }

    function getWaterSurfaceY(x, baseWaterY) {
        if (baseWaterY >= height) return height;
        // Two sinusoidal wave octaves
        let wave = Math.sin(x * 0.007 + time * 1.8) * 5
                 + Math.sin(x * 0.014 - time * 1.2) * 2.5;

        // Interactive mouse wake
        if (mouse.active) {
            const dist = Math.abs(x - mouse.x);
            if (dist < 220) {
                const influence = Math.cos((dist / 220) * (Math.PI / 2));
                wave += influence * 8 * Math.sin(time * 5);
            }
        }
        return baseWaterY + wave;
    }

    // Expose water surface API for 3D synchronization
    window.HydroWater = {
        getSurfaceY: function (x) {
            const fHeight = getFloodHeight(performance.now());
            const fSurfaceY = height - fHeight;
            return getWaterSurfaceY(x, fSurfaceY);
        },
        getSurfaceAngle: function (x) {
            const fHeight = getFloodHeight(performance.now());
            const fSurfaceY = height - fHeight;
            const dy = getWaterSurfaceY(x + 12, fSurfaceY) - getWaterSurfaceY(x - 12, fSurfaceY);
            return Math.atan2(dy, 24);
        },
        createSplash: function (x, y, count = 5) {
            createSplash(x, y, count);
        },
        createRipple: function (x, y) {
            createRipple(x, y);
        },
        getTime: function () {
            return time;
        },
        getFloodHeight: function () {
            return getFloodHeight(performance.now());
        },
        getDimensions: function () {
            return { width, height };
        }
    };

    // ── MODULAR RANDOM FLOATING ITEMS ENGINE ─────────────────────────────────
    // Preload random picture frame photos (all 5 user-uploaded images)
    const frameImages = [1, 2, 3, 4, 5].map(i => {
        const img = new Image();
        img.src = `/landing/img/frame_${i}.jpg`;
        return img;
    });

    const frameLabels = ['Bading ❤', 'LIKHA 🚀', 'Team Deparo', 'Brothers ⭐', 'Dev Squad 🔥'];
    const frameTapes = [
        'rgba(244, 63, 94, 0.85)',   // Rose
        'rgba(14, 165, 233, 0.85)',  // Sky blue
        'rgba(168, 85, 247, 0.85)',  // Purple
        'rgba(34, 197, 94, 0.85)',   // Emerald
        'rgba(245, 158, 11, 0.85)'   // Amber
    ];

    // ── MODULAR ITEM RENDERERS REGISTRY ──────────────────────────────────────
    const ITEM_RENDERERS = {
        boat: function (ctx) {
            // Folded paper boat hull
            ctx.beginPath();
            ctx.moveTo(-22, 0);
            ctx.lineTo(-12, 8);
            ctx.lineTo(12, 8);
            ctx.lineTo(22, 0);
            ctx.lineTo(0, 3);
            ctx.closePath();
            ctx.fillStyle = '#f0f6fc';
            ctx.fill();
            ctx.strokeStyle = '#c9d1d9';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Hull shadow facet
            ctx.beginPath();
            ctx.moveTo(0, 3);
            ctx.lineTo(12, 8);
            ctx.lineTo(22, 0);
            ctx.closePath();
            ctx.fillStyle = '#d0d7de';
            ctx.fill();

            // Big center triangular sail
            ctx.beginPath();
            ctx.moveTo(-6, 2);
            ctx.lineTo(0, -18);
            ctx.lineTo(10, 2);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.stroke();

            // Sail accent facet
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(10, 2);
            ctx.lineTo(0, 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 210, 255, 0.28)';
            ctx.fill();
        },

        duck: function (ctx) {
            // Duck yellow body
            ctx.beginPath();
            ctx.ellipse(-2, 0, 13, 8, -0.05, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd13b';
            ctx.fill();
            ctx.strokeStyle = '#e6b31e';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Tail bump
            ctx.beginPath();
            ctx.moveTo(-13, 0);
            ctx.lineTo(-17, -5);
            ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fillStyle = '#ffd13b';
            ctx.fill();

            // Head
            ctx.beginPath();
            ctx.arc(8, -8, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffe055';
            ctx.fill();
            ctx.stroke();

            // Eye
            ctx.beginPath();
            ctx.arc(10, -9, 1.3, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1a1a';
            ctx.fill();

            // Beak
            ctx.beginPath();
            ctx.moveTo(14, -8);
            ctx.lineTo(20, -6);
            ctx.lineTo(14, -4);
            ctx.closePath();
            ctx.fillStyle = '#ff6b35';
            ctx.fill();
            ctx.stroke();
        },

        basketball: function (ctx) {
            const r = 11;
            ctx.beginPath();
            ctx.arc(0, -2, r, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(-3, -5, 2, 0, -2, r);
            grad.addColorStop(0, '#ff8a3d');
            grad.addColorStop(0.85, '#d9530f');
            grad.addColorStop(1, '#9e3500');
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.strokeStyle = '#2b1408';
            ctx.lineWidth = 1.1;

            ctx.beginPath();
            ctx.ellipse(0, -2, r, r * 0.25, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(-r * 0.45, -2, r * 0.7, -Math.PI / 2, Math.PI / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(r * 0.45, -2, r * 0.7, Math.PI / 2, (3 * Math.PI) / 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(-4, -6, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fill();
        },

        tsinelas: function (ctx) {
            // Sole
            ctx.beginPath();
            ctx.roundRect(-16, -2, 32, 6, 3);
            ctx.fillStyle = '#0ea5e9';
            ctx.fill();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Y-strap
            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(6, -8);
            ctx.lineTo(10, -2);
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 2.2;
            ctx.stroke();

            // Toe plug
            ctx.beginPath();
            ctx.arc(6, -8, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = '#0284c7';
            ctx.fill();
        },

        leaf: function (ctx) {
            ctx.beginPath();
            ctx.moveTo(-16, 2);
            ctx.quadraticCurveTo(0, -10, 16, 0);
            ctx.quadraticCurveTo(0, 10, -16, 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-14, 2);
            ctx.quadraticCurveTo(0, 0, 14, 0);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
            ctx.lineWidth = 0.9;
            ctx.stroke();
        },

        soda: function (ctx) {
            // Metallic red soda can floating tilted
            const w = 24, h = 13;
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h + 2, w, h, 2.5);
            const grad = ctx.createLinearGradient(0, -h, 0, 2);
            grad.addColorStop(0, '#e11d48');
            grad.addColorStop(0.45, '#fb7185');
            grad.addColorStop(0.85, '#e11d48');
            grad.addColorStop(1, '#9f1239');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Silver metallic rims
            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(-w / 2, -h + 2, 3, h);
            ctx.fillRect(w / 2 - 3, -h + 2, 3, h);

            // Silver brand swoosh
            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.ellipse(0, -h / 2 + 2, 5, 2, -0.2, 0, Math.PI * 2);
            ctx.fill();
        },

        coconut: function (ctx) {
            // Brown textured coconut bobbing heavily
            const r = 12;
            ctx.beginPath();
            ctx.arc(0, -2, r, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(-3, -5, 2, 0, -2, r);
            grad.addColorStop(0, '#854d0e');
            grad.addColorStop(0.7, '#593208');
            grad.addColorStop(1, '#3b1f03');
            ctx.fillStyle = grad;
            ctx.fill();

            // 3 germination eyes
            ctx.fillStyle = '#1c0a00';
            ctx.beginPath();
            ctx.arc(-3, -6, 1.2, 0, Math.PI * 2);
            ctx.arc(1, -7, 1.1, 0, Math.PI * 2);
            ctx.arc(-1, -3, 1.2, 0, Math.PI * 2);
            ctx.fill();

            // Fiber highlights
            ctx.strokeStyle = 'rgba(254, 240, 138, 0.25)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(0, -2, r - 1.5, -0.6, 1.2);
            ctx.stroke();
        },

        bottle: function (ctx) {
            // Translucent mineral water bottle
            const w = 28, h = 11;
            ctx.beginPath();
            ctx.roundRect(-w / 2 + 5, -h + 2, w - 5, h, 2);
            ctx.fillStyle = 'rgba(186, 230, 253, 0.65)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.8)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Cyan paper label
            ctx.fillStyle = '#0284c7';
            ctx.fillRect(-w / 2 + 10, -h + 3, 10, h - 2);

            // Neck & blue cap
            ctx.fillStyle = 'rgba(186, 230, 253, 0.7)';
            ctx.fillRect(-w / 2 + 2, -h / 2 - 1, 3, 4);
            ctx.fillStyle = '#0369a1';
            ctx.fillRect(-w / 2, -h / 2 - 2, 2.5, 6);

            // Specular sheen
            ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
            ctx.fillRect(-w / 2 + 7, -h + 3.5, w - 8, 1.5);
        },

        plank: function (ctx) {
            // Weathered wooden timber plank
            const w = 36, h = 9;
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h + 2, w, h, 1.5);
            const grad = ctx.createLinearGradient(0, -h, 0, 2);
            grad.addColorStop(0, '#a16207');
            grad.addColorStop(0.5, '#78350f');
            grad.addColorStop(1, '#451a03');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#291001';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // Grain line & nail marks
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.moveTo(-w / 2 + 4, -h / 2 + 1);
            ctx.lineTo(w / 2 - 4, -h / 2 + 1);
            ctx.stroke();

            ctx.fillStyle = '#1c0a00';
            ctx.fillRect(-w / 2 + 4, -h / 2, 1.5, 1.5);
            ctx.fillRect(w / 2 - 6, -h / 2, 1.5, 1.5);
        },

        frame: function (ctx, extra) {
            // Enhanced, larger Polaroid-style picture frame (64px wide x 80px tall)
            const imgIdx = (extra && extra.imageIndex !== undefined) ? extra.imageIndex : 0;
            const fw = 32; // half-width (64px total width)
            const fh = 80; // full height (80px total height)
            const topY = -fh + 16;

            // Frame drop shadow on water
            ctx.fillStyle = 'rgba(0, 20, 40, 0.35)';
            ctx.beginPath();
            ctx.roundRect(-fw - 3, topY - 2, (fw + 3) * 2, fh + 4, 4);
            ctx.fill();

            // Outer white Polaroid card
            ctx.beginPath();
            ctx.roundRect(-fw, topY, fw * 2, fh, 4);
            ctx.fillStyle = '#fdfefe';
            ctx.fill();
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Inner photo viewport (56px wide x 54px tall)
            const pw = fw - 4;
            const ph = 54;
            const px = -pw;
            const py = topY + 4;

            ctx.save();
            ctx.beginPath();
            ctx.rect(px, py, pw * 2, ph);
            ctx.clip();

            const img = frameImages[imgIdx % frameImages.length];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, px, py, pw * 2, ph);
            } else {
                ctx.fillStyle = '#475569';
                ctx.fillRect(px, py, pw * 2, ph);
            }

            // Glass glare sheen
            const glare = ctx.createLinearGradient(px, py, px + pw * 2, py + ph);
            glare.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
            glare.addColorStop(0.45, 'rgba(255, 255, 255, 0.05)');
            glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = glare;
            ctx.fillRect(px, py, pw * 2, ph);
            ctx.restore();

            // Handwritten caption label
            const label = frameLabels[imgIdx % frameLabels.length];
            ctx.font = 'bold 8px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
            ctx.fillStyle = '#1e293b';
            ctx.textAlign = 'center';
            ctx.fillText(label, 0, topY + fh - 6);

            // Decorative colored washi tape
            const tapeColor = frameTapes[imgIdx % frameTapes.length];
            ctx.fillStyle = tapeColor;
            ctx.beginPath();
            ctx.roundRect(-10, topY - 3.5, 20, 6, 1.5);
            ctx.fill();
        }
    };

    // ── MODULAR FLOATING ITEM CLASS ──────────────────────────────────────────
    class FloatingItem {
        constructor(type, x, speed, scale = 1, extra = {}) {
            this.type = type;
            this.x = x;
            this.speed = speed;
            this.scale = scale;
            this.extra = extra;
            this.bobPhase = Math.random() * Math.PI * 2;
            this.bobSpeed = 1.1 + Math.random() * 0.7;
            this.jumpY = 0;
            this.jumpVy = 0;
            this.hoverCooldown = 0;
        }

        update(floodSurfaceY) {
            this.x += this.speed;
            if (this.x > width + 100) {
                this.x = -100;
                // Cycle picture index when wrapping around so all photos appear
                if (this.type === 'frame') {
                    this.extra.imageIndex = ((this.extra.imageIndex || 0) + 1) % frameImages.length;
                }
            }

            if (this.hoverCooldown > 0) {
                this.hoverCooldown--;
            }

            // Smooth single buoyant hop when cursor passes over item
            if (mouse.active && this.hoverCooldown <= 0 && this.jumpY === 0) {
                const dx = Math.abs(this.x - mouse.x);
                const surfaceY = getWaterSurfaceY(this.x, floodSurfaceY);
                const dy = Math.abs(surfaceY - mouse.y);
                const hitDist = this.type === 'frame' ? 48 : 36;
                if (dx < hitDist && dy < hitDist) {
                    this.jumpVy = -3.2; // Soft buoyant hop
                    this.hoverCooldown = 80; // ~1.4s cooldown prevents rapid spam bouncing
                    createSplash(this.x, surfaceY, 3);
                    createRipple(this.x, surfaceY);
                }
            }

            if (this.jumpVy !== 0 || this.jumpY !== 0) {
                this.jumpY += this.jumpVy;
                this.jumpVy += 0.16; // Soft gentle water buoyancy restoration
                if (this.jumpY >= 0) {
                    this.jumpY = 0;
                    this.jumpVy = 0;
                    const surfaceY = getWaterSurfaceY(this.x, floodSurfaceY);
                    createRipple(this.x, surfaceY);
                }
            }

            // Occasional ambient wake ripple
            if (Math.random() < 0.015) {
                const surfaceY = getWaterSurfaceY(this.x, floodSurfaceY);
                createRipple(this.x - 8 * this.speed, surfaceY);
            }
        }

        draw(ctx, floodSurfaceY) {
            const surfaceY = getWaterSurfaceY(this.x, floodSurfaceY);
            const dy = getWaterSurfaceY(this.x + 8, floodSurfaceY) - getWaterSurfaceY(this.x - 8, floodSurfaceY);
            const waveAngle = Math.atan2(dy, 16);
            const bob = Math.sin(time * this.bobSpeed + this.bobPhase) * 2.8 + this.jumpY;

            ctx.save();
            ctx.translate(this.x, surfaceY + bob);
            ctx.rotate(waveAngle * 0.85);
            ctx.scale(this.scale, this.scale);

            // Water reflection / contact shadow
            const shadowW = this.type === 'frame' ? 26 : 16;
            ctx.fillStyle = 'rgba(2, 32, 60, 0.28)';
            ctx.beginPath();
            ctx.ellipse(0, 3, shadowW, 3.5, 0, 0, Math.PI * 2);
            ctx.fill();

            const renderer = ITEM_RENDERERS[this.type];
            if (renderer) {
                renderer(ctx, this.extra);
            }

            ctx.restore();
        }
    }

    // Initialize rich, modular floating items pool
    const floatingItems = [
        new FloatingItem('boat', window.innerWidth * 0.04, 0.42, 1.05),
        new FloatingItem('frame', window.innerWidth * 0.16, 0.35, 1.0, { imageIndex: 0 }),
        new FloatingItem('duck', window.innerWidth * 0.28, 0.52, 0.95),
        new FloatingItem('soda', window.innerWidth * 0.38, 0.44, 1.0),
        new FloatingItem('frame', window.innerWidth * 0.50, 0.34, 1.0, { imageIndex: 1 }),
        new FloatingItem('basketball', window.innerWidth * 0.62, 0.46, 0.9),
        new FloatingItem('coconut', window.innerWidth * 0.72, 0.40, 0.95),
        new FloatingItem('frame', window.innerWidth * 0.82, 0.36, 1.0, { imageIndex: 2 }),
        new FloatingItem('tsinelas', window.innerWidth * 0.92, 0.38, 0.95),
        new FloatingItem('bottle', window.innerWidth * 0.22, 0.48, 1.0),
        new FloatingItem('plank', window.innerWidth * 0.58, 0.36, 1.0),
        new FloatingItem('leaf', window.innerWidth * 0.68, 0.32, 1.0)
    ];

    class Raindrop {
        constructor() {
            this.reset(true);
        }

        reset(initial = false) {
            const rand = Math.random();
            if (rand < 0.5) {
                // Background mist (faint, gentle)
                this.layer = 0;
                this.speed = 8 + Math.random() * 4;
                this.length = 12 + Math.random() * 12;
                this.width = 0.65;
                this.color = 'rgba(150, 205, 240, 0.09)';
            } else if (rand < 0.88) {
                // Midground drizzle
                this.layer = 1;
                this.speed = 14 + Math.random() * 5;
                this.length = 20 + Math.random() * 18;
                this.width = 0.9;
                this.color = 'rgba(175, 225, 255, 0.16)';
            } else {
                // Foreground subtle drop
                this.layer = 2;
                this.speed = 20 + Math.random() * 6;
                this.length = 32 + Math.random() * 20;
                this.width = 1.15;
                this.color = 'rgba(215, 242, 255, 0.26)';
            }

            const initialSurface = height - (height / 6);
            this.x = Math.random() * (width + 200) - 100;
            this.y = initial ? Math.random() * initialSurface : -this.length - Math.random() * 60;
        }

        update(currentFloodY) {
            this.x += this.speed * WIND_RATIO;
            this.y += this.speed;

            // Target surface is either the rising flood water or the bottom
            const impactY = Math.min(height, currentFloodY ? getWaterSurfaceY(this.x, currentFloodY) : height);

            if (this.y >= impactY) {
                if (this.layer >= 1 && Math.random() < 0.5) {
                    createSplash(this.x, impactY - 1, this.layer === 2 ? 3 : 1);
                    if (this.layer === 2 && Math.random() < 0.45) {
                        createRipple(this.x, impactY);
                    }
                }
                this.reset();
            }

            if (this.x > width + 100) {
                this.reset();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x - this.length * WIND_RATIO, this.y - this.length);
            ctx.strokeStyle = this.color;
            ctx.lineWidth = this.width;
            ctx.stroke();
        }
    }

    // Initialize raindrops
    for (let i = 0; i < RAIN_COUNT; i++) {
        raindrops.push(new Raindrop());
    }

    // ── SPLASHES & RIPPLES ──────────────────────────────────────────────────
    function createSplash(x, y, count) {
        if (splashes.length > 80) splashes.splice(0, 15);
        for (let i = 0; i < count; i++) {
            splashes.push({
                x: x,
                y: y,
                vx: (Math.random() - 0.5) * 2.8 + 0.4,
                vy: -(Math.random() * 2.4 + 0.8),
                gravity: 0.14,
                alpha: 0.35 + Math.random() * 0.25,
                radius: 0.8 + Math.random() * 0.8
            });
        }
    }

    function createRipple(x, y) {
        if (ripples.length > 25) ripples.shift();
        ripples.push({
            x: x,
            y: y,
            rx: 2,
            ry: 0.6,
            maxRx: 14 + Math.random() * 16,
            alpha: 0.28 + Math.random() * 0.18,
            speed: 0.65 + Math.random() * 0.3
        });
    }

    // ── MAIN RENDER LOOP ────────────────────────────────────────────────────
    function render(now) {
        time += 0.018;

        // Subtle distant lightning sheet
        if (now - lastLightningTick > nextLightningTime) {
            lightningOpacity = 0.08;
            lastLightningTick = now;
            nextLightningTime = 16000 + Math.random() * 24000;
        }

        if (lightningOpacity > 0.003) {
            lightningOpacity *= 0.88;
        } else {
            lightningOpacity = 0;
        }

        ctx.clearRect(0, 0, width, height);

        // Soft lightning flash
        if (lightningOpacity > 0) {
            ctx.fillStyle = `rgba(180, 220, 255, ${lightningOpacity})`;
            ctx.fillRect(0, 0, width, height);
        }

        // Current flood level (0 when beginning, rises upward from height)
        const floodHeight = getFloodHeight(now);
        const floodSurfaceY = height - floodHeight;

        // 1. Draw subtle rain streaks
        for (let drop of raindrops) {
            drop.update(floodSurfaceY);
            drop.draw();
        }

        // 2. Draw ground / water impact ripples
        for (let i = ripples.length - 1; i >= 0; i--) {
            const rip = ripples[i];
            rip.rx += rip.speed;
            rip.ry += rip.speed * 0.32;
            rip.alpha *= 0.94;

            if (rip.alpha <= 0.01 || rip.rx >= rip.maxRx) {
                ripples.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.ellipse(rip.x, rip.y, rip.rx, rip.ry, 0, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(160, 225, 255, ${rip.alpha})`;
            ctx.lineWidth = 0.9;
            ctx.stroke();
        }

        // 3. Draw splash particles
        for (let i = splashes.length - 1; i >= 0; i--) {
            const s = splashes[i];
            s.x += s.vx;
            s.y += s.vy;
            s.vy += s.gravity;
            s.alpha *= 0.93;

            if (s.alpha <= 0.01 || s.y > height + 5) {
                splashes.splice(i, 1);
                continue;
            }

            ctx.beginPath();
            ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(180, 230, 255, ${s.alpha})`;
            ctx.fill();
        }

        // 4. DRAW RISING FLOODWATER ACCUMULATION
        if (floodHeight > 1) {
            // A. Back depth water wave layer
            ctx.beginPath();
            ctx.moveTo(0, height);
            for (let x = 0; x <= width; x += 15) {
                const subWave = Math.sin(x * 0.005 - time * 1.2) * 4
                              + Math.cos(x * 0.011 + time * 1.5) * 2.5;
                ctx.lineTo(x, floodSurfaceY + 3 + subWave);
            }
            ctx.lineTo(width, height);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 160, 210, 0.08)';
            ctx.fill();

            // B. Primary main flood water body
            ctx.beginPath();
            ctx.moveTo(0, height);
            ctx.lineTo(0, getWaterSurfaceY(0, floodSurfaceY));

            for (let x = 12; x <= width; x += 12) {
                ctx.lineTo(x, getWaterSurfaceY(x, floodSurfaceY));
            }

            ctx.lineTo(width, height);
            ctx.closePath();

            // Deep translucent flood water gradient
            const waterGrad = ctx.createLinearGradient(0, floodSurfaceY, 0, height);
            waterGrad.addColorStop(0, 'rgba(0, 195, 240, 0.16)');
            waterGrad.addColorStop(0.35, 'rgba(4, 80, 125, 0.32)');
            waterGrad.addColorStop(1, 'rgba(2, 22, 42, 0.65)');

            ctx.fillStyle = waterGrad;
            ctx.fill();

            // C. Gleaming surface water crest line
            ctx.beginPath();
            ctx.moveTo(0, getWaterSurfaceY(0, floodSurfaceY));
            for (let x = 12; x <= width; x += 12) {
                ctx.lineTo(x, getWaterSurfaceY(x, floodSurfaceY));
            }
            ctx.strokeStyle = 'rgba(120, 235, 255, 0.38)';
            ctx.lineWidth = 1.3;
            ctx.stroke();

            // Subtle surface foam reflection dots
            // D. Draw floating water items
            for (let item of floatingItems) {
                item.update(floodSurfaceY);
                item.draw(ctx, floodSurfaceY);
            }
            ctx.fillStyle = 'rgba(220, 245, 255, 0.4)';
            for (let k = 0; k < 6; k++) {
                const foamX = ((time * 30 + k * (width / 6)) % width);
                const foamY = getWaterSurfaceY(foamX, floodSurfaceY) + 1;
                ctx.beginPath();
                ctx.arc(foamX, foamY, 1.2, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        requestAnimationFrame(render);
    }

    requestAnimationFrame(render);
})();
