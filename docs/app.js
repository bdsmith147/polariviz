// app.js
// ─────────────────────────────────────────────────────────────────────────────
// Event wiring for PolariViz static site.
// Direct JavaScript port of the Dash callback logic in app.py.
//
// Depends on (loaded before this file):
//   math_helpers.js, physics.js, traces.js
//
// FILE STRUCTURE:
//   1. Tab switching
//   2. Slider ↔ number-input sync
//   3. Camera helpers
//   4. updateAll() — master render function
//   5. Density bar depth-sort on rotation
//   6. Initialization
// ─────────────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// 1. TAB SWITCHING
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Activate one tab pane within a named group.
 *
 * groupId : string prefix shared by all pane IDs in this group
 *           (e.g. 'ctrl' → panes are 'ctrl-geometry', 'ctrl-polarization')
 * paneId  : suffix of the pane to show (e.g. 'geometry')
 * btn     : the <button> element that was clicked
 *
 * After switching, any Plotly div inside the newly-visible pane is resized
 * so Plotly knows its true pixel dimensions.
 */
function activateTab(groupId, paneId, btn) {
    // Deactivate all sibling tab buttons
    btn.parentElement.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active');
    });
    btn.classList.add('active');

    // Find all panes whose id starts with groupId + '-'
    const prefix = groupId + '-';
    document.querySelectorAll(`[id^="${prefix}"]`).forEach(pane => {
        if (!pane.classList.contains('tab-pane')) return;
        pane.classList.remove('active');
    });

    const target = document.getElementById(prefix + paneId);
    if (target) {
        target.classList.add('active');
        // Resize any Plotly plot inside the newly-visible pane
        target.querySelectorAll('.js-plotly-plot').forEach(el => {
            Plotly.Plots.resize(el);
        });
    }
}


// ══════════════════════════════════════════════════════════════════════════════
// 2. SLIDER ↔ NUMBER-INPUT SYNC
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Wire one (slider, number-input) pair so they stay in sync and both
 * trigger updateAll() on change.
 *
 * sliderId : id of the <input type="range">
 * inputId  : id of the companion <input type="number">
 */
function linkSlider(sliderId, inputId) {
    const slider = document.getElementById(sliderId);
    const input  = document.getElementById(inputId);
    if (!slider || !input) return;

    const lo = parseFloat(slider.min);
    const hi = parseFloat(slider.max);

    // Slider moved → update number box, then re-render
    slider.addEventListener('input', () => {
        input.value = slider.value;
        updateAll();
    });

    // Number box changed → clamp, push to slider, then re-render
    input.addEventListener('change', () => {
        let v = parseFloat(input.value);
        if (isNaN(v)) v = lo;
        v = Math.max(lo, Math.min(hi, v));
        input.value = v;
        slider.value = v;
        updateAll();
    });
}


// ══════════════════════════════════════════════════════════════════════════════
// 3. CAMERA HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Return the current scene camera from a Plotly 3D plot, or null.
 * Plotly stores the live layout on the DOM element after the first render.
 */
function getCamera(divId) {
    const el = document.getElementById(divId);
    if (!el || !el.layout) return null;
    const scene = el.layout.scene;
    return (scene && scene.camera) ? scene.camera : null;
}

/**
 * Inject a camera object into a figure's scene layout (mutates in place).
 * No-op if camera is null/undefined.
 */
function applyCamera(layout, camera) {
    if (!camera) return;
    layout.scene = layout.scene || {};
    layout.scene.camera = camera;
}


// ══════════════════════════════════════════════════════════════════════════════
// 4. updateAll() — MASTER RENDER FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Read all controls, run the physics pipeline, build every figure,
 * and push them to Plotly.react().
 *
 * Mirrors the update_all() Dash callback in app.py.
 */
