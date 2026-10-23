/**
 * 3D Floating Player Hero on Landing Page Hydrodynamic Water
 * - No swim ring: model floats freely like a statue across the full water body
 * - Multi-depth: spawns at random Y depth within the blue water
 * - Random orientation angle each lap
 * - Click-and-hold to drag anywhere; release gently drops with splash
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

(function () {
    const canvas = document.getElementById('floating-3d-canvas');
    if (!canvas) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // ── THREE.JS SETUP ───────────────────────────────────────────────────────
    const scene = new THREE.Scene();

    const camera = new THREE.OrthographicCamera(
        -width / 2, width / 2,
        height / 2, -height / 2,
        1, 2000
    );
    camera.position.set(0, 0, 500);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    // ── LIGHTING ─────────────────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0xffffff, 2.2));

    const keyLight = new THREE.DirectionalLight(0xfff6ec, 2.6);
    keyLight.position.set(150, 300, 250);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xd8edff, 1.4);
    fillLight.position.set(-200, 150, 150);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x00f2fe, 2.4);
    rimLight.position.set(0, -180, 100);
    scene.add(rimLight);

    // ── 3D PLAYER GROUP (no swim ring) ───────────────────────────────────────
    const playerGroup = new THREE.Group();
    scene.add(playerGroup);

    let isLoaded = false;
    let playerModel = null;

    const loader = new GLTFLoader();
    loader.load(
        '/landing/models/player.glb',
        (gltf) => {
            playerModel = gltf.scene;

            playerModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                    if (child.material) {
                        child.material.side = THREE.DoubleSide;
                        if (child.material.metalness !== undefined) child.material.metalness = 0.08;
                        if (child.material.roughness !== undefined) child.material.roughness = 0.65;
                        child.material.needsUpdate = true;
                    }
                }
            });

            // Model Y: -0.5 (feet) to +0.5 (head). Scale to 185px.
            const modelScale = 185;
            playerModel.scale.set(modelScale, modelScale, modelScale);
            playerModel.position.set(0, 0, 0);

            playerGroup.add(playerModel);
            isLoaded = true;

            // Opening splash
            if (window.HydroWater) {
                const sY = window.HydroWater.getSurfaceY(playerScreenX);
                window.HydroWater.createSplash(playerScreenX, sY, 10);
            }
        },
        undefined,
        (err) => console.error('Failed to load 3D player model:', err)
    );

    // ── STATE ─────────────────────────────────────────────────────────────────
    let playerScreenX = width * 0.42;
    let driftSpeed = 0.38;

    // depth: 0=surface, 1=bottom. Model floats anywhere in the blue body.
    let depthRatio = 0.1 + Math.random() * 0.65;

    // Random tilt/orientation angle around the vertical (yaw offset per lap)
    let baseYaw = (Math.random() - 0.5) * 0.45;

    let bounceY = 0;
    let bounceVy = 0;
    let clickWobble = 0;
    let clickWobbleVy = 0;

    // ── DRAG STATE ────────────────────────────────────────────────────────────
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    let airY = 0;         // current Y in screen coords while held/falling
    let dropVy = 0;       // gravity while falling after release
    let currentRenderedY = height * 0.82; // live tracked Y for screen hit testing

    let rippleTick = 0;

    function resize() {
        width = window.innerWidth;
        height = window.innerHeight;
        camera.left = -width / 2;
        camera.right = width / 2;
        camera.top = height / 2;
        camera.bottom = -height / 2;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }
    window.addEventListener('resize', resize);

    // ── RAYCASTER & HIT DETECTION ─────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouseCoord = new THREE.Vector2(-9999, -9999);

    function screenToNDC(ex, ey) {
        return {
            x: (ex / width) * 2 - 1,
            y: -(ey / height) * 2 + 1
        };
    }

    function isHit(ex, ey) {
        if (!isLoaded) return false;
        // 1. Screen proximity check: player is ~100px wide x 185px tall
        const dx = Math.abs(ex - playerScreenX);
        const dy = Math.abs(ey - currentRenderedY);
        if (dx < 70 && dy < 100) {
            return true;
        }
        // 2. Three.js raycasting fallback
        const ndc = screenToNDC(ex, ey);
        mouseCoord.set(ndc.x, ndc.y);
        raycaster.setFromCamera(mouseCoord, camera);
        return raycaster.intersectObjects(playerGroup.children, true).length > 0;
    }

    // ── POINTER EVENTS (Global Window Listeners) ──────────────────────────────
    window.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a, button, input, [role="button"]')) return;
        if (!isLoaded) return;
        if (window._2dItemDragging) return;

        if (isHit(e.clientX, e.clientY)) {
            isDragging = true;
            window._3dPlayerDragging = true;
            dragOffsetX = e.clientX - playerScreenX;
            dragOffsetY = e.clientY - currentRenderedY;
            airY = currentRenderedY;
            dropVy = 0;
            document.body.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation();
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (isDragging) {
            playerScreenX = e.clientX - dragOffsetX;
            airY = e.clientY - dragOffsetY;
            e.preventDefault();
        } else if (!window._2dItemDragging) {
            if (isHit(e.clientX, e.clientY)) {
                document.body.style.cursor = 'grab';
            } else if (document.body.style.cursor === 'grab' && !window._2dItemHovered) {
                document.body.style.cursor = '';
            }
        }
    });

    window.addEventListener('pointerup', () => {
        if (!isDragging) return;
        isDragging = false;
        window._3dPlayerDragging = false;
        document.body.style.cursor = '';

        // Gentle initial downward speed (NOT dropping like a rock)
        dropVy = 0.4;
        depthRatio = 0.05 + Math.random() * 0.70;
        baseYaw = (Math.random() - 0.5) * 0.5;
        driftSpeed = 0.28 + Math.random() * 0.22;
    });

    window.addEventListener('pointercancel', () => {
        if (!isDragging) return;
        isDragging = false;
        window._3dPlayerDragging = false;
        document.body.style.cursor = '';
        dropVy = 0.4;
    });

    // ── ANIMATION LOOP ────────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        let time = now * 0.001;
        if (window.HydroWater) time = window.HydroWater.getTime();

        // Drift across the screen unless held or falling
        if (!isDragging && dropVy === 0) {
            playerScreenX += driftSpeed;
            if (playerScreenX > width + 120) {
                playerScreenX = -120;
                depthRatio = 0.05 + Math.random() * 0.70;
                baseYaw = (Math.random() - 0.5) * 0.5;
                driftSpeed = 0.28 + Math.random() * 0.22;
            }
        }

        const dims = window.HydroWater ? window.HydroWater.getDimensions() : { width, height };
        const sY = window.HydroWater ? window.HydroWater.getSurfaceY(playerScreenX) : height * 0.83;
        const wH = Math.max(30, dims.height - sY);
        const avail = Math.max(10, wH - 35);
        const targetBaseY = sY + depthRatio * avail;
        const waveAngle = window.HydroWater ? window.HydroWater.getSurfaceAngle(playerScreenX) : 0;
        const waveInfluence = Math.max(0.3, 1 - depthRatio * 0.7);

        let finalScreenY;

        if (isDragging) {
            // While held: follow cursor exactly
            finalScreenY = airY;
        } else if (dropVy > 0) {
            // Gentle, floaty descent after release (NOT dropping too fast)
            airY += dropVy;
            dropVy = Math.min(4.2, dropVy + 0.16); // soft gravity, capped terminal speed
            if (airY >= targetBaseY) {
                // Landed in water with splash & ripples
                const impactForce = Math.min(dropVy * 2.2, 10);
                bounceVy = -impactForce * 0.45;
                dropVy = 0;
                airY = targetBaseY;
                if (window.HydroWater) {
                    window.HydroWater.createSplash(playerScreenX, sY, Math.round(impactForce * 1.5));
                    window.HydroWater.createRipple(playerScreenX, sY);
                    window.HydroWater.createRipple(playerScreenX - 25, sY);
                    window.HydroWater.createRipple(playerScreenX + 25, sY);
                }
            }
            finalScreenY = airY;
        } else {
            // Normal floating with soft buoyancy bob
            if (bounceVy !== 0 || bounceY !== 0) {
                bounceY += bounceVy;
                bounceVy += 0.22; // smooth spring return
                if (bounceY >= 0) {
                    if (window.HydroWater) {
                        window.HydroWater.createSplash(playerScreenX, sY, 3);
                        window.HydroWater.createRipple(playerScreenX, sY);
                    }
                    bounceY = 0;
                    bounceVy = 0;
                }
            }
            const naturalBob = Math.sin(time * 2.0) * 3.0 * waveInfluence;
            finalScreenY = targetBaseY + naturalBob + bounceY;
        }

        // Keep currentRenderedY synchronized for hit testing
        currentRenderedY = finalScreenY;

        // Wobble spring
        if (clickWobbleVy !== 0 || clickWobble !== 0) {
            clickWobble += clickWobbleVy;
            clickWobbleVy -= clickWobble * 0.16;
            clickWobbleVy *= 0.88;
            if (Math.abs(clickWobble) < 0.002 && Math.abs(clickWobbleVy) < 0.002) {
                clickWobble = 0;
                clickWobbleVy = 0;
            }
        }

        // Map screen → Three.js orthographic coords
        playerGroup.position.x = playerScreenX - width / 2;
        playerGroup.position.y = height / 2 - finalScreenY;

        if (isDragging) {
            // While dragging: keep front-facing with slight tilt
            playerGroup.rotation.z = 0;
            playerGroup.rotation.x = 0;
            playerGroup.rotation.y = THREE.MathUtils.clamp(baseYaw + clickWobble, -0.55, 0.55);
        } else if (dropVy > 0) {
            // Tumble gently while floating down
            playerGroup.rotation.z = Math.sin(time * 2.5) * 0.18;
            playerGroup.rotation.x = Math.cos(time * 2) * 0.10;
            playerGroup.rotation.y = baseYaw + time * 0.3;
        } else {
            // Normal float: wave tilt + gentle sway, locked within ±25° yaw
            const waveZ = waveAngle * waveInfluence * 0.85;
            playerGroup.rotation.z = waveZ;
            playerGroup.rotation.x = Math.sin(time * 1.4) * 0.05 * waveInfluence;
            const yaw = Math.sin(time * 0.65) * 0.14 + baseYaw + clickWobble;
            playerGroup.rotation.y = THREE.MathUtils.clamp(yaw, baseYaw - 0.22, baseYaw + 0.22);
        }

        // Periodic wake ripples only when calmly drifting near surface
        rippleTick++;
        if (rippleTick % 45 === 0 && !isDragging && dropVy === 0 && depthRatio < 0.35 && window.HydroWater) {
            window.HydroWater.createRipple(playerScreenX, sY);
        }

        renderer.render(scene, camera);
    }

    animate();
})();
