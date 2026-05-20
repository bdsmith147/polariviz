// traces.js
// ─────────────────────────────────────────────────────────────────────────────
// Plotly.js figure builders for PolariViz.
// Direct JavaScript port of traces.py.
//
// Every function here is PURE:
//   - Takes numbers / plain objects (from computeAll() result)
//   - Returns a {data, layout} object for Plotly.newPlot / Plotly.react
//   - No DOM manipulation, no callbacks, no global state
//
// Depends on: math_helpers.js (must be loaded first)
//
// FILE STRUCTURE:
//   1. Constants & color scheme
//   2. 3D scene helpers  (arrow, sphere, axes — return trace objects)
//   3. make3dFigure()
//   4. makeLevelFigure()
//   5. makeDensityFigure()
//   6. makeAmplitudesFigure()
//   7. makeStokesFigure()
//   8. makeEllipseFigure()
//   9. makePoincareFigure()
// ─────────────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// 1. CONSTANTS & COLOR SCHEME
// ══════════════════════════════════════════════════════════════════════════════

// ── Arrow / scene geometry ────────────────────────────────────────────────────
const L_ARROW       = 1.0;    // length of k̂ and quantization axis arrows
const L_EAXES       = 0.5;    // length of ê₁, ê₂ axes
const R_SPHERE      = 0.15;   // atom cloud radius
const SCENE_RANGE   = 1.6;    // ± axis range for 3D scene
const ELLIPSE_SCALE = 0.35;   // max radius of polarization ellipse (scene units)

// ── Colors ────────────────────────────────────────────────────────────────────
const COLOR_K_ARROW     = '#E63946';   // red      — k̂ vector
const COLOR_QUANT       = '#457B9D';   // blue     — quantization axis
const COLOR_EAXES       = '#2A9D8F';   // teal     — ê₁ and ê₂
const COLOR_ELLIPSE     = '#FF4444';   // red      — polarization ellipse in 3D
const COLOR_SPHERE      = '#A8DADC';   // pale blue — atom cloud
const COLOR_LAB_AXES    = '#8888A8';   // blue-gray — x, y, z reference lines
const COLOR_SIGMA_PLUS  = '#E63946';   // red      — σ+ transitions
const COLOR_PI          = '#2A9D8F';   // teal     — π  transitions
const COLOR_SIGMA_MINUS = '#457B9D';   // blue     — σ- transitions
const COLOR_BG          = '#1A1A2E';   // dark navy — figure background
const COLOR_PAPER       = '#16213E';   // slightly lighter — paper background
const COLOR_TEXT        = '#D3D3D3';   // light grey — plot labels and annotations
const COLOR_LAB_AXES_TEXT = '#8888A8'; // blue-gray — axis labels

// ── Level diagram layout (in normalized figure units 0–1) ─────────────────────
const LEVEL_J0_Y       = 0.15;  // y position of J=0 ground level line
const LEVEL_J1_Y       = 0.80;  // y position of J=1 excited level line
const LEVEL_MJ_XS      = { plus1: 0.75, zero: 0.50, minus1: 0.25 };
const LEVEL_LINE_HALF_W = 0.10; // half-width of each level line segment

// ── Density matrix bar chart ──────────────────────────────────────────────────
const DM_BAR_WIDTH = 0.6;   // width of each bar in x and y
const DM_BAR_GAP   = 1.0;   // cell size (bars spaced 1.0 apart)


// ══════════════════════════════════════════════════════════════════════════════
// 2. 3D SCENE HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function _coneMesh(tipPos, direction, baseRadius, height, color, name, nSides = 24) {
    /**
     * Build a cone as a Mesh3d trace with independent baseRadius and height.
     *
     * tipPos    : [x, y, z] world position of the sharp tip
     * direction : [u, v, w] vector pointing FROM base TOWARD tip (need not be unit)
     * baseRadius: radius of the circular base
     * height    : distance from base centre to tip
     * nSides    : polygon approximation
     */
    const mag = norm(direction);
    if (mag < 1e-10) return null;
    const d = normalize(direction);

    // Base centre: step back from tip along arrow direction
    const baseCenter = subtract(tipPos, scale(d, height));

    // Two orthonormal vectors spanning the plane perpendicular to d
    const arb = (Math.abs(d[0]) < 0.9) ? [1.0, 0.0, 0.0] : [0.0, 1.0, 0.0];
    const uVec = normalize(cross(d, arb));
    const vVec = cross(d, uVec);    // already unit since d ⊥ uVec, both unit

    // Base circle vertices
    const baseVerts = [];
    for (let s = 0; s < nSides; s++) {
        const a  = 2.0 * Math.PI * s / nSides;
        const ca = Math.cos(a), sa = Math.sin(a);
        const p  = add(baseCenter,
                       add(scale(uVec, baseRadius * ca),
                           scale(vVec, baseRadius * sa)));
        baseVerts.push(p);
    }

    // Vertex list: base ring (0..nSides-1), tip (nSides), base centre (nSides+1)
    const tipIdx    = nSides;
    const centerIdx = nSides + 1;
    const allVerts  = baseVerts.concat([Array.from(tipPos), Array.from(baseCenter)]);

    const xs = allVerts.map(v => v[0]);
    const ys = allVerts.map(v => v[1]);
    const zs = allVerts.map(v => v[2]);

    const ii = [], jj = [], kk = [];
    for (let s = 0; s < nSides; s++) {
        const ns = (s + 1) % nSides;
        // Side triangle: tip → base[s] → base[s+1]
        ii.push(tipIdx);    jj.push(s);   kk.push(ns);
        // Base triangle:  centre → base[s+1] → base[s]
        ii.push(centerIdx); jj.push(ns);  kk.push(s);
    }

    return {
        type: 'mesh3d',
        x: xs, y: ys, z: zs,
        i: ii, j: jj, k: kk,
        color: color,
        opacity: 1.0,
        name: name,
        showlegend: false,
        hoverinfo: 'name',
        flatshading: false,
        lighting: { ambient: 0.6, diffuse: 0.6, specular: 0.2 },
    };
}