function updateAll() {

    // ── Read slider values ────────────────────────────────────────────────────
    const theta  = parseFloat(document.getElementById('slider-theta').value)  || 0;
    const phi    = parseFloat(document.getElementById('slider-phi').value)    || 0;
    const chi    = parseFloat(document.getElementById('slider-chi').value)    || 0;
    const thetaB = parseFloat(document.getElementById('slider-theta_b').value) || 0;
    const phiB   = parseFloat(document.getElementById('slider-phi_b').value)  || 0;
    const alpha1 = parseFloat(document.getElementById('slider-alpha1').value) || 0;
    const alpha2 = parseFloat(document.getElementById('slider-alpha2').value) || 0;
    const alpha3 = parseFloat(document.getElementById('slider-alpha3').value) || 0;

    // ── Read polarization mode (which inner tab is active) ────────────────────
    // The active pol-* pane id tells us the mode.
    let inputMode = 'basis';
    if (document.getElementById('pol-waveplate') &&
        document.getElementById('pol-waveplate').classList.contains('active')) {
        inputMode = 'waveplate';
    }

    // ── Read basis state radio ────────────────────────────────────────────────
    const basisRadio = document.querySelector('input[name="basis-radio"]:checked');
    const basisState = basisRadio ? basisRadio.value : 'sigma_plus';

    // ── Run physics pipeline ──────────────────────────────────────────────────
    const result = computeAll({
        thetaRad:  degreesToRadians(theta),
        phiRad:    degreesToRadians(phi),
        chiRad:    degreesToRadians(chi),
        thetaBRad: degreesToRadians(thetaB),
        phiBRad:   degreesToRadians(phiB),
        inputMode: inputMode,
        basisState: inputMode === 'basis' ? basisState : null,
        alpha1Rad: degreesToRadians(alpha1),
        alpha2Rad: degreesToRadians(alpha2),
        alpha3Rad: degreesToRadians(alpha3),
    });

    // ── 3D figure — preserve camera orientation across renders ────────────────
    const fig3d = make3dFigure(result);
    applyCamera(fig3d.layout, getCamera('plot-3d'));
    Plotly.react('plot-3d', fig3d.data, fig3d.layout);

    // ── Level diagram ─────────────────────────────────────────────────────────
    const figLevel = makeLevelFigure(result);
    Plotly.react('plot-level', figLevel.data, figLevel.layout);

    // ── Transition amplitudes table ───────────────────────────────────────────
    const figAmplitudes = makeAmplitudesFigure(result);
    Plotly.react('plot-amplitudes', figAmplitudes.data, figAmplitudes.layout);

    // ── Density matrix — preserve camera; use it for depth-sort ──────────────
    const dmCamera = getCamera('plot-density');
    const figDensity = makeDensityFigure(
        result,
        dmCamera ? { eye: dmCamera.eye } : null,
    );
    applyCamera(figDensity.layout, dmCamera);
    Plotly.react('plot-density', figDensity.data, figDensity.layout);

    // ── Polarization ellipse (2D) ─────────────────────────────────────────────
    const figEllipse = makeEllipseFigure(result);
    Plotly.react('plot-ellipse', figEllipse.data, figEllipse.layout);

    // ── Poincaré sphere — preserve camera ────────────────────────────────────
    const figPoincare = makePoincareFigure(result);
    applyCamera(figPoincare.layout, getCamera('plot-poincare'));
    Plotly.react('plot-poincare', figPoincare.data, figPoincare.layout);

    // ── Stokes table ──────────────────────────────────────────────────────────
    const figStokes = makeStokesFigure(result);
    Plotly.react('plot-stokes', figStokes.data, figStokes.layout);
}


// ══════════════════════════════════════════════════════════════════════════════
// 5. DENSITY BAR DEPTH-SORT ON ROTATION
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Whenever the user rotates the density matrix 3D plot, re-sort the 9
 * Mesh3d bar traces by distance from the new camera eye (painter's algorithm).
 * This ensures semi-transparent faces composite correctly.
 *
 * Mirrors the resort_density_bars() Dash callback in app.py.
 */
function initDensityDepthSort() {
    const el = document.getElementById('plot-density');
    if (!el) return;

    el.on('plotly_relayout', function (eventData) {
        if (!eventData || !eventData['scene.camera']) return;

        const camera = eventData['scene.camera'];
        const eye    = camera.eye || { x: 1.25, y: 1.25, z: 1.25 };
        const ex = eye.x !== undefined ? eye.x : 1.25;
        const ey = eye.y !== undefined ? eye.y : 1.25;
        const ez = eye.z !== undefined ? eye.z : 1.25;

        // Separate mesh3d bars from any other traces
        const allTraces   = el.data;
        const meshTraces  = allTraces.filter(t => t.type === 'mesh3d');
        const otherTraces = allTraces.filter(t => t.type !== 'mesh3d');

        // Depth = squared distance from camera eye to bar centre
        function distSq(trace) {
            const xs = trace.x, ys = trace.y;
            const xc = (Math.min(...xs) + Math.max(...xs)) / 2;
            const yc = (Math.min(...ys) + Math.max(...ys)) / 2;
            return (xc - ex) ** 2 + (yc - ey) ** 2 + ez ** 2;
        }

        meshTraces.sort((a, b) => distSq(b) - distSq(a));   // farthest first

        // Preserve the camera in the layout so the view doesn't jump
        const newLayout = Object.assign({}, el.layout);
        newLayout.scene = Object.assign({}, el.layout.scene);
        newLayout.scene.camera = camera;

        Plotly.react('plot-density', otherTraces.concat(meshTraces), newLayout);
    });
}


// ══════════════════════════════════════════════════════════════════════════════
// 6. INITIALIZATION
// ══════════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', function () {

    // Wire all sliders to their companion number inputs
    [
        ['slider-theta',   'input-theta'],
        ['slider-phi',     'input-phi'],
        ['slider-chi',     'input-chi'],
        ['slider-theta_b', 'input-theta_b'],
        ['slider-phi_b',   'input-phi_b'],
        ['slider-alpha1',  'input-alpha1'],
        ['slider-alpha2',  'input-alpha2'],
        ['slider-alpha3',  'input-alpha3'],
    ].forEach(([sid, iid]) => linkSlider(sid, iid));

    // Radio buttons trigger a full re-render
    document.querySelectorAll('input[name="basis-radio"]').forEach(radio => {
        radio.addEventListener('change', updateAll);
    });

    // Initial render — populates all plots on page load
    updateAll();

    // Attach density depth-sort listener (must happen after first render
    // so Plotly has created the .on() method on the div element)
    initDensityDepthSort();
});
