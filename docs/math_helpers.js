// math_helpers.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure math helper library for PolariViz.
// Direct JavaScript port of math_helpers.py.
//
// Conventions (identical to the Python version):
//   - All matrices are plain nested Arrays (no typed arrays)
//   - All vectors are plain Arrays of length 3
//   - Complex numbers are plain 2-element Arrays [real, imag]
//   - No external dependencies
//
// FILE STRUCTURE:
//   1. Scalar helpers
//   2. Complex number primitives
//   3. Real vector operations
//   4. Complex vector operations
//   5. Real matrix operations
//   6. Complex matrix operations
//   7. Real rotation matrices
//   8. Coordinate conversions
//   9. Spherical tensor basis matrices
//  10. Development / debug helpers
// ─────────────────────────────────────────────────────────────────────────────


// ══════════════════════════════════════════════════════════════════════════════
// 1. SCALAR HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function degreesToRadians(deg) { return deg * Math.PI / 180; }

function radiansToDegrees(rad) { return rad * 180 / Math.PI; }

function linspace(start, stop, n) {
    if (n < 2) return [start];
    const step = (stop - start) / (n - 1);
    return Array.from({length: n}, (_, i) => start + i * step);
}


// ══════════════════════════════════════════════════════════════════════════════
// 2. COMPLEX NUMBER PRIMITIVES
//
// Convention: a complex number is a plain 2-element Array [real, imag].
// Example: 1 + 2i  →  [1, 2]
//          i       →  [0, 1]
//          3       →  [3, 0]
// ══════════════════════════════════════════════════════════════════════════════

function cMake(re, im)  { return [re, im]; }
function cReal(a)       { return a[0]; }
function cImag(a)       { return a[1]; }
function cConj(a)       { return [a[0], -a[1]]; }
function cAbs(a)        { return Math.sqrt(a[0]**2 + a[1]**2); }
function cAbsSq(a)      { return a[0]**2 + a[1]**2; }
function cAdd(a, b)     { return [a[0]+b[0], a[1]+b[1]]; }
function cSub(a, b)     { return [a[0]-b[0], a[1]-b[1]]; }
function cScale(a, s)   { return [a[0]*s, a[1]*s]; }
function cFromReal(x)   { return [x, 0]; }

function cMul(a, b) {
    return [a[0]*b[0] - a[1]*b[1],
            a[0]*b[1] + a[1]*b[0]];
}

function cDiv(a, b) {
    const d = b[0]**2 + b[1]**2;
    return [(a[0]*b[0] + a[1]*b[1]) / d,
            (a[1]*b[0] - a[0]*b[1]) / d];
}

function cExp(a) {
    const r = Math.exp(a[0]);
    return [r * Math.cos(a[1]), r * Math.sin(a[1])];
}

function cPhase(phi) { return [Math.cos(phi), Math.sin(phi)]; }


// ══════════════════════════════════════════════════════════════════════════════
// 3. REAL VECTOR OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

function dot(a, b)      { return a[0]*b[0] + a[1]*b[1] + a[2]*b[2]; }
function norm(v)        { return Math.sqrt(v[0]**2 + v[1]**2 + v[2]**2); }
function scale(v, s)    { return [v[0]*s, v[1]*s, v[2]*s]; }
function add(a, b)      { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function subtract(a, b) { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }

function cross(a, b) {
    return [a[1]*b[2] - a[2]*b[1],
            a[2]*b[0] - a[0]*b[2],
            a[0]*b[1] - a[1]*b[0]];
}

function normalize(v) {
    const mag = norm(v);
    return [v[0]/mag, v[1]/mag, v[2]/mag];
}


// ══════════════════════════════════════════════════════════════════════════════
// 4. COMPLEX VECTOR OPERATIONS
//
// A complex 3-vector is a plain Array of three complex numbers:
//   v = [ [re0,im0], [re1,im1], [re2,im2] ]
// ══════════════════════════════════════════════════════════════════════════════

function cVecAdd(a, b)      { return [cAdd(a[0],b[0]), cAdd(a[1],b[1]), cAdd(a[2],b[2])]; }
function cVecSub(a, b)      { return [cSub(a[0],b[0]), cSub(a[1],b[1]), cSub(a[2],b[2])]; }
function cVecScale(v, s)    { return [cMul(v[0],s), cMul(v[1],s), cMul(v[2],s)]; }
function cVecScaleReal(v,s) { return [cScale(v[0],s), cScale(v[1],s), cScale(v[2],s)]; }
function cVecConj(v)        { return [cConj(v[0]), cConj(v[1]), cConj(v[2])]; }
function realToCVec(v)      { return [[v[0],0],[v[1],0],[v[2],0]]; }
function cVecRealPart(v)    { return [v[0][0], v[1][0], v[2][0]]; }
function cVecImagPart(v)    { return [v[0][1], v[1][1], v[2][1]]; }

function cDot(a, b) {
    let result = [0, 0];
    for (let i = 0; i < 3; i++)
        result = cAdd(result, cMul(cConj(a[i]), b[i]));
    return result;
}

function cNorm(v)      { return Math.sqrt(cReal(cDot(v, v))); }
function cNormalize(v) { return cVecScaleReal(v, 1.0 / cNorm(v)); }


// ══════════════════════════════════════════════════════════════════════════════
// 5. REAL MATRIX OPERATIONS
// ══════════════════════════════════════════════════════════════════════════════

function matVecMultiply(M, v) {
    return [M[0][0]*v[0]+M[0][1]*v[1]+M[0][2]*v[2],
            M[1][0]*v[0]+M[1][1]*v[1]+M[1][2]*v[2],
            M[2][0]*v[0]+M[2][1]*v[1]+M[2][2]*v[2]];
}

function matMatMultiply(A, B) {
    let R = [[0,0,0],[0,0,0],[0,0,0]];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            for (let k = 0; k < 3; k++)
                R[i][j] += A[i][k] * B[k][j];
    return R;
}

function transpose(M) {
    return [[M[0][0],M[1][0],M[2][0]],
            [M[0][1],M[1][1],M[2][1]],
            [M[0][2],M[1][2],M[2][2]]];
}

function invertRotation(R) { return transpose(R); }


// ══════════════════════════════════════════════════════════════════════════════
// 6. COMPLEX MATRIX OPERATIONS
//
// A complex 3x3 matrix is a nested Array of complex numbers:
//   M = [ [M00, M01, M02],   where each Mij = [re, im]
//         [M10, M11, M12],
//         [M20, M21, M22] ]
// ══════════════════════════════════════════════════════════════════════════════

function cMatVecMultiply(M, v) {
    return M.map(row =>
        row.reduce((acc, Mij, j) => cAdd(acc, cMul(Mij, v[j])), [0, 0])
    );
}

function cMatMatMultiply(A, B) {
    let R = Array.from({length: 3}, () => Array(3).fill(null).map(() => [0, 0]));
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++)
            for (let k = 0; k < 3; k++)
                R[i][j] = cAdd(R[i][j], cMul(A[i][k], B[k][j]));
    return R;
}