function _arrowTraces(tail, tip, color, name, lineWidth = 5,
                      coneSize = 0.07, coneRadius = null, coneHeight = null) {
    /**
     * Build a 3D arrow as a Scatter3d shaft + Mesh3d cone head.
     *
     * coneRadius / coneHeight override coneSize when provided.
     * The shaft is trimmed to exactly meet the cone base.
     *
     * Returns an array of trace objects: [shaft, head].
     */
    const direction = subtract(tip, tail);
    const mag = norm(direction);
    if (mag < 1e-10) return [];

    // Cone dimensions
    const cHeight = (coneHeight !== null) ? coneHeight : coneSize;
    const cRadius = (coneRadius !== null) ? coneRadius : coneSize / 3.0;

    // Shaft ends exactly at the cone base
    const d = normalize(direction);
    const shaftEnd = subtract(tip, scale(d, cHeight));

    const shaft = {
        type: 'scatter3d',
        x: [tail[0], shaftEnd[0]],
        y: [tail[1], shaftEnd[1]],
        z: [tail[2], shaftEnd[2]],
        mode: 'lines',
        line: { color: color, width: lineWidth },
        name: name,
        showlegend: true,
        hoverinfo: 'name',
    };

    const head = _coneMesh(tip, direction, cRadius, cHeight, color, name);
    if (head === null) return [shaft];
    return [shaft, head];
}


function _dashedLineTrace(tail, tip, color, name, opacity = 0.6, width = 3) {
    /**
     * A dotted 3D line from tail to tip — used for ê₁, ê₂ axes.
     *
     * Plotly Scatter3d doesn't natively support dashed lines in 3D,
     * so we approximate by placing dots along the line.
     * Returns a single scatter3d trace object.
     */
    const n = 20;
    const ts = linspace(0, 1, n);
    const xs = ts.map(t => tail[0] + t * (tip[0] - tail[0]));
    const ys = ts.map(t => tail[1] + t * (tip[1] - tail[1]));
    const zs = ts.map(t => tail[2] + t * (tip[2] - tail[2]));
    return {
        type: 'scatter3d',
        x: xs, y: ys, z: zs,
        mode: 'markers',
        marker: { size: 3, color: color, opacity: opacity },
        name: name,
        showlegend: true,
        hoverinfo: 'name',
    };
}


function _sphereSurfaceTrace(radius, color, opacity, name) {
    /**
     * A smooth sphere surface centered at origin using a surface trace.
     *
     * Parameterized as:
     *   x = r sinθ cosφ
     *   y = r sinθ sinφ
     *   z = r cosθ
     *
     * Returns a single surface trace object.
     */
    const nTheta = 24, nPhi = 24;
    const thetas = linspace(0, Math.PI, nTheta);
    const phis   = linspace(0, 2 * Math.PI, nPhi);

    const xs = thetas.map(th => phis.map(ph => radius * Math.sin(th) * Math.cos(ph)));
    const ys = thetas.map(th => phis.map(ph => radius * Math.sin(th) * Math.sin(ph)));
    const zs = thetas.map(th => phis.map(ph => radius * Math.cos(th)));

    return {
        type: 'surface',
        x: xs, y: ys, z: zs,
        colorscale: [[0, color], [1, color]],
        opacity: opacity,
        showscale: false,
        name: name,
        hoverinfo: 'name',
        lighting: { ambient: 0.8, diffuse: 0.5 },
    };
}


function _labAxesTraces() {
    /**
     * Three thin reference lines along lab x, y, z axes.
     * Returns an array of 3 scatter3d trace objects.
     */
    const axes = [
        [[1, 0, 0], 'x'],
        [[0, 1, 0], 'y'],
        [[0, 0, 1], 'z'],
    ];
    return axes.map(([direction, label]) => {
        const tip = scale(direction, SCENE_RANGE * 0.9);
        return {
            type: 'scatter3d',
            x: [0, tip[0]],
            y: [0, tip[1]],
            z: [0, tip[2]],
            mode: 'lines+text',
            line: { color: COLOR_LAB_AXES, width: 3 },
            text: ['', label],
            textposition: 'top center',
            textfont: { color: COLOR_LAB_AXES_TEXT, size: 12 },
            name: `${label}-axis`,
            showlegend: false,
            hoverinfo: 'none',
        };
    });
}


