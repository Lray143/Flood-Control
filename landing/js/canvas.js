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

    // ── KEYBIND: Left Ctrl + Right Ctrl to Toggle Floating Items ────────────
    window.HydroItemsHidden = false;
    let keyCtrlLeft = false;
    let keyCtrlRight = false;
    let ctrlDebounce = false;

    window.addEventListener('keydown', (e) => {
        if (e.code === 'ControlLeft') keyCtrlLeft = true;
        if (e.code === 'ControlRight') keyCtrlRight = true;

        if (keyCtrlLeft && keyCtrlRight && !ctrlDebounce) {
            ctrlDebounce = true;
            window.HydroItemsHidden = !window.HydroItemsHidden;
            if (window.HydroItemsHidden && dragged2DItem) {
                dragged2DItem.isDragging = false;
                dragged2DItem = null;
                window._2dItemDragging = false;
                document.body.style.cursor = '';
            }
            setTimeout(() => { ctrlDebounce = false; }, 350);
        }
    });

    window.addEventListener('keyup', (e) => {
        if (e.code === 'ControlLeft') keyCtrlLeft = false;
        if (e.code === 'ControlRight') keyCtrlRight = false;
    });

        // ── HOLD RIGHT CLICK ON 2D ITEM TO POP LIKE A BUBBLE ───────────────────
    let rightClick2DItem = null;

    window.addEventListener('contextmenu', (e) => {
        // Prevent default context menu so right-click hold works seamlessly
        e.preventDefault();
    });

    // 2D item drag state
    let dragged2DItem = null;
    let drag2DOffsetX = 0;
    let drag2DOffsetY = 0;

    window.addEventListener('pointermove', (e) => {
        if (window.HydroItemsHidden) return;
        mouse.x = e.clientX;
        mouse.y = e.clientY;
        mouse.active = true;

        if (dragged2DItem) {
            dragged2DItem.dragX = e.clientX - drag2DOffsetX;
            dragged2DItem.dragY = e.clientY - drag2DOffsetY;
            e.preventDefault();
        } else if (!window._3dPlayerDragging) {
            // Check hover over 2D floating items
            let hovered = false;
            for (let item of floatingItems) {
                const ix = item.x;
                const iy = item._lastDrawY;
                if (ix !== undefined && iy !== undefined) {
                    if (Math.abs(e.clientX - ix) < 50 && Math.abs(e.clientY - iy) < 50) {
                        hovered = true;
                        break;
                    }
                }
            }
            window._2dItemHovered = hovered;
            if (hovered && document.body.style.cursor !== 'grabbing') {
                document.body.style.cursor = 'grab';
            } else if (!hovered && !window._3dPlayerDragging && document.body.style.cursor === 'grab') {
                document.body.style.cursor = '';
            }

            if (Math.random() < 0.25) {
                createSplash(e.clientX, e.clientY, 2);
            }
        }
    });

    window.addEventListener('pointerleave', () => {
        mouse.active = false;
    });

    window.addEventListener('pointerdown', (e) => {
        if (window.HydroItemsHidden) return;
        if (e.target.closest('a, button, input, [role="button"]')) return;
        if (window._3dPlayerDragging) return;

        const hitRadius = 55;

        // Right click hold: bubble pop
        if (e.button === 2) {
            for (let item of floatingItems) {
                const ix = item.isDragging ? item.dragX : item.x;
                const iy = item.isDragging ? item.dragY : item._lastDrawY;
                if (ix === undefined || iy === undefined) continue;
                if (Math.abs(e.clientX - ix) < hitRadius && Math.abs(e.clientY - iy) < hitRadius) {
                    rightClick2DItem = item;
                    item.isPopping = true;
                    item.popProgress = 0;
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                }
            }
            return;
        }

        // Left click: drag & drop
        if (e.button === 0) {
            for (let item of floatingItems) {
                const ix = item.isDragging ? item.dragX : item.x;
                const iy = item.isDragging ? item.dragY : item._lastDrawY;
                if (ix === undefined || iy === undefined) continue;
                const dx = Math.abs(e.clientX - ix);
                const dy = Math.abs(e.clientY - iy);
                if (dx < hitRadius && dy < hitRadius) {
                    dragged2DItem = item;
                    window._2dItemDragging = true;
                    item.isDragging = true;
                    item.hoverCooldown = 999;
                    item.jumpY = 0;
                    item.jumpVy = 0;
                    drag2DOffsetX = e.clientX - ix;
                    drag2DOffsetY = e.clientY - iy;
                    item.dragX = ix;
                    item.dragY = iy;
                    document.body.style.cursor = 'grabbing';
                    e.preventDefault();
                    e.stopPropagation();
                    break;
                }
            }
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (e.button === 2 && rightClick2DItem) {
            rightClick2DItem.isPopping = false;
            rightClick2DItem.popProgress = 0;
            rightClick2DItem = null;
        }

        if (dragged2DItem) {
            const item = dragged2DItem;
            dragged2DItem = null;
            window._2dItemDragging = false;
            item.isDragging = false;
            item.hoverCooldown = 60;
            document.body.style.cursor = '';

            // Gentle float-down drop physics with start height recorded for dynamic splash
            item.dropX = item.dragX;
            item.dropY = item.dragY;
            item.startDropY = item.dragY;
            item.dropVy = 0.3;
            item.isDropping = true;
        }
    });

    window.addEventListener('pointercancel', () => {
        if (dragged2DItem) {
            const item = dragged2DItem;
            dragged2DItem = null;
            window._2dItemDragging = false;
            item.isDragging = false;
            document.body.style.cursor = '';
            item.dropX = item.dragX;
            item.dropY = item.dragY;
            item.dropVy = 0.4;
            item.isDropping = true;
        }
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
        createBubblePop: createBubblePop,
        getDimensions: function () {
            return { width, height };
        }
    };

    // ── MODULAR RANDOM FLOATING ITEMS ENGINE ─────────────────────────────────
        // 23 distinct authentic urban flood debris types
    const DEBRIS_TYPES = [
        'boat', 'duck', 'basketball', 'tsinelas', 'leaf', 'soda', 'coconut',
        'bottle', 'plank', 'lifebuoy', 'soccer', 'box', 'cap', 'watermelon',
        'branch', 'log', 'chair', 'tire', 'gallon', 'cooler', 'cone', 'umbrella', 'bamboo'
    ];

    // Preload random picture frame photos (14 user-uploaded team photos)
    const FRAME_PHOTO_COUNT = 14;
    const frameImages = [];
    for (let i = 1; i <= FRAME_PHOTO_COUNT; i++) {
        const img = new Image();
        img.src = `/landing/img/frame_${i}.jpg`;
        frameImages.push(img);
    }

    const FRAME_COLORS = [
        '#ffffff', // Crisp classic Polaroid
        '#fef08a', // Pastel yellow
        '#fed7aa', // Warm peach
        '#fbcfe8', // Cute pastel pink
        '#bbf7d0', // Mint green
        '#bae6fd', // Soft baby blue
        '#e9d5ff', // Pastel lavender
        '#fed7d7', // Light coral
        '#fef3c7', // Warm cream
        '#ddd6fe', // Periwinkle
        '#fed1d1'  // Blossom
    ];

    const FRAME_TAPES = [
        'rgba(244, 63, 94, 0.85)',   // Rose
        'rgba(14, 165, 233, 0.85)',  // Sky blue
        'rgba(168, 85, 247, 0.85)',  // Purple
        'rgba(34, 197, 94, 0.85)',   // Emerald
        'rgba(245, 158, 11, 0.85)',  // Amber
        'rgba(236, 72, 153, 0.85)',  // Hot pink
        'rgba(99, 102, 241, 0.85)'   // Indigo
    ];

    // ── MODULAR ITEM RENDERERS REGISTRY (CRISP ABOVE-WATER RENDERING) ────────
    const ITEM_RENDERERS = {
        boat: function (ctx) {
            // Folded paper boat
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

            ctx.beginPath();
            ctx.moveTo(0, 3);
            ctx.lineTo(12, 8);
            ctx.lineTo(22, 0);
            ctx.closePath();
            ctx.fillStyle = '#d0d7de';
            ctx.fill();

            ctx.beginPath();
            ctx.moveTo(-6, 2);
            ctx.lineTo(0, -18);
            ctx.lineTo(10, 2);
            ctx.closePath();
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(10, 2);
            ctx.lineTo(0, 2);
            ctx.closePath();
            ctx.fillStyle = 'rgba(0, 210, 255, 0.3)';
            ctx.fill();
        },

        duck: function (ctx) {
            ctx.beginPath();
            ctx.ellipse(-2, 0, 13, 8, -0.05, 0, Math.PI * 2);
            ctx.fillStyle = '#ffd13b';
            ctx.fill();
            ctx.strokeStyle = '#e6b31e';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-13, 0);
            ctx.lineTo(-17, -5);
            ctx.lineTo(-10, -2);
            ctx.closePath();
            ctx.fillStyle = '#ffd13b';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(8, -8, 7.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffe055';
            ctx.fill();
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(10, -9, 1.3, 0, Math.PI * 2);
            ctx.fillStyle = '#1a1a1a';
            ctx.fill();

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
            ctx.beginPath();
            ctx.roundRect(-16, -2, 32, 6, 3);
            ctx.fillStyle = '#0ea5e9';
            ctx.fill();
            ctx.strokeStyle = '#0284c7';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-4, -2);
            ctx.lineTo(6, -8);
            ctx.lineTo(10, -2);
            ctx.strokeStyle = '#f8fafc';
            ctx.lineWidth = 2.2;
            ctx.stroke();

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
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 0.9;
            ctx.stroke();
        },

        soda: function (ctx) {
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

            ctx.fillStyle = '#cbd5e1';
            ctx.fillRect(-w / 2, -h + 2, 3, h);
            ctx.fillRect(w / 2 - 3, -h + 2, 3, h);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.beginPath();
            ctx.ellipse(0, -h / 2 + 2, 5, 2, -0.2, 0, Math.PI * 2);
            ctx.fill();
        },

        coconut: function (ctx) {
            const r = 12;
            ctx.beginPath();
            ctx.arc(0, -2, r, 0, Math.PI * 2);
            const grad = ctx.createRadialGradient(-3, -5, 2, 0, -2, r);
            grad.addColorStop(0, '#854d0e');
            grad.addColorStop(0.7, '#593208');
            grad.addColorStop(1, '#3b1f03');
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.fillStyle = '#1c0a00';
            ctx.beginPath();
            ctx.arc(-3, -6, 1.2, 0, Math.PI * 2);
            ctx.arc(1, -7, 1.1, 0, Math.PI * 2);
            ctx.arc(-1, -3, 1.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(254, 240, 138, 0.25)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.arc(0, -2, r - 1.5, -0.6, 1.2);
            ctx.stroke();
        },

        bottle: function (ctx) {
            const w = 28, h = 11;
            ctx.beginPath();
            ctx.roundRect(-w / 2 + 5, -h + 2, w - 5, h, 2);
            ctx.fillStyle = 'rgba(186, 230, 253, 0.75)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.fillStyle = '#0284c7';
            ctx.fillRect(-w / 2 + 10, -h + 3, 10, h - 2);

            ctx.fillStyle = 'rgba(186, 230, 253, 0.8)';
            ctx.fillRect(-w / 2 + 2, -h / 2 - 1, 3, 4);
            ctx.fillStyle = '#0369a1';
            ctx.fillRect(-w / 2, -h / 2 - 2, 2.5, 6);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
            ctx.fillRect(-w / 2 + 7, -h + 3.5, w - 8, 1.5);
        },

        plank: function (ctx) {
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

            ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
            ctx.beginPath();
            ctx.moveTo(-w / 2 + 4, -h / 2 + 1);
            ctx.lineTo(w / 2 - 4, -h / 2 + 1);
            ctx.stroke();

            ctx.fillStyle = '#1c0a00';
            ctx.fillRect(-w / 2 + 4, -h / 2, 1.5, 1.5);
            ctx.fillRect(w / 2 - 6, -h / 2, 1.5, 1.5);
        },

        lifebuoy: function (ctx) {
            const rOuter = 16, rInner = 8;
            ctx.beginPath();
            ctx.arc(0, 0, rOuter, 0, Math.PI * 2);
            ctx.fillStyle = '#ff3b30';
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            for (let i = 0; i < 4; i++) {
                const ang = (i * Math.PI) / 2;
                ctx.beginPath();
                ctx.arc(0, 0, rOuter + 0.5, ang - 0.28, ang + 0.28);
                ctx.arc(0, 0, rInner - 0.5, ang + 0.28, ang - 0.28, true);
                ctx.closePath();
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(0, 0, rInner, 0, Math.PI * 2);
            ctx.fillStyle = '#062d4c';
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.15)';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.setLineDash([3, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, rOuter - 1.5, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        },

        soccer: function (ctx) {
            const r = 11;
            ctx.beginPath();
            ctx.arc(0, -2, r, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc';
            ctx.fill();
            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            for (let i = 0; i < 5; i++) {
                const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                const px = Math.cos(a) * 3.8;
                const py = -2 + Math.sin(a) * 3.8;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();

            for (let i = 0; i < 5; i++) {
                const a = (i * 2 * Math.PI) / 5 - Math.PI / 2;
                const px1 = Math.cos(a) * 3.8;
                const py1 = -2 + Math.sin(a) * 3.8;
                const px2 = Math.cos(a) * r;
                const py2 = -2 + Math.sin(a) * r;
                ctx.beginPath();
                ctx.moveTo(px1, py1);
                ctx.lineTo(px2, py2);
                ctx.strokeStyle = '#334155';
                ctx.lineWidth = 0.8;
                ctx.stroke();
            }
        },

        box: function (ctx) {
            const w = 26, h = 20;
            ctx.beginPath();
            ctx.roundRect(-w / 2, -h + 4, w, h, 2);
            const grad = ctx.createLinearGradient(0, -h, 0, 4);
            grad.addColorStop(0, '#d97706');
            grad.addColorStop(0.5, '#b45309');
            grad.addColorStop(1, '#92400e');
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.fillStyle = 'rgba(253, 230, 138, 0.7)';
            ctx.fillRect(-4, -h + 4, 8, h);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-w / 2 + 3, -h + 7, 7, 5);
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(-w / 2 + 4, -h + 8, 5, 1);
            ctx.fillRect(-w / 2 + 4, -h + 10, 5, 1);
        },

        cap: function (ctx) {
            ctx.beginPath();
            ctx.arc(0, -4, 9, Math.PI, 0);
            ctx.fillStyle = '#2563eb';
            ctx.fill();
            ctx.strokeStyle = '#1d4ed8';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(4, -4);
            ctx.quadraticCurveTo(14, -6, 17, -2);
            ctx.quadraticCurveTo(11, -1, 3, -2);
            ctx.fillStyle = '#1e40af';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(0, -13, 1.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        },

        watermelon: function (ctx) {
            ctx.beginPath();
            ctx.arc(0, -4, 15, 0.1, Math.PI - 0.1);
            ctx.closePath();
            ctx.fillStyle = '#15803d';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(0, -4, 13.5, 0.15, Math.PI - 0.15);
            ctx.closePath();
            ctx.fillStyle = '#bbf7d0';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(0, -4, 12, 0.18, Math.PI - 0.18);
            ctx.closePath();
            ctx.fillStyle = '#ef4444';
            ctx.fill();

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(-4, 0, 1, 0, Math.PI * 2);
            ctx.arc(4, 0, 1, 0, Math.PI * 2);
            ctx.arc(0, 3, 1, 0, Math.PI * 2);
            ctx.fill();
        },

        branch: function (ctx) {
            ctx.strokeStyle = '#78350f';
            ctx.lineWidth = 2.2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(-18, 0);
            ctx.quadraticCurveTo(-6, -6, 6, -2);
            ctx.quadraticCurveTo(14, 2, 18, -3);
            ctx.stroke();

            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(-4, -4);
            ctx.lineTo(2, -9);
            ctx.stroke();

            ctx.fillStyle = '#22c55e';
            ctx.beginPath();
            ctx.ellipse(3, -10, 4, 2, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(15, -4, 3.5, 1.8, 0.3, 0, Math.PI * 2);
            ctx.fill();
        },

        log: function (ctx) {
            // Heavy floating driftwood / tree trunk with bark and stump
            ctx.fillStyle = '#5c3a21';
            ctx.beginPath();
            ctx.roundRect(-26, -5, 52, 10, 4);
            ctx.fill();

            // Bark grooves
            ctx.strokeStyle = '#3d2412';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(-20, -2);
            ctx.lineTo(16, -2);
            ctx.moveTo(-14, 2);
            ctx.lineTo(22, 2);
            ctx.stroke();

            // Cut stump sticking out
            ctx.fillStyle = '#6e4428';
            ctx.beginPath();
            ctx.ellipse(-8, -7, 4, 3, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#8c5935';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Green moss spot
            ctx.fillStyle = '#4d7c0f';
            ctx.beginPath();
            ctx.ellipse(8, -5, 5, 2, 0.1, 0, Math.PI * 2);
            ctx.fill();
        },

        chair: function (ctx) {
            // Iconic plastic Monobloc patio chair floating on its side
            ctx.fillStyle = '#f8fafc';
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 1.2;

            // Seat base
            ctx.beginPath();
            ctx.roundRect(-10, -3, 20, 6, 2);
            ctx.fill();
            ctx.stroke();

            // Curved backrest
            ctx.beginPath();
            ctx.moveTo(-10, -3);
            ctx.quadraticCurveTo(-14, -16, -6, -20);
            ctx.lineTo(6, -20);
            ctx.quadraticCurveTo(14, -16, 10, -3);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Backrest slats
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            ctx.moveTo(-3, -7); ctx.lineTo(-2, -17);
            ctx.moveTo(3, -7); ctx.lineTo(2, -17);
            ctx.stroke();

            // Splayed legs
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(-8, 3); ctx.lineTo(-12, 14);
            ctx.moveTo(-4, 3); ctx.lineTo(-5, 12);
            ctx.moveTo(4, 3); ctx.lineTo(5, 12);
            ctx.moveTo(8, 3); ctx.lineTo(12, 14);
            ctx.stroke();
        },

        tire: function (ctx) {
            // Floating rubber vehicle tire
            ctx.fillStyle = '#1e2229';
            ctx.beginPath();
            ctx.ellipse(0, 0, 16, 9, 0, 0, Math.PI * 2);
            ctx.fill();

            // Inner hollow rim hole
            ctx.fillStyle = '#061320';
            ctx.beginPath();
            ctx.ellipse(0, 0, 8, 4.5, 0, 0, Math.PI * 2);
            ctx.fill();

            // Tread rubber highlights
            ctx.strokeStyle = '#3f4756';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.ellipse(0, 0, 13, 7.2, 0, 0, Math.PI * 2);
            ctx.stroke();
        },

        gallon: function (ctx) {
            // Blue 5-gallon water container / jug
            ctx.fillStyle = '#0284c7';
            ctx.beginPath();
            ctx.roundRect(-8, -14, 16, 26, 3);
            ctx.fill();

            // Ribbed barrel grooves
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(-7, -7); ctx.lineTo(7, -7);
            ctx.moveTo(-7, -1); ctx.lineTo(7, -1);
            ctx.moveTo(-7, 5); ctx.lineTo(7, 5);
            ctx.stroke();

            // White neck & screw cap
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.rect(-3.5, -18, 7, 4);
            ctx.fill();
        },

        cooler: function (ctx) {
            // Red picnic cooler / ice chest
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.roundRect(-14, -6, 28, 14, 2);
            ctx.fill();

            // White insulated lid
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.roundRect(-15, -11, 30, 5, 2);
            ctx.fill();
            ctx.strokeStyle = '#e2e8f0';
            ctx.lineWidth = 0.8;
            ctx.stroke();

            // White side handle
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-14, -2); ctx.lineTo(-17, -2); ctx.lineTo(-17, 3);
            ctx.stroke();
        },

        cone: function (ctx) {
            // Bright orange safety traffic cone
            ctx.fillStyle = '#ff5722';
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(8, 2);
            ctx.lineTo(-8, 2);
            ctx.closePath();
            ctx.fill();

            // White reflective collar band
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.moveTo(-4, -8);
            ctx.lineTo(4, -8);
            ctx.lineTo(5.5, -3);
            ctx.lineTo(-5.5, -3);
            ctx.closePath();
            ctx.fill();

            // Square base plate
            ctx.fillStyle = '#e64a19';
            ctx.beginPath();
            ctx.roundRect(-12, 2, 24, 3, 1);
            ctx.fill();
        },

        umbrella: function (ctx) {
            // Broken/tilted floating umbrella
            ctx.fillStyle = '#2563eb';
            ctx.beginPath();
            ctx.arc(0, -2, 16, Math.PI, 0, false);
            ctx.closePath();
            ctx.fill();

            // Alternating cyan panel
            ctx.fillStyle = '#38bdf8';
            ctx.beginPath();
            ctx.moveTo(-5, -2);
            ctx.lineTo(5, -2);
            ctx.lineTo(0, -18);
            ctx.closePath();
            ctx.fill();

            // Curved metal hook tip sticking up
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 1.3;
            ctx.beginPath();
            ctx.moveTo(0, -18);
            ctx.lineTo(0, -23);
            ctx.arc(3, -23, 3, Math.PI, 0, false);
            ctx.stroke();
        },

        bamboo: function (ctx) {
            // Segmented floating bamboo stalk
            ctx.fillStyle = '#84cc16';
            ctx.beginPath();
            ctx.roundRect(-22, -4, 44, 8, 3);
            ctx.fill();

            // Node rings
            ctx.strokeStyle = '#4d7c0f';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(-8, -4); ctx.lineTo(-8, 4);
            ctx.moveTo(8, -4); ctx.lineTo(8, 4);
            ctx.stroke();

            // Tiny sprout leaf
            ctx.fillStyle = '#65a30d';
            ctx.beginPath();
            ctx.ellipse(9, -7, 4, 1.8, -0.4, 0, Math.PI * 2);
            ctx.fill();
        },

        frame: function (ctx, extra) {
            // Clean modern photo frame without text, dynamic color
            const imgIdx = (extra && extra.imageIndex !== undefined) ? extra.imageIndex : 0;
            const frameColor = (extra && extra.frameColor) ? extra.frameColor : '#ffffff';
            const tapeColor = (extra && extra.tapeColor) ? extra.tapeColor : FRAME_TAPES[imgIdx % FRAME_TAPES.length];

            const fw = 32; // half-width (64px wide)
            const fh = 72; // clean height (72px tall without text)
            const topY = -fh + 16;

            // Frame drop shadow
            ctx.fillStyle = 'rgba(0, 15, 30, 0.28)';
            ctx.beginPath();
            ctx.roundRect(-fw - 2.5, topY - 2, (fw + 2.5) * 2, fh + 4, 4);
            ctx.fill();

            // Colored Polaroid card
            ctx.beginPath();
            ctx.roundRect(-fw, topY, fw * 2, fh, 4);
            ctx.fillStyle = frameColor;
            ctx.fill();
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.12)';
            ctx.lineWidth = 1;
            ctx.stroke();

            // Inner photo viewport (56px wide x 54px tall)
            const pw = fw - 4;
            const ph = 54;
            const px = -pw;
            const py = topY + 4;

            ctx.save();
            ctx.beginPath();
            ctx.roundRect(px, py, pw * 2, ph, 2);
            ctx.clip();

            const safeIdx = Math.abs(imgIdx || 0) % frameImages.length;
            const img = frameImages[safeIdx];
            if (img && img.complete && img.naturalWidth > 0) {
                ctx.drawImage(img, px, py, pw * 2, ph);
            } else {
                // Instant fallback: draw first photo (team group photo)
                const fallbackImg = frameImages[0];
                if (fallbackImg && fallbackImg.complete && fallbackImg.naturalWidth > 0) {
                    ctx.drawImage(fallbackImg, px, py, pw * 2, ph);
                } else {
                    ctx.fillStyle = '#1e293b';
                    ctx.fillRect(px, py, pw * 2, ph);
                }
            }

            // Glass glare sheen
            const glare = ctx.createLinearGradient(px, py, px + pw * 2, py + ph);
            glare.addColorStop(0, 'rgba(255, 255, 255, 0.28)');
            glare.addColorStop(0.45, 'rgba(255, 255, 255, 0.05)');
            glare.addColorStop(1, 'rgba(255, 255, 255, 0)');
            ctx.fillStyle = glare;
            ctx.fillRect(px, py, pw * 2, ph);
            ctx.restore();

            // Inner photo border
            ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)';
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.roundRect(px, py, pw * 2, ph, 2);
            ctx.stroke();

            // Decorative colored washi tape on top
            ctx.fillStyle = tapeColor;
            ctx.beginPath();
            ctx.roundRect(-10, topY - 3.5, 20, 6, 1.5);
            ctx.fill();
        }
    };

    // ── MODULAR FLOATING ITEM CLASS (DIFFERENT ORIENTATION EVERYTIME) ────────
    class FloatingItem {
        constructor(type, x, speed, scale = 1, extra = {}) {
            this.type = type;
            this.x = x;
            this.speed = speed;
            this.scale = scale;
            this.extra = extra;
            // depthRatio: 0 = surface crest, 0.5 = middle, 0.85 = bottom
            this.depthRatio = extra.depthRatio !== undefined ? extra.depthRatio : Math.random() * 0.78;
            // Distinct random orientation / tilt angle everytime
            this.baseAngle = (Math.random() - 0.5) * 0.45;
            this.bobPhase = Math.random() * Math.PI * 2;
            this.bobSpeed = 1.0 + Math.random() * 0.7;
            this.jumpY = 0;
            this.jumpVy = 0;
            this.hoverCooldown = 0;
            // Drag & drop state
            this.isDragging = false;
            this.isDropping = false;
            this.dragX = 0;
            this.dragY = 0;
            this.dropX = 0;
            this.dropY = 0;
            this.dropVy = 0;
            this._lastDrawY = 0;
        }

        update(floodSurfaceY) {
            // While being dragged or dropping, skip normal drift physics
            if (this.isDragging) return;

            // Handle right-click bubble pop
            if (this.isPopping) {
                this.popProgress += 0.055;
                if (this.popProgress >= 1.0) {
                    createBubblePop(this.x, this._lastDrawY || floodSurfaceY);
                    this.isPopping = false;
                    this.popProgress = 0;
                    // Disappear and respawn far offscreen
                    this.x = -150 - Math.random() * (width * 1.6 + 400);
                    this.depthRatio = 0.05 + Math.random() * 0.75;
                    if (this.type === 'frame') {
                        this.extra.imageIndex = pickUniqueFrameIndex(this);
                    }
                    return;
                }
            }

            if (this.isDropping) {
                const surfaceY = getWaterSurfaceY(this.dropX, floodSurfaceY);
                const waterH = Math.max(30, height - surfaceY);
                const avail = Math.max(10, waterH - 35);
                const targetY = surfaceY + this.depthRatio * avail;
                this.dropY += this.dropVy;
                this.dropVy = Math.min(4.5, this.dropVy + 0.16);
                if (this.dropY >= targetY) {
                    // Dynamic splash based on drop height!
                    const fallDistance = Math.max(10, targetY - (this.startDropY || surfaceY));
                    const heightRatio = Math.min(3.5, Math.max(0.4, fallDistance / 120));
                    const impact = Math.min(this.dropVy * 2.0 * heightRatio, 24);
                    const splashCount = Math.round(Math.min(32, Math.max(4, heightRatio * 12)));
                    createSplash(this.dropX, surfaceY, splashCount);
                    createRipple(this.dropX, surfaceY);
                    if (heightRatio > 1.2) {
                        createRipple(this.dropX - 22, surfaceY);
                        createRipple(this.dropX + 22, surfaceY);
                    }
                    this.jumpVy = -impact * 0.42;
                    this.x = this.dropX;
                    this.baseAngle = (Math.random() - 0.5) * 0.55;
                    this.depthRatio = 0.05 + Math.random() * 0.70;
                    this.isDropping = false;
                    this.hoverCooldown = 80;
                }
                return;
            }

            this.x += this.speed;
            if (this.x > width + 100) {
                if (this.type === 'frame') {
                    // Shorter respawn so frames appear more frequently
                    this.x = -120 - (width * (0.6 + Math.random() * 1.0));
                    // Pick a unique photo not shown by any other visible frame
                    this.extra.imageIndex = pickUniqueFrameIndex(this);
                    this.extra.frameColor = FRAME_COLORS[Math.floor(Math.random() * FRAME_COLORS.length)];
                    this.extra.tapeColor = FRAME_TAPES[Math.floor(Math.random() * FRAME_TAPES.length)];
                } else {
                    // Balanced offscreen respawn keeping water consistently lively and varied
                    this.x = -120 - Math.random() * (width * 1.2 + 200);
                    // Morph into a new random debris type from our 23 diverse items!
                    this.type = DEBRIS_TYPES[Math.floor(Math.random() * DEBRIS_TYPES.length)];
                }
                this.depthRatio = 0.05 + Math.random() * 0.75;
                this.baseAngle = (Math.random() - 0.5) * 0.55;
            }

            if (this.hoverCooldown > 0) {
                this.hoverCooldown--;
            }

            const surfaceY = getWaterSurfaceY(this.x, floodSurfaceY);
            const waterHeight = Math.max(30, height - surfaceY);
            const availableDepth = Math.max(10, waterHeight - 35);
            const currentBaseY = surfaceY + this.depthRatio * availableDepth;

            // Mouse interaction across all depths
            if (mouse.active && this.hoverCooldown <= 0 && this.jumpY === 0) {
                const dx = Math.abs(this.x - mouse.x);
                const dy = Math.abs(currentBaseY - mouse.y);
                const hitDist = this.type === 'frame' ? 50 : 38;
                if (dx < hitDist && dy < hitDist) {
                    this.jumpVy = -3.4;
                    this.hoverCooldown = 80;
                    createSplash(this.x, Math.max(surfaceY, currentBaseY - 10), 3);
                    createRipple(this.x, surfaceY);
                }
            }

            if (this.jumpVy !== 0 || this.jumpY !== 0) {
                this.jumpY += this.jumpVy;
                this.jumpVy += 0.16;
                if (this.jumpY >= 0) {
                    this.jumpY = 0;
                    this.jumpVy = 0;
                    createRipple(this.x, surfaceY);
                }
            }

            if (Math.random() < 0.012 && this.depthRatio < 0.25) {
                createRipple(this.x - 8 * this.speed, surfaceY);
            }
        }

        draw(ctx, floodSurfaceY) {
            let drawX, drawY, drawAngle;

            if (this.isDragging) {
                drawX = this.dragX;
                drawY = this.dragY;
                drawAngle = this.baseAngle;
            } else if (this.isDropping) {
                drawX = this.dropX;
                drawY = this.dropY;
                // Tumble slightly while falling
                drawAngle = this.baseAngle + time * 1.8;
            } else {
                const surfaceY = getWaterSurfaceY(this.x, floodSurfaceY);
                const dy = getWaterSurfaceY(this.x + 8, floodSurfaceY) - getWaterSurfaceY(this.x - 8, floodSurfaceY);
                const waveInfluence = Math.max(0.35, 1 - this.depthRatio * 0.65);
                const waveAngle = Math.atan2(dy, 16) * waveInfluence;
                const bob = (Math.sin(time * this.bobSpeed + this.bobPhase) * 2.6 + this.jumpY) * waveInfluence;
                const waterHeight = Math.max(30, height - surfaceY);
                const availableDepth = Math.max(10, waterHeight - 35);
                drawX = this.x;
                drawY = surfaceY + this.depthRatio * availableDepth + bob;
                drawAngle = this.baseAngle + waveAngle * 0.85;
            }

            // Store Y so pointerdown can do hit testing
            this._lastDrawY = drawY;

            ctx.save();
            ctx.translate(drawX, drawY);
            ctx.rotate(drawAngle);
                        let renderScale = this.scale;
            if (this.isPopping) {
                // Swell, wobble and fade like a soap bubble about to burst
                const wobble = Math.sin(time * 35) * 0.08 * this.popProgress;
                renderScale = this.scale * (1 + this.popProgress * 0.35) + wobble;
                ctx.globalAlpha = Math.max(0.12, 1 - this.popProgress * 0.65);
            }
            ctx.scale(renderScale, renderScale);

            // Shadow (lift shadow when dragging for "held" look)
            if (!this.isDragging && !this.isDropping) {
                const shadowW = this.type === 'frame' ? 26 : 15;
                const shadowAlpha = Math.max(0.12, 0.30 - this.depthRatio * 0.15);
                ctx.fillStyle = `rgba(1, 20, 42, ${shadowAlpha})`;
                ctx.beginPath();
                ctx.ellipse(0, 3, shadowW, 3.5, 0, 0, Math.PI * 2);
                ctx.fill();
            } else if (this.isDragging) {
                // Larger diffuse shadow below to show it's lifted
                ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
                ctx.beginPath();
                ctx.ellipse(0, 8, 22, 5, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            const renderer = ITEM_RENDERERS[this.type];
            if (renderer) {
                renderer(ctx, this.extra);
            }

            ctx.restore();
        }
    }

    // ── UNIQUE FRAME PHOTO PICKER ────────────────────────────────────────
    // Returns a photo index not currently shown by any other near-screen frame,
    // so the same picture never appears twice (or more) on screen at once.
    function pickUniqueFrameIndex(excludeSelf) {
        const inUse = new Set();
        for (const item of floatingItems) {
            if (item === excludeSelf) continue;
            if (item.type !== 'frame') continue;
            // Consider "near screen": not buried far offscreen to the left
            if (item.x > -300 && item.x < width + 300) {
                inUse.add(item.extra.imageIndex);
            }
        }
        // Build pool of indices not already visible
        const pool = [];
        for (let i = 0; i < frameImages.length; i++) {
            if (!inUse.has(i)) pool.push(i);
        }
        // Fallback: full pool if every slot is somehow taken (14 photos vs 3 frames)
        const candidates = pool.length > 0 ? pool : Array.from({ length: frameImages.length }, (_, i) => i);
        // ~30% bias toward group photo (index 0) if available
        if (Math.random() < 0.30 && candidates.includes(0)) return 0;
        const others = candidates.filter(i => i !== 0);
        if (others.length > 0) return others[Math.floor(Math.random() * others.length)];
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Rich, multi-item fleet – frames are rare (only 2 frames among many items)
    const floatingItems = [
        // 15 diverse active debris items for lively water with variety
        new FloatingItem('boat',       window.innerWidth * 0.04, 0.40, 1.05, { depthRatio: 0.05 }),
        new FloatingItem('tsinelas',   window.innerWidth * 0.18, 0.38, 0.95, { depthRatio: 0.12 }),
        new FloatingItem('duck',       window.innerWidth * 0.32, 0.45, 1.0,  { depthRatio: 0.08 }),
        new FloatingItem('basketball', window.innerWidth * 0.48, 0.42, 0.95, { depthRatio: 0.20 }),
        new FloatingItem('tire',       window.innerWidth * 0.64, 0.42, 1.0,  { depthRatio: 0.72 }),
        new FloatingItem('chair',      window.innerWidth * 0.80, 0.36, 1.0,  { depthRatio: 0.30 }),
        new FloatingItem('lifebuoy',   window.innerWidth * 0.96, 0.38, 0.95, { depthRatio: 0.25 }),
        new FloatingItem('branch',     window.innerWidth * 1.12, 0.43, 1.05, { depthRatio: 0.15 }),
        new FloatingItem('gallon',     window.innerWidth * 1.28, 0.44, 0.95, { depthRatio: 0.65 }),
        new FloatingItem('umbrella',   window.innerWidth * 1.44, 0.39, 1.0,  { depthRatio: 0.28 }),
        new FloatingItem('log',        window.innerWidth * 1.60, 0.36, 1.0,  { depthRatio: 0.45 }),
        new FloatingItem('cooler',     window.innerWidth * 1.76, 0.42, 0.95, { depthRatio: 0.22 }),
        new FloatingItem('cone',       window.innerWidth * 1.94, 0.40, 1.0,  { depthRatio: 0.38 }),
        new FloatingItem('coconut',    window.innerWidth * 2.12, 0.41, 0.90, { depthRatio: 0.18 }),
        new FloatingItem('bamboo',     window.innerWidth * 2.30, 0.38, 1.0,  { depthRatio: 0.55 }),

        // 7 Photo Frames staggered for higher frequency (initial indices non-overlapping, no duplicates)
        new FloatingItem('frame',      window.innerWidth * 0.10, 0.34, 1.0,  { imageIndex: 0,  frameColor: '#ffffff', depthRatio: 0.38 }),
        new FloatingItem('frame',      window.innerWidth * 0.55, 0.33, 1.0,  { imageIndex: 1 + Math.floor(Math.random() * 2), frameColor: '#fef08a', depthRatio: 0.42 }),
        new FloatingItem('frame',      window.innerWidth * 1.00, 0.35, 1.0,  { imageIndex: 3 + Math.floor(Math.random() * 2), frameColor: '#bae6fd', depthRatio: 0.35 }),
        new FloatingItem('frame',      window.innerWidth * 1.45, 0.32, 1.0,  { imageIndex: 5 + Math.floor(Math.random() * 2), frameColor: '#fed7aa', depthRatio: 0.40 }),
        new FloatingItem('frame',      window.innerWidth * 1.90, 0.34, 1.0,  { imageIndex: 7 + Math.floor(Math.random() * 2), frameColor: '#e9d5ff', depthRatio: 0.32 }),
        new FloatingItem('frame',      window.innerWidth * 2.35, 0.33, 1.0,  { imageIndex: 9 + Math.floor(Math.random() * 2), frameColor: '#bbf7d0', depthRatio: 0.44 }),
        new FloatingItem('frame',      window.innerWidth * 2.80, 0.31, 1.0,  { imageIndex: 11 + Math.floor(Math.random() * 3), frameColor: '#fed1d1', depthRatio: 0.36 })
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
        // ── BUBBLE POP PARTICLE SYSTEM ──────────────────────────────────────────
    const bubbleParticles = [];

    function createBubblePop(x, y) {
        createSplash(x, y, 14);
        createRipple(x, y);
        createRipple(x - 20, y);
        createRipple(x + 20, y);

        // Spawn 16 iridescent bubble particles that expand and pop outward
        for (let i = 0; i < 16; i++) {
            const angle = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
            const speed = 1.8 + Math.random() * 3.5;
            bubbleParticles.push({
                x: x,
                y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.2,
                radius: 3.5 + Math.random() * 5.5,
                alpha: 0.9,
                colorHue: 185 + Math.random() * 40,
                decay: 0.038 + Math.random() * 0.024
            });
        }
    }

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

                // Draw bubble pop particles
        for (let i = bubbleParticles.length - 1; i >= 0; i--) {
            const b = bubbleParticles[i];
            b.x += b.vx;
            b.y += b.vy;
            b.vx *= 0.94;
            b.vy *= 0.94;
            b.radius *= 0.97;
            b.alpha -= b.decay;

            if (b.alpha <= 0 || b.radius <= 0.5) {
                bubbleParticles.splice(i, 1);
                continue;
            }

            ctx.save();
            ctx.beginPath();
            ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
            ctx.fillStyle = `hsla(${b.colorHue}, 90%, 75%, ${b.alpha * 0.4})`;
            ctx.fill();
            ctx.strokeStyle = `hsla(${b.colorHue}, 100%, 85%, ${b.alpha * 0.85})`;
            ctx.lineWidth = 1.2;
            ctx.stroke();

            // Reflection highlight inside bubble
            ctx.beginPath();
            ctx.arc(b.x - b.radius * 0.35, b.y - b.radius * 0.35, b.radius * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 255, ${b.alpha * 0.9})`;
            ctx.fill();
            ctx.restore();
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
            // D. Draw floating water items (hidden when Left Ctrl + Right Ctrl toggled)
            if (!window.HydroItemsHidden) {
                for (let item of floatingItems) {
                    item.update(floodSurfaceY);
                    item.draw(ctx, floodSurfaceY);
                }
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
