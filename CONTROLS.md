# Control reference

Everything the visuals respond to, organized around how you actually play it live. The
definitive saved state is [`ableton-touchdesigner-viz.toe`](ableton-touchdesigner-viz.toe) —
open that directly; `ableton_viz_setup.py` only builds the base audio-analysis network and
knows nothing about the MIDI/control layer described here.

## MIDI controller: MVAVE SMC-Mixer

**Physical CCs: knobs send CC 30–37, faders send CC 40–47.** TD's `midiin1` CHOP has
`onebased: true`, which adds **+1** to every raw CC number when building its channel name —
physical CC30 (Knob 1) arrives as `ch1ctrl31`, physical CC40 (Fader 1) arrives as `ch1ctrl41`,
and so on (Knob N → `ch1ctrl(30+N)`, Fader N → `ch1ctrl(40+N)`).

## Design rule

**Knob = magnitude** (thickness, density, spread, color/hue value, blur amount) —
things you judge by looking at the screen, not the knob position. **Fader = rate/time**
(speed, rotation rate, changing/breathing rate) — things you judge by the fader's height at
a glance. Three deliberate exceptions: Gain (fader, standard audio-gear convention), Mode
select (knob, discrete), and Rotation (knob, because "spin the knob to spin the pattern" is
too natural a gesture to give up even though rotation is technically a rate).

## Position 1 — fixed, same in every mode

| Control | CC → Channel | Function |
|---|---|---|
| Knob 1 | 30 → `ch1ctrl31` | **Mode select** (0–7), linear |
| Fader 1 | 40 → `ch1ctrl41` | **Gain** — log curve, `20 * (raw/127)^2.5` |

## Positions 2–8

