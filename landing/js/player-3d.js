/**
 * 3D Floating Objects on Landing Page Hydrodynamic Water
 * - Basketball player model & Character bust model
 * - Both float freely without swim rings, appear periodically (offscreen intervals)
 * - Both strictly locked front-facing (unfinished backsides never shown)
 * - Draggable anywhere across the page with gentle, buoyant float-down drop physics
 * - Double-clicking the bust plays mama.mp3 with a celebratory leap!
 * - Floating "Double click me" hint arrow tracks above the bust
 * - Full integration with Left Ctrl + Right Ctrl toggle keybind
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

(function () {
    const canvas = document.getElementById('floating-3d-canvas');
    if (!canvas) return;

    const hintElem = document.getElementById('bust-hint');

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

    const loader = new GLTFLoader();

    // ── 1. BASKETBALL PLAYER MODEL ───────────────────────────────────────────
    const playerGroup = new THREE.Group();
    scene.add(playerGroup);
    let playerLoaded = false;

    loader.load(
        '/landing/models/player.glb',
        (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.side = THREE.DoubleSide;
                    if (child.material.metalness !== undefined) child.material.metalness = 0.08;
                    if (child.material.roughness !== undefined) child.material.roughness = 0.65;
                    child.material.needsUpdate = true;
                }
            });
            const modelScale = 185;
            model.scale.set(modelScale, modelScale, modelScale);
            model.position.set(0, 0, 0);
            playerGroup.add(model);
            playerLoaded = true;
        },
        undefined,
        (err) => console.error('Failed to load player.glb:', err)
    );

    let playerScreenX = width * 0.45;
    let playerDriftSpeed = 0.35;
    let playerDepthRatio = 0.12 + Math.random() * 0.60;
    let playerBaseYaw = (Math.random() - 0.5) * 0.45;
    let playerBounceY = 0;
    let playerBounceVy = 0;
    let playerWobble = 0;
    let playerWobbleVy = 0;
    let playerIsDragging = false;
    let playerDragOffsetX = 0;
    let playerDragOffsetY = 0;
    let playerAirY = 0;
    let playerDropVy = 0;
    let playerRenderedY = height * 0.82;
    let playerIsOffscreen = false;
    let playerNextSpawn = 0;

    // ── 2. BUST STATUE MODEL (Double-Clickable with Sound) ────────────────────
    const bustGroup = new THREE.Group();
    scene.add(bustGroup);
    let bustLoaded = false;

    loader.load(
        '/landing/models/bust.glb',
        (gltf) => {
            const model = gltf.scene;
            model.traverse((child) => {
                if (child.isMesh && child.material) {
                    child.material.side = THREE.DoubleSide;
                    if (child.material.metalness !== undefined) child.material.metalness = 0.08;
                    if (child.material.roughness !== undefined) child.material.roughness = 0.65;
                    child.material.needsUpdate = true;
                }
            });
            const bustScale = 180;
            model.scale.set(bustScale, bustScale, bustScale);
            model.position.set(0, 36, 0);
            bustGroup.add(model);
            bustLoaded = true;
        },
        undefined,
        (err) => console.error('Failed to load bust.glb:', err)
    );

    // Bust starts offscreen on initial load and arrives 5 to 10 seconds in!
    let bustScreenX = -150;
    let bustDriftSpeed = 0.32;
    let bustDepthRatio = 0.20 + Math.random() * 0.55;
    let bustBounceY = 0;
    let bustBounceVy = 0;
    let bustWobble = 0;
    let bustWobbleVy = 0;
    let bustIsDragging = false;
    let bustDragOffsetX = 0;
    let bustDragOffsetY = 0;
    let bustAirY = 0;
    let bustDropVy = 0;
    let bustRenderedY = height * 0.82;
    let bustIsOffscreen = true;
    let bustNextSpawn = performance.now() + 5000 + Math.random() * 7000;

    // Preloaded Audio for double click
    const mamaAudio = new Audio('/landing/audio/mama.mp3');
    mamaAudio.preload = 'auto';

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

    // ── HIT DETECTION ─────────────────────────────────────────────────────────
    const raycaster = new THREE.Raycaster();
    const mouseCoord = new THREE.Vector2(-9999, -9999);

    function screenToNDC(ex, ey) {
        return {
            x: (ex / width) * 2 - 1,
            y: -(ey / height) * 2 + 1
        };
    }

    function isHitPlayer(ex, ey) {
        if (!playerLoaded || playerIsOffscreen || window.HydroItemsHidden) return false;
        const dx = Math.abs(ex - playerScreenX);
        const dy = Math.abs(ey - playerRenderedY);
        if (dx < 70 && dy < 100) return true;
        const ndc = screenToNDC(ex, ey);
        mouseCoord.set(ndc.x, ndc.y);
        raycaster.setFromCamera(mouseCoord, camera);
        return raycaster.intersectObjects(playerGroup.children, true).length > 0;
    }

    function isHitBust(ex, ey) {
        if (!bustLoaded || bustIsOffscreen || window.HydroItemsHidden) return false;
        const dx = Math.abs(ex - bustScreenX);
        const dy = Math.abs(ey - bustRenderedY);
        if (dx < 70 && dy < 95) return true;
        const ndc = screenToNDC(ex, ey);
        mouseCoord.set(ndc.x, ndc.y);
        raycaster.setFromCamera(mouseCoord, camera);
        return raycaster.intersectObjects(bustGroup.children, true).length > 0;
    }

    // ── DOUBLE CLICK TO PLAY SOUND ON BUST STATUE ────────────────────────────
    window.addEventListener('dblclick', (e) => {
        if (window.HydroItemsHidden || bustIsOffscreen || !bustLoaded) return;
        if (e.target.closest('a, button, input, [role="button"]')) return;

        if (isHitBust(e.clientX, e.clientY)) {
            try {
                mamaAudio.currentTime = 0;
                mamaAudio.play().catch((err) => console.log('Audio playback prevented:', err));
            } catch (err) { }

            // Enthusiastic bounce and celebration wobble
            bustBounceVy = -9.5;
            bustWobbleVy = 0.28;

            if (window.HydroWater) {
                const sY = window.HydroWater.getSurfaceY(bustScreenX);
                window.HydroWater.createSplash(bustScreenX, sY, 18);
                window.HydroWater.createRipple(bustScreenX, sY);
                window.HydroWater.createRipple(bustScreenX - 25, sY);
                window.HydroWater.createRipple(bustScreenX + 25, sY);
            }

            e.preventDefault();
            e.stopPropagation();
        }
    });

    // ── DRAG & DROP POINTER EVENTS ───────────────────────────────────────────
    window.addEventListener('pointerdown', (e) => {
        if (window.HydroItemsHidden) return;
        if (e.target.closest('a, button, input, [role="button"]')) return;
        if (window._2dItemDragging) return;

        // Check bust statue first
        if (isHitBust(e.clientX, e.clientY)) {
            bustIsDragging = true;
            window._3dPlayerDragging = true;
            bustDragOffsetX = e.clientX - bustScreenX;
            bustDragOffsetY = e.clientY - bustRenderedY;
            bustAirY = bustRenderedY;
            bustDropVy = 0;
            document.body.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // Check basketball player
        if (isHitPlayer(e.clientX, e.clientY)) {
            playerIsDragging = true;
            window._3dPlayerDragging = true;
            playerDragOffsetX = e.clientX - playerScreenX;
            playerDragOffsetY = e.clientY - playerRenderedY;
            playerAirY = playerRenderedY;
            playerDropVy = 0;
            document.body.style.cursor = 'grabbing';
            e.preventDefault();
            e.stopPropagation();
            return;
        }
    });

    window.addEventListener('pointermove', (e) => {
        if (window.HydroItemsHidden) return;

        if (bustIsDragging) {
            bustScreenX = e.clientX - bustDragOffsetX;
            bustAirY = e.clientY - bustDragOffsetY;
            e.preventDefault();
        } else if (playerIsDragging) {
            playerScreenX = e.clientX - playerDragOffsetX;
            playerAirY = e.clientY - playerDragOffsetY;
            e.preventDefault();
        } else if (!window._2dItemDragging) {
            if (isHitBust(e.clientX, e.clientY) || isHitPlayer(e.clientX, e.clientY)) {
                document.body.style.cursor = 'grab';
            } else if (document.body.style.cursor === 'grab' && !window._2dItemHovered) {
                document.body.style.cursor = '';
            }
        }
    });

    window.addEventListener('pointerup', () => {
        if (bustIsDragging) {
            bustIsDragging = false;
            bustDropVy = 0.4; // gentle float down
            bustDepthRatio = 0.10 + Math.random() * 0.60;
        }
        if (playerIsDragging) {
            playerIsDragging = false;
            playerDropVy = 0.4; // gentle float down
            playerDepthRatio = 0.08 + Math.random() * 0.65;
            playerBaseYaw = (Math.random() - 0.5) * 0.5;
            playerDriftSpeed = 0.28 + Math.random() * 0.22;
        }
        window._3dPlayerDragging = false;
        document.body.style.cursor = '';
    });

    window.addEventListener('pointercancel', () => {
        if (bustIsDragging) {
            bustIsDragging = false;
            bustDropVy = 0.4;
        }
        if (playerIsDragging) {
            playerIsDragging = false;
            playerDropVy = 0.4;
        }
        window._3dPlayerDragging = false;
        document.body.style.cursor = '';
    });

    // ── ANIMATION LOOP ────────────────────────────────────────────────────────
    function animate() {
        requestAnimationFrame(animate);

        const now = performance.now();
        let time = now * 0.001;
        if (window.HydroWater) time = window.HydroWater.getTime();

        const dims = window.HydroWater ? window.HydroWater.getDimensions() : { width, height };

        // ── 1. UPDATE BASKETBALL PLAYER ───────────────────────────────────────
        if (window.HydroItemsHidden || playerIsOffscreen || !playerLoaded) {
            playerGroup.visible = false;
        } else {
            playerGroup.visible = true;
        }

        if (playerIsOffscreen) {
            if (now >= playerNextSpawn) {
                playerIsOffscreen = false;
                playerScreenX = -120;
                playerDepthRatio = 0.08 + Math.random() * 0.65;
                playerBaseYaw = (Math.random() - 0.5) * 0.55;
                playerDriftSpeed = 0.28 + Math.random() * 0.24;
            }
        } else if (!playerIsDragging && playerDropVy === 0) {
            playerScreenX += playerDriftSpeed;
            if (playerScreenX > width + 120) {
                playerIsOffscreen = true;
                playerNextSpawn = now + 14000 + Math.random() * 26000;
            }
        }

        const playerSY = window.HydroWater ? window.HydroWater.getSurfaceY(playerScreenX) : height * 0.83;
        const playerWH = Math.max(30, dims.height - playerSY);
        const playerAvail = Math.max(10, playerWH - 35);
        const playerTargetBaseY = playerSY + playerDepthRatio * playerAvail;
        const playerWaveAngle = window.HydroWater ? window.HydroWater.getSurfaceAngle(playerScreenX) : 0;
        const playerWaveInfluence = Math.max(0.3, 1 - playerDepthRatio * 0.7);

        let finalPlayerY;
        if (playerIsDragging) {
            finalPlayerY = playerAirY;
        } else if (playerDropVy > 0) {
            playerAirY += playerDropVy;
            playerDropVy = Math.min(4.2, playerDropVy + 0.16);
            if (playerAirY >= playerTargetBaseY) {
                const impact = Math.min(playerDropVy * 2.2, 10);
                playerBounceVy = -impact * 0.45;
                playerDropVy = 0;
                playerAirY = playerTargetBaseY;
                if (window.HydroWater) {
                    window.HydroWater.createSplash(playerScreenX, playerSY, Math.round(impact * 1.5));
                    window.HydroWater.createRipple(playerScreenX, playerSY);
                }
            }
            finalPlayerY = playerAirY;
        } else {
            if (playerBounceVy !== 0 || playerBounceY !== 0) {
                playerBounceY += playerBounceVy;
                playerBounceVy += 0.22;
                if (playerBounceY >= 0) {
                    if (window.HydroWater) window.HydroWater.createSplash(playerScreenX, playerSY, 3);
                    playerBounceY = 0;
                    playerBounceVy = 0;
                }
            }
            const bob = Math.sin(time * 2.0) * 3.0 * playerWaveInfluence;
            finalPlayerY = playerTargetBaseY + bob + playerBounceY;
        }
        playerRenderedY = finalPlayerY;

        // Player wobble spring
        if (playerWobbleVy !== 0 || playerWobble !== 0) {
            playerWobble += playerWobbleVy;
            playerWobbleVy -= playerWobble * 0.16;
            playerWobbleVy *= 0.88;
            if (Math.abs(playerWobble) < 0.002 && Math.abs(playerWobbleVy) < 0.002) {
                playerWobble = 0;
                playerWobbleVy = 0;
            }
        }

        playerGroup.position.x = playerScreenX - width / 2;
        playerGroup.position.y = height / 2 - finalPlayerY;

        if (playerIsDragging) {
            playerGroup.rotation.z = 0;
            playerGroup.rotation.x = 0;
            playerGroup.rotation.y = THREE.MathUtils.clamp(playerBaseYaw + playerWobble, -0.55, 0.55);
        } else if (playerDropVy > 0) {
            playerGroup.rotation.z = Math.sin(time * 2.5) * 0.18;
            playerGroup.rotation.x = Math.cos(time * 2) * 0.10;
            playerGroup.rotation.y = playerBaseYaw + time * 0.3;
        } else {
            playerGroup.rotation.z = playerWaveAngle * playerWaveInfluence * 0.85;
            playerGroup.rotation.x = Math.sin(time * 1.4) * 0.05 * playerWaveInfluence;
            const yaw = Math.sin(time * 0.65) * 0.14 + playerBaseYaw + playerWobble;
            playerGroup.rotation.y = THREE.MathUtils.clamp(yaw, playerBaseYaw - 0.22, playerBaseYaw + 0.22);
        }

        // ── 2. UPDATE BUST STATUE ─────────────────────────────────────────────
        if (window.HydroItemsHidden || bustIsOffscreen || !bustLoaded) {
            bustGroup.visible = false;
        } else {
            bustGroup.visible = true;
        }

        if (bustIsOffscreen) {
            if (now >= bustNextSpawn) {
                bustIsOffscreen = false;
                bustScreenX = -120;
                bustDepthRatio = 0.15 + Math.random() * 0.55;
                bustDriftSpeed = 0.26 + Math.random() * 0.22;
            }
        } else if (!bustIsDragging && bustDropVy === 0) {
            bustScreenX += bustDriftSpeed;
            if (bustScreenX > width + 120) {
                bustIsOffscreen = true;
                bustNextSpawn = now + 16000 + Math.random() * 28000;
            }
        }

        const bustSY = window.HydroWater ? window.HydroWater.getSurfaceY(bustScreenX) : height * 0.83;
        const bustWH = Math.max(30, dims.height - bustSY);
        const bustAvail = Math.max(10, bustWH - 35);
        const bustTargetBaseY = bustSY + bustDepthRatio * bustAvail;
        const bustWaveAngle = window.HydroWater ? window.HydroWater.getSurfaceAngle(bustScreenX) : 0;
        const bustWaveInfluence = Math.max(0.3, 1 - bustDepthRatio * 0.7);

        let finalBustY;
        if (bustIsDragging) {
            finalBustY = bustAirY;
        } else if (bustDropVy > 0) {
            bustAirY += bustDropVy;
            bustDropVy = Math.min(4.2, bustDropVy + 0.16);
            if (bustAirY >= bustTargetBaseY) {
                const impact = Math.min(bustDropVy * 2.2, 10);
                bustBounceVy = -impact * 0.45;
                bustDropVy = 0;
                bustAirY = bustTargetBaseY;
                if (window.HydroWater) {
                    window.HydroWater.createSplash(bustScreenX, bustSY, Math.round(impact * 1.5));
                    window.HydroWater.createRipple(bustScreenX, bustSY);
                }
            }
            finalBustY = bustAirY;
        } else {
            if (bustBounceVy !== 0 || bustBounceY !== 0) {
                bustBounceY += bustBounceVy;
                bustBounceVy += 0.22;
                if (bustBounceY >= 0) {
                    if (window.HydroWater) window.HydroWater.createSplash(bustScreenX, bustSY, 3);
                    bustBounceY = 0;
                    bustBounceVy = 0;
                }
            }
            const bob = Math.sin(time * 2.2 + 1.2) * 2.8 * bustWaveInfluence;
            finalBustY = bustTargetBaseY + bob + bustBounceY;
        }
        bustRenderedY = finalBustY;

        // Bust spring wobble
        if (bustWobbleVy !== 0 || bustWobble !== 0) {
            bustWobble += bustWobbleVy;
            bustWobbleVy -= bustWobble * 0.16;
            bustWobbleVy *= 0.88;
            if (Math.abs(bustWobble) < 0.002 && Math.abs(bustWobbleVy) < 0.002) {
                bustWobble = 0;
                bustWobbleVy = 0;
            }
        }

        bustGroup.position.x = bustScreenX - width / 2;
        bustGroup.position.y = height / 2 - finalBustY;

        if (bustIsDragging) {
            bustGroup.rotation.z = 0;
            bustGroup.rotation.x = 0;
            // Strictly front-facing: never turn around to reveal unfinished back!
            bustGroup.rotation.y = THREE.MathUtils.clamp(bustWobble, -0.26, 0.26);
        } else if (bustDropVy > 0) {
            bustGroup.rotation.z = Math.sin(time * 2) * 0.12;
            bustGroup.rotation.x = Math.cos(time * 1.8) * 0.08;
            bustGroup.rotation.y = THREE.MathUtils.clamp(Math.sin(time * 0.8) * 0.15 + bustWobble, -0.26, 0.26);
        } else {
            bustGroup.rotation.z = -bustWaveAngle * bustWaveInfluence * 0.75;
            bustGroup.rotation.x = Math.sin(time * 1.5) * 0.05 * bustWaveInfluence;
            const bustYaw = Math.sin(time * 0.7) * 0.12 + bustWobble;
            // Strictly locked front-facing: +- 14 degrees max!
            bustGroup.rotation.y = THREE.MathUtils.clamp(bustYaw, -0.26, 0.26);
        }

        // ── 3. UPDATE FLOATING "DOUBLE CLICK ME" HINT ─────────────────────────
        if (hintElem) {
            const showHint = bustGroup.visible && !bustIsOffscreen && !bustIsDragging && !window.HydroItemsHidden && bustScreenX > 60 && bustScreenX < width - 60;
            if (showHint) {
                hintElem.classList.add('visible');
                hintElem.style.left = `${bustScreenX}px`;
                hintElem.style.top = `${bustRenderedY - 95}px`;
            } else {
                hintElem.classList.remove('visible');
            }
        }

        // Periodic wake ripples
        rippleTick++;
        if (rippleTick % 45 === 0 && window.HydroWater) {
            if (playerGroup.visible && !playerIsDragging && playerDropVy === 0 && playerDepthRatio < 0.35) {
                window.HydroWater.createRipple(playerScreenX, playerSY);
            }
            if (bustGroup.visible && !bustIsDragging && bustDropVy === 0 && bustDepthRatio < 0.35) {
                window.HydroWater.createRipple(bustScreenX, bustSY);
            }
        }

        renderer.render(scene, camera);
    }

    animate();
})();