function cConjugateTranspose(M) {
    return [[cConj(M[0][0]), cConj(M[1][0]), cConj(M[2][0])],
            [cConj(M[0][1]), cConj(M[1][1]), cConj(M[2][1])],
            [cConj(M[0][2]), cConj(M[1][2]), cConj(M[2][2])]];
}

function invertUnitary(U) { return cConjugateTranspose(U); }

function realToCMat(M) { return M.map(row => row.map(x => [x, 0])); }


// ══════════════════════════════════════════════════════════════════════════════
// 7. REAL ROTATION MATRICES
// ══════════════════════════════════════════════════════════════════════════════

function rotationX(a) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [[1,0,0],[0,c,-s],[0,s,c]];
}

function rotationY(a) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [[c,0,s],[0,1,0],[-s,0,c]];
}

function rotationZ(a) {
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return [[c,-s,0],[s,c,0],[0,0,1]];
}


// ══════════════════════════════════════════════════════════════════════════════
// 8. COORDINATE CONVERSIONS
// ══════════════════════════════════════════════════════════════════════════════

function sphericalToCartesian(r, theta, phi) {
    return [r * Math.sin(theta) * Math.cos(phi),
            r * Math.sin(theta) * Math.sin(phi),
            r * Math.cos(theta)];
}

function cartesianToSpherical(v) {
    const r = norm(v);
    if (r === 0) return [0, 0, 0];
    return [r,
            Math.acos(Math.max(-1, Math.min(1, v[2] / r))),
            Math.atan2(v[1], v[0])];
}


// ══════════════════════════════════════════════════════════════════════════════
// 9. SPHERICAL TENSOR BASIS MATRICES
//
// B transforms a Cartesian column vector [x, y, z] → spherical [σ+, π, σ−].
// B is unitary, so B^{-1} = B†  (conjugate transpose).
// ══════════════════════════════════════════════════════════════════════════════

const _s = 1.0 / Math.sqrt(2);

const B_CARTESIAN_TO_SPHERICAL = [
    [ [_s,  0], [0, -_s], [0, 0] ],   // σ+ row
    [ [0,   0], [0,   0], [1, 0] ],   // π  row
    [ [-_s, 0], [0, -_s], [0, 0] ],   // σ− row
];

const B_SPHERICAL_TO_CARTESIAN = cConjugateTranspose(B_CARTESIAN_TO_SPHERICAL);

function cartesianToSphericalTensor(v) {
    return cMatVecMultiply(B_CARTESIAN_TO_SPHERICAL, realToCVec(v));
}

function sphericalTensorToCartesian(v) {
    return cMatVecMultiply(B_SPHERICAL_TO_CARTESIAN, v);
}


// ══════════════════════════════════════════════════════════════════════════════
// 10. DEVELOPMENT / DEBUG HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function assertRotationMatrix(R, tol = 1e-6, name = 'R') {
    const RtR = matMatMultiply(transpose(R), R);
    const I   = [[1,0,0],[0,1,0],[0,0,1]];
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            const diff = Math.abs(RtR[i][j] - I[i][j]);
            if (diff >= tol)
                throw new Error(`assertRotationMatrix: '${name}' failed orthogonality at [${i}][${j}]: got ${RtR[i][j].toFixed(8)}, expected ${I[i][j]}`);
        }
    const det = (
        R[0][0] * (R[1][1]*R[2][2] - R[1][2]*R[2][1]) -
        R[0][1] * (R[1][0]*R[2][2] - R[1][2]*R[2][0]) +
        R[0][2] * (R[1][0]*R[2][1] - R[1][1]*R[2][0])
    );
    if (Math.abs(det - 1.0) >= tol)
        throw new Error(`assertRotationMatrix: '${name}' has det = ${det.toFixed(8)}, expected +1`);
}

function assertUnitaryMatrix(U, tol = 1e-6, name = 'U') {
    const UdU = cMatMatMultiply(cConjugateTranspose(U), U);
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            const expectedRe = (i === j) ? 1.0 : 0.0;
            if (Math.abs(UdU[i][j][0] - expectedRe) >= tol || Math.abs(UdU[i][j][1]) >= tol)
                throw new Error(`assertUnitaryMatrix: '${name}' failed at [${i}][${j}]: got ${UdU[i][j][0].toFixed(6)}+${UdU[i][j][1].toFixed(6)}i, expected ${expectedRe}+0i`);
        }
}