function _ellipseTraces(xs, ys, zs, kTail, color, opacity, name) {
    /**
     * Polarization ellipse as a closed scatter3d line.
     *
     * The ellipse coordinates (xs, ys, zs) are centered at the origin.
     * Here we shift them to be centered at kTail and scale to ELLIPSE_SCALE.
     *
     * Returns a single scatter3d trace object.
     */
    const n = xs.length;
    let maxR = 0;
    for (let i = 0; i < n; i++) {
        const r = Math.sqrt(xs[i]**2 + ys[i]**2 + zs[i]**2);
        if (r > maxR) maxR = r;
    }
    if (maxR < 1e-10) maxR = 1.0;

    const sf = ELLIPSE_SCALE / maxR;

    const ex = xs.map(x => kTail[0] + x * sf);
    const ey = ys.map(y => kTail[1] + y * sf);
    const ez = zs.map(z => kTail[2] + z * sf);

    // Close the loop
    ex.push(ex[0]); ey.push(ey[0]); ez.push(ez[0]);

    return {
        type: 'scatter3d',
        x: ex, y: ey, z: ez,
        mode: 'lines',
        line: { color: color, width: 2 },
        opacity: opacity,
        name: name,
        showlegend: true,
        hoverinfo: 'name',
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// 3. make3dFigure()
// ══════════════════════════════════════════════════════════════════════════════

function make3dFigure(result, showEllipse = true, showEaxes = true) {
    /**
     * Build the main 3D scene figure.
     *
     * result:       object from computeAll()
     * showEllipse:  bool — show polarization ellipse
     * showEaxes:    bool — show ê₁, ê₂ frame axes
     *
     * Returns {data, layout}.
     */
    const kHat     = result.kHat;
    const e1       = result.e1;
    const e2       = result.e2;
    const qAxis    = result.quantAxis;
    const ellipseXs = result.ellipseXs;
    const ellipseYs = result.ellipseYs;
    const ellipseZs = result.ellipseZs;

    // ── Derived geometry ──────────────────────────────────────────────────────
    const kTail  = scale(kHat, -L_ARROW);
    const kTip   = scale(kHat, -R_SPHERE * 1.2);

    const qTip   = scale(qAxis, L_ARROW / 2);

    const e1Tail = kTail;
    const e1Tip  = add(kTail, scale(e1, L_EAXES));
    const e2Tail = kTail;
    const e2Tip  = add(kTail, scale(e2, L_EAXES));

    // ── Assemble traces ───────────────────────────────────────────────────────
    let traces = [];

    // 1. Lab reference axes (background, unobtrusive)
    traces = traces.concat(_labAxesTraces());

    // 2. Atom cloud sphere
    traces.push(_sphereSurfaceTrace(R_SPHERE, COLOR_SPHERE, 0.5, 'Atom cloud'));

    // 3. Quantization axis
    traces = traces.concat(_arrowTraces(
        [0, 0, 0], qTip,
        COLOR_QUANT, 'Quantization axis',
        10, 0.07, 0.075, 0.15));

    // 4. k̂ vector (most prominent arrow)
    traces = traces.concat(_arrowTraces(
        kTail, kTip,
        COLOR_K_ARROW, 'k (beam)',
        20, 0.07, 0.135, 0.27));

    // 5. ê₁, ê₂ axes (subtle, checkbox-gated)
    if (showEaxes) {
        traces.push(_dashedLineTrace(e1Tail, e1Tip, COLOR_EAXES, 'ê₁', 0.6));
        traces.push(_dashedLineTrace(e2Tail, e2Tip, COLOR_EAXES, 'ê₂', 0.6));
    }

    // 6. Polarization ellipse (subtle, checkbox-gated)
    if (showEllipse) {
        traces.push(_ellipseTraces(
            ellipseXs, ellipseYs, ellipseZs,
            kTail, COLOR_ELLIPSE, 0.7, 'Polarization ellipse'));
    }

    // ── Layout ────────────────────────────────────────────────────────────────
    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 0, r: 0, t: 30, b: 0 },
        title: { text: '3D Scene', font: { color: COLOR_TEXT, size: 13 }, x: 0.5 },
        legend: {
            font: { color: '#D0D0D0', size: 11 },
            bgcolor: 'rgba(16, 20, 40, 0.80)',
            bordercolor: '#2A2A4A',
            borderwidth: 1,
            x: 0.01, y: 0.99,
        },
        scene: {
            bgcolor: COLOR_BG,
            xaxis: {
                range: [-SCENE_RANGE, SCENE_RANGE],
                showticklabels: false,
                showgrid: true, gridcolor: '#333355',
                zeroline: false, title: '',
            },
            yaxis: {
                range: [-SCENE_RANGE, SCENE_RANGE],
                showticklabels: false,
                showgrid: true, gridcolor: '#333355',
                zeroline: false, title: '',
            },
            zaxis: {
                range: [-SCENE_RANGE, SCENE_RANGE],
                showticklabels: false,
                showgrid: true, gridcolor: '#333355',
                zeroline: false, title: '',
            },
            aspectmode: 'cube',
            camera: {
                eye: { x: 0.75, y: 0.75, z: 0.75 },
                up:  { x: 0, y: 0, z: 1 },
            },
        },
    };

    return { data: traces, layout };
}


// ══════════════════════════════════════════════════════════════════════════════
// 4. makeLevelFigure()
// ══════════════════════════════════════════════════════════════════════════════