| Pos | Knob (magnitude) | Fader (rate) |
|---|---|---|
| 2 | **Rotation** *(exception)*: Mode 3 rings-orbit, Mode 6 pattern rotation. No effect in Mode 7 currently (a diagonal-rotation experiment was tried and removed, see "Mode 7: Superstring" below) | **Speed**: default in most modes; Mode 3 override = ring/shape growth rate. No effect in Mode 7 currently (a flow-drift experiment was tried and removed) |
| 3 | **Color Mix** — picks the hue (sweeps the color wheel), lagged | **Color changing rate** — 0 = frozen on Knob 3's color, unbounded log curve above 0 |
| 4 | **Tunnel Hue** value — layered as an additive hue offset in *every* mode (on top of whatever each mode already does for color: Color Mix in 0/1/2/6, index rainbow in 3, hue-spread in 4, Tron hue in 5, per-origin hue offset in 7), plus its original **Hue-spread** value role in Mode 4 specifically | **Tunnel Hue changing rate** — 0 = frozen, unbounded log curve, same "applies everywhere" scope as the value |
| 5 | **Ring visibility** — the shared traveling ring is now drawn as an overlay in *every* mode (0/1/2/3/4/5/6/7), lagged. The 8 scattered rings in Mode 3 are a separate thing and always fully visible regardless of Knob 5. Mode 5 also keeps Knob 5's original Tron hue breathing rate role — **reverted to plain linear** (`raw/127`, bounded 0..1), not the log/unbounded family | **Ring speed** — likewise now drives the shared ring's travel speed in every mode (bipolar, unbounded in mode 7's own use, bounded ±40 as the base mechanism elsewhere). Mode 5 also keeps Fader 5's original Tron hue value role |
| 6 | **Thickness hub**: waveform line thickness (Modes 0/1/2, lagged), bar thickness (Mode 5), superstring vine/tendril thickness (Mode 7), ring thickness (Mode 3, lagged) — **plus the soft glow/blur halo around every line and both 3D meshes' line glow**, merged in here since they read as visually similar effects (previously Knob 8's job, see position 8 below). Waveform thickness's curve (Knob 6) is now **flat/linear through ~98% of the travel** (0 to 15), with unbounded divergence compressed into just the last handful of raw MIDI values at the very top — a true constant-slope linear curve can't become unbounded at a finite knob position, so this trades a barely-there acceleration right at the physical max for a linear feel everywhere else | Hue-spread rate (Mode 4) / bar-thickness rate (Mode 5) / ring-thickness rate (Mode 3) / **shared thickness-breathing rate** (also now drives the glow halo's breathing, same merge as above), unbounded log curve — waveform thickness (Modes 0/1/2, previously had no rate at all) and superstring thickness (Mode 7, previously static as tunnel thickness) now breathe too. *(Modes 4 and 6 were intentionally left with fixed/uncontrolled width — not part of this pass.)* |
| 7 | **Waveform X-scale** (Modes 0/1/2, lagged, unbounded — horizontal magnify/shrink) / **ring radius scale** (Mode 3, lagged) / **superstring field radius** (Mode 7 — log-compressed into a 0.5–2.4 multiplier) / **bar spacing** (Mode 5, lagged — horizontal distance between the 8 main bars' centers, independent of their thickness) | **Amplitude** (Modes 0/1/2/4, lagged, unbounded) / **Diversity** (Mode 7 — how many of the 6 scattered origins are active, 0..1 raw) / Diversity-spread (Mode 3, lagged, unbounded) / **Knob 7's breathing rate** (Mode 5 — how fast the bar spacing drifts, unbounded log curve) |
| 8 | **Optic flow shadow blur** — blur amount of the trailing echo copies (see "Optic flow shadow" below), 0 at CCW min (crisp echo) to strongly blurred at CW max | **Optic flow shadow movement** — direction + speed of the trail (see below), bipolar, center = stopped |

## Modes

| # | Name | Notes |
|---|---|---|
| 0 | Waveform | Single oscilloscope trace |
| 1 | Multi-wave | 14 overlapping traces |
| 2 | Aurora | Tron-style silhouette + traces |
| 3 | Raster Bars | Shared central ring + 8 scattered dissolving rings |
| 4 | Chromatic Bars | Dense rainbow bar chart. **Overridden:** `mode_switch1` routes this index to the 3D `grid3d` wave mesh instead (see "Mode 4's 3D mesh" below) — this GLSL scene still exists but is never actually shown |
| 5 | Tron EQ | Neon bar equalizer |
| 6 | Unknown Pleasures | The real CP1919 pulsar dataset (actual Joy Division album data) rendered as a stacked ridgeline, 3D-rotatable, audio modulates overall intensity. **Overridden:** `mode_switch1` routes this index to the 3D `ridgeline` mesh (see "Mode 6's 3D mesh" below); the old Moiré GLSL scene this replaced still exists in the shader but is never shown |
| 7 | Superstring | Organic 3D random-walk "vine" growth, spreading slowly across the whole screen from up to 6 scattered origins, plus finer "dark matter" tendrils and a shared traveling ring overlay. The only motion is the growth itself — static otherwise (see "Mode 7: Superstring" below) |

## Response lag

Fixed at a **constant 1.07s** — no longer live-controlled (it used to live on Knob 2, but
that's now dedicated purely to rotation). Every control marked "lagged" above smooths at
this fixed rate. If you want it adjustable again, it needs a new home — ask and it can be
wired to a free control.

## Curve types, in plain terms

- **Log/unbounded** (`t^k / (1-t)` family, `t = raw/127` or similar): fine control through
  most of the travel, diverging sharply only in the last stretch — used for anything marked
  "unbounded" above (Speed, Amplitude, X-scale, blur amount/rate, hue-changing rate, ring
  speed, rotation rate). None of these have a hard ceiling; pushed far enough they reach
  extreme values (fast strobing, huge scale, etc.) by design.
- **Bipolar** (Speed, ring speed, rotation, mode-3 growth/orbit): center of the fader/knob =
  stopped; one side = one direction, the other = the opposite. Speed (Fader 2) has a small
  dead-zone right at center (raw within ~8% of center snaps to exactly 0) so it reliably
  freezes instead of drifting from controller noise.
- **"Changing"/breathing rate controls** (Color Mix rate, Tunnel Hue rate, rings-thickness
  rate, blur breathing rate, Tron hue rate, hue-spread rate, bar-width rate, line-density
  rate): at 0 the value sits exactly on the knob's chosen base with zero drift; above 0 it
  starts cycling away from that point, faster as the fader rises, with no ceiling. All of
  these now share the same log curve (exp 2.5) and the same jump-free mechanism: each has
  its own dedicated accumulator clock, completely independent of Fader 2/Speed and of each
  other, so moving one rate control never causes a sudden visual jump in that effect (the
  old approach multiplied a large ever-growing clock by the live rate, which jumped the
  phase every time the fader moved).

## F1 (Gain) vs F7 (Amplitude) — why both exist

These look redundant (both "make the reactive visual bigger") but they act on two different
stages of the pipeline and solve two different problems:

- **F1/Gain is input-side sensitivity.** It rescales the *raw* incoming audio (band/level
  values, often tiny — 0.01–0.1 from a real mix) up into a usable 0–1 range before anything
  else touches it: `gLevel() = clamp(uLevel * uGain, 0, 1)`, `gBand(b) = clamp(b * uGain, 0, 1)`.
  Same role in Mode 4's 3D mesh simulation (`height_script1`): gain scales each raw band value
  before it's allowed to inject energy into the wave physics.
- **F7/Amplitude is output-side visual scale.** It's applied *after* gain, to the
  already-normalized, already-reactive result — it only controls how big the resulting shape
  is drawn (`uWaveSize` in the 2D traces; `amplitude` multiplying final wave height in the 3D
  mesh). It does not change how responsive the visual is to the music's dynamics, only how
  large the already-responsive result appears.

In practice: if F1 is too low, quiet passages barely move the visual at all, no matter how
high F7 is. If F1 is too high, everything slams to the clamp ceiling and stops being
dynamic — loud and quiet parts look identical, no matter how low F7 is. F7 never fixes an
unresponsive signal; it only resizes whatever F1 already let through. Not redundant — they're
answering "can it hear the music correctly" (F1) vs. "how big do I want to draw what it
heard" (F7).

## K3 (Color Mix) vs K4 (Tunnel Hue) — why both exist

Same question as F1/F7, different mechanism. These look redundant (both "shift the color")
but K3 alone structurally cannot reach every color at full saturation — K4 is the one thing
that fixes that, not a duplicate control.

**Root cause:** in the 3D mesh's color formula (and in any 2D-mode usage that calls
`tint(colorHue())` with its own hue argument), K3's single value is reused for two different
jobs at once — it's both the hue-wheel position *and* the white↔color blend amount (`cm`).
Concretely: `color = mix(white, hsv(hue, 1, 1), cm)`, and when `hue == cm == K3`, saturation
ends up tied to *distance from red*. Verified numerically:

| K3 position | Nominal hue | What you actually see |
|---|---|---|
| 0.33 | green | pale washed-out mint (only 33% saturated) |
| 0.66 | blue | pale dusty lavender (only 66% saturated) |
| 1.0 (wraps) | red | the *only* point reaching full, vivid saturation |

So turning K3 alone sweeps the hue wheel, but only the red wraparound point ever looks truly
vivid — every other hue is forced pastel in proportion to how far it sits from red.

**Why K4 fixes it:** K4's tunnel-hue is *added* to the final hue used for display but is
**not** part of the saturation calculation (`final_hue = cm + tunnel_hue`, saturation only
ever depends on `cm`). So you can push K3 up near max (maxing out saturation, landing near
red) and then use K4 to dial the displayed hue to anywhere else on the wheel — any hue, full
saturation — something K3 alone cannot do.

**Conclusion:** K3+K4 is a necessary pair, not a redundant one, as long as the "white at
minimum" blend behavior (explicitly requested) stays tied to K3's own value. A redesign
where K3 alone reaches full saturation at every hue is possible (split the single knob's
travel into a fast white→saturated ramp over roughly the first 15%, then a full-wheel hue
sweep at locked full saturation for the rest) but was intentionally **not implemented** —
decided to keep K3+K4 as-is for now.

## Mode 4's 3D mesh — control overrides

The 3D wireframe water-plane mesh (`grid3d`) has its own dedicated roles for several
positions, layered on top of (or replacing) the general table above:

- **Knob 2 / Fader 2 — rotation/tumble.** True axis-angle tumbling (`tumble_script1`): Knob 2
  is wobble amount (how far the spin axis itself precesses off a clean single-axis spin),
  Fader 2 drives spin speed via the shared `rotx_accum` clock. This is the *only* thing that
  moves the mesh as a whole — density and the wave physics never do (see below).
- **Knob 5 — mesh density**, not Ring visibility: live grid resolution from 2×2 up to
  120×120 cells (`meshgrid1` cols/rows). Below ~8×8 the grid is too coarse to show real
  ripple structure and the whole mesh reads as swinging/tilting rather than rippling — that's
  a hard geometric floor (4 corner points can't encode localized bumps), not a tunable bug.
  Wave footprint size (`INJECT_RADIUS`/`INJECT_SIGMA`) and smoothing passes scale with density
  so the wave's look stays constant in world units regardless of where Knob 5 sits.
- **Knob 3 (Color Mix) / Fader 3, Knob 4 (Tunnel Hue) / Fader 4 — unchanged**, still set the
  mesh's base color exactly as in the general table.
- **Fader 5 — rainbow spread + speed** (new, `color_script1`/`color_to_sop1`, replaces Ring
  speed for this mesh only). At F5=0 the mesh is a single uniform color (identical to K3/K4's
  base hue, so the look is unchanged from before this control existed). Turning F5 up spreads
  that base hue out into a full rainbow gradient across the mesh (diagonal by grid row+col)
  *and* speeds up how fast that gradient scrolls — both driven by the same raw fader value so
  they scale together. F5=0 freezes the scroll, matching every other "changing rate" control's
  zero-drift convention. Implemented as a per-point `Cd` color attribute (a `color_script1`
  scriptCHOP feeding a `color_to_sop1` chopToSOP), with `wiremat1`'s own constant color set to
  white so it passes the per-point color through unmodified. K3's white↔color blend (`cm`,
  see "K3 vs K4" above) still applies to every point here too, not just the single base
  color — K3 fades the whole rainbow toward white at K3=min, same as before this control
  existed.

## Mode 6's 3D mesh — control overrides ("Unknown Pleasures")

A second 3D mesh (`ridgeline`), forked from Mode 4's `grid3d` pipeline and sharing most of its
mechanisms, but rendered as independent horizontal row LINES (`meshgrid1 surftype='rows'`, no
cross-strands) instead of a crosshatch — the CP1919/Joy-Division "stacked pulsar chart" look.

**Wave shape is the real CP1919 pulsar data, not a simulation.** The first version used a
forked copy of Mode 4's ripple-tank physics with an artificial column window to fake the
"concentrated in the middle" look — this was replaced entirely after it didn't read as
authentic and had a hard, unnaturally sharp cutoff at the row edges. `height_script1` now
reads [`data/cp1919_pulsar.csv`](../data/cp1919_pulsar.csv) (CC0, 24,000 points: 80 successive
real pulses × 300 time-bins each, from Harold Craft's 1970 PhD thesis / Arecibo Observatory
data — the actual dataset behind the real album cover, sourced via
[github.com/pachadotdev/cp1919](https://github.com/pachadotdev/cp1919)) once on startup and
bilinearly resamples it to the current grid size every cook: columns map to the 300 time-bins,
rows map to the 80 pulses (cyclically, as a continuous loop — see "movement" below). The
"concentrated in the middle, irregular noise at the edges, no hard cutoff" character is simply
what the real data looks like — no artificial window needed.

**Movement/audio response** (two independent sources, so the pattern genuinely moves rather
than just scaling uniformly): (1) a slow constant scroll through the 80-row dataset, treated as
a cyclic loop (`SCROLL_ROWS_PER_SEC = 3.0`, a fixed constant, not user-controlled) — there's
always some motion even in silence, like a live feed rather than a frozen image; (2) **Gain
(Fader 1) is sensitivity** — same role as everywhere else in this project (see the F1-vs-F7
section above) — scaling how strongly raw audio reaches a per-row modulation that's smoothly
interpolated across the 8 bands *by row position* (row 0 leans toward band 0, the last row
toward band 7), so different frequencies visibly intensify different parts of the stack, not
a uniform brightness pulse; its effective range (`AUDIO_INTENSITY_MIN`/`MAX`, 0.6–4.2, a 3.6×
spread) was widened 3× on request for more dynamic range. **Amplitude (Fader 7) is output
scale** — how tall the result is drawn — scaled against a *fixed reference* row spacing (80
rows' worth) rather than the live one, so turning Knob 5 up doesn't shrink peak height the way
it did in an earlier version (at max density + max amplitude, peaks had collapsed to
near-nothing since the live spacing had halved); F7 now reads consistently regardless of
density, ranging from ~1× that reference spacing (barely poking above a neighboring row) to
~10× (`PEAK_MULT_MAX`, also widened 3× — dramatically poking through many rows ahead of it).

**Known TD quirk, worked around:** a Grid SOP with `surftype='rows'` at *exactly* `rows=1`
generates a degenerate duplicate primitive (confirmed via direct introspection — `numPrims=2`,
242 vertices referencing only 120 points, vs. the clean 1-primitive-per-row behavior at
`rows>=2`), rendering as a spurious flat line across the whole width in addition to the real
one. `meshgrid1`'s own rows expression now floors at 2, never requesting exactly 1 from TD;
`height_script1` tracks the user-facing "visual" row count (which can still be 1, per Knob 5's
full range) independently and, when it's 1, makes every actual mesh row sample the identical
pulsar row so the extra geometry overlaps invisibly and it still reads as one line.
- **Knob 2 / Fader 2 — rotation/tumble**, identical mechanism to Mode 4, sharing the *same*
  `rotx_accum`/`rotx_rate` clock so the rotation feel matches between modes.
- **S button (CC29, track 2 toggle) — same position-reset/freeze gate as Mode 4**, and it's
  the literal same global MIDI read (`ch1ctrl30 > 63`) in both modes' `tumble_script1`, so
  toggling it freezes whichever 3D mesh is currently showing (and the other, if you switch
  modes while it's engaged).
- **Knob 5 — row count (line density), inverted direction from Mode 4's Knob 5:** CCW/min =
  1 single line, CW/max = 200 lines (a practical ceiling — the real data lookup is much
  cheaper than the old ripple-tank sim, ~13ms/frame at 200 rows × 120 fixed columns, vs.
  ~62ms/frame the old simulation needed at the same cell count; "infinity" still isn't
  performance-free, but there's much more headroom now). Column count stays fixed at 120
  regardless of Knob 5 — only row count changes. Changing Knob 5 no longer has any chance of
  breaking the wave (no persistent per-density state anymore — every cook resamples fresh).
- **Knob 3 (Color Mix) / Fader 3, Knob 4 (Tunnel Hue) / Fader 4 — unchanged**, same base-hue +
  white-blend mechanism as Mode 4, producing one uniform color across the whole mesh.
- **Fader 1 (Gain) and Fader 7 (Amplitude)** — sensitivity and output scale respectively, see
  "Movement/audio response" above.
- **Fader 5 — intentionally left unassigned** for this mode (unlike Mode 4, which uses it for
  rainbow spread/speed). No spatial color effect here, by request.
- **Knob 6/Fader 6, Knob 8/Fader 8 — same mechanisms as Mode 4** (thickness pixel-dilation,
  quantized blur).

## Mode 7: Superstring — control overrides

Replaced the old "Odyssey" 2001-style tunnel entirely (`sceneSuperstring()` in
`minimal_glitch.frag`, was `sceneTunnel()`). Went through four iterations based on direct
feedback, each documented in NOTES.md:

1. A clean analytic logarithmic spiral — read as too static/mechanical, every strand bent the
   exact same predictable way.
2. A biased 3D random walk per strand instead (DLA/Eden-growth-style, like bacterial/coral
   colony spread) — better bending, but growth was tied to Fader 2's speed ("too fast, not
   really growing"), the halo was too soft ("too blur"), and audio reactivity was too strong.
3. Kept the random-walk strands, decoupled growth from any knob (plain elapsed time), tightened
   the halo, gentled audio reactivity — but *added* a continuous diagonal 3D tumble (Knob 2), a
   bidirectional flow drift (Fader 2), a traveling wave ripple along every strand, and a fast
   sinusoidal pulse on each origin core. Net result: "don't like it... too much and too fast."
4. **Current version**: stripped all of that back out. **The only motion in this scene is slow
   growth** — no auto-rotation, no drift, no per-frame shape wiggle, no fast-breathing cores. A
   strand's geometry is a pure function of its random seed, fixed forever once computed; only
   how much of it is revealed changes, slowly, over roughly a minute or two per strand. Origins
   are also now spread across the *entire* visible frame (not clustered within half a screen's
   radius of center) with much longer per-strand reach, so growth genuinely spans the whole
   screen instead of staying confined to one corner. Knobs 2 and 7 no longer have a mode-7 role
   (the diagonal-rotate and flow experiments from iteration 3 are gone); Fader 2 is back to its
   global Speed role, with no Mode 7-specific effect right now.

**Two real bugs worth knowing if this gets extended further, both the same shape:** a
"did we find X this frame" value defaulting to something indistinguishable from legitimate
data. (1) A `tipGlow` term defaulted its "tip position" to the current pixel's own screen
position when no segment was partially grown that frame (true for a long stretch once a strand
finishes growing) — distance-to-self is `0`, so `exp(0) = 1.0`, the single brightest value the
term could produce, and it leaked into the sum for every pixel. (2) The origin-core glow's
falloff radius was divided by a per-origin `depthBoost` term meant only to brighten near-camera
origins — at high values that denominator grew instead of shrinking, which slowed the falloff
rate, blowing the core out into a soft radius covering much of the screen. Both fixed the same
way: never let a fallback/derived value be numerically indistinguishable from a legitimate
result — use an explicit `bool found` flag for (1), and keep depth out of a falloff radius
entirely, using it only as a brightness multiplier, for (2).

- **Knob 2, Knob 7 — no mode-7 role currently**: the diagonal-rotation and flow-radius
  experiments from iteration 3 were removed along with the rest of the auto-motion. Available
  for a future control if wanted.
- **Knob 3 (Color Mix) / Fader 3, Knob 4 (Tunnel Hue) / Fader 4** — same base-hue + white-blend
  mechanism as every other mode; each origin gets its own small additive hue offset so the
  field reads as warm/cool-varied rather than one flat color, and the dark-matter tendrils get
  an extra violet-leaning shift.
- **Knob 6/Fader 6 — Thickness hub**: scales both vine and tendril thickness, breathing via
  Fader 6 same as elsewhere.
- **Fader 7 — Diversity** (was "Spoke Density" in the old tunnel): raw 0..1 value gates how
  many of the 6 origins are active (each of the 5 non-center origins has its own random reveal
  threshold it crosses as Diversity rises), widens per-string parameter variance, modestly
  speeds up growth, and scales the tendril count from 10 up to 36.
- **Knob 5/Fader 5 — Ring visibility/speed**: the shared traveling ring (see "Odyssey ring"
  elsewhere) still overlays this mode identically to Modes 3/6.
- **Audio-reactivity, intentionally subtle by request**: each vine/tendril is keyed to one of
  the 8 frequency bands for a gentle brightness nudge only (`0.85 + 0.4*band`) — never growth
  timing, to avoid the live-rate phase-jump bug documented in NOTES.md — and the whole scene
  pulses brighter on the kick/bass band, same convention as the old tunnel's `kickPulse`. No
  shape wiggle or wave ripple of any kind as of this version.
- **Knob 8/Fader 8 — Optic flow shadow**: same global post-effect as every mode, no
  mode-specific work needed.

## Optic flow shadow (K8/F8) — global, every mode

K8/F8 used to drive a soft glow/blur halo (now merged into Knob 6/Fader 6's thickness hub —
see position 6 above). They're now a single global post-effect applied to the final
composited image, after `mode_switch1` and `level_post`, before `window1` — works identically
across all 8 modes since it operates on the finished 2D image, not per-mode internals.

**Mechanism**: a stamped zoom-echo feedback loop, tuned through two rounds of real fixes (see
below) — `opticflow_feedback1` → `opticflow_decay1` → `opticflow_scale1` →
`opticflow_blur_bypass`/`opticflow_blur1` → composited additively with the live frame →
`opticflow_stamp_source` gates whether that composite or just the bare trail feeds back in.
`window1` displays `opticflow_composite1` (live frame + current trail) every cook; only the
*feedback* accumulation is gated, so the current pattern always stays crisp and current while
the trail behind it updates in discrete steps.

- **Fader 8 — direction + speed**: bipolar with the same center dead-zone convention as Speed
  (Fader 2) — raw within ~8% of center snaps to exactly stopped. The scale-per-cook factor is
  `exp(zoomRate / 60)` (project runs at 60fps), so it's an exponential/compounding zoom, not
  linear — `zoomRate` uses the same bipolar unbounded-log-curve shape as `speed_curve`, just
  with a much smaller coefficient (0.35, not 60.0) since even modest sustained e-foldings/sec
  compound fast cook over cook. **Up** = trail scales up, reads as the pattern continuously
  expanding outward from center — rushing toward you. **Down** = trail scales down, pulling
  inward toward center — receding away. **Center** = scale locked at exactly 1.0, frozen.
- **Knob 8 — blur amount, shadows only**: `opticflow_blur1`'s size, quantized to 4px steps
  (same recompile-avoidance trick the old glow blur used). A separate `opticflow_blur_bypass`
  switchTOP routes around the blur entirely below raw CC 1 — TD's Blur TOP floors at 1px
  internally and can't actually reach zero through its own `size` parameter, so true "no blur"
  needs this bypass, not just driving size to 0. Blur only ever touches the trail; the live
  frame composited on top every cook is never blurred, at any Knob 8 setting.
- Pivot is locked to exact screen center (0.5, 0.5 fraction) for the scale, so the zoom always
  reads as radiating from/to the middle of the frame regardless of what's on screen.

**Two real bugs found and fixed while tuning this (both from the first build, not present
now):**
- **It only ever showed a glow around one bright spot, not the whole pattern.** Root cause:
  the feedback loop was blending in new content *every single cook* with no gap, which
  averages consecutive frames into a smooth gradient — any shape detail washes out into a
  soft blob, leaving only the brightest/largest feature (a center glow) visible. Fixed by
  having the feedback only accept new content every 15th cook (`opticflow_stamp_source`,
  `int(absTime.frame) % 15 == 0`) — between stamps, the existing trail just keeps scaling and
  decaying untouched. This freezes a genuine snapshot of the *whole* pattern's actual shape
  into each generation instead of blending it away, which is what actually produces distinct,
  separated echo copies ("shattered, not continuous," per the request) rather than one smear.
- **No shadow was visible at all** once the stamping fix went in, even though the mechanism
  was structurally correct. Root cause: the live frame was composited `over` the trail, and
  the live frame's background is opaque black (alpha filled, not transparent) — `over`
  compositing with an opaque top layer replaces 100% of what's underneath every cook,
  erasing the trail regardless of whether that cook was a stamp or not. Switched to `add`
  compositing (correct for a glow-trail-on-black effect: black contributes nothing, so only
  actual bright content shows through and layers up) and added `opticflow_decay1` (a fixed
  0.96×/cook brightness falloff) so added brightness doesn't accumulate forever — each
  generation now genuinely fades out, matching "a series of shadows fading."

## Known quirks worth knowing

- **F7 keeps 4 roles at once** (Amplitude, Diversity for Mode 7, Diversity-spread for Mode 3,
  line density) because they're all mode-exclusive — only one is ever active depending on
  which mode you're in.
- **Unbounded curves can outrun what's visible.** Pushed near the very top of travel, a
  control's underlying value can already be enormous (e.g. amplitude in the thousands) while
  looking visually identical to a slightly-lower setting, because the visual result has
  already saturated (off-screen, fully stretched flat, etc.) — that's expected, not a fault
  in the knob/fader response.
