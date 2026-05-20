// physics.js
// ─────────────────────────────────────────────────────────────────────────────
// Physics computations for PolariViz.
// Direct JavaScript port of physics.py.
//
// Depends on: math_helpers.js (must be loaded first)
//
// PIPELINE OVERVIEW:
//   Slider inputs (angles, polarization params)
//         ↓
//   ① Geometry: k̂, {ê₁, ê₂}, quantization axis
//         ↓
//   ② Polarization state: Jones vector in lab frame (complex 3-vector)
//         ↓
//   ③ Spherical decomposition: rotate to quant frame, apply B → (σ+, π, σ−)
//         ↓
//   ④ Absorption: |CG|² × |σ±,π|² per mJ sublevel
//         ↓
//   ⑤ Density matrix: ρᵢⱼ = Eᵢ Eⱼ*
//         ↓
//   ⑥ Poincaré / ellipse: Stokes parameters, polarization ellipse in 3D
//         ↓
//   ⑦ computeAll(): single master function → object of all plot data
//
// FILE STRUCTURE:
//   1. Geometry
//   2. Polarization state construction
//   3. Spherical decomposition
//   4. Absorption (J=0 → J=1)
//   5. Density matrix
//   6. Poincaré sphere and polarization ellipse
//   7. Master pipeline function
// ─────────────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// 1. GEOMETRY
// ══════════════════════════════════════════════════════════════════════════════

function makeKHat(theta, phi) {
    return sphericalToCartesian(1, theta, phi);
}

function makeQuantAxis(thetaB, phiB) {
    return sphericalToCartesian(1, thetaB, phiB);
}

function rodrigues(v, axis, angleRad) {
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);
    const d    = dot(axis, v);
    const cr   = cross(axis, v);
    return [
        v[0]*cosA + cr[0]*sinA + axis[0]*d*(1 - cosA),
        v[1]*cosA + cr[1]*sinA + axis[1]*d*(1 - cosA),
        v[2]*cosA + cr[2]*sinA + axis[2]*d*(1 - cosA),
    ];
}

function makeBeamFrame(theta, phi, chi) {
    const kHat = makeKHat(theta, phi);
    const zHat = [0, 0, 1];
    let e1_0 = cross(zHat, kHat);
    if (norm(e1_0) < 1e-6) e1_0 = [0, 1, 0];
    else e1_0 = normalize(e1_0);
    const e2_0 = normalize(cross(kHat, e1_0));
    const e1   = rodrigues(e1_0, kHat, chi);
    const e2   = rodrigues(e2_0, kHat, chi);
    return [e1, e2, kHat];
}


// ══════════════════════════════════════════════════════════════════════════════
// 2. POLARIZATION STATE CONSTRUCTION
// ══════════════════════════════════════════════════════════════════════════════

function jonesFromBasisState(basis) {
    const states = {
        sigma_plus:  [[1,0],[0,0],[0,0]],
        pi:          [[0,0],[1,0],[0,0]],
        sigma_minus: [[0,0],[0,0],[1,0]],
    };
    return cMatVecMultiply(B_SPHERICAL_TO_CARTESIAN, states[basis]);
}

function jonesMatrixQwp(alpha) {
    const ca = Math.cos(alpha), sa = Math.sin(alpha);
    const ca2 = ca*ca, sa2 = sa*sa, sc = sa*ca;
    return [
        [[ca2, sa2], [-sc, -sc]],
        [[sc,  -sc], [ca2, -sa2]],
    ];
}

function jonesMatrixHwp(alpha) {
    const c2 = Math.cos(2*alpha), s2 = Math.sin(2*alpha);
    return [
        [[c2, 0],  [s2, 0]],
        [[s2, 0],  [-c2, 0]],
    ];
}

function jonesMat2Vec2Multiply(M, v) {
    return [
        cAdd(cMul(M[0][0], v[0]), cMul(M[0][1], v[1])),
        cAdd(cMul(M[1][0], v[0]), cMul(M[1][1], v[1])),
    ];
}

function jonesMat2Mat2Multiply(A, B) {
    return [
        [cAdd(cMul(A[0][0],B[0][0]), cMul(A[0][1],B[1][0])),
         cAdd(cMul(A[0][0],B[0][1]), cMul(A[0][1],B[1][1]))],
        [cAdd(cMul(A[1][0],B[0][0]), cMul(A[1][1],B[1][0])),
         cAdd(cMul(A[1][0],B[0][1]), cMul(A[1][1],B[1][1]))],
    ];
}

function applyWaveplateChain(a1, a2, a3) {
    const E0   = [[0,0],[1,0]];
    const QWP1 = jonesMatrixQwp(a1);
    const HWP  = jonesMatrixHwp(a2);
    const QWP2 = jonesMatrixQwp(a3);
    const chain = jonesMat2Mat2Multiply(QWP2, jonesMat2Mat2Multiply(HWP, QWP1));
    return jonesMat2Vec2Multiply(chain, E0);
}