function makeLevelFigure(result) {
    /**
     * Build the J=0 → J=1 energy level diagram.
     *
     * Arrow width ∝ absorption strength.
     * Arrow color encodes transition type (σ+/π/σ-).
     * Percentage label next to each arrowhead.
     *
     * Returns {data, layout}.
     */
    const absorption = result.absorption;
    const sp  = absorption.mJ_plus1;
    const pi  = absorption.mJ_0;
    const sm  = absorption.mJ_minus1;
    const total = (sp + pi + sm) > 0 ? (sp + pi + sm) : 1.0;

    const pct = {
        plus1:  100 * sp / total,
        zero:   100 * pi / total,
        minus1: 100 * sm / total,
    };

    const maxAbs = Math.max(sp, pi, sm) > 0 ? Math.max(sp, pi, sm) : 1.0;
    const MAX_WIDTH = 12, MIN_WIDTH = 1;
    function arrowWidth(strength) {
        return Math.max(MIN_WIDTH, (strength / maxAbs) * MAX_WIDTH);
    }
    const widths = {
        plus1:  arrowWidth(sp),
        zero:   arrowWidth(pi),
        minus1: arrowWidth(sm),
    };

    const colors = {
        plus1:  COLOR_SIGMA_PLUS,
        zero:   COLOR_PI,
        minus1: COLOR_SIGMA_MINUS,
    };

    const labels = {
        plus1:  'σ+',
        zero:   'π',
        minus1: 'σ-',
    };

    const angles = {
        plus1:  35,
        zero:   0,
        minus1: -35,
    };

    let traces = [];

    // ── J=0 ground level line ─────────────────────────────────────────────────
    traces.push({
        type: 'scatter',
        x: [0.5 - LEVEL_LINE_HALF_W, 0.5 + LEVEL_LINE_HALF_W],
        y: [LEVEL_J0_Y, LEVEL_J0_Y],
        mode: 'lines',
        line: { color: COLOR_TEXT, width: 2 },
        name: 'J=0',
        showlegend: false,
        hoverinfo: 'none',
    });
    traces.push({
        type: 'scatter',
        x: [0.05], y: [LEVEL_J0_Y],
        mode: 'text',
        text: ['J=0'],
        textfont: { color: COLOR_TEXT, size: 12 },
        showlegend: false,
        hoverinfo: 'none',
    });

    // ── J=1 excited level lines (one per mJ sublevel) ─────────────────────────
    for (const [key, xCenter] of Object.entries(LEVEL_MJ_XS)) {
        traces.push({
            type: 'scatter',
            x: [xCenter - LEVEL_LINE_HALF_W, xCenter + LEVEL_LINE_HALF_W],
            y: [LEVEL_J1_Y, LEVEL_J1_Y],
            mode: 'lines',
            line: { color: COLOR_TEXT, width: 2 },
            showlegend: false,
            hoverinfo: 'none',
        });
    }

    // ── mJ sublevel labels ────────────────────────────────────────────────────
    const mjLabels = { plus1: 'mJ=+1', zero: 'mJ=0', minus1: 'mJ=-1' };
    for (const [key, xCenter] of Object.entries(LEVEL_MJ_XS)) {
        traces.push({
            type: 'scatter',
            x: [xCenter], y: [LEVEL_J1_Y + 0.08],
            mode: 'text',
            text: [mjLabels[key]],
            textfont: { color: COLOR_TEXT, size: 11 },
            showlegend: false,
            hoverinfo: 'none',
        });
    }

    // J=1 label
    traces.push({
        type: 'scatter',
        x: [0.05], y: [LEVEL_J1_Y],
        mode: 'text',
        text: ['J=1'],
        textfont: { color: COLOR_TEXT, size: 12 },
        showlegend: false,
        hoverinfo: 'none',
    });

    // ── Transition arrows ─────────────────────────────────────────────────────
    for (const [key, xCenter] of Object.entries(LEVEL_MJ_XS)) {
        const color    = colors[key];
        const width    = widths[key];
        const pctVal   = pct[key];
        const ang      = angles[key];

        // Arrow shaft (angled line from ground level toward sublevel)
        traces.push({
            type: 'scatter',
            x: [0.5 - (0.5 - xCenter) * 0.1, xCenter],
            y: [LEVEL_J0_Y + 0.04, LEVEL_J1_Y - 0.08],
            mode: 'lines',
            line: { color: color, width: width },
            name: labels[key],
            showlegend: true,
            hoverinfo: 'name',
        });

        // Arrowhead (triangle marker at tip)
        traces.push({
            type: 'scatter',
            x: [xCenter],
            y: [LEVEL_J1_Y - 0.08],
            mode: 'markers',
            marker: {
                symbol: 'triangle-up',
                size: Math.max(6, width * 1.5),
                color: color,
                angle: ang,
            },
            showlegend: false,
            hoverinfo: 'none',
        });

        // Percentage label next to arrowhead
        traces.push({
            type: 'scatter',
            x: [xCenter + 0.07],
            y: [LEVEL_J1_Y - 0.05],
            mode: 'text',
            text: [`${pctVal.toFixed(1)}%`],
            textfont: { color: color, size: 12 },
            showlegend: false,
            hoverinfo: 'none',
        });
    }

    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 10, r: 10, t: 30, b: 10 },
        title: {
            text: 'J=0 → J=1 Transitions',
            font: { color: COLOR_TEXT, size: 13 },
            x: 0.5,
        },
        xaxis: { range: [0, 1], showticklabels: false, showgrid: false, zeroline: false },
        yaxis: { range: [0, 1], showticklabels: false, showgrid: false, zeroline: false },
        legend: {
            font: { color: COLOR_TEXT, size: 11 },
            bgcolor: 'rgba(0,0,0,0)',
            x: 0.99, y: 0.05,
            xanchor: 'right',
        },
        showlegend: true,
    };

    return { data: traces, layout };
}


// ══════════════════════════════════════════════════════════════════════════════
// 5. makeDensityFigure()
// ══════════════════════════════════════════════════════════════════════════════

function _barMesh(xCenter, yCenter, height, color) {
    /**
     * Build a single rectangular prism (3D bar) using mesh3d.
     *
     * Centered at (xCenter, yCenter), footprint DM_BAR_WIDTH × DM_BAR_WIDTH,
     * rises from z=0 to z=height.
     *
     * Returns a single mesh3d trace object.
     */
    const hw = DM_BAR_WIDTH / 2;
    const x0 = xCenter - hw, x1 = xCenter + hw;
    const y0 = yCenter - hw, y1 = yCenter + hw;
    const z0 = 0.0, z1 = Math.max(height, 0.01);

    // 8 vertices of the box
    const vx = [x0, x1, x1, x0, x0, x1, x1, x0];
    const vy = [y0, y0, y1, y1, y0, y0, y1, y1];
    const vz = [z0, z0, z0, z0, z1, z1, z1, z1];

    // 12 triangles (2 per face × 6 faces), all wound CCW from outside
    // bottom(-z)  top(+z)    front(-y)  back(+y)   right(+x)  left(-x)
    const i = [0, 0,  4, 4,  0, 0,  2, 2,  1, 1,  0, 0];
    const j = [3, 2,  5, 6,  1, 5,  3, 7,  2, 6,  4, 7];
    const k = [2, 1,  6, 7,  5, 4,  7, 6,  6, 5,  7, 3];

    return {
        type: 'mesh3d',
        x: vx, y: vy, z: vz,
        i, j, k,
        color: color,
        opacity: 1.0,
        flatshading: true,
        showlegend: false,
        hoverinfo: 'skip',
    };
}


