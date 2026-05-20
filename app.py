# app.py
# ─────────────────────────────────────────────────────────────────────────────
# Dash app wiring for PolariViz.
#
# THIS FILE IS CONVERSION SCAFFOLDING.
# It exists to let you test physics.py and traces.py interactively in Python.
# The final deployed product is a static Plotly.js site on GitHub Pages.
# When converting:
#   - app.layout   → HTML structure in index.html
#   - @callback    → addEventListener + updateAll() function in app.js
#   - dcc.Slider   → <input type="range"> in index.html
#   - dcc.Tabs     → <div class="tab"> structure in index.html
#   - dcc.Checklist→ <input type="checkbox"> in index.html
#
# STRUCTURE:
#   1. Imports
#   2. Slider/control definitions  (reusable specs)
#   3. Layout
#   4. Callback
#   5. Run
# ─────────────────────────────────────────────────────────────────────────────

import base64
from dash import Dash, dcc, html, Input, Output, State, callback, no_update
import plotly.graph_objects as go
from math_helpers import degrees_to_radians
from physics import compute_all
from traces import (
    make_3d_figure,
    make_level_figure,
    make_amplitudes_figure,
    make_density_figure,
    make_stokes_figure,
    make_ellipse_figure,
    make_poincare_figure,
)


# ══════════════════════════════════════════════════════════════════════════════
# 1. APP INIT
# ══════════════════════════════════════════════════════════════════════════════

app = Dash(__name__, title='PolariViz')

# GitHub mark-github-24 icon (Primer Octicons) — precomputed data URI so the
# icon renders reliably without any external network request.
_GITHUB_ICON_SVG = (
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"'
    ' width="18" height="18" fill="#B0B0C0">'
    '<path d="M12 1C5.923 1 1 5.923 1 12c0 4.863 3.163 8.979 7.535 10.426'
    '.55.098.748-.237.748-.526 0-.26-.009-.949-.014-1.863'
    '-3.06.664-3.705-1.475-3.705-1.475-.5-1.27-1.22-1.607'
    '-1.22-1.607-.998-.682.076-.668.076-.668 1.103.077 1.683'
    ' 1.133 1.683 1.133.981 1.68 2.574 1.195 3.2.913.1-.71'
    '.384-1.195.698-1.47-2.442-.278-5.012-1.221-5.012-5.437'
    ' 0-1.201.429-2.183 1.132-2.952-.114-.278-.49-1.397.108'
    '-2.91 0 0 .923-.295 3.023 1.128A10.574 10.574 0 0 1 12'
    ' 6.577c.935.004 1.876.126 2.754.37 2.099-1.424 3.02-1.128'
    ' 3.02-1.128.6 1.513.223 2.632.11 2.91.706.769 1.131 1.751'
    ' 1.131 2.952 0 4.226-2.574 5.156-5.022 5.428.394.34.745'
    ' 1.01.745 2.036 0 1.47-.013 2.655-.013 3.017 0 .291.197'
    '.629.752.522C19.841 20.975 23 16.862 23 12c0-6.077-4.923'
    '-11-11-11Z"/></svg>'
)
_GITHUB_ICON_URI = (
    'data:image/svg+xml;base64,'
    + base64.b64encode(_GITHUB_ICON_SVG.encode('utf-8')).decode('ascii')
)


# ══════════════════════════════════════════════════════════════════════════════
# 2. SLIDER / CONTROL SPECS
# ══════════════════════════════════════════════════════════════════════════════
# Each slider is defined as a dict so the spec lives in one place.
# JS conversion: each entry maps to one <input type="range"> element.

