# PolariViz

**[Link to the live app → https://bdsmith147.github.io/polariviz/](https://bdsmith147.github.io/polariviz/)**

## Purpose and Audience 
What polarization of light does an atom "see"? Well, that depends. This might be a simple answer in highly symmetric configurations. But what if directions and polarization are not so ideal? That is the question this app attempts to answer.

This app was created for AMO (atomic, molecular, and optical) students and researchers. It gives <u>full</u>, <u>arbitrary</u>, and <u>interactive</u> control of the light beam and quantization axis geometry, and the input polarization direction in a laboratory frame. The primary result is a visual and numerical display of the polarization amplitudes and intensities in the quantization frame of the atom. This app is designed to help researchers more effectively design and implement AMO experiments, especially where optical access is limited.


## Requirements
For the GitHub page version, the only requirement is an internet browser. For the local Python version, the requirements can be installed as 

`pip install dash plotly`

Or in a conda environment:

`conda install -c conda-forge dash plotly`

<empty-block/>


## Interface
This app is designed to be operated from a desktop or laptop computer, not from a mobile screen. There are two primary interface options:
1. Use the online GitHub page version at https://bdsmith147.github.io/polariviz/. This is the easiest and quickest method.
2. Clone the repository and run either the `run_app.bat` file, or `python app.py` from a Python console. Then open http://localhost:8050 in your browser.

<empty-block/>


## Organization
This app is organized into four main panels (clockwise from the upper left):

| Panel | Contents |
|---|---|
| 3D lab visualization<br>(upper left) | • View the quantization axis, beam input direction, and input polarization frame from a laboratory frame. |
| Main geometry and polarization control<br>(upper right) | <u>Geometry control</u><br>◦ Beam direction — determined by 3 Euler angles ($\theta$, $\varphi$, $\chi$) in the ZYZ convention relative to the lab frame.<br>◦ Quantization axis — determined by polar and azimuthal angles ($\theta_B$, $\varphi_B$) in the lab frame.<br><br><u>Polarization control</u><br>Two input options:<br>• Basic states: H, V, D, A, RHC, LHC.<br>• A QWP, HWP, and QWP waveplate chain to produce any arbitrary polarization state. |
| Polarization viewer<br>(bottom right) | • Polarization ellipse in the input beam frame, looking back along the k-vector from the target to the source.<br>• Poincaré sphere representation of the input polarization.<br>• Stokes parameters of the polarization state. |
| Polarization intensities and amplitudes<br>(bottom left) | • A J=0 → J=1 level diagram showing transition intensities $\lvert a_i \rvert^2$, independent of Clebsch-Gordan weighting.<br>• The complex polarization amplitudes $a_+$, $a_0$, $a_-$.<br>• The coherency matrix shows the outer product $\lvert\mathcal{P}\rangle\langle\mathcal{P}\rvert$ in the spherical basis, visualizing both intensities and phase correlations. |


## Background
The polarization of an electromagnetic field encodes its helicity, or its spin angular momentum projected along the propagation direction; this is similar to the well-known spin property of electrons, atoms, and other quantum particles. As the light wave propagates along some vector direction $`\vec{k}`$ through space, the electric field oscillates in a plane orthogonal to $`\vec{k}`$. In the following, Dirac notation represents column vectors compactly and cleanly, and this should not be confused with quantum mechanical ket states. 

In the lab frame, the Cartesian unit vectors are $`\hat{e}_i\equiv |i\rangle`$ and the electric field vector $`\vec{E} \equiv |E\rangle`$ is

$$
|E\rangle = E_x |x\rangle + E_y |y\rangle  + E_z |z\rangle,
$$

where $`E_i`$ are the fully-general Cartesian electric field amplitudes in the lab frame. In this project, we consider fully polarized light, for example, linear, circular, or elliptical polarization. Often it’s convenient to describe the electric field in its propagation frame with unit vectors $`\hat{e}_i^\prime \equiv |i^\prime\rangle`$, where $`\hat{e}_z^\prime \parallel \vec{k}`$. Thus, the electric field in the propagation frame is

$$
|E^\prime\rangle = E_x^\prime |x^\prime\rangle + E_y^\prime |y^\prime\rangle  + 0 |z^\prime\rangle,
$$
where $`(E_x^\prime, E_y^\prime)`$ is also known as a Jones vector.

For quantum “things”, angular momentum exists in discrete quanta, and is fundamentally *directional*; we measure angular momentum projected along a certain axis through 3D space called a quantization axis $`\vec{q}`$. For atoms, usually the most convenient choice of this axis is the vector parallel to an external magnetic field. 

When bound electrons in atoms interact with polarized light, the light transfers discrete quanta of its angular momentum to the atom.  Because of the intrinsic properties of light, there are three possible outcomes of the net angular momentum change to the atom, projected along the quantization axis, labeled as \{σ+, $`\pi`$, $`\sigma_-`$\} transitions, respectively:
| | |
|---|---|
| $\sigma_+$ | Adds one quantum of angular momentum to an atom |
| $\pi$ | Leaves the angular momentum unchanged |
| $\sigma_-$ | Removes one quantum of angular momentum from the atom |
| | |

A representation called the **spherical basis** is ideal for describing the transfer of angular momentum between light and atoms. This basis is defined in terms of the Cartesian unit vectors in the frame of the quantization axis as:
- $`|\sigma_\pm\rangle = \pm \frac{1}{\sqrt{2}}\left(|x_q\rangle \mp i |y_q\rangle\right),`$
- $`|\pi\rangle = |z_q\rangle,`$

where $`|i_q\rangle`$ are the Cartesian basis vectors in the frame of the quantization axis. In general, light can address a single transition or a superposition of the three transitions. The polarization experienced by the atoms in its quantization axis frame is

$$
|\mathcal{P}\rangle = a_+ |\sigma_+\rangle + a_0 |\pi\rangle + a_- |\sigma_-\rangle.
$$

In summary, there are three reference frames:
1. The lab frame $`|i\rangle`$.
2. The propagation frame $`|i^\prime\rangle`$ defined by $`\vec{k}`$, with the input light’s polarization given by $`(E_x^\prime, E_y^\prime)`$.
3. The quantization axis frame $`|i_q\rangle`$ defined by $`\vec{q}`$.

The relationships between each frame are relevant to answering the question, “What polarization $`|\mathcal{P}\rangle`$ does the atom ‘see’?” The answer to this question involves physical rotations of the input electric field $`|E^\prime\rangle`$ between the various frames, and then transforming the final rotated field into the spherical basis. This is what’s happening under the hood of the `Polariviz` app.



## Software License and Information
© 2026 Benjamin Smith — License GPLv3+

Co-Authored by*: Anthropic’s Claude Sonnet 4.6

\* This README was written by a human; AI was used for editing purposes only.