function _phaseToColor(phaseRad) {
    /**
     * Map a phase angle (radians) to an RGB hex color using HSV.
     *
     * Hue cycles through the full color wheel as phase goes 0 → 2π.
     * Returns a hex color string '#rrggbb'.
     */
    const hue = ((phaseRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    const s = 0.9, v = 0.9;
    const h6 = hue * 6.0;
    const hi = Math.floor(h6) % 6;
    const f  = h6 - Math.floor(h6);
    const p  = v * (1 - s);
    const q  = v * (1 - s * f);
    const t  = v * (1 - s * (1 - f));
    const rgbMap = [
        [v, t, p], [q, v, p], [p, v, t],
        [p, q, v], [t, p, v], [v, p, q],
    ];
    const [r, g, b] = rgbMap[hi];
    const ri = Math.round(r * 255), gi = Math.round(g * 255), bi = Math.round(b * 255);
    return '#' + ri.toString(16).padStart(2, '0')
               + gi.toString(16).padStart(2, '0')
               + bi.toString(16).padStart(2, '0');
}


function _makePhaseWheelSvg() {
    /**
     * Build an SVG color-wheel legend for the phase encoding used in the
     * density matrix figure.
     *
     * Layout (all in a 160×160 viewBox):
     *   - 72 annular segments (5° each), each colored by _phaseToColor
     *   - Phase increases counter-clockwise; phase=0 at 3-o'clock (right)
     *   - Black stroke on inner and outer border circles
     *   - Inward tick marks at 0°, 90°, 180°, 270°
     *   - Degree labels outside the ring at each tick
     *
     * Returns an SVG string.
     */
    const N        = 72;     // segments — 360/72 = 5° per segment
    const CX       = 80.0;   // centre x  (viewBox 160×160)
    const CY       = 80.0;   // centre y
    const R_OUT    = 52.0;   // outer radius
    const R_IN     = 32.0;   // inner radius  (ring width = 20)
    const TICK_LEN = 7.0;    // tick protrudes inward from outer edge
    const R_LABEL  = 65.0;   // label distance from centre
    const FONT_SZ  = 14;
    const BDR      = 1.5;    // border / tick stroke-width

    const dtheta = 2.0 * Math.PI / N;
    const parts  = [
        '<svg xmlns="http://www.w3.org/2000/svg"'
        + ' width="160" height="160" viewBox="0 0 160 160">',
    ];

    // ── Colored annular segments ──────────────────────────────────────────────
    // Phase=0 at 3-o'clock; increases counter-clockwise (standard math).
    // SVG y-axis points down: x = cx + r*cos(θ), y = cy − r*sin(θ).
    for (let i = 0; i < N; i++) {
        const t1 = i * dtheta;
        const t2 = t1 + dtheta;
        const ox1 = CX + R_OUT * Math.cos(t1), oy1 = CY - R_OUT * Math.sin(t1);
        const ox2 = CX + R_OUT * Math.cos(t2), oy2 = CY - R_OUT * Math.sin(t2);
        const ix1 = CX + R_IN  * Math.cos(t1), iy1 = CY - R_IN  * Math.sin(t1);
        const ix2 = CX + R_IN  * Math.cos(t2), iy2 = CY - R_IN  * Math.sin(t2);
        const col = _phaseToColor(t1);
        parts.push(
            `<path d="`
            + `M ${ox1.toFixed(3)},${oy1.toFixed(3)} `
            + `A ${R_OUT.toFixed(1)},${R_OUT.toFixed(1)} 0 0,0 ${ox2.toFixed(3)},${oy2.toFixed(3)} `
            + `L ${ix2.toFixed(3)},${iy2.toFixed(3)} `
            + `A ${R_IN.toFixed(1)},${R_IN.toFixed(1)} 0 0,1 ${ix1.toFixed(3)},${iy1.toFixed(3)} Z" `
            + `fill="${col}" stroke="${col}" stroke-width="0.8"/>`
        );
    }

    // ── Black border circles ──────────────────────────────────────────────────
    for (const r of [R_OUT, R_IN]) {
        parts.push(
            `<circle cx="${CX.toFixed(0)}" cy="${CY.toFixed(0)}" r="${r.toFixed(1)}"`
            + ` fill="none" stroke="black" stroke-width="${BDR}"/>`
        );
    }

    // ── Inward tick marks and labels at cardinal phase angles ─────────────────
    const tickSpecs = [
        [  0, '0°'],
        [ 90, '90°'],
        [180, '180°'],
        [270, '270°'],
    ];
    for (const [deg, label] of tickSpecs) {
        const rad   = deg * Math.PI / 180;
        const cosT  = Math.cos(rad);
        const sinT  = Math.sin(rad);

        const tx1 = CX + R_OUT * cosT,             ty1 = CY - R_OUT * sinT;
        const tx2 = CX + (R_OUT - TICK_LEN) * cosT, ty2 = CY - (R_OUT - TICK_LEN) * sinT;
        parts.push(
            `<line x1="${tx1.toFixed(2)}" y1="${ty1.toFixed(2)}"`
            + ` x2="${tx2.toFixed(2)}" y2="${ty2.toFixed(2)}"`
            + ` stroke="black" stroke-width="${BDR}"/>`
        );

        const lx = CX + R_LABEL * cosT;
        const ly = CY - R_LABEL * sinT;
        parts.push(
            `<text x="${lx.toFixed(2)}" y="${ly.toFixed(2)}"`
            + ` font-size="${FONT_SZ}" font-family="Arial,sans-serif"`
            + ` fill="#D3D3D3" text-anchor="middle" dominant-baseline="middle">`
            + `${label}</text>`
        );
    }

    parts.push('</svg>');
    return parts.join('\n');
}

// Precompute once at module load — the wheel is data-independent
const _PHASE_WHEEL_DATA_URI = (function () {
    const svg = _makePhaseWheelSvg();
    return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svg)));
})();