SLIDERS = {
    # Beam direction (ZYZ Euler angles)
    'theta':  dict(min=0,   max=180, step=1, value=0,  label='θ (polar)'),
    'phi':    dict(min=0,   max=360, step=1, value=0,   label='φ (azimuthal)'),
    'chi':    dict(min=0,   max=360, step=1, value=0,   label='χ (roll)'),
    # Quantization axis
    'theta_b': dict(min=0,  max=180, step=1, value=0,   label='θ_B (polar)'),
    'phi_b':   dict(min=0,  max=360, step=1, value=0,   label='φ_B (azimuthal)'),
    # Waveplate chain
    'alpha1': dict(min=0,   max=180, step=1, value=0,   label='α₁  QWP₁ fast axis'),
    'alpha2': dict(min=0,   max=180, step=1, value=0,   label='α₂  HWP  fast axis'),
    'alpha3': dict(min=0,   max=180, step=1, value=0,   label='α₃  QWP₂ fast axis'),
}


def _slider_block(slider_id, spec, margin_bottom='12px'):
    """Return a labelled horizontal slider as a Div.

    JS conversion:
        <div class="slider-block">
            <label>{spec['label']}: <input type="number" id="{slider_id}-input">°</label>
            <input type="range" id="{slider_id}" min=... max=... step=... value=...>
        </div>
    """
    return html.Div([
        html.Div([
            html.Span(spec['label'] + ': ',
                      style={'color': '#B0B0C0', 'fontSize': '12px'}),
            dcc.Input(
                id=f'input-{slider_id}',
                type='number',
                value=spec['value'],
                min=spec['min'],
                max=spec['max'],
                step=spec['step'],
                debounce=True,
                style={
                    'width': '52px',
                    'backgroundColor': '#0D1B2A',
                    'color': '#E0E0E0',
                    'border': '1px solid #2A2A4A',
                    'borderRadius': '4px',
                    'fontSize': '12px',
                    'fontWeight': 'bold',
                    'textAlign': 'center',
                    'padding': '1px 4px',
                },
            ),
            html.Span('°', style={'color': '#B0B0C0', 'fontSize': '12px',
                                  'marginLeft': '2px'}),
        ], style={'marginBottom': '2px', 'display': 'flex',
                  'alignItems': 'center', 'gap': '4px'}),
        dcc.Slider(
            id=f'slider-{slider_id}',
            min=spec['min'],
            max=spec['max'],
            step=spec['step'],
            value=spec['value'],
            marks=None,
            tooltip={'placement': 'bottom', 'always_visible': False},
            updatemode='drag',
        ),
    ], style={'marginBottom': margin_bottom})


def _vertical_slider_block(slider_id, spec, height=160, display_label=None):
    """Return a labelled vertical slider as a Div — label + number input above,
    vertical dcc.Slider below.

    display_label: optional Dash component or string to override spec['label']
                   for the visible header (allows rich HTML like html.Sub).
    JS conversion: rotate a horizontal <input type="range"> 90° with CSS.
    """
    _input_style = {
        'width': '48px',
        'backgroundColor': '#0D1B2A',
        'color': '#E0E0E0',
        'border': '1px solid #2A2A4A',
        'borderRadius': '4px',
        'fontSize': '12px',
        'fontWeight': 'bold',
        'textAlign': 'center',
        'padding': '1px 4px',
    }
    label_content = display_label if display_label is not None else spec['label']
    return html.Div([
        html.Div(label_content,
                 style={'color': '#B0B0C0', 'fontSize': '11px',
                        'textAlign': 'center', 'marginBottom': '4px'}),
        html.Div([
            dcc.Input(
                id=f'input-{slider_id}',
                type='number',
                value=spec['value'],
                min=spec['min'],
                max=spec['max'],
                step=spec['step'],
                debounce=True,
                style=_input_style,
            ),
            html.Span('°', style={'color': '#B0B0C0', 'fontSize': '12px',
                                  'marginLeft': '2px'}),
        ], style={'display': 'flex', 'alignItems': 'center',
                  'justifyContent': 'center', 'marginBottom': '6px'}),
        html.Div(
            dcc.Slider(
                id=f'slider-{slider_id}',
                min=spec['min'],
                max=spec['max'],
                step=spec['step'],
                value=spec['value'],
                marks=None,
                vertical=True,
                verticalHeight=height,
                tooltip={'placement': 'right', 'always_visible': False},
                updatemode='drag',
            ),
            style={'display': 'flex', 'justifyContent': 'center'},
        ),
    ], style={
        'display': 'flex',
        'flexDirection': 'column',
        'alignItems': 'center',
    })