function embedJonesInLab(jones2d, e1, e2) {
    const Ex = jones2d[0], Ey = jones2d[1];
    return cVecAdd(cVecScale(realToCVec(e1), Ex),
                   cVecScale(realToCVec(e2), Ey));
}


// ══════════════════════════════════════════════════════════════════════════════
// 3. SPHERICAL DECOMPOSITION
// ══════════════════════════════════════════════════════════════════════════════

function rotateEfieldToQuantFrame(E_lab, thetaB, phiB) {
    const R     = matMatMultiply(rotationZ(phiB), rotationY(thetaB));
    const R_inv = invertRotation(R);
    return cMatVecMultiply(realToCMat(R_inv), E_lab);
}

function rotateEfieldToLabFrame(E_input, theta, phi, chi) {
    const Rz1 = rotationZ(phi);
    const Ry  = rotationY(theta);
    const Rz2 = rotationZ(chi);
    const R   = matMatMultiply(Rz1, matMatMultiply(Ry, Rz2));
    return cMatVecMultiply(realToCMat(R), E_input);
}

function decomposeToSpherical(E_quant) {
    return cMatVecMultiply(B_CARTESIAN_TO_SPHERICAL, E_quant);
}

function computeSphericalIntensities(sc) {
    const sp = cAbsSq(sc[0]), pi = cAbsSq(sc[1]), sm = cAbsSq(sc[2]);
    return { sigma_plus: sp, pi: pi, sigma_minus: sm, total: sp + pi + sm };
}

function computeSphericalFractions(sc) {
    const ints = computeSphericalIntensities(sc);
    const tot  = ints.total || 1.0;
    return { sigma_plus:  ints.sigma_plus  / tot,
             pi:          ints.pi          / tot,
             sigma_minus: ints.sigma_minus / tot,
             total:       1.0 };
}


// ══════════════════════════════════════════════════════════════════════════════
// 4. ABSORPTION (J=0 → J=1)
// ══════════════════════════════════════════════════════════════════════════════

function clebschGordanJ0J1(deltaM) {
    // For J=0 → J=1 all CG coefficients are equal: |CG|² = 1/3
    return 1.0 / Math.sqrt(3);
}

function computeAbsorptionJ0J1(sc) {
    const cg2 = 1.0 / 3.0;   // |CG|² = 1/3 for all J=0→J=1 transitions
    return {
        mJ_plus1:  cg2 * cAbsSq(sc[0]),
        mJ_0:      cg2 * cAbsSq(sc[1]),
        mJ_minus1: cg2 * cAbsSq(sc[2]),
    };
}


// ══════════════════════════════════════════════════════════════════════════════
// 5. DENSITY MATRIX
// ══════════════════════════════════════════════════════════════════════════════

function computeDensityMatrix(sc) {
    return sc.map(Ei =>
        sc.map(Ej => cMul(Ei, cConj(Ej)))
    );
}

function densityMatrixAmplitudes(rho) {
    return rho.map(row => row.map(el => cAbs(el)));
}

function densityMatrixPhases(rho) {
    return rho.map(row =>
        row.map(el => Math.atan2(el[1], el[0]))
    );
}


// ══════════════════════════════════════════════════════════════════════════════
// 6. POINCARÉ SPHERE AND POLARIZATION ELLIPSE
// ══════════════════════════════════════════════════════════════════════════════

function computeStokes(jones2d) {
    const Ex = jones2d[0], Ey = jones2d[1];
    const S0 = cAbsSq(Ex) + cAbsSq(Ey);
    const S1 = cAbsSq(Ex) - cAbsSq(Ey);
    const ExcEy = cMul(cConj(Ex), Ey);
    const S2 = 2 * ExcEy[0];
    const S3 = 2 * ExcEy[1];
    const norm_s = S0 > 0 ? S0 : 1.0;
    return { S0, S1, S2, S3,
             poincare: [S1/norm_s, S2/norm_s, S3/norm_s] };
}

function computePolarizationEllipse(jones2d, nPoints = 100) {
    const ts     = linspace(0, 2 * Math.PI, nPoints);
    const e1Vals = [], e2Vals = [];
    for (const t of ts) {
        const phase = [Math.cos(t), Math.sin(t)];
        const E = [cMul(jones2d[0], phase), cMul(jones2d[1], phase)];
        e1Vals.push(E[0][0]);
        e2Vals.push(E[1][0]);
    }
    return [e1Vals, e2Vals];
}

function embedEllipseInLab(e1Vals, e2Vals, e1Vec, e2Vec) {
    return e1Vals.map((e1, i) => {
        const e2 = e2Vals[i];
        return [e1*e1Vec[0] + e2*e2Vec[0],
                e1*e1Vec[1] + e2*e2Vec[1],
                e1*e1Vec[2] + e2*e2Vec[2]];
    });
}