function makeDensityFigure(result, camera = null) {
    /**
     * Build the 3×3 density matrix visualization.
     *
     * Each element ρᵢⱼ is drawn as a 3D rectangular bar:
     *   Height = |ρᵢⱼ|  (amplitude)
     *   Color  = arg(ρᵢⱼ) mapped to HSV hue  (phase)
     *
     * Axes labeled [σ+, π, σ-] on both x and y.
     *
     * camera: optional object with 'eye' key containing {x, y, z}.
     *         When provided, bars are sorted farthest-to-nearest (painter's
     *         algorithm) so semi-transparent bars composite correctly.
     *
     * Returns {data, layout}.
     */
    const rhoAmps   = result.rhoAmps;
    const rhoPhases = result.rhoPhases;

    const labels = ['σ+', 'π', 'σ-'];

    // Build list of bar specs
    let barSpecs = [];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            barSpecs.push([j * DM_BAR_GAP, i * DM_BAR_GAP, rhoAmps[i][j], rhoPhases[i][j]]);
        }
    }

    // Sort farthest-to-nearest for painter's algorithm
    if (camera && camera.eye) {
        const eye = camera.eye;
        const ex = eye.x !== undefined ? eye.x : 1.25;
        const ey = eye.y !== undefined ? eye.y : 1.25;
        const ez = eye.z !== undefined ? eye.z : 1.25;
        barSpecs.sort((a, b) => {
            const da = (a[0]-ex)**2 + (a[1]-ey)**2 + ez**2;
            const db = (b[0]-ex)**2 + (b[1]-ey)**2 + ez**2;
            return db - da;
        });
    }

    const traces = barSpecs.map(([xc, yc, amp, phase]) =>
        _barMesh(xc, yc, amp, _phaseToColor(phase))
    );

    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 0, r: 0, t: 30, b: 0 },
        title: { text: 'Density Matrix  |𝒫⟩⟨𝒫|', font: { color: COLOR_TEXT, size: 13 }, x: 0.5 },
        scene: {
            bgcolor: COLOR_BG,
            xaxis: {
                tickvals: [0, 1, 2],
                ticktext: labels,
                tickfont: { color: COLOR_TEXT },
                title: { text: '', font: { color: COLOR_TEXT } },
                showgrid: true, gridcolor: '#333355',
                range: [-0.8, 2.8],
            },
            yaxis: {
                tickvals: [0, 1, 2],
                ticktext: labels,
                tickfont: { color: COLOR_TEXT },
                title: { text: '', font: { color: COLOR_TEXT } },
                showgrid: true, gridcolor: '#333355',
                range: [-0.8, 2.8],
            },
            zaxis: {
                range: [0, 1.1],
                tickfont: { color: COLOR_TEXT },
                title: { text: '|ρ|', font: { color: COLOR_TEXT, size: 11 } },
                showgrid: true, gridcolor: '#333355',
            },
            aspectmode: 'cube',
            camera: { eye: { x: 1.6, y: -1.6, z: 1.2 }, up: { x: 0, y: 0, z: 1 } },
        },
        images: [{
            source:  _PHASE_WHEEL_DATA_URI,
            xref: 'paper', yref: 'paper',
            x: 0.99, y: 0.99,
            sizex: 0.30, sizey: 0.44,
            xanchor: 'right', yanchor: 'top',
            layer: 'above',
        }],
    };

    return { data: traces, layout };
}


// ══════════════════════════════════════════════════════════════════════════════
// 6. makeAmplitudesFigure()
// ══════════════════════════════════════════════════════════════════════════════

function makeAmplitudesFigure(result) {
    /**
     * Display the complex spherical transition amplitudes [σ+, π, σ−] as a table.
     *
     * Columns: component | Re(ψ) | Im(ψ) | |ψ| | Phase (°)
     *
     * Returns {data, layout}.
     */
    const spherical = result.spherical;   // [[re,im], [re,im], [re,im]]

    const components = ['σ+', 'π', 'σ−'];
    const componentColors = [COLOR_SIGMA_PLUS, COLOR_PI, COLOR_SIGMA_MINUS];

    function signedFixed(v, d) {
        return (v >= 0 ? '+' : '') + v.toFixed(d);
    }

    const reVals    = spherical.map(s => signedFixed(s[0], 4));
    const imVals    = spherical.map(s => signedFixed(s[1], 4));
    const magVals   = spherical.map(s => Math.sqrt(s[0]**2 + s[1]**2).toFixed(4));
    const phaseVals = spherical.map(s =>
        (Math.atan2(s[1], s[0]) * 180 / Math.PI).toFixed(1) + '°'
    );

    const nRows     = 3;
    const cellBg    = '#16213E';
    const headerBg  = '#1E2A3E';

    const table = {
        type: 'table',
        columnwidth: [60, 90, 90, 80, 80],
        header: {
            values: ['<b>𝒫ᵢ</b>', '<b>Re[aᵢ]</b>', '<b>Im[aᵢ]</b>',
                     '<b>|aᵢ|</b>', '<b>∠aᵢ</b>'],
            fill:   { color: headerBg },
            font:   { color: '#7EC8E3', size: 12 },
            align:  'center',
            height: 30,
            line:   { color: '#2A2A4A' },
        },
        cells: {
            values: [components, reVals, imVals, magVals, phaseVals],
            fill:   { color: cellBg },
            font: {
                color: [componentColors,
                        Array(nRows).fill(COLOR_TEXT),
                        Array(nRows).fill(COLOR_TEXT),
                        Array(nRows).fill(COLOR_TEXT),
                        Array(nRows).fill(COLOR_TEXT)],
                size: 13,
                family: 'monospace, Courier New, courier',
            },
            align:  'center',
            height: 34,
            line:   { color: '#2A2A4A' },
        },
    };

    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 8, r: 8, t: 60, b: 8 },
        title: {
            text: 'Transition Amplitudes<br>|𝒫⟩ = a₊|σ₊⟩ + a₀|π⟩ + a₋|σ₋⟩',
            font: { color: COLOR_TEXT, size: 13 },
            x: 0.5, y: 0.9,
            yanchor: 'top',
        },
    };

    return { data: [table], layout };
}