# ══════════════════════════════════════════════════════════════════════════════
# 3. LAYOUT
# ══════════════════════════════════════════════════════════════════════════════

# ── Shared styles ─────────────────────────────────────────────────────────────
STYLE_PAGE = {
    'backgroundColor': '#1A1A2E',
    'color': '#E0E0E0',
    'fontFamily': 'Inter, Segoe UI, sans-serif',
    'padding': '12px',
    'height': '100vh',
    'boxSizing': 'border-box',
    'display': 'flex',
    'flexDirection': 'column',
}

STYLE_ROW = {
    'display': 'flex',
    'flexDirection': 'row',
    'gap': '10px',
    'marginBottom': '10px',
}

STYLE_PANEL = {
    'backgroundColor': '#16213E',
    'borderRadius': '8px',
    'padding': '12px',
    'border': '1px solid #2A2A4A',
}

STYLE_SECTION_LABEL = {
    'color': '#7EC8E3',
    'fontSize': '11px',
    'fontWeight': 'bold',
    'letterSpacing': '0.08em',
    'textTransform': 'uppercase',
    'marginBottom': '6px',
    'marginTop': '10px',
}

TAB_STYLE = {
    'backgroundColor': '#1A1A2E',
    'color': '#B0B0C0',
    'border': '1px solid #2A2A4A',
    'borderRadius': '4px 4px 0 0',
    'padding': '6px 12px',
    'fontSize': '12px',
}

TAB_SELECTED_STYLE = {
    'backgroundColor': '#16213E',
    'color': '#E0E0E0',
    'border': '1px solid #457B9D',
    'borderBottom': '1px solid #16213E',
    'borderRadius': '4px 4px 0 0',
    'padding': '6px 12px',
    'fontSize': '12px',
}