// ══════════════════════════════════════════════════════════════════════════════
// 7. MASTER PIPELINE FUNCTION
// ══════════════════════════════════════════════════════════════════════════════

function computeAll({
    // Beam geometry
    thetaRad, phiRad, chiRad,
    // Quantization axis
    thetaBRad, phiBRad,
    // Polarization input mode: 'basis' or 'waveplate'
    inputMode,
    // Basis mode params (used if inputMode === 'basis')
    basisState = null,
    // Waveplate mode params (used if inputMode === 'waveplate')
    alpha1Rad = 0.0, alpha2Rad = 0.0, alpha3Rad = 0.0,
    // Ellipse resolution
    nEllipsePoints = 50,
} = {}) {

    // ── Step 1: Geometry ─────────────────────────────────────────────────────
    const [e1, e2, kHat] = makeBeamFrame(thetaRad, phiRad, chiRad);
    const quantAxis = makeQuantAxis(thetaBRad, phiBRad);

    // ── Step 2: Polarization state ────────────────────────────────────────────
    let E_input, jones2d;

    if (inputMode === 'basis') {
        if (basisState === 'pi') {
            E_input = jonesFromBasisState('pi');
            const R1 = realToCMat(rotationY(degreesToRadians(90)));
            E_input = cMatVecMultiply(R1, E_input);
        } else if (basisState === 'sigma_plus' || basisState === 'sigma_minus') {
            E_input = jonesFromBasisState(basisState);
        } else if (basisState === 'horizontal') {
            // H = linear polarisation orthogonal to V (⊥ ê₂) → y-polarised in
            // input frame, which embeds as ê₁ after the beam-frame rotation.
            E_input = [[0, 0], [1, 0], [0, 0]];
        } else if (basisState === 'diagonal') {
            // |D⟩ = (|H⟩ + |V⟩) / √2  — +45° linear (+S2 pole)
            const s = 1.0 / Math.sqrt(2);
            E_input = [[s, 0], [s, 0], [0, 0]];
        } else if (basisState === 'antidiagonal') {
            // |A⟩ = (|H⟩ − |V⟩) / √2  — −45° linear (−S2 pole)
            const s = 1.0 / Math.sqrt(2);
            E_input = [[-s, 0], [s, 0], [0, 0]];
        } else {
            throw new Error(`Invalid basisState: ${basisState}`);
        }
        jones2d = null;

    } else if (inputMode === 'waveplate') {
        jones2d = applyWaveplateChain(alpha1Rad, alpha2Rad, alpha3Rad);
        E_input = embedJonesInLab(jones2d, [1, 0, 0], [0, 1, 0]);

    } else {
        throw new Error(`inputMode must be 'basis' or 'waveplate'. Got: ${inputMode}`);
    }

    // ── Step 3: Spherical decomposition ──────────────────────────────────────
    const E_lab  = rotateEfieldToLabFrame(E_input, thetaRad, phiRad, chiRad);
    const jones2dForEllipse = [cDot(realToCVec(e1), E_lab),
                               cDot(realToCVec(e2), E_lab)];
    const E_quant   = rotateEfieldToQuantFrame(E_lab, thetaBRad, phiBRad);
    const spherical = decomposeToSpherical(E_quant);
    const intensities = computeSphericalIntensities(spherical);
    const fractions   = computeSphericalFractions(spherical);

    // ── Step 4: Stokes parameters and polarization ellipse ───────────────────
    const stokes = computeStokes(jones2dForEllipse);
    const [e1Vals, e2Vals] = computePolarizationEllipse(jones2dForEllipse, nEllipsePoints);
    const ellipsePoints    = embedEllipseInLab(e1Vals, e2Vals, e1, e2);
    const ellipseXs = ellipsePoints.map(p => p[0]);
    const ellipseYs = ellipsePoints.map(p => p[1]);
    const ellipseZs = ellipsePoints.map(p => p[2]);

    // ── Step 5: Absorption ────────────────────────────────────────────────────
    const absorption = computeAbsorptionJ0J1(spherical);

    // ── Step 6: Density matrix ────────────────────────────────────────────────
    const rho      = computeDensityMatrix(spherical);
    const rhoAmps  = densityMatrixAmplitudes(rho);
    const rhoPhases = densityMatrixPhases(rho);

    return {
        // Geometry
        kHat, e1, e2, quantAxis, E_lab,
        // Polarization
        jones2d, stokes,
        // Ellipse
        ellipseE1: e1Vals, ellipseE2: e2Vals,
        ellipseXs, ellipseYs, ellipseZs,
        // Spherical decomposition
        spherical, intensities, fractions,
        // Absorption
        absorption,
        // Density matrix
        rho, rhoAmps, rhoPhases,
    };
}