// ══════════════════════════════════════════════════════════════════════════════
// 7. makeStokesFigure()
// ══════════════════════════════════════════════════════════════════════════════

function makeStokesFigure(result) {
    /**
     * Display the four Stokes parameters as a table.
     *
     * Rows: S0, S1, S2, S3
     * Columns: parameter name | value | normalized (Sn/S0) | physical meaning
     *
     * Returns {data, layout}.
     */
    const stokes = result.stokes;
    const S0 = stokes.S0, S1 = stokes.S1, S2 = stokes.S2, S3 = stokes.S3;
    const norm0 = S0 > 1e-12 ? S0 : 1.0;

    const nRows = 4;

    function signedFixed(v, d) {
        return (v >= 0 ? '+' : '') + v.toFixed(d);
    }

    const params     = ['S0', 'S1', 'S2', 'S3'];
    const values     = [S0, S1, S2, S3].map(v => signedFixed(v, 4));
    const normalized = [S0, S1, S2, S3].map(v => signedFixed(v / norm0, 4));
    const meanings   = [
        'Total intensity',
        'Linear H / V',
        'Linear +45 / -45',
        'Circular RHC / LHC',
    ];

    const labelColors = [COLOR_TEXT, COLOR_TEXT, COLOR_TEXT, COLOR_SIGMA_MINUS];
    const headerBg = '#1E2A3E';
    const cellBg   = '#16213E';

    const table = {
        type: 'table',
        columnwidth: [50, 90, 90, 160],
        header: {
            values: ['<b>Param</b>', '<b>Value</b>',
                     '<b>Value / S0</b>', '<b>Meaning</b>'],
            fill:   { color: headerBg },
            font:   { color: '#7EC8E3', size: 12 },
            align:  'center',
            height: 30,
            line:   { color: '#2A2A4A' },
        },
        cells: {
            values: [params, values, normalized, meanings],
            fill:   { color: cellBg },
            font: {
                color: [labelColors,
                        Array(nRows).fill(COLOR_TEXT),
                        Array(nRows).fill(COLOR_TEXT),
                        Array(nRows).fill(COLOR_TEXT)],
                size: 13,
                family: 'monospace, Courier New, courier',
            },
            align:  ['center', 'center', 'center', 'left'],
            height: 34,
            line:   { color: '#2A2A4A' },
        },
    };

    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 8, r: 8, t: 30, b: 8 },
        title: {
            text: 'Stokes Parameters',
            font: { color: COLOR_TEXT, size: 13 },
            x: 0.5,
        },
    };

    return { data: [table], layout };
}


// ══════════════════════════════════════════════════════════════════════════════
// 8. makeEllipseFigure()
// ══════════════════════════════════════════════════════════════════════════════

function makeEllipseFigure(result) {
    /**
     * Build the 2D polarization ellipse in the {ê₁, ê₂} transverse plane.
     *
     * Axes:
     *   x → component along ê₁
     *   y → component along ê₂
     *
     * The ellipse is normalized so its maximum radius = 1.
     *
     * Returns {data, layout}.
     */
    const e1Vals = result.ellipseE1;
    const e2Vals = result.ellipseE2;
    const stokes = result.stokes;

    // Normalize ellipse to max radius = 1
    let maxR = 0;
    for (let i = 0; i < e1Vals.length; i++) {
        const r = Math.sqrt(e1Vals[i]**2 + e2Vals[i]**2);
        if (r > maxR) maxR = r;
    }
    if (maxR < 1e-10) maxR = 1.0;

    const e1Norm = e1Vals.map(v => v / maxR);
    const e2Norm = e2Vals.map(v => v / maxR);

    // Close the loop
    const e1Closed = e1Norm.concat([e1Norm[0]]);
    const e2Closed = e2Norm.concat([e2Norm[0]]);

    // Handedness label from S3
    const S3 = stokes.S3;
    let handedness;
    if (Math.abs(S3) < 0.05)   handedness = 'Linear';
    else if (S3 > 0)            handedness = 'RHC';
    else                        handedness = 'LHC';

    const circleTs = linspace(0, 2 * Math.PI, 60);

    const traces = [
        // Reference circle (unit circle guide)
        {
            type: 'scatter',
            x: circleTs.map(t => Math.cos(t)),
            y: circleTs.map(t => Math.sin(t)),
            mode: 'lines',
            line: { color: '#333355', width: 1, dash: 'dot' },
            showlegend: false,
            hoverinfo: 'none',
        },
        // ê₁ axis reference line
        {
            type: 'scatter',
            x: [-1.1, 1.1], y: [0, 0],
            mode: 'lines',
            line: { color: COLOR_LAB_AXES, width: 1 },
            showlegend: false,
            hoverinfo: 'none',
        },
        // ê₂ axis reference line
        {
            type: 'scatter',
            x: [0, 0], y: [-1.1, 1.1],
            mode: 'lines',
            line: { color: COLOR_LAB_AXES, width: 1 },
            showlegend: false,
            hoverinfo: 'none',
        },
        // Polarization ellipse
        {
            type: 'scatter',
            x: e1Closed,
            y: e2Closed,
            mode: 'lines',
            line: { color: COLOR_ELLIPSE, width: 2 },
            fill: 'toself',
            fillcolor: 'rgba(233,196,106,0.1)',
            name: 'Polarization ellipse',
            hoverinfo: 'none',
        },
        // Origin dot
        {
            type: 'scatter',
            x: [0], y: [0],
            mode: 'markers',
            marker: { size: 5, color: COLOR_TEXT },
            showlegend: false,
            hoverinfo: 'none',
        },
    ];

    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 40, r: 20, t: 40, b: 40 },
        title: {
            text: `Polarization Ellipse  (${handedness})`,
            font: { color: COLOR_TEXT, size: 13 },
            x: 0.5,
        },
        xaxis: {
            range: [-1.3, 1.3],
            showticklabels: false,
            showgrid: false,
            zeroline: false,
            title: { text: '\xea₁', font: { color: COLOR_EAXES, size: 12 } },
            scaleanchor: 'y',
            scaleratio: 1,
        },
        yaxis: {
            range: [-1.3, 1.3],
            showticklabels: false,
            showgrid: false,
            zeroline: false,
            title: { text: '\xea₂', font: { color: COLOR_EAXES, size: 12 } },
        },
        showlegend: false,
        annotations: [
            {
                x: 1.15, y: 0.05,
                xref: 'x', yref: 'y',
                text: '\xea₁',
                showarrow: false,
                font: { color: COLOR_EAXES, size: 12 },
            },
            {
                x: 0.05, y: 1.15,
                xref: 'x', yref: 'y',
                text: '\xea₂',
                showarrow: false,
                font: { color: COLOR_EAXES, size: 12 },
            },
        ],
    };

    return { data: traces, layout };
}