# ── Controls panel ────────────────────────────────────────────────────────────
controls_panel = html.Div([

    html.Div([
        html.H3('PolariViz', style={
            'color': '#7EC8E3', 'fontSize': '16px',
            'margin': '0', 'letterSpacing': '0.1em',
        }),
        html.Div([
            html.A([
                html.Img(
                    src=_GITHUB_ICON_URI,
                    style={'width': '18px', 'height': '18px', 'display': 'block'},
                ),
                html.Span('Help', style={'fontSize': '13px'}),
            ],
            href='https://github.com/bdsmith147/polariviz#readme',
            target='_blank',
            style={
                'display': 'inline-flex',
                'alignItems': 'center',
                'gap': '4px',
                'color': '#B0B0C0',
                'backgroundColor': '#0D1B2A',
                'border': '1px solid #2A2A4A',
                'borderRadius': '4px',
                'padding': '3px 8px',
                'textDecoration': 'none',
                'cursor': 'pointer',
                'flexShrink': '0',
            }),
            html.A(
                html.Span('Feedback', style={'fontSize': '13px'}),
            href='https://github.com/bdsmith147/polariviz/issues',
            target='_blank',
            style={
                'display': 'inline-flex',
                'alignItems': 'center',
                'gap': '4px',
                'color': '#B0B0C0',
                'backgroundColor': '#0D1B2A',
                'border': '1px solid #2A2A4A',
                'borderRadius': '4px',
                'padding': '3px 8px',
                'textDecoration': 'none',
                'cursor': 'pointer',
                'flexShrink': '0',
            }),
        ], style={'display': 'flex', 'flexDirection': 'row', 'gap': '6px'}),
    ], style={
        'display': 'flex',
        'flexDirection': 'row',
        'alignItems': 'center',
        'justifyContent': 'space-between',
        'marginBottom': '8px',
    }),

    dcc.Tabs(
        id='controls-tabs',
        value='geometry',
        children=[

            # ── Tab 1: Geometry ───────────────────────────────────────────────
            dcc.Tab(
                label='Geometry',
                value='geometry',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[
                    html.Div([
                        # Left column: Beam Direction (~60%)
                        html.Div([
                            html.Div('Beam Direction', style=STYLE_SECTION_LABEL),
                            _slider_block('theta', SLIDERS['theta'], margin_bottom='20px'),
                            _slider_block('phi',   SLIDERS['phi'],   margin_bottom='20px'),
                            _slider_block('chi',   SLIDERS['chi'],   margin_bottom='4px'),
                        ], style={
                            'width': '60%',
                            'paddingRight': '10px',
                            'boxSizing': 'border-box',
                        }),
                        # Right column: Quantization Axis (~40%) — vertical sliders
                        html.Div([
                            html.Div('Quantization Axis', style=STYLE_SECTION_LABEL),
                            html.Div([
                                _vertical_slider_block('theta_b', SLIDERS['theta_b'],
                                    display_label=html.Div([
                                        html.Span(['θ', html.Sub('B')]),
                                        html.Div('(polar)', style={'fontSize': '10px', 'marginTop': '1px'}),
                                    ], style={'textAlign': 'center'})),
                                _vertical_slider_block('phi_b', SLIDERS['phi_b'],
                                    display_label=html.Div([
                                        html.Span(['φ', html.Sub('B')]),
                                        html.Div('(azimuthal)', style={'fontSize': '10px', 'marginTop': '1px'}),
                                    ], style={'textAlign': 'center'})),
                            ], style={
                                'display': 'flex',
                                'flexDirection': 'row',
                                'justifyContent': 'space-around',
                                'paddingTop': '4px',
                            }),
                        ], style={
                            'width': '40%',
                            'boxSizing': 'border-box',
                        }),
                    ], style={
                        'display': 'flex',
                        'flexDirection': 'row',
                        'paddingTop': '8px',
                    }),
                ],
            ),

            # ── Tab 2: Polarization Input ─────────────────────────────────────
            dcc.Tab(
                label='Polarization Input',
                value='polarization',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[
                    html.Div([
                        dcc.Tabs(
                            id='pol-tabs',
                            value='basis',
                            children=[
                                dcc.Tab(
                                    label='Basic',
                                    value='basis',
                                    style=TAB_STYLE,
                                    selected_style=TAB_SELECTED_STYLE,
                                    children=[
                                        html.Div([
                                            dcc.RadioItems(
                                                id='basis-radio',
                                                options=[
                                                    {'label': ' RHC', 'value': 'sigma_plus'},
                                                    {'label': ' V',   'value': 'pi'},
                                                    {'label': ' D',   'value': 'diagonal'},
                                                    {'label': ' LHC', 'value': 'sigma_minus'},
                                                    {'label': ' H',   'value': 'horizontal'},
                                                    {'label': ' A',   'value': 'antidiagonal'},
                                                ],
                                                value='sigma_plus',
                                                labelStyle={
                                                    'display': 'flex',
                                                    'alignItems': 'center',
                                                    'justifyContent': 'center',
                                                    'color': '#E0E0E0',
                                                    'fontSize': '13px',
                                                    'cursor': 'pointer',
                                                },
                                                style={
                                                    'marginTop': '10px',
                                                    'display': 'grid',
                                                    'gridTemplateColumns': 'repeat(3, 1fr)',
                                                    'gap': '14px 4px',
                                                },
                                            ),
                                        ]),
                                    ],
                                ),
                                dcc.Tab(
                                    label='Waveplate Chain',
                                    value='waveplate',
                                    style=TAB_STYLE,
                                    selected_style=TAB_SELECTED_STYLE,
                                    children=[
                                        html.Div([
                                            html.Div(
                                                '↓ vertical  →  QWP₁  →  HWP  →  QWP₂',
                                                style={'color': '#7EC8E3', 'fontSize': '11px',
                                                       'marginTop': '8px', 'marginBottom': '4px'},
                                            ),
                                            _slider_block('alpha1', SLIDERS['alpha1']),
                                            _slider_block('alpha2', SLIDERS['alpha2']),
                                            _slider_block('alpha3', SLIDERS['alpha3']),
                                        ]),
                                    ],
                                ),
                            ],
                            style={'marginBottom': '0px'},
                        ),
                    ], style={'paddingTop': '8px'}),
                ],
            ),

        ],
        style={'marginBottom': '0px'},
    ),

], style={**STYLE_PANEL, 'flex': '1', 'minWidth': '0', 'boxSizing': 'border-box'})

