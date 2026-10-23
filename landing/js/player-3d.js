/**
 * 3D Floating Player Hero on Landing Page Hydrodynamic Water
 * - No swim ring: model floats freely like a statue across the full water body
 * - Multi-depth: spawns at random Y depth within the blue water
 * - Random orientation angle each lap
 * - Click-and-hold to drag anywhere; release drops with splash
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
            // Position so center of mass (~waist) aligns with group origin
            playerModel.position.set(0, 0, 0);

            playerGroup.add(playerModel);
            isLoaded = true;

            // Opening splash
            if (window.HydroWater) {
                const dims = window.HydroWater.getDimensions();
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
    let dragScreenX = 0;
    let dragScreenY = 0;
    let dragOffsetX = 0;
    let dragOffsetY = 0;
    // While dragging: model floats free in air (above water)
    let airY = 0;         // current Y in screen coords while in air
    let dropVy = 0;       // gravity while falling after release

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

    // ── RAYCASTER FOR CLICK DETECTION ─────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouseCoord = new THREE.Vector2(-9999, -9999);

    function screenToNDC(ex, ey) {
        return {
            x: (ex / width) * 2 - 1,
            y: -(ey / height) * 2 + 1
        };
    }

    function isHit(ex, ey) {
        const ndc = screenToNDC(ex, ey);
        mouseCoord.set(ndc.x, ndc.y);
        raycaster.setFromCamera(mouseCoord, camera);
        return raycaster.intersectObjects(playerGroup.children, true).length > 0;
    }

    // ── POINTER EVENTS ────────────────────────────────────────────────────────
    canvas.style.pointerEvents = 'auto';

    canvas.addEventListener('pointerdown', (e) => {
        if (e.target.closest('a, button, input, [role="button"]')) return;
        if (!isLoaded) return;

        if (isHit(e.clientX, e.clientY)) {
            isDragging = true;
            canvas.setPointerCapture(e.pointerId);
            dragScreenX = e.clientX;
            dragScreenY = e.clientY;

            // Compute current rendered Y so offset feels natural
            const dims = window.HydroWater ? window.HydroWater.getDimensions() : { width, height };
            const sY = window.HydroWater ? window.HydroWater.getSurfaceY(playerScreenX) : height * 0.83;
            const wH = Math.max(30, dims.height - sY);
            const avail = Math.max(10, wH - 35);
            const curBaseY = sY + depthRatio * avail;

            dragOffsetX = e.clientX - playerScreenX;
            dragOffsetY = e.clientY - curBaseY;
            airY = curBaseY;
            dropVy = 0;
            document.body.style.cursor = 'grabbing';
            e.stopPropagation();
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (isDragging) {
            playerScreenX = e.clientX - dragOffsetX;
            airY = e.clientY - dragOffsetY;
        } else {
            // Hover cursor
            if (!isLoaded) return;
            const ndc = screenToNDC(e.clientX, e.clientY);
            mouseCoord.set(ndc.x, ndc.y);
            raycaster.setFromCamera(mouseCoord, camera);
            const hit = raycaster.intersectObjects(playerGroup.children, true).length > 0;
            canvas.style.cursor = hit ? 'grab' : '';
        }
    });

    window.addEventListener('pointerup', (e) => {
        if (!isDragging) return;
        isDragging = false;
        canvas.style.cursor = '';
        document.body.style.cursor = '';

        // Calculate where the model landed relative to the water surface
        const sY = window.HydroWater ? window.HydroWater.getSurfaceY(playerScreenX) : height * 0.83;
        // Start the drop with current air velocity + a small downward kick
        dropVy = 4.5;
        // Re-randomize depth and orientation when dropped at new location
        depthRatio = 0.05 + Math.random() * 0.70;
        baseYaw = (Math.random() - 0.5) * 0.5;
        driftSpeed = 0.28 + Math.random() * 0.22;
    });

    // ── ANIMATION LOOP ────────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        let time = now * 0.001;
        if (window.HydroWater) time = window.HydroWater.getTime();

        // Drift across the screen unless dragged
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
            // Falling after release: simulate gravity until it hits target depth
            airY += dropVy;
            dropVy += 0.6; // gravity
            if (airY >= targetBaseY) {
                // Landed
                const impactForce = Math.min(dropVy, 18);
                bounceVy = -impactForce * 0.55;
                dropVy = 0;
                airY = targetBaseY;
                if (window.HydroWater) {
                    window.HydroWater.createSplash(playerScreenX, sY, Math.round(impactForce * 1.2));
                    window.HydroWater.createRipple(playerScreenX, sY);
                    window.HydroWater.createRipple(playerScreenX - 20, sY);
                    window.HydroWater.createRipple(playerScreenX + 20, sY);
                }
            }
            finalScreenY = airY;
        } else {
            // Normal floating with buoyancy bounce
            if (bounceVy !== 0 || bounceY !== 0) {
                bounceY += bounceVy;
                bounceVy += 0.38;
                if (bounceY >= 0) {
                    if (window.HydroWater) {
                        window.HydroWater.createSplash(playerScreenX, sY, 5);
                        window.HydroWater.createRipple(playerScreenX, sY);
                    }
                    bounceY = 0;
                    bounceVy = 0;
                }
            }
            const naturalBob = Math.sin(time * 2.2) * 3.2 * waveInfluence;
            finalScreenY = targetBaseY + naturalBob + bounceY;
        }

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
            // While dragging: no wave tilt, just slight tilt in drag direction
            playerGroup.rotation.z = 0;
            playerGroup.rotation.x = 0;
            playerGroup.rotation.y = THREE.MathUtils.clamp(baseYaw + clickWobble, -0.55, 0.55);
        } else if (dropVy > 0) {
            // Tumble gently while falling
            playerGroup.rotation.z = Math.sin(time * 3) * 0.22;
            playerGroup.rotation.x = Math.cos(time * 2.5) * 0.12;
            playerGroup.rotation.y = baseYaw + time * 0.4;
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
        if (rippleTick % 40 === 0 && !isDragging && dropVy === 0 && depthRatio < 0.35 && window.HydroWater) {
            window.HydroWater.createRipple(playerScreenX, sY);
        }

        renderer.render(scene, camera);
    }

    animate();
})();
