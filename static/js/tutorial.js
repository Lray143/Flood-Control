/**
 * Hydrodynamics - Interactive Guided Walkthrough & Onboarding Tutorial
 * Standardized, accessible, glassmorphic tour system for flood simulation digital twin.
 */

(function () {
    'use strict';

    // Tour Definition covering all UI and analytical features
    const TOUR_STEPS = [
        {
            id: 'welcome',
            target: null, // Center modal
            placement: 'center',
            badge: 'WELCOME TO HYDRODYNAMICS',
            title: '3D Flood Simulation Digital Twin',
            icon: 'droplet',
            desc: 'Welcome to the Barangay 168 (Deparo, Caloocan City) flood control simulation. This interactive walkthrough will guide you step-by-step through every control button, analytical layer, storm scenario, and infrastructure tool.',
            tip: 'Use Next / Back below, or your keyboard arrows (→ / ←). Press Escape or "Skip Entire Tour" at any time to exit.'
        },
        {
            id: 'telemetry',
            target: '.telemetry-card',
            placement: 'right',
            badge: 'LIVE SENSORS & METRICS',
            title: 'Real-Time Telemetry Monitor',
            icon: 'activity',
            desc: 'Displays the live analytical pulse of the watershed: elapsed simulation time, count of currently inundated grid cells, peak flood depth in meters, total surface water volume (m³), and the numerical mass balance conservation error.',
            tip: 'A mass balance error under 1.0% confirms the finite-volume shallow water solver is conserving liquid mass precisely.'
        },
        {
            id: 'weather-presets',
            target: '#card-scenario',
            placement: 'right',
            badge: 'PAGASA STORM SCENARIOS',
            title: 'Weather Presets',
            icon: 'cloud-rain',
            desc: 'Instantly simulate standardized Philippine meteorological events: Light Rain (2.5 mm/h, 24h), Moderate (5 mm/h, 12h), Heavy (30 mm/h, 6h), Typhoon (55 mm/h, 12h), or Super Typhoon (100 mm/h, 12h).',
            tip: 'Weather presets adjust rain rates and durations while keeping your drainage pipe blockages completely independent.'
        },
        {
            id: 'drainage-presets',
            target: '#card-pipe-presets',
            placement: 'right',
            badge: 'INFRASTRUCTURE STRESS-TEST',
            title: 'Drainage Network Presets',
            icon: 'git-commit',
            desc: 'Test urban drainage resilience under various maintenance conditions: Optimal (0% clog), Minor (25%), Half Clogged (50%), Heavy Clog (75%), Total Jam (100%), or Assorted (random realistic clog distribution across the 369 pipes).',
            tip: 'Comparing "Optimal" vs "Heavy Clog" reveals the dramatic impact of clogged culverts on neighborhood flood duration.'
        },
        {
            id: 'rainfall-slider',
            target: '#card-rainfall',
            placement: 'right',
            badge: 'PRECISION RAIN CONTROL',
            title: 'Manual Rainfall Intensity',
            icon: 'sliders',
            desc: 'Need custom precipitation? Use this slider to dynamically adjust rainfall rate from 0 mm/h up to 1000 mm/h in real time while the simulation runs.',
            tip: 'The active intensity badge displays the exact precipitation depth currently being injected across each DEM elevation cell.'
        },
        {
            id: 'bulk-pipe',
            target: '#card-bulk-pipe',
            placement: 'right',
            badge: 'REGIONAL ENGINEERING',
            title: 'Bulk Pipe & Culvert Controls',
            icon: 'share-2',
            desc: 'Apply infrastructure changes across entire sectors (All, North, South, East, or West Half). Set uniform blockages or resize underground pipe diameters (0.3m to 3.0m) to model drainage upgrades and urban expansion.',
            tip: 'Try selecting "North Half" and setting 100% blockage to observe localized pooling in the northern subdivisions.'
        },
        {
            id: 'sim-speed',
            target: '#card-sim-speed',
            placement: 'right',
            badge: 'PLAYBACK CONTROLS',
            title: 'Playback & Simulation Speed',
            icon: 'gauge',
            desc: 'Play or pause the fluid simulation solver at any moment. Toggle simulation speeds (1x, 2x, 5x, 10x) or trigger offline finite-volume physics fast-forwarding to simulate hours of rainfall in just a few seconds.',
            tip: 'Press the Play button to commence rainfall accumulation and watch water flow gravitationally through the streets.'
        },
        {
            id: 'snapshot-rewind',
            target: '#card-snapshot',
            placement: 'right',
            badge: 'TIME-TRAVEL REWIND',
            title: 'Rewind to Snapshot',
            icon: 'history',
            desc: 'The engine records historical simulation snapshots automatically. Pick any prior timestamp from the dropdown and click "Go" to rewind water depths and drainage flows back to that exact instant in time.',
            tip: 'Rewinding lets you test different emergency drainage interventions from the exact same flood stage.'
        },
        {
            id: 'btn-reset',
            target: '#btn-reset',
            placement: 'right',
            badge: 'ENVIRONMENT RESTORE',
            title: 'Reset Simulation',
            icon: 'rotate-ccw',
            desc: 'Completely flushes all accumulated surface water, resets simulation time to 0s, clears temporary blockage overrides, and re-initializes the baseline digital twin.',
            tip: 'Use this anytime you want to clear the entire map and start an experiment from a dry baseline.'
        },
        {
            id: 'view-toggle',
            target: '#btn-view',
            placement: 'right',
            badge: 'GIS CAMERA MODES',
            title: '2D Orthographic / 3D Perspective View',
            icon: 'box',
            desc: 'Switch effortlessly between a 3D isometric perspective view (for exploring street contours, buildings, and water depths) and a true 2D top-down GIS orthographic map (for aerial hazard assessments).',
            tip: 'In 3D view: Left-click and drag to orbit, Right-click to pan, and Scroll to zoom in/out.'
        },
        {
            id: 'elevation-heatmap',
            target: '#btn-elev',
            placement: 'right',
            badge: 'TOPOGRAPHIC ANALYSIS',
            title: 'Digital Elevation Heatmap (DEM)',
            icon: 'mountain',
            desc: 'Overlays a dynamic elevation color gradient derived from real LiDAR DEM terrain data (1.0m green valleys to 65.4m red ridges) to reveal natural gravity flow paths and low-lying catchment basins.',
            tip: 'Water naturally flows down the elevation gradient into the emerald-green depression corridors.'
        },
        {
            id: 'xray-mode',
            target: '#btn-glass',
            placement: 'right',
            badge: 'UNDERGROUND VISUALIZATION',
            title: 'Underground Pipe X-Ray Mode',
            icon: 'eye',
            desc: 'Makes the terrain translucent like glass, illuminating the subterranean drainage network: 368 manhole nodes, 369 pipes, and 7 natural outfalls beneath the roads.',
            tip: 'Water flow pulses dynamically through active pipes toward downstream outfalls during runoff.'
        },
        {
            id: 'pipe-inspector',
            target: '#pipe-inspector',
            placement: 'left',
            badge: 'INDIVIDUAL CULVERTS',
            title: 'Interactive 3D Pipe Inspector',
            icon: 'wrench',
            desc: 'Hover over any pipe in the 3D viewport to inspect its live flow rate and diameter. Click on any pipe to open this inspector—here you can clear clogs, set specific blockage % (0–100%), or adjust its physical diameter.',
            tip: 'Any pipe can be selected in the 3D world with a single mouse click to inspect and fine-tune its hydraulic capacity.'
        },
        {
            id: 'layers-popover',
            target: '#layers-popover',
            placement: 'right',
            badge: 'LAYER FILTERS',
            title: 'Layer Visibility & GIS Filters',
            icon: 'layers',
            desc: 'Filter which visual elements are rendered: toggle 3D buildings, natural trees, OSM road networks, water surface, Barangay 168 boundary, zone borders, 3D area labels, drain nodes, and grid coordinates.',
            tip: 'Turn off buildings and greenery when you want an unobstructed, clean aerial flood depth map.'
        },
        {
            id: 'sitrep-panel',
            target: '#sitrep-panel',
            placement: 'left',
            badge: 'DISASTER RISK DASHBOARD',
            title: 'SitRep & Subdivision Zone Stats',
            icon: 'triangle-alert',
            desc: 'Live situational report for Barangay 168. Summarizes rain duration, inundated percentage, affected subdivisions, and peak flood depth. The zone table below tracks real-time flood status for each of the 8 subdivision zones.',
            tip: 'Each subdivision is classified in real time from SAFE (green) to ALERT, CRITICAL, or DISASTER (red) based on localized flood risk.'
        },
        {
            id: 'completion',
            target: null, // Center modal
            placement: 'center',
            badge: 'READY TO EXPLORE',
            title: 'You Are All Set!',
            icon: 'check-circle-2',
            desc: 'You now know all the analytical and simulation tools in Hydrodynamics! You can start the rain, test pipe blockages, and observe how the water responds across Barangay 168.',
            tip: 'Need a refresher? Click the Guide pill in the header or the (?) button on the floating map controls anytime.'
        }
    ];

    let currentStep = 0;
    let isActive = false;
    let sampleInspectorShown = false;
    let layersPopoverWasOpen = false;

    // DOM Elements
    let overlayEl = null;
    let spotlightEl = null;
    let popoverEl = null;

    /**
     * Build and inject the modal DOM structure
     */
    function createTourElements() {
        if (document.getElementById('tour-overlay')) return;

        // Overlay backdrop container
        overlayEl = document.createElement('div');
        overlayEl.id = 'tour-overlay';

        // Spotlight highlight box
        spotlightEl = document.createElement('div');
        spotlightEl.id = 'tour-spotlight';
        overlayEl.appendChild(spotlightEl);

        // Tour Popover Dialog
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
                    <i data-lucide="compass"></i> <span id="tour-badge-text">STEP 1 OF 16</span>
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
                <div class="tour-desc" id="tour-desc">Description text goes here.</div>
                <div class="tour-tip" id="tour-tip-wrap">
                    <i data-lucide="lightbulb"></i>
                    <span id="tour-tip-text">Pro tip goes here.</span>
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

        // Bind events inside the modal
        document.getElementById('tour-btn-close').addEventListener('click', () => endTour(true));
        document.getElementById('tour-btn-skip').addEventListener('click', () => endTour(true));
        document.getElementById('tour-btn-prev').addEventListener('click', prevStep);
        document.getElementById('tour-btn-next').addEventListener('click', nextStep);

        // Bind trigger buttons from the page
        bindTriggerButtons();

        // Keyboard navigation
        window.addEventListener('keydown', handleKeydown);

        // Resize & reposition
        window.addEventListener('resize', handleResize);
        window.addEventListener('scroll', handleResize, true);
    }

    function bindTriggerButtons() {
        const btnTut = document.getElementById('btn-tutorial');
        if (btnTut && !btnTut._tourBound) {
            btnTut.addEventListener('click', () => startTour(0));
            btnTut._tourBound = true;
        }

        const btnHeaderGuide = document.getElementById('btn-header-guide');
        if (btnHeaderGuide && !btnHeaderGuide._tourBound) {
            btnHeaderGuide.addEventListener('click', () => startTour(0));
            btnHeaderGuide._tourBound = true;
        }
    }

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
        setTimeout(() => {
            toast.classList.remove('visible');
        }, 3200);
    }

    function handleKeydown(e) {
        if (!isActive) return;
        if (e.key === 'Escape') {
            e.preventDefault();
            endTour(true);
        } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
            e.preventDefault();
            nextStep();
        } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            prevStep();
        }
    }

    let resizeTimer = null;
    function handleResize() {
        if (!isActive) return;
        if (resizeTimer) cancelAnimationFrame(resizeTimer);
        resizeTimer = requestAnimationFrame(() => {
            renderCurrentStep(false);
        });
    }

    /**
     * Start the tour from specified step
     */
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

    /**
     * Advance to next step
     */
    function nextStep() {
        if (currentStep < TOUR_STEPS.length - 1) {
            currentStep++;
            renderCurrentStep(true);
        } else {
            endTour(false);
        }
    }

    /**
     * Go back to previous step
     */
    function prevStep() {
        if (currentStep > 0) {
            currentStep--;
            renderCurrentStep(true);
        }
    }

    /**
     * End / dismiss the walkthrough
     */
    function endTour(skipped = false) {
        isActive = false;
        try {
            localStorage.setItem('hydro_walkthrough_seen', 'true');
        } catch (e) { }

        // Clean up temporary states
        if (sampleInspectorShown) {
            const pi = document.getElementById('pipe-inspector');
            if (pi) pi.style.display = 'none';
            sampleInspectorShown = false;
        }

        const layersPopover = document.getElementById('layers-popover');
        if (layersPopover && !layersPopoverWasOpen) {
            layersPopover.style.display = 'none';
        }

        if (popoverEl) popoverEl.classList.remove('visible');
        if (spotlightEl) spotlightEl.style.opacity = '0';

        setTimeout(() => {
            if (overlayEl) overlayEl.style.display = 'none';
            if (popoverEl) popoverEl.style.display = 'none';
        }, 220);

        if (skipped) {
            showToast('Tour skipped. Replay anytime using the Guide button or (?).');
        }
    }

    /**
     * Ensure targeted collapsible card or panel is visible & unhidden
     */
    function prepareTarget(step) {
        // 1. Ensure left UI panel is expanded
        const uiPanel = document.getElementById('ui');
        if (uiPanel && uiPanel.classList.contains('panel-hidden')) {
            uiPanel.classList.remove('panel-hidden');
            const panelToggle = document.getElementById('panel-toggle');
            if (panelToggle) panelToggle.innerHTML = '<i data-lucide="chevron-left"></i>';
        }

        // 2. If target is inside a collapsible card, open it
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                const card = el.closest('.collapsible-card');
                if (card && !card.classList.contains('open')) {
                    card.classList.add('open');
                }
                // Scroll target into view inside sidebar
                if (uiPanel && uiPanel.contains(el)) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }

        // 3. Special handling for Pipe Inspector step
        if (step.id === 'pipe-inspector') {
            const pi = document.getElementById('pipe-inspector');
            if (pi && (pi.style.display === 'none' || !pi.style.display)) {
                // Populate sample preview data
                const piId = document.getElementById('pi-id');
                const piNodes = document.getElementById('pi-nodes');
                const piDiam = document.getElementById('pi-diam');
                const piFlow = document.getElementById('pi-flow');
                const piBlock = document.getElementById('pi-block-pct');
                const piFill = document.getElementById('pi-fill');
                const piSlider = document.getElementById('pi-slider');
                const piBlockVal = document.getElementById('pi-blockage-val');
                const piDiamInput = document.getElementById('pi-diam-input');

                if (piId) piId.textContent = '#42 (Sample)';
                if (piNodes) piNodes.textContent = '14 → 15';
                if (piDiam) piDiam.textContent = '0.9m';
                if (piFlow) piFlow.textContent = '0.450 m³/s';
                if (piBlock) piBlock.textContent = '25%';
                if (piFill) {
                    piFill.style.width = '25%';
                    piFill.style.background = '#e67e22';
                }
                if (piSlider) piSlider.value = 25;
                if (piBlockVal) piBlockVal.textContent = '25%';
                if (piDiamInput) piDiamInput.value = 0.9;

                // Position centrally in clear 3D space
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

        // 4. Special handling for Layer Visibility popover step
        const layersPopover = document.getElementById('layers-popover');
        if (step.id === 'layers-popover') {
            if (layersPopover) {
                layersPopoverWasOpen = layersPopover.style.display === 'block';
                layersPopover.style.display = 'block';
            }
        } else if (step.id !== 'layers-popover' && layersPopover && !layersPopoverWasOpen) {
            layersPopover.style.display = 'none';
        }

        // 5. Special handling for SitRep panel step: expand the table body
        if (step.id === 'sitrep-panel') {
            const sitrepBody = document.getElementById('sitrep-body');
            const sitrepToggleBtn = document.getElementById('sitrep-toggle-btn');
            const sitrepHeader = document.getElementById('sitrep-header');
            if (sitrepBody && (sitrepBody.style.display === 'none' || !sitrepBody.style.display)) {
                sitrepBody.style.display = 'block';
                if (sitrepToggleBtn) sitrepToggleBtn.innerHTML = '<i data-lucide="minus"></i>';
                if (sitrepHeader) sitrepHeader.style.borderBottom = '1px solid rgba(255, 255, 255, 0.06)';
            }
        }
    }

    /**
     * Render the active step into popover and reposition spotlight
     */
    function renderCurrentStep(animate = true) {
        const step = TOUR_STEPS[currentStep];
        if (!step) return;

        prepareTarget(step);

        // Update progress bar
        const progressPct = ((currentStep + 1) / TOUR_STEPS.length) * 100;
        const progressFill = document.getElementById('tour-progress-fill');
        if (progressFill) progressFill.style.width = `${progressPct}%`;

        // Update step counter & badge
        const badgeText = document.getElementById('tour-badge-text');
        if (badgeText) {
            badgeText.textContent = `STEP ${currentStep + 1} OF ${TOUR_STEPS.length} • ${step.badge}`;
        }

        // Title and icon
        const titleText = document.getElementById('tour-title-text');
        const titleIcon = document.getElementById('tour-title-icon');
        if (titleText) titleText.textContent = step.title;
        if (titleIcon) titleIcon.setAttribute('data-lucide', step.icon || 'info');

        // Description & tip
        const descEl = document.getElementById('tour-desc');
        if (descEl) descEl.textContent = step.desc;

        const tipWrap = document.getElementById('tour-tip-wrap');
        const tipText = document.getElementById('tour-tip-text');
        if (step.tip) {
            if (tipWrap) tipWrap.style.display = 'flex';
            if (tipText) tipText.textContent = step.tip;
        } else {
            if (tipWrap) tipWrap.style.display = 'none';
        }

        // Navigation button labels
        const prevBtn = document.getElementById('tour-btn-prev');
        const nextBtn = document.getElementById('tour-btn-next');
        if (prevBtn) {
            prevBtn.disabled = currentStep === 0;
        }
        if (nextBtn) {
            if (currentStep === TOUR_STEPS.length - 1) {
                nextBtn.innerHTML = `Finish Tour <i data-lucide="check"></i>`;
            } else {
                nextBtn.innerHTML = `Next <i data-lucide="chevron-right"></i>`;
            }
        }

        // Re-render Lucide icons
        if (window.lucide) lucide.createIcons();

        // Calculate geometry and position
        positionStep(step, animate);
    }

    /**
     * Calculate and position the spotlight cutout and popover
     */
    function positionStep(step, animate) {
        const margin = 8;
        const popoverWidth = popoverEl.offsetWidth || 380;
        const popoverHeight = popoverEl.offsetHeight || 280;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        let targetRect = null;
        if (step.target) {
            const el = document.querySelector(step.target);
            if (el) {
                targetRect = el.getBoundingClientRect();
            }
        }

        if (!targetRect || step.placement === 'center') {
            // Center modal (no specific spotlight target)
            spotlightEl.style.opacity = '0';
            spotlightEl.classList.remove('pulse');

            popoverEl.setAttribute('data-placement', 'center');
            popoverEl.style.left = `${Math.max(16, (windowWidth - popoverWidth) / 2)}px`;
            popoverEl.style.top = `${Math.max(16, (windowHeight - popoverHeight) / 2)}px`;
            return;
        }

        // Move and size spotlight
        const spotLeft = Math.max(0, targetRect.left - margin);
        const spotTop = Math.max(0, targetRect.top - margin);
        const spotWidth = targetRect.width + margin * 2;
        const spotHeight = targetRect.height + margin * 2;

        spotlightEl.style.left = `${spotLeft}px`;
        spotlightEl.style.top = `${spotTop}px`;
        spotlightEl.style.width = `${spotWidth}px`;
        spotlightEl.style.height = `${spotHeight}px`;
        spotlightEl.style.opacity = '1';
        spotlightEl.classList.add('pulse');

        // Determine best popover placement
        let placement = step.placement || 'right';
        let popLeft = 0;
        let popTop = 0;

        if (placement === 'right') {
            popLeft = spotLeft + spotWidth + 14;
            popTop = spotTop + (spotHeight / 2) - (popoverHeight / 2);

            // Flip to left if overflowing right screen edge
            if (popLeft + popoverWidth > windowWidth - 16) {
                if (spotLeft - popoverWidth - 14 > 16) {
                    placement = 'left';
                    popLeft = spotLeft - popoverWidth - 14;
                } else {
                    placement = 'bottom';
                    popLeft = Math.max(16, spotLeft);
                    popTop = spotTop + spotHeight + 14;
                }
            }
        } else if (placement === 'left') {
            popLeft = spotLeft - popoverWidth - 14;
            popTop = spotTop + (spotHeight / 2) - (popoverHeight / 2);

            // Flip to right if overflowing left screen edge
            if (popLeft < 16) {
                if (spotLeft + spotWidth + popoverWidth + 14 < windowWidth - 16) {
                    placement = 'right';
                    popLeft = spotLeft + spotWidth + 14;
                } else {
                    placement = 'bottom';
                    popLeft = Math.max(16, spotLeft);
                    popTop = spotTop + spotHeight + 14;
                }
            }
        }

        // Clamp popTop so popover stays on screen
        popTop = Math.max(16, Math.min(popTop, windowHeight - popoverHeight - 16));
        popLeft = Math.max(16, Math.min(popLeft, windowWidth - popoverWidth - 16));

        popoverEl.setAttribute('data-placement', placement);
        popoverEl.style.left = `${popLeft}px`;
        popoverEl.style.top = `${popTop}px`;
    }

    /**
     * Check if first time user, offer optional subtle auto-prompt
     */
    function checkFirstVisit() {
        try {
            const seen = localStorage.getItem('hydro_walkthrough_seen');
            if (!seen) {
                // Wait for simulation building loading screen to clear
                const checkReady = setInterval(() => {
                    const loading = document.getElementById('loading');
                    if (!loading || loading.style.display === 'none') {
                        clearInterval(checkReady);
                        setTimeout(() => {
                            // Show first-time tour welcome
                            startTour(0);
                        }, 1200);
                    }
                }, 500);
            }
        } catch (e) { }
    }

    // Expose global interface
    window.HydroTutorial = {
        start: startTour,
        next: nextStep,
        prev: prevStep,
        end: endTour,
        isActive: () => isActive
    };

    // Auto-init on DOMContentLoaded
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