# ── 3D scene ──────────────────────────────────────────────────────────────────
scene_panel = html.Div([
    dcc.Graph(
        id='plot-3d',
        style={'height': '100%'},
        config={'displayModeBar': True, 'scrollZoom': False, 'modeBarButtonsToRemove': ['zoom3d', 'pan3d']},
    ),
], style={**STYLE_PANEL, 'width': '60%', 'boxSizing': 'border-box',
          'padding': '6px', 'display': 'flex', 'flexDirection': 'column'})

# ── Bottom row: level diagram ─────────────────────────────────────────────────
level_panel = html.Div([
    dcc.Graph(
        id='plot-level',
        style={'height': '35vh'},
        config={'displayModeBar': False},
    ),
], style={**STYLE_PANEL, 'flex': '1', 'minWidth': '0', 'boxSizing': 'border-box',
          'padding': '6px'})

# ── Bottom row: density matrix ────────────────────────────────────────────────
density_panel = html.Div([
    dcc.Tabs(
        id='density-tabs',
        value='amplitudes',
        children=[
            dcc.Tab(
                label='Amplitudes',
                value='amplitudes',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[dcc.Graph(
                    id='plot-amplitudes',
                    style={'height': 'calc(35vh - 38px)'},
                    config={'displayModeBar': False},
                )],
            ),
            dcc.Tab(
                label='Density Matrix',
                value='density',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[dcc.Graph(
                    id='plot-density',
                    style={'height': 'calc(35vh - 38px)'},
                    config={'displayModeBar': False},
                )],
            ),
        ],
    ),
], style={**STYLE_PANEL, 'flex': '1', 'minWidth': '0', 'boxSizing': 'border-box',
          'padding': '6px'})

# ── Bottom row: tabbed panel (ellipse / Poincaré) ─────────────────────────────
tabbed_panel = html.Div([
    dcc.Tabs(
        id='plot-tabs',
        value='ellipse',
        children=[
            dcc.Tab(
                label='Polarization Ellipse',
                value='ellipse',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[dcc.Graph(
                    id='plot-ellipse',
                    style={'height': '32vh'},
                    config={'displayModeBar': False},
                )],
            ),
            dcc.Tab(
                label='Poincaré Sphere',
                value='poincare',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[dcc.Graph(
                    id='plot-poincare',
                    style={'height': '32vh'},
                    config={'displayModeBar': False},
                )],
            ),
            dcc.Tab(
                label='Stokes',
                value='stokes',
                style=TAB_STYLE,
                selected_style=TAB_SELECTED_STYLE,
                children=[dcc.Graph(
                    id='plot-stokes',
                    style={'height': '32vh'},
                    config={'displayModeBar': False},
                )],
            ),
        ],
    ),
], style={**STYLE_PANEL, 'flex': '1', 'minWidth': '0', 'boxSizing': 'border-box',
          'padding': '6px'})

# ── Full layout ───────────────────────────────────────────────────────────────
app.layout = html.Div([
    # Row 1: 3D scene + controls
    html.Div([
        scene_panel,
        controls_panel,
    ], style={**STYLE_ROW, 'flex': '1', 'minHeight': '0', 'marginBottom': '10px'}),

    # Row 2: level diagram + density matrix + tabbed plots
    # level+density are wrapped in a 60%-wide group so the tabbed panel's
    # left/right edges align with the controls panel above it.
    html.Div([
        html.Div([
            level_panel,
            density_panel,
        ], style={
            'display': 'flex',
            'flexDirection': 'row',
            'gap': '10px',
            'flex': '0 0 60%',
            'minWidth': '0',
            'boxSizing': 'border-box',
        }),
        tabbed_panel,
    ], style=STYLE_ROW),

    # Footer
    html.Div(
        '© 2026 Benjamin Smith — License GPLv3+  ·  Co-Authored-By: Claude Sonnet 4.6',
        style={
            'textAlign': 'center',
            'color': '#555570',
            'fontSize': '11px',
            'paddingTop': '8px',
            'paddingBottom': '4px',
            'borderTop': '1px solid #2A2A4A',
            'marginTop': '4px',
        },
    ),

], style=STYLE_PAGE)


