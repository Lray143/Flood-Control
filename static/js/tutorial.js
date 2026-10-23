/**
 * Hydrodynamics - Interactive Guided Walkthrough & Onboarding Tutorial
 * Standardized, accessible, glassmorphic tour system for flood simulation digital twin.
 */

(function () {
    'use strict';

    // ── Tour Steps Definition ───────────────────────────────────────────────────
    const TOUR_STEPS = [
        {
            id: 'welcome',
            target: null,
            placement: 'center',
            badge: 'WELCOME TO HYDRODYNAMICS',
            title: '3D Flood Simulation Digital Twin',
            icon: 'droplet',
            desc: 'Welcome to the Barangay 168 (Deparo, Caloocan City) flood control simulation. This walkthrough guides you through every control, map mode, preset, and analytical layer in the interface.',
            tip: 'Navigate with Next / Back below or your keyboard arrow keys (→ / ←). You can restart this guide at any time by clicking the compass icon ( ⊙ ) in the top-right corner of the header.'
        },
        {
            id: 'guide-button',
            target: '#btn-header-guide',
            placement: 'right',
            badge: 'HELP & WALKTHROUGH',
            title: 'Restart Guide Anytime',
            icon: 'compass',
            desc: 'Click this compass icon in the top-right of the header whenever you want to reopen or replay this interactive guide. It remains pinned here permanently.',
            tip: 'Whenever you want a quick refresher on what any button does, just click this icon!'
        },
        {
            id: '3d-canvas',
            target: null,
            placement: 'center',
            badge: 'THE 3D MAP VIEWPORT',
            title: 'Interactive 3D Flood Map',
            icon: 'map',
            desc: 'The center of your screen is the 3D WebGL flood map — a real-scale digital twin of Barangay 168 built from actual LiDAR terrain data and OpenStreetMap road geometry. Water flows across streets, buildings, and drainage channels based on real shallow water hydrodynamic physics.',
            tip: 'Left-click and drag to orbit the camera. Right-click to pan. Scroll wheel to zoom in and out. In 2D top-down mode, drag to pan the overhead map.'
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
            desc: 'Test urban drainage resilience under different maintenance conditions: Optimal (0% clog), Minor (25%), Half Clogged (50%), Heavy Clog (75%), Total Jam (100%), or Assorted — a randomized realistic clog distribution across all 369 pipes.',
            tip: 'Comparing "Optimal" vs "Heavy Clog" under the same rainfall reveals the true impact of unmaintained culverts on neighborhood flooding.'
        },
        {
            id: 'rainfall-slider',
            target: '#card-rainfall',
            placement: 'right',
            badge: 'PRECISION RAIN CONTROL',
            title: 'Manual Rainfall Intensity',
            icon: 'sliders',
            desc: 'Fine-tune precipitation continuously from 0 mm/h up to 1,000 mm/h in real-time using this slider while the simulation runs.',
            tip: 'The blue badge displays the active precipitation depth currently being applied across every terrain grid cell.'
        },
        {
            id: 'bulk-pipe',
            target: '#card-bulk-pipe',
            placement: 'right',
            badge: 'REGIONAL ENGINEERING',
            title: 'Bulk Pipe & Culvert Controls',
            icon: 'share-2',
            desc: 'Apply drainage changes across entire geographic sectors — All Pipes, North, South, East, or West Half. Set uniform blockage percentages or resize pipe diameters (0.3m to 3.0m) across a whole region in bulk.',
            tip: 'Try selecting "North Half" and 100% blockage to observe isolated pooling in the northern subdivisions.'
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
            desc: 'The simulation engine automatically records historical state snapshots. Pick any previous timestamp from the dropdown and click "Go" to instantly rewind water levels, flood extents, and pipe flows to that exact moment.',
            tip: 'Rewinding lets you test different emergency drainage interventions from the exact same flood stage without starting over.'
        },
        {
            id: 'btn-reset',
            target: '#btn-reset',
            placement: 'right',
            badge: 'ENVIRONMENT RESTORE',
            title: 'Reset Simulation',
            icon: 'rotate-ccw',
            desc: 'Completely flushes all accumulated surface water, resets the simulation clock to 0s, and re-initializes the digital twin to a clean dry baseline topography.',
            tip: 'Use this whenever you want to start a completely fresh simulation run.'
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
            desc: 'Overlays a dynamic color gradient from real LiDAR terrain data (1.0m green valleys → 65.4m red ridges) to reveal natural runoff pathways and low-lying flood basins across Barangay 168.',
            tip: 'Water naturally drains down the elevation slope into the emerald-green depression corridors.'
        },
        {
            id: 'xray-mode',
            target: '#btn-glass',
            placement: 'right',
            badge: 'UNDERGROUND VISUALIZATION',
            title: 'Underground Pipe X-Ray Mode',
            icon: 'eye',
            desc: 'Makes the terrain surface translucent like glass, revealing the subterranean drainage network: 368 manhole nodes, 369 pipes, and 7 natural outfalls beneath the roads.',
            tip: 'CRITICAL: You must turn on X-Ray Mode to see, hover over, and click underground pipes! In standard view, the solid terrain blocks pipe selection.'
        },
        {
            id: 'layers-btn',
            target: '#btn-layers',
            placement: 'right',
            badge: 'LAYER VISIBILITY TOGGLE',
            title: 'Layer Visibility Button',
            icon: 'layers',
            desc: 'Click this button to open the Layer Visibility panel — where you can individually toggle each visual layer on and off in the 3D scene.',
            tip: 'Click this button anytime to open the GIS layer filters popover.'
        },
        {
            id: 'map-controls-all',
            target: '#map-controls',
            placement: 'right',
            badge: 'LAYER FILTERS',
            title: 'Layer Visibility & GIS Filters',
            icon: 'layers',
            desc: 'The Layer Visibility panel lets you toggle: 3D buildings, natural trees, OSM road networks, water surface, Barangay 168 boundary, zone borders, 3D area labels, map labels, drain nodes, and grid overlay.',
            tip: 'Turn off buildings and trees for a clean, unobstructed aerial flood hazard map.'
        },
        {
            id: 'pipe-inspector',
            target: '#pipe-inspector',
            placement: 'left',
            badge: 'INDIVIDUAL CULVERTS',
            title: 'Interactive 3D Pipe Inspector',
            icon: 'wrench',
            desc: 'Remember: Hovering and selecting pipes works ONLY when Underground X-Ray Mode is active! With X-Ray turned on, simply hover over any pipe in the 3D scene to inspect its live flow rate and diameter, or click it to open this inspector panel.',
            tip: 'In this inspector, you can clear debris clogs, set custom blockage % (0–100%), or adjust physical culvert diameter (0.1m–5.0m).'
        },
        {
            id: 'sitrep-panel',
            target: '#sitrep-panel',
            placement: 'left',
            badge: 'DISASTER RISK DASHBOARD',
            title: 'SitRep & Subdivision Zone Stats',
            icon: 'triangle-alert',
            desc: 'Live situational report for Barangay 168. Shows rain duration, inundated area percentage, affected subdivisions, and peak flood depth. The zone table below tracks real-time flood status per subdivision.',
            tip: 'Each subdivision is classified in real time: SAFE → ALERT → CRITICAL → DISASTER based on localized water depth.'
        },
        {
            id: 'completion',
            target: null,
            placement: 'center',
            badge: 'READY TO EXPLORE',
            title: 'You Are All Set!',
            icon: 'check-circle-2',
            desc: 'You now know every tool in the Hydrodynamics simulation! Start the rain, test pipe blockages, and watch how water responds across Barangay 168 in real time. Remember: you can click the compass icon ( ⊙ ) in the top-right corner of the header at any time to reopen this guide!',
            tip: 'Click "Finish Tour" below to start exploring.'
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
            <div class="tour-header">
                <span class="tour-step-counter" id="tour-badge-text">Step 1 of ${TOUR_STEPS.length}</span>
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
                <button class="tour-skip-btn" id="tour-btn-skip" title="Exit the guided tour">
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
            btnHeaderGuide.addEventListener('click', (e) => {
                e.stopPropagation();
                startTour(0);
            });
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
        toast._timer = setTimeout(() => toast.classList.remove('visible'), 4000);
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
        try { sessionStorage.setItem('hydro_walkthrough_seen', 'true'); } catch (e) {}

        if (sampleInspectorShown) {
            const pi = document.getElementById('pipe-inspector');
            if (pi) pi.style.display = 'none';
            sampleInspectorShown = false;
        }
        const layersPopover = document.getElementById('layers-popover');
        if (layersPopover && !layersPopoverWasOpen) layersPopover.style.display = 'none';

        if (popoverEl) popoverEl.classList.remove('visible');
        if (spotlightEl) { spotlightEl.style.opacity = '0'; spotlightEl.classList.remove('pulse'); }
        setTimeout(() => {
            if (overlayEl) overlayEl.style.display = 'none';
        }, 220);

        if (skipped) {
            showToast('Tour exited — click the ⊙ compass icon in the top-right corner of the header to open the guide again anytime.');
        }
    }

    // ── Prepare Step Target ─────────────────────────────────────────────────────
    function prepareTarget(step) {
        // Ensure left sidebar is open
        const uiPanel = document.getElementById('ui');
        if (uiPanel && uiPanel.classList.contains('panel-hidden')) {
            uiPanel.classList.remove('panel-hidden');
            const pt = document.getElementById('panel-toggle');
            if (pt) pt.innerHTML = '<i data-lucide="chevron-left"></i>';
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

        // Pipe Inspector — show sample data preview
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
                
                const canvasW = window.innerWidth;
                pi.style.display = 'block';
                pi.style.top = '120px';
                pi.style.left = Math.min(420, canvasW - 250) + 'px';
                sampleInspectorShown = true;
            }
        } else if (sampleInspectorShown) {
            const pi = document.getElementById('pipe-inspector');
            if (pi) pi.style.display = 'none';
            sampleInspectorShown = false;
        }

        // Layer Visibility popover — open for map-controls-all step
        const layersPopover = document.getElementById('layers-popover');
        if (step.id === 'map-controls-all') {
            if (layersPopover) {
                layersPopoverWasOpen = layersPopover.style.display === 'block';
                layersPopover.style.display = 'block';
            }
        } else if (step.id === 'layers-btn') {
            if (layersPopover) {
                layersPopoverWasOpen = layersPopover.style.display === 'block';
                layersPopover.style.display = 'none';
            }
        } else if (layersPopover && !layersPopoverWasOpen) {
            layersPopover.style.display = 'none';
        }

        // SitRep — expand table body
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
            nextBtn.innerHTML = currentStep === TOUR_STEPS.length - 1
                ? `Finish Tour <i data-lucide="check"></i>`
                : `Next <i data-lucide="chevron-right"></i>`;
        }

        if (window.lucide) lucide.createIcons();
        positionStep(step);
    }

    // ── Smart Positioning (responsive, collision-aware) ────────────────────────
    function positionStep(step) {
        popoverEl.style.visibility = 'hidden';
        popoverEl.style.display = 'block';
        const popW = popoverEl.offsetWidth || 360;
        const popH = popoverEl.offsetHeight || 260;
        popoverEl.style.visibility = '';

        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const margin = 12;
        const edge = 12;

        if (vw < 500) {
            spotlightEl.style.opacity = '0';
            spotlightEl.classList.remove('pulse');
            popoverEl.setAttribute('data-placement', 'center');
            place(Math.max(edge, (vw - popW) / 2), Math.max(edge, (vh - popH) / 2));
            return;
        }

        let targetRect = null;
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) targetRect = el.getBoundingClientRect();
        }

        if (!targetRect || step.placement === 'center') {
            spotlightEl.style.opacity = '0';
            spotlightEl.classList.remove('pulse');
            popoverEl.setAttribute('data-placement', 'center');
            place(Math.max(edge, (vw - popW) / 2), Math.max(edge, (vh - popH) / 2));
            return;
        }

        // Spotlight
        const pad = 8;
        const sl = Math.max(0, targetRect.left - pad);
        const st = Math.max(0, targetRect.top - pad);
        const sw = Math.min(targetRect.width + pad * 2, vw);
        const sh = Math.min(targetRect.height + pad * 2, vh);

        spotlightEl.style.left   = sl + 'px';
        spotlightEl.style.top    = st + 'px';
        spotlightEl.style.width  = sw + 'px';
        spotlightEl.style.height = sh + 'px';
        spotlightEl.style.opacity = '1';
        spotlightEl.classList.add('pulse');

        // Candidate placements in priority order
        const preferred = step.placement || 'right';
        const candidates = [preferred, preferred === 'right' ? 'left' : 'right', 'bottom', 'top', 'center'];
        let placed = false;

        for (const p of candidates) {
            let left, top;
            if (p === 'right') {
                left = sl + sw + margin;
                top  = st + sh / 2 - popH / 2;
                if (left + popW <= vw - edge) { place(left, clampV(top, popH, vh, edge)); popoverEl.setAttribute('data-placement', 'right'); placed = true; break; }
            } else if (p === 'left') {
                left = sl - popW - margin;
                top  = st + sh / 2 - popH / 2;
                if (left >= edge) { place(left, clampV(top, popH, vh, edge)); popoverEl.setAttribute('data-placement', 'left'); placed = true; break; }
            } else if (p === 'bottom') {
                left = clampH(sl + sw / 2 - popW / 2, popW, vw, edge);
                top  = st + sh + margin;
                if (top + popH <= vh - edge) { place(left, top); popoverEl.setAttribute('data-placement', 'bottom'); placed = true; break; }
            } else if (p === 'top') {
                left = clampH(sl + sw / 2 - popW / 2, popW, vw, edge);
                top  = st - popH - margin;
                if (top >= edge) { place(left, top); popoverEl.setAttribute('data-placement', 'top'); placed = true; break; }
            } else if (p === 'center') {
                spotlightEl.style.opacity = '0';
                place(Math.max(edge, (vw - popW) / 2), Math.max(edge, (vh - popH) / 2));
                popoverEl.setAttribute('data-placement', 'center');
                placed = true; break;
            }
        }

        if (!placed) {
            popoverEl.setAttribute('data-placement', 'center');
            place(Math.max(edge, (vw - popW) / 2), Math.max(edge, (vh - popH) / 2));
        }
    }

    function place(left, top) {
        popoverEl.style.left = left + 'px';
        popoverEl.style.top  = top  + 'px';
    }

    function clampV(top, popH, vh, edge) {
        return Math.max(edge, Math.min(top, vh - popH - edge));
    }

    function clampH(left, popW, vw, edge) {
        return Math.max(edge, Math.min(left, vw - popW - edge));
    }

    // ── First-Visit Auto-Launch ─────────────────────────────────────────────────
    function checkFirstVisit() {
        try {
            if (!sessionStorage.getItem('hydro_walkthrough_seen')) {
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
