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