# ══════════════════════════════════════════════════════════════════════════════
# 4. CALLBACK
# ══════════════════════════════════════════════════════════════════════════════
# Single callback: all inputs → all outputs.
# JS conversion: this entire function becomes one updateAll() in app.js,
# called by addEventListener on every slider/radio/checkbox change.

@callback(
    # ── Outputs: all figures ──────────────────────────────────────────────────
    Output('plot-3d',         'figure'),
    Output('plot-level',      'figure'),
    Output('plot-amplitudes', 'figure'),
    Output('plot-density',    'figure'),
    Output('plot-ellipse',    'figure'),
    Output('plot-poincare',   'figure'),
    Output('plot-stokes',     'figure'),
    # ── Slider value displays (keep input boxes in sync with slider) ──────────
    Output('input-theta',   'value', allow_duplicate=True),
    Output('input-phi',     'value', allow_duplicate=True),
    Output('input-chi',     'value', allow_duplicate=True),
    Output('input-theta_b', 'value', allow_duplicate=True),
    Output('input-phi_b',   'value', allow_duplicate=True),
    Output('input-alpha1',  'value', allow_duplicate=True),
    Output('input-alpha2',  'value', allow_duplicate=True),
    Output('input-alpha3',  'value', allow_duplicate=True),
    # ── Inputs: beam sliders ──────────────────────────────────────────────────
    Input('slider-theta',   'value'),
    Input('slider-phi',     'value'),
    Input('slider-chi',     'value'),
    # Quantization axis
    Input('slider-theta_b', 'value'),
    Input('slider-phi_b',   'value'),
    # Polarization mode
    Input('pol-tabs',       'value'),
    Input('basis-radio',    'value'),
    # Waveplate sliders
    Input('slider-alpha1',  'value'),
    Input('slider-alpha2',  'value'),
    Input('slider-alpha3',  'value'),
    # Current 3D figure state (for preserving camera)
    State('plot-3d', 'figure'),
    State('plot-3d', 'relayoutData'),
    # Density matrix camera (for depth-sorting bars)
    State('plot-density', 'relayoutData'),
    # Poincaré sphere camera (for preserving orientation)
    State('plot-poincare', 'relayoutData'),
    State('plot-poincare', 'figure'),
    prevent_initial_call='initial_duplicate',
)
def update_all(
    theta, phi, chi,
    theta_b, phi_b,
    pol_mode, basis_state,
    alpha1, alpha2, alpha3,
    current_3d,
    relayout_data,
    density_relayout,
    poincare_relayout,
    current_poincare,
):
    # ── Run physics pipeline ──────────────────────────────────────────────────
    # JS conversion: this block becomes the body of updateAll() in app.js
    result = compute_all(
        theta_rad   = degrees_to_radians(theta),
        phi_rad     = degrees_to_radians(phi),
        chi_rad     = degrees_to_radians(chi),
        theta_B_rad = degrees_to_radians(theta_b),
        phi_B_rad   = degrees_to_radians(phi_b),
        input_mode  = pol_mode,
        basis_state = basis_state if pol_mode == 'basis' else None,
        alpha1_rad  = degrees_to_radians(alpha1),
        alpha2_rad  = degrees_to_radians(alpha2),
        alpha3_rad  = degrees_to_radians(alpha3),
    )

    # ── Build figures ─────────────────────────────────────────────────────────
    # JS conversion: each make_*_figure() call becomes its JS equivalent
    fig_amplitudes = make_amplitudes_figure(result)
    fig_stokes     = make_stokes_figure(result)
    fig_3d         = make_3d_figure(result)
    camera = None
    if relayout_data and 'scene.camera' in relayout_data:
        camera = relayout_data['scene.camera']
    elif current_3d and current_3d.get('layout', {}).get('scene', {}).get('camera'):
        camera = current_3d['layout']['scene']['camera']
    if camera:
        fig_3d.update_layout(scene_camera=camera)
    fig_level    = make_level_figure(result)
    dm_camera = None
    if density_relayout and 'scene.camera' in density_relayout:
        dm_camera = density_relayout['scene.camera']
    fig_density  = make_density_figure(result, camera=dm_camera)
    if dm_camera:
        fig_density.update_layout(scene_camera=dm_camera)
    fig_ellipse  = make_ellipse_figure(result)
    fig_poincare = make_poincare_figure(result)
    poincare_camera = None
    if poincare_relayout and 'scene.camera' in poincare_relayout:
        poincare_camera = poincare_relayout['scene.camera']
    elif current_poincare and current_poincare.get('layout', {}).get('scene', {}).get('camera'):
        poincare_camera = current_poincare['layout']['scene']['camera']
    if poincare_camera:
        fig_poincare.update_layout(scene_camera=poincare_camera)

    return (
        fig_3d, fig_level, fig_amplitudes, fig_density,
        fig_ellipse, fig_poincare, fig_stokes,
        theta, phi, chi,
        theta_b, phi_b,
        alpha1, alpha2, alpha3,
    )


