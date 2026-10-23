/**
 * Hydrodynamics - Interactive Guided Walkthrough & Onboarding Tutorial
 * Standardized, accessible, glassmorphic tour system for flood simulation digital twin.
 */

(function () {
    'use strict';

    // ── Tour Steps ─────────────────────────────────────────────────────────────
    // 17 steps total. target: null = centered modal (no spotlight).
    // target: CSS selector = spotlight that element with popover beside it.
    const TOUR_STEPS = [
        {
            id: 'welcome',
            target: null,
            placement: 'center',
            badge: 'WELCOME TO HYDRODYNAMICS',
            title: '3D Flood Simulation Digital Twin',
            icon: 'droplet',
            desc: 'Welcome to the Barangay 168 (Deparo, Caloocan City) flood control simulation. This walkthrough guides you through every control, map mode, preset, and analytical layer in the interface.',
            tip: 'Navigate with the Next / Back buttons, your keyboard arrow keys (→ / ←), or press Escape to exit. You can always restart by clicking the compass icon ( ⊙ ) beside the HYDRODYNAMICS logo.'
        },
        {
            id: '3d-canvas',
            target: null,
            placement: 'center',
            badge: 'THE 3D MAP VIEWPORT',
            title: 'Interactive 3D Flood Map',
            icon: 'map',
            desc: 'The center of the screen is the 3D WebGL flood simulation map — a real-scale digital twin of Barangay 168 built from actual LiDAR terrain data and OpenStreetMap road network data. Water flows in real-time across streets, buildings, and drainage channels based on the physics of shallow water equations.',
            tip: 'Left-click and drag to orbit the camera. Right-click to pan. Scroll wheel to zoom in and out. In 2D top-down mode, click and drag to pan the map.'
        },
        {
            id: 'telemetry',
            target: '.telemetry-card',
            placement: 'right',
            badge: 'LIVE SENSORS & METRICS',
            title: 'Real-Time Telemetry Monitor',
            icon: 'activity',
            desc: 'Displays the live analytical state of the watershed: elapsed simulation time, count of inundated grid cells, peak flood depth in meters, total surface water volume (m³), and the numerical mass balance conservation error.',
            tip: 'A mass balance error under 1.0% confirms the finite-volume shallow water solver is conserving liquid mass precisely.'
        },
        {
            id: 'weather-presets',
            target: '#card-scenario',
            placement: 'right',
            badge: 'PAGASA STORM SCENARIOS',
            title: 'Weather Presets',
            icon: 'cloud-rain',
            desc: 'Instantly trigger standardized Philippine storm events: Light Rain (2.5 mm/h, 24h), Moderate (5 mm/h, 12h), Heavy (30 mm/h, 6h), Typhoon (55 mm/h, 12h), or Super Typhoon (100 mm/h, 12h).',
            tip: 'Weather presets change rain intensity and duration but leave your drainage pipe blockages completely untouched.'
        },
        {
            id: 'drainage-presets',
            target: '#card-pipe-presets',
            placement: 'right',
            badge: 'INFRASTRUCTURE STRESS-TEST',
            title: 'Drainage Network Presets',
            icon: 'git-commit',
            desc: 'Test urban drainage resilience under different maintenance scenarios: Optimal (0% clog), Minor (25%), Half Clogged (50%), Heavy Clog (75%), Total Jam (100%), or Assorted — a random realistic clog distribution across all 369 pipes.',
            tip: 'Comparing "Optimal" versus "Heavy Clog" under the same rainfall reveals the real impact of unmaintained culverts.'
        },
        {
            id: 'rainfall-slider',
            target: '#card-rainfall',
            placement: 'right',
            badge: 'PRECISION RAIN CONTROL',
            title: 'Manual Rainfall Intensity',
            icon: 'sliders',
            desc: 'Fine-tune precipitation from 0 mm/h up to 1,000 mm/h in real-time using the continuous slider while the simulation is running.',
            tip: 'The blue badge shows the active precipitation depth currently being applied across every terrain grid cell.'
        },
        {
            id: 'bulk-pipe',
            target: '#card-bulk-pipe',
            placement: 'right',
            badge: 'REGIONAL ENGINEERING',
            title: 'Bulk Pipe & Culvert Controls',
            icon: 'share-2',
            desc: 'Apply drainage changes across entire geographic sectors — All Pipes, North, South, East, or West Half. Set uniform blockages or resize pipe diameters (0.3m to 3.0m) across a region in bulk.',
            tip: 'Try selecting "North Half" and 100% blockage to see localized pooling in the northern subdivisions.'
        },
        {
            id: 'sim-speed',
            target: '#card-sim-speed',
            placement: 'right',
            badge: 'PLAYBACK CONTROLS',
            title: 'Playback & Simulation Speed',
            icon: 'gauge',
            desc: 'Play or pause the fluid simulation at any moment. Cycle through 1×, 2×, 5×, and 10× real-time multipliers, or trigger an offline physics fast-forward to simulate hours of rainfall in seconds.',
            tip: 'Press Play to start accumulating water and watch it flow gravitationally through streets and drainage pipes.'
        },
        {
            id: 'snapshot-rewind',
            target: '#card-snapshot',
            placement: 'right',
            badge: 'TIME-TRAVEL REWIND',
            title: 'Rewind to Snapshot',
            icon: 'history',
            desc: 'The simulation engine automatically records historical state snapshots. Pick any previous timestamp from the dropdown and click "Go" to instantly rewind water levels, flood extents, and pipe flows to that moment.',
            tip: 'Rewinding lets you test different drainage interventions from the exact same flood stage without starting over.'
        },
        {
            id: 'btn-reset',
            target: '#btn-reset',
            placement: 'right',
            badge: 'ENVIRONMENT RESTORE',
            title: 'Reset Simulation',
            icon: 'rotate-ccw',
            desc: 'Completely flushes all accumulated surface water, resets the simulation clock to 0s, and re-initializes the digital twin to a clean dry baseline state.',
            tip: 'Use this when you want to start a completely fresh experiment from scratch.'
        },
        {
            id: 'view-toggle',
            target: '#btn-view',
            placement: 'right',
            badge: 'GIS CAMERA MODES',
            title: '2D Orthographic / 3D Perspective View',
            icon: 'box',
            desc: 'Toggle the camera between a 3D isometric perspective (for exploring terrain relief and water depths spatially) and a true 2D top-down GIS orthographic view (for aerial flood hazard mapping).',
            tip: 'In 3D mode: Left-drag to orbit, Right-drag to pan, Scroll to zoom.'
        },
        {
            id: 'elevation-heatmap',
            target: '#btn-elev',
            placement: 'right',
            badge: 'TOPOGRAPHIC ANALYSIS',
            title: 'Digital Elevation Heatmap (DEM)',
            icon: 'mountain',
            desc: 'Overlays an elevation color gradient from real LiDAR terrain data (1.0m green valleys → 65.4m red ridges) to reveal natural runoff pathways and low-lying catchment basins across Barangay 168.',
            tip: 'Water flows naturally into the green corridors — the lowest depressions on the DEM.'
        },
        {
            id: 'xray-mode',
            target: '#btn-glass',
            placement: 'right',
            badge: 'UNDERGROUND VISUALIZATION',
            title: 'Underground Pipe X-Ray Mode',
            icon: 'eye',
            desc: 'Makes the terrain surface translucent like glass, revealing the entire subterranean drainage network beneath the roads: 368 manhole nodes, 369 pipes, and 7 natural outfalls.',
            tip: 'Animated flow pulses travel through the pipes toward downstream outfalls when runoff is active.'
        },
        {
            id: 'map-controls-all',
            target: '#map-controls',
            placement: 'right',
            badge: 'FLOATING MAP TOOLS',
            title: 'Map View Controls & Layer Visibility',
            icon: 'layers',
            desc: 'This column of floating controls (from top): 3D/2D view toggle, Elevation Heatmap, Underground X-Ray, and Layer Visibility. The Layer Visibility button opens a popover where you can toggle 3D buildings, trees, roads, water, zone borders, drain nodes, grid, and more.',
            tip: 'Turn off buildings and trees to get a clean, unobstructed aerial flood depth map.'
        },
        {
            id: 'pipe-inspector',
            target: '#pipe-inspector',
            placement: 'left',
            badge: 'INDIVIDUAL CULVERTS',
            title: 'Interactive 3D Pipe Inspector',
            icon: 'wrench',
            desc: 'Hover over any pipe in the 3D viewport to see its live flow rate. Click it to open this inspector — where you can clear clogs, set a precise blockage % (0–100%), or adjust its physical diameter (0.1m–5.0m).',
            tip: 'Try clicking any pipe cylinder in the 3D canvas after this tour to customize it directly.'
        },
        {
            id: 'sitrep-panel',
            target: '#sitrep-panel',
            placement: 'left',
            badge: 'DISASTER RISK DASHBOARD',
            title: 'SitRep & Subdivision Zone Stats',
            icon: 'triangle-alert',
            desc: 'Live situational report for Barangay 168. Shows rain duration, inundated area percentage, affected subdivisions, and peak flood depth. The zone table below tracks real-time flood status per subdivision.',
            tip: 'Each zone is classified in real time: SAFE → ALERT → CRITICAL → DISASTER based on localized water depth.'
        },
        {
            id: 'completion',
            target: null,
            placement: 'center',
            badge: 'READY TO EXPLORE',
            title: 'You Are All Set!',
            icon: 'check-circle-2',
            desc: 'You now know every tool in the Hydrodynamics simulation. Start the rain, test pipe blockages, and watch how water responds across Barangay 168 in real time.',
            tip: 'Need a refresher anytime? Click the ⊙ compass icon beside the HYDRODYNAMICS logo in the top-left to restart this guide from the beginning.'
        }
    ];

    let currentStep = 0;
    let isActive = false;
    let sampleInspectorShown = false;
    let layersPopoverWasOpen = false;

    let overlayEl = null;
    let spotlightEl = null;
    let popoverEl = null;

    // ── DOM Construction ────────────────────────────────────────────────────────
    function createTourElements() {
        if (document.getElementById('tour-overlay')) return;

        overlayEl = document.createElement('div');
        overlayEl.id = 'tour-overlay';

        spotlightEl = document.createElement('div');
        spotlightEl.id = 'tour-spotlight';
        overlayEl.appendChild(spotlightEl);

        popoverEl = document.createElement('div');
        popoverEl.id = 'tour-popover';
        popoverEl.setAttribute('role', 'dialog');
        popoverEl.setAttribute('aria-modal', 'true');
        popoverEl.innerHTML = `
            <div class="tour-progress-bar">
                <div class="tour-progress-fill" id="tour-progress-fill"></div>
            </div>
            <div class="tour-header">
                <span class="tour-step-badge" id="tour-badge">
                    <i data-lucide="compass"></i>
                    <span id="tour-badge-text">STEP 1 OF ${TOUR_STEPS.length}</span>
                </span>
                <button class="tour-close-btn" id="tour-btn-close" title="Exit Tour (Esc)">
                    <i data-lucide="x"></i>
                </button>
            </div>
            <div class="tour-body">
                <div class="tour-title" id="tour-title">
                    <i data-lucide="info" id="tour-title-icon"></i>
                    <span id="tour-title-text">Title</span>
                </div>
                <div class="tour-desc" id="tour-desc">Description.</div>
                <div class="tour-tip" id="tour-tip-wrap">
                    <i data-lucide="lightbulb"></i>
                    <span id="tour-tip-text">Tip.</span>
                </div>
            </div>
            <div class="tour-footer">
                <button class="tour-skip-btn" id="tour-btn-skip" title="Skip the entire guided tour">
                    <i data-lucide="skip-forward"></i> Skip Entire Tour
                </button>
                <div class="tour-btn-group">
                    <button class="tour-btn-nav prev" id="tour-btn-prev">
                        <i data-lucide="chevron-left"></i> Back
                    </button>
                    <button class="tour-btn-nav next" id="tour-btn-next">
                        Next <i data-lucide="chevron-right"></i>
                    </button>
                </div>
            </div>
            <div id="tour-arrow"></div>
        `;

        overlayEl.appendChild(popoverEl);
        document.body.appendChild(overlayEl);

        document.getElementById('tour-btn-close').addEventListener('click', () => endTour(true));
        document.getElementById('tour-btn-skip').addEventListener('click', () => endTour(true));
        document.getElementById('tour-btn-prev').addEventListener('click', prevStep);
        document.getElementById('tour-btn-next').addEventListener('click', nextStep);

        window.addEventListener('keydown', handleKeydown);
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleResize, true);
    }

    function bindTriggerButtons() {
        const btnHeaderGuide = document.getElementById('btn-header-guide');
        if (btnHeaderGuide && !btnHeaderGuide._tourBound) {
            btnHeaderGuide.addEventListener('click', () => startTour(0));
            btnHeaderGuide._tourBound = true;
        }
    }

    // ── Toast Notification ──────────────────────────────────────────────────────
    function showToast(message) {
        let toast = document.getElementById('tour-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tour-toast';
            toast.className = 'tour-toast';
            document.body.appendChild(toast);
        }
        toast.innerHTML = `<i data-lucide="info"></i> <span>${message}</span>`;
        if (window.lucide) lucide.createIcons();
        toast.classList.add('visible');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => toast.classList.remove('visible'), 3600);
    }

    // ── Keyboard ────────────────────────────────────────────────────────────────
    function handleKeydown(e) {
        if (!isActive) return;
        if (e.key === 'Escape') { e.preventDefault(); endTour(true); }
        else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); nextStep(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); prevStep(); }
    }

    let resizeTimer = null;
    function handleResize() {
        if (!isActive) return;
        if (resizeTimer) cancelAnimationFrame(resizeTimer);
        resizeTimer = requestAnimationFrame(() => renderCurrentStep(false));
    }

    // ── Tour Control ────────────────────────────────────────────────────────────
    function startTour(fromStep = 0) {
        createTourElements();
        isActive = true;
        currentStep = Math.max(0, Math.min(fromStep, TOUR_STEPS.length - 1));
        overlayEl.style.display = 'block';
        popoverEl.style.display = 'block';
        requestAnimationFrame(() => {
            popoverEl.classList.add('visible');
            renderCurrentStep(true);
        });
    }

    function nextStep() {
        if (currentStep < TOUR_STEPS.length - 1) { currentStep++; renderCurrentStep(true); }
        else endTour(false);
    }

    function prevStep() {
        if (currentStep > 0) { currentStep--; renderCurrentStep(true); }
    }

    function endTour(skipped = false) {
        isActive = false;
        try { localStorage.setItem('hydro_walkthrough_seen', 'true'); } catch (e) {}

        // Clean up temporarily opened panels
        if (sampleInspectorShown) {
            const pi = document.getElementById('pipe-inspector');
            if (pi) pi.style.display = 'none';
            sampleInspectorShown = false;
        }
        const layersPopover = document.getElementById('layers-popover');
        if (layersPopover && !layersPopoverWasOpen) layersPopover.style.display = 'none';

        if (popoverEl) popoverEl.classList.remove('visible');
        if (spotlightEl) spotlightEl.style.opacity = '0';
        setTimeout(() => {
            if (overlayEl) overlayEl.style.display = 'none';
            if (popoverEl) popoverEl.style.display = 'none';
        }, 220);

        if (skipped) {
            showToast('Tour exited — click the ⊙ compass icon beside HYDRODYNAMICS to restart anytime.');
        }
    }

    // ── Prepare Step Target ─────────────────────────────────────────────────────
    function prepareTarget(step) {
        // Ensure left sidebar is open
        const uiPanel = document.getElementById('ui');
        if (uiPanel && uiPanel.classList.contains('panel-hidden')) {
            uiPanel.classList.remove('panel-hidden');
            const panelToggle = document.getElementById('panel-toggle');
            if (panelToggle) panelToggle.innerHTML = '<i data-lucide="chevron-left"></i>';
        }

        // Open collapsible card containing target
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const card = el.closest('.collapsible-card');
                if (card && !card.classList.contains('open')) card.classList.add('open');
                if (uiPanel && uiPanel.contains(el)) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
        }

        // Pipe Inspector — show sample preview
        if (step.id === 'pipe-inspector') {
            const pi = document.getElementById('pipe-inspector');
            if (pi && (pi.style.display === 'none' || !pi.style.display)) {
                const set = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
                set('pi-id', '#42 (Sample)');
                set('pi-nodes', '14 → 15');
                set('pi-diam', '0.9m');
                set('pi-flow', '0.450 m³/s');
                set('pi-block-pct', '25%');
                set('pi-blockage-val', '25%');
                const piFill = document.getElementById('pi-fill');
                if (piFill) { piFill.style.width = '25%'; piFill.style.background = '#e67e22'; }
                const piSlider = document.getElementById('pi-slider');
                if (piSlider) piSlider.value = 25;
                const piDiamInput = document.getElementById('pi-diam-input');
                if (piDiamInput) piDiamInput.value = 0.9;
                pi.style.display = 'block';
                pi.style.top = '120px';
                pi.style.left = '420px';
                sampleInspectorShown = true;
            }
        } else if (sampleInspectorShown && step.id !== 'pipe-inspector') {
            const pi = document.getElementById('pipe-inspector');
            if (pi) pi.style.display = 'none';
            sampleInspectorShown = false;
        }

        // Layer Visibility popover — open it for the map-controls step
        const layersPopover = document.getElementById('layers-popover');
        if (step.id === 'map-controls-all') {
            if (layersPopover) {
                layersPopoverWasOpen = layersPopover.style.display === 'block';
                layersPopover.style.display = 'block';
            }
        } else if (step.id !== 'map-controls-all' && layersPopover && !layersPopoverWasOpen) {
            layersPopover.style.display = 'none';
        }

        // SitRep panel — expand table body
        if (step.id === 'sitrep-panel') {
            const sitrepBody = document.getElementById('sitrep-body');
            const sitrepToggleBtn = document.getElementById('sitrep-toggle-btn');
            const sitrepHeader = document.getElementById('sitrep-header');
            if (sitrepBody && (sitrepBody.style.display === 'none' || !sitrepBody.style.display)) {
                sitrepBody.style.display = 'block';
                if (sitrepToggleBtn) sitrepToggleBtn.innerHTML = '<i data-lucide="minus"></i>';
                if (sitrepHeader) sitrepHeader.style.borderBottom = '1px solid rgba(255,255,255,0.06)';
            }
        }
    }

    // ── Render Step ─────────────────────────────────────────────────────────────
    function renderCurrentStep(animate = true) {
        const step = TOUR_STEPS[currentStep];
        if (!step) return;

        prepareTarget(step);

        // Progress bar
        const pct = ((currentStep + 1) / TOUR_STEPS.length) * 100;
        const fill = document.getElementById('tour-progress-fill');
        if (fill) fill.style.width = pct + '%';

        // Badge
        const badgeText = document.getElementById('tour-badge-text');
        if (badgeText) badgeText.textContent = `STEP ${currentStep + 1} OF ${TOUR_STEPS.length} \u2022 ${step.badge}`;

        // Title & icon
        const titleText = document.getElementById('tour-title-text');
        const titleIcon = document.getElementById('tour-title-icon');
        if (titleText) titleText.textContent = step.title;
        if (titleIcon) titleIcon.setAttribute('data-lucide', step.icon || 'info');

        // Description
        const descEl = document.getElementById('tour-desc');
        if (descEl) descEl.textContent = step.desc;

        // Tip
        const tipWrap = document.getElementById('tour-tip-wrap');
        const tipText = document.getElementById('tour-tip-text');
        if (step.tip) {
            if (tipWrap) tipWrap.style.display = 'flex';
            if (tipText) tipText.textContent = step.tip;
        } else {
            if (tipWrap) tipWrap.style.display = 'none';
        }

        // Buttons
        const prevBtn = document.getElementById('tour-btn-prev');
        const nextBtn = document.getElementById('tour-btn-next');
        if (prevBtn) prevBtn.disabled = currentStep === 0;
        if (nextBtn) {
            if (currentStep === TOUR_STEPS.length - 1) {
                nextBtn.innerHTML = `Finish Tour <i data-lucide="check"></i>`;
            } else {
                nextBtn.innerHTML = `Next <i data-lucide="chevron-right"></i>`;
            }
        }

        if (window.lucide) lucide.createIcons();
        positionStep(step, animate);
    }

    // ── Positioning ─────────────────────────────────────────────────────────────
    function positionStep(step, animate) {
        const margin = 8;
        const popoverWidth = popoverEl.offsetWidth || 380;
        const popoverHeight = popoverEl.offsetHeight || 280;
        const W = window.innerWidth;
        const H = window.innerHeight;

        let targetRect = null;
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) targetRect = el.getBoundingClientRect();
        }

        if (!targetRect || step.placement === 'center') {
            spotlightEl.style.opacity = '0';
            spotlightEl.classList.remove('pulse');
            popoverEl.setAttribute('data-placement', 'center');
            popoverEl.style.left = Math.max(16, (W - popoverWidth) / 2) + 'px';
            popoverEl.style.top = Math.max(16, (H - popoverHeight) / 2) + 'px';
            return;
        }

        // Spotlight
        const sl = Math.max(0, targetRect.left - margin);
        const st = Math.max(0, targetRect.top - margin);
        const sw = targetRect.width + margin * 2;
        const sh = targetRect.height + margin * 2;

        spotlightEl.style.left = sl + 'px';
        spotlightEl.style.top = st + 'px';
        spotlightEl.style.width = sw + 'px';
        spotlightEl.style.height = sh + 'px';
        spotlightEl.style.opacity = '1';
        spotlightEl.classList.add('pulse');

        // Popover position
        let placement = step.placement || 'right';
        let popLeft = 0, popTop = 0;

        if (placement === 'right') {
            popLeft = sl + sw + 14;
            popTop = st + sh / 2 - popoverHeight / 2;
            if (popLeft + popoverWidth > W - 16) {
                if (sl - popoverWidth - 14 > 16) { placement = 'left'; popLeft = sl - popoverWidth - 14; }
                else { placement = 'bottom'; popLeft = Math.max(16, sl); popTop = st + sh + 14; }
            }
        } else if (placement === 'left') {
            popLeft = sl - popoverWidth - 14;
            popTop = st + sh / 2 - popoverHeight / 2;
            if (popLeft < 16) {
                if (sl + sw + popoverWidth + 14 < W - 16) { placement = 'right'; popLeft = sl + sw + 14; }
                else { placement = 'bottom'; popLeft = Math.max(16, sl); popTop = st + sh + 14; }
            }
        }

        popTop = Math.max(16, Math.min(popTop, H - popoverHeight - 16));
        popLeft = Math.max(16, Math.min(popLeft, W - popoverWidth - 16));

        popoverEl.setAttribute('data-placement', placement);
        popoverEl.style.left = popLeft + 'px';
        popoverEl.style.top = popTop + 'px';
    }

    // ── First-Visit Auto-Launch ─────────────────────────────────────────────────
    function checkFirstVisit() {
        try {
            if (!localStorage.getItem('hydro_walkthrough_seen')) {
                const checkReady = setInterval(() => {
                    const loading = document.getElementById('loading');
                    if (!loading || loading.style.display === 'none') {
                        clearInterval(checkReady);
                        setTimeout(() => startTour(0), 1200);
                    }
                }, 500);
            }
        } catch (e) {}
    }

    // ── Public API ──────────────────────────────────────────────────────────────
    window.HydroTutorial = {
        start: startTour,
        next: nextStep,
        prev: prevStep,
        end: endTour,
        isActive: () => isActive
    };

    // ── Init ────────────────────────────────────────────────────────────────────
    function init() {
        createTourElements();
        bindTriggerButtons();
        checkFirstVisit();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