// ══════════════════════════════════════════════════════════════════════════════
// 9. makePoincareFigure()
// ══════════════════════════════════════════════════════════════════════════════

function makePoincareFigure(result) {
    /**
     * Build the Poincaré sphere showing current polarization state.
     *
     * Traces:
     *   1. Unit sphere surface (low opacity)
     *   2. Principal great circles (equator, S1-S3, S2-S3 planes)
     *   3. S1, S2, S3 axis lines with pole labels
     *   4. Current state: bold point on sphere surface
     *   5. Line from origin to point
     *
     * Returns {data, layout}.
     */
    const stokes = result.stokes;
    const p = stokes.poincare;   // [S1/S0, S2/S0, S3/S0]

    let traces = [];

    // ── Sphere surface ────────────────────────────────────────────────────────
    traces.push(_sphereSurfaceTrace(1.0, '#334466', 0.15, 'Poincaré sphere'));

    // ── Principal great circles ───────────────────────────────────────────────
    const _tArr = linspace(0, 2 * Math.PI, 200);
    const _cArr = _tArr.map(t => Math.cos(t));
    const _sArr = _tArr.map(t => Math.sin(t));
    const _zArr = new Array(_tArr.length).fill(0.0);

    const greatCircleSpecs = [
        [_cArr, _sArr, _zArr],   // equator  (S1-S2 plane)
        [_cArr, _zArr, _sArr],   // S1-S3 plane
        [_zArr, _cArr, _sArr],   // S2-S3 plane
    ];
    for (const [gx, gy, gz] of greatCircleSpecs) {
        traces.push({
            type: 'scatter3d',
            x: gx, y: gy, z: gz,
            mode: 'lines',
            line: { color: '#4A6080', width: 1 },
            showlegend: false,
            hoverinfo: 'none',
        });
    }

    // ── Axis lines with pole labels ───────────────────────────────────────────
    const poleAxes = [
        [[1,0,0], [-1,0,0], 'H',    'V',    COLOR_SIGMA_PLUS],
        [[0,1,0], [0,-1,0], '+45°', '-45°', COLOR_PI],
        [[0,0,1], [0,0,-1], 'RHC',  'LHC',  COLOR_SIGMA_MINUS],
    ];
    for (const [posTip, negTip, posLbl, negLbl, color] of poleAxes) {
        traces.push({
            type: 'scatter3d',
            x: [negTip[0], posTip[0]],
            y: [negTip[1], posTip[1]],
            z: [negTip[2], posTip[2]],
            mode: 'lines+text',
            line: { color: color, width: 2 },
            text: [negLbl, posLbl],
            textposition: ['bottom center', 'top center'],
            textfont: { color: color, size: 11 },
            showlegend: false,
            hoverinfo: 'none',
        });
    }

    // ── Line from origin to current state point ───────────────────────────────
    traces.push({
        type: 'scatter3d',
        x: [0, p[0]], y: [0, p[1]], z: [0, p[2]],
        mode: 'lines',
        line: { color: COLOR_TEXT, width: 2, dash: 'dot' },
        showlegend: false,
        hoverinfo: 'none',
    });

    // ── Current state point ───────────────────────────────────────────────────
    traces.push({
        type: 'scatter3d',
        x: [p[0]], y: [p[1]], z: [p[2]],
        mode: 'markers',
        marker: { size: 10, color: COLOR_ELLIPSE, symbol: 'circle' },
        name: 'Polarization state',
        hovertemplate:
            `S1/S0: ${p[0].toFixed(3)}<br>`
            + `S2/S0: ${p[1].toFixed(3)}<br>`
            + `S3/S0: ${p[2].toFixed(3)}<extra></extra>`,
    });

    const layout = {
        paper_bgcolor: COLOR_PAPER,
        plot_bgcolor:  COLOR_BG,
        margin: { l: 0, r: 0, t: 30, b: 0 },
        title: { text: 'Poincaré Sphere', font: { color: COLOR_TEXT, size: 13 }, x: 0.5 },
        legend: {
            font: { color: COLOR_TEXT, size: 11 },
            bgcolor: 'rgba(0,0,0,0)',
        },
        scene: {
            bgcolor: COLOR_BG,
            xaxis: {
                range: [-1.3, 1.3],
                showticklabels: false, showgrid: false,
                showbackground: false, zeroline: false, title: '',
            },
            yaxis: {
                range: [-1.3, 1.3],
                showticklabels: false, showgrid: false,
                showbackground: false, zeroline: false, title: '',
            },
            zaxis: {
                range: [-1.3, 1.3],
                showticklabels: false, showgrid: false,
                showbackground: false, zeroline: false, title: '',
            },
            aspectmode: 'cube',
            camera: {
                eye: { x: 1.4, y: 1.0, z: 0.8 },
                up:  { x: 0, y: 0, z: 1 },
            },
        },
    };

    return { data: traces, layout };
}