# ══════════════════════════════════════════════════════════════════════════════
# 5. DENSITY MATRIX BAR DEPTH-SORT ON ROTATION
# ══════════════════════════════════════════════════════════════════════════════
# Reorders the 9 Mesh3d bar traces by distance from the camera eye whenever the
# user rotates the density plot. No physics is recomputed — bar centers are
# extracted directly from the existing trace vertex data.

@callback(
    Output('plot-density', 'figure', allow_duplicate=True),
    Input('plot-density', 'relayoutData'),
    State('plot-density', 'figure'),
    prevent_initial_call=True,
)
def resort_density_bars(relayout_data, current_figure):
    if not relayout_data or 'scene.camera' not in relayout_data:
        return no_update
    if not current_figure:
        return no_update

    camera = relayout_data['scene.camera']
    eye    = camera.get('eye', {})
    ex = eye.get('x', 1.25)
    ey = eye.get('y', 1.25)
    ez = eye.get('z', 1.25)

    data         = current_figure['data']
    mesh_traces  = [t for t in data if t.get('type') == 'mesh3d']
    other_traces = [t for t in data if t.get('type') != 'mesh3d']

    def dist_sq(trace):
        xs = trace['x']
        ys = trace['y']
        xc = (min(xs) + max(xs)) / 2
        yc = (min(ys) + max(ys)) / 2
        return (xc - ex)**2 + (yc - ey)**2 + ez**2

    mesh_traces_sorted = sorted(mesh_traces, key=dist_sq, reverse=True)

    current_figure['data'] = other_traces + mesh_traces_sorted
    current_figure['layout']['scene']['camera'] = camera
    return current_figure


# ══════════════════════════════════════════════════════════════════════════════
# 6. SLIDER ↔ NUMBER INPUT SYNC CALLBACKS
# ══════════════════════════════════════════════════════════════════════════════
# One pair per slider: slider → input (display sync) and input → slider (entry).
# Clamping is applied in the input→slider direction so the slider and displayed
# value always agree and stay within the valid physics range.
# JS conversion: not needed — <input type="range"> and <input type="number">
# can be kept in sync with a single oninput handler per parameter.

for _sid, _spec in SLIDERS.items():
    @callback(
        Output(f'slider-{_sid}', 'value'),
        Input(f'input-{_sid}', 'value'),
        prevent_initial_call=True,
    )
    def _sync_slider_from_input(val, _lo=_spec['min'], _hi=_spec['max']):
        if val is None:
            return no_update
        return max(_lo, min(_hi, val))


# ══════════════════════════════════════════════════════════════════════════════
# 7. RUN
# ══════════════════════════════════════════════════════════════════════════════

if __name__ == '__main__':
    app.run(debug=True, port=8050)