# PolariViz

Interactive visualization of polarized light absorption in a J=0 → J=1 atomic transition.

**[Live app → https://bdsmith147.github.io/polariviz/](https://bdsmith147.github.io/polariviz/)**

## Overview

PolariViz lets you explore how the polarization state of a light beam — defined by its direction, roll angle, and waveplate chain — couples to the magnetic sublevels of a two-level atomic system, as a function of the quantization axis orientation.

Controls:
- **Geometry tab** — set the beam direction (θ, φ) and roll angle (χ), and the quantization axis (θ_B, φ_B)
- **Polarization Input tab** — choose a basis state (RHC / V / LHC) or dial in a custom waveplate chain (QWP₁ → HWP → QWP₂)

Outputs update in real time:
- 3D scene with beam, polarization ellipse, and quantization axis
- J=0 → J=1 transition diagram with absorption strengths
- Transition amplitude table and density matrix
- 2D polarization ellipse, Poincaré sphere, and Stokes parameters

## Running locally (Python/Dash)

```bash
pip install dash plotly
python app.py
```

Then open [http://localhost:8050](http://localhost:8050) in your browser.

## License

© 2026 Benjamin Smith — License GPLv3+  ·  Co-Authored-By: Claude Sonnet 4.6
