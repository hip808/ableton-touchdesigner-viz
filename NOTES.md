# TouchDesigner gotchas found while building this

A list of things that failed *silently* — no error, no crash, just wrong behavior — while
building this project. Worth reading before extending the network, since several of these
cost significant debugging time.

## Keep the Mac awake only during a live show with `ui.performMode` + `caffeinate -w`

The screensaver/sleep kicking in mid-performance is a separate problem from "is Claude actively
working" (Claude Code's own "keep awake while working" setting only holds while *it's* computing,
not while you're just running TD live on your own). The clean, TD-native fix: an Execute DAT
(`/ableton_viz/caffeinate_perform`, frame-start callback on) that starts `caffeinate -d -i -w
<TD's own pid>` when `ui.performMode` goes `True` and terminates it when it goes `False`:

```python
import subprocess, os
_proc = None

def _start():
	global _proc
	if _proc is None or _proc.poll() is not None:
		_proc = subprocess.Popen(['caffeinate', '-d', '-i', '-w', str(os.getpid())])

def _stop():
	global _proc
	if _proc and _proc.poll() is None:
		_proc.terminate()
	_proc = None

def onFrameStart(frame):
	if ui.performMode:
		_start()
	else:
		_stop()
	return

def onExit():
	_stop()
	return
```

`-w <pid>` ties the assertion to TD's own process, so a crash or force-quit releases it
automatically with no cleanup step. Verified both directions with `pmset -g assertions`: entering
Perform mode (F1/Esc) shows a live `caffeinate` holding `PreventUserIdleDisplaySleep` and
`PreventUserIdleSystemSleep`; leaving it removes the process entirely. Edit mode sleeps normally.

## gridSOP has a built-in "rows only" surface type — no custom geometry needed for a ridgeline look

`surftype` on a Grid SOP isn't just `quads`/`triangles` — its menu also has `rows`, `cols`,
and `rowcol`. Setting it to `rows` renders the grid as independent horizontal polylines with
zero cross-strands, instantly giving a CP1919/Joy-Division "stacked oscilloscope" look with no
custom line-building code — just reuse the same flat-plane-plus-Y-displacement approach already
used for a crosshatch mesh (`height_script1`/`displace_script1` in this project) and flip this
one parameter. Easy to miss since the default/obvious value (`quads`) already looks reasonable
for a generic mesh, so there's no error or obvious prompt to go check the menu's other options.

## Ableton Link is a separate CHOP, not a Beat CHOP setting

There is no "Source: Link" option on the regular Beat CHOP in this TD build. Ableton Link
sync requires a dedicated **Ableton Link CHOP** (`abletonlinkCHOP` in Python), with its
**Enable** parameter turned on. It exposes `numpeers`, `linked`, `waiting`, `synced`, and a
`ramp` channel (0->1 per beat) by default — other channels like `beat`, `tempo`, `phase`
exist per the docs but need the CHOP's scope widened to appear.

## Audio Filter CHOP: `units` must be `'frequency'`, not the default `'logarithmic'`

This was the single biggest time sink. The Audio Filter CHOP's `cutofffrequency` parameter
is **silently ignored** unless `units` is set to `'frequency'`. Left at the default
`'logarithmic'`, the filter instead uses a different, unset parameter (`cutofflog`), so
every filter node — regardless of its own distinct `cutofffrequency` value — behaves
identically. Symptom: 8 band-pass filters at 8 different frequencies all producing the
exact same output to 15 significant digits. No error, no warning.

```python
flt.par.units = 'frequency'
flt.par.cutofffrequency = 800  # now actually takes effect
```

## Analyze CHOP: RMS is `'rmspower'`, not `'rms'`

Setting `par.function = 'rms'` doesn't error — it just doesn't match any menu item and
silently leaves the parameter at its default (`'average'`). `'average'` on raw bipolar
audio produces small values that swing *negative*, which is a giveaway something's wrong
(true RMS/power is never negative). Check `.menuNames` on any menu parameter before
assuming a string will match:

```python
print(op('...').par.function.menuNames)
# ['average', 'maximum', 'minimum', ..., 'rmspower', ...]
```

## GLSL TOP has no built-in time uniform

Despite what similar shaders elsewhere assume, there's no `uTime`, `uTDTime`, or
equivalent. Declare your own `uniform float uTimeSec;` and bind its Value to the
expression `absTime.seconds` in the Vectors page.

## Never multiply elapsed time by a live-changing rate for animation

`sin(x + uTimeSec * speed)` looks fine until `speed` changes while the app has been running
a while — since `uTimeSec` only grows, even a tiny change in `speed` produces a phase jump
proportional to how long the session's been open (thousands of radians after a few hours).
Symptom: turning a "speed" knob causes the visual to flicker/jump wildly for a moment before
"settling." Fix: don't multiply elapsed time by a live rate at all. Feed the rate through a
**Speed CHOP** (`order = 'first'`, i.e. velocity -> position) to get a smoothly accumulating
phase value instead, and use *that* in the shader — it's immune to this because it
integrates the rate continuously rather than reconstructing a position from
`time * current_rate`.

## GLSL TOP's Vectors page does not auto-detect uniforms

Declaring `uniform float uFoo;` in the shader does not create a matching parameter. You get
a runtime warning listing every unassigned uniform by name ("Warning: Uniform 'uFoo' is not
assigned..."), but you still have to manually click **+** on the Vectors page, type the
exact name into **Name**, and put an expression or constant in **Value** yourself, once per
uniform.

## Window COMP takes its TOP via `winop`, not a cable or a param called `operator`

Window COMP has no video input connector. It displays whatever operator its `winop`
parameter references (assign the TOP object or its path directly). There's also no
scriptable "Fullscreen" parameter in this build — full-screening a window is a manual
UI action (drag to the target display, then the OS/TD fullscreen shortcut).

## TD parameter expressions are plain Python, not GLSL

`floor()` is not defined in a TD parameter expression (it's a GLSL/shading-language
built-in). Use Python's `int()` for truncation instead. A bad expression here throws a
generic `td.tdError` with no detail in the Textport — the real reason only shows up in that
parameter's own error/warning text (`op(...).par.X.eval()` raises, but doesn't say why; the
parameter's tooltip or an Info DAT for the *containing* operator will).

## The Textport is a real Python REPL — watch for open blocks

Pasting a multi-line `for`/`if` block leaves the REPL in a continuation state (`...`
prompt) until it sees a blank line. Pasting a *new* top-level statement right after a loop
body, without that blank line first, gets swallowed into the loop and throws a confusing
`SyntaxError` pointing at unrelated code. Always send a blank line to close a block before
the next statement.

## "Sync to File" is bidirectional — a stale editor window can overwrite newer changes

If the shader's Text DAT has **Sync to File** on and the `.frag` file is also open in a
plain text editor (TextEdit, etc.), whichever side saves *last* wins — including
overwriting changes made from the other side after the editor loaded its (now stale) copy.
Symptom: edits mysteriously "revert." Close and reopen the file in your editor after any
external change (from TD itself, or from an AI assistant editing the file directly) before
making further edits there.

## TD's numbered auto-backups grow forever — prune them with an Execute DAT's `onProjectPostSave`

TD writes a new `<project>.NNN.toe` into a `Backup/` folder on every save and never deletes
old ones — no setting caps this, and it fails silently in the sense that nothing ever
complains, the folder just quietly grows (hit 210+ files in this project before being
noticed). An **Execute DAT** (not a special preference or global script) has built-in
`onProjectPostSave()`/`onProjectPreSave()` callbacks that fire automatically per-project
once its `active` and `projectpostsave` toggle parameters are on — no extra wiring needed.
This project's `backup_pruner` (`/ableton_viz/backup_pruner`) uses that callback to keep
only the newest 15 backups by their embedded number, deleting the rest after each save. One
quirk: TD moves its most-recent root-level numbered backup into `Backup/` in a step that
lands *after* `onProjectPostSave` fires, so the kept count settles at 16 in practice, not
exactly 15 — harmless and stable, just worth knowing if the count looks off by one.

## Bluetooth MIDI devices need TD's own MIDI subsystem to "see" them first

A MIDI In CHOP pointed at a Device ID with nothing registered there fails with "Could not
open the MIDI interface" — even if the OS (Audio MIDI Setup) and other apps (Ableton Live)
already see the device fine. Open **Dialogs -> MIDI Mapper** once (and use "Check MIDI
Devices" if needed) to get TD to actually scan and populate `/local/midi/device`.

## Script SOP points have no `.color`/`Cd` property — use a scriptCHOP + chopToSOP instead

A Script SOP's `Point` object only exposes `P, x, y, z, index, normP, owner` — there is no
`.color` member, despite `scriptOp.pointAttribs.create('Cd')` succeeding without error and
returning a real `Attribute` object. That attribute's own API (`.vals()`, `arraySize`, etc.)
turned out to be the newer POP-attribute interface ("Returns the attribute values as a list
**for POPs**" — in its own help text), not something that writes back per-point SOP color
through the Python object model used here. No error anywhere in this chain — `pt[attrib]`
just raises `'td.Point' object is not subscriptable`, which looks like a syntax/API mistake
rather than "this path doesn't do what you think."

The working, well-trodden alternative: a **scriptCHOP** outputting `r`/`g`/`b` channels (one
sample per point, same row-major order as any other per-point CHOP data in the network —
see `height_script1`/`displace_script1`), fed into a **chopToSOP** with `chanscope = 'r g b'`
and `attscope = 'Cd(0) Cd(1) Cd(2)'`, `mapping = 'onetoone'`. This mirrors the project's
existing `soptoCHOP` (`mesh_base_chop1`) used for the reverse direction, and is the pattern
this project now uses for the grid3d mesh's rainbow coloring (`color_script1` ->
`color_to_sop1`). Point color on the destination MAT (`wireframeMAT` here) is picked up
automatically once a `Cd` attribute exists on the geometry — no separate toggle needed, but
the MAT's own constant color still multiplies against it, so set that constant to white if
you want the per-point color to show through unmodified.

## `Connector.connect()` silently replaces without needing `.disconnect()` first

Calling `.connect(newSource)` on an already-connected input just rewires it — no need to
call `.disconnect()` first. (`.disconnect()` on a `Connector` object doesn't exist as an
`isConnected` check either; that attribute isn't there in this build.) Rewiring a single
input in a multi-input Merge CHOP by index after the fact can also silently shift *other*
inputs if you're not careful about how many connectors currently exist — rebuild the full
input list explicitly if in doubt, rather than patching indices one at a time.

## Analytic logarithmic-spiral growth, and why straight lines read as "mechanical" not "organic"

For Mode 7's "superstring" redesign (organic cosmic patterns that grow like a plant), a
logarithmic spiral `r(theta) = r0 * exp(k*theta)` is analytically invertible per-pixel:
`thetaCurve = log(radiusPixel/r0) / k` gives the angle at which the coil would pass through
that pixel's radius, so a single continuously-advancing `curTheta` (how far the spiral has
swept so far) is the entire "growth" state needed — no persistent per-frame memory, no
particle simulation. Two lessons from iterating on this with real user feedback:

- **Scaling a complete shape's radius reads as "breathing," not "growing."** A first attempt
  just grew ellipses from 0.3x to 1.0x scale — rejected as not looking like organic plant
  growth at all. The fix was to make a single angle (`curTheta`) the one quantity that
  advances, so new coil keeps appearing at the tip while the already-grown part stays fixed,
  rather than the whole shape rescaling uniformly.
- **Straight rays, even sparse/randomized/jittered ones, read as mechanical/artificial next to
  organic spiral growth** — explicit user feedback ("I don't like the straight lines") on a
  version with curling vines *plus* straight radiating "cosmic ray" streaks. Fix: reuse the
  exact same analytic spiral distance function for the fine radiating tendrils too, just with
  a tighter curl (higher `k`) and more wraps (`maxTheta`) — everything in the scene is a coil
  at one of two scales, nothing is ever a straight line, and it still reads as "rays spreading
  out" at a glance because the tight curl is subtle at a distance.
- **Spiral pitch (`k`) needs to be large enough that the widening is visible within ~1-2
  wraps**, or it reads as a static ring/orbit instead of a growing coil — a small `k` with
  many wraps (`maxTheta` several full turns) produces many nearly-overlapping same-radius
  loops that look like concentric circles, not a nautilus-shell spiral. Capping wraps at
  roughly 0.75-1.85 turns and raising `k` to ~0.28-0.6 is what made the growth actually
  legible as coiling outward rather than orbiting in place.

**Update:** even a tuned analytic spiral eventually got the same complaint the straight rays
did — "too static, no organic growth." Every strand following the exact same `r = r0*exp(k*theta)`
curve, just at different scales/rotations, still reads as one predictable formula once you see
a few of them. The fix was to drop the closed-form curve entirely and grow each strand as a
**biased 3D random walk**: at each of ~9 steps, pick a small random 3D nudge (`hash`-seeded,
not noise-function-based) and `normalize(dir + nudge)` to get the next direction, with step
length also randomized per-segment. This is the simplified building block behind diffusion-
limited aggregation (DLA) and Eden-growth models, the standard procedural techniques for
bacterial/coral/lichen colony spread — no two strands ever bend the same way twice, which an
analytic formula structurally cannot give you no matter how it's tuned. Segment endpoints are
computed into a small fixed-size local `vec3[]` array (not passed between functions, not
raymarched) and tested against the pixel with a standard capsule/line-segment SDF — O(segments)
per strand instead of O(1) for the old analytic-inversion approach, but still cheap enough for
real-time at this strand count (~16 main + ~30 fine tendrils, 5-9 segments each).

## A "not found" sentinel that looks like valid data is a silent landmine

Porting the spiral growth above to a random-walk chain, a `tipGlow` effect needed "the position
of the currently-growing tip" each frame. The code initialized `tipPos2 = pScreen` (the
pixel's own position) as a fallback, then overwrote it if a partially-grown segment was found
that frame. Sounds safe — except a strand sits with `growFrac` pinned at exactly `1.0` for a
long stretch of time after finishing growth (not briefly crossing 1.0, genuinely clamped there
by `clamp(...,0.0,1.0)`), during which *no* segment is ever "partially grown," so the fallback
value was used: `length(pScreen - pScreen) = 0`, and `exp(-0 * 55.0) = 1.0` — the single
brightest value the glow term could ever produce. A multiplier meant to zero this case out
didn't reliably do so at the float-precision edge, so this `1.0` got added into every pixel's
color for every affected strand, every frame — not a crash, not a GLSL error, just a flat gray
wash across the entire 1280x1280 frame at certain rotation/diversity combinations, diagnosed by
bisecting the scene (disabling whole render passes one at a time with `for (int i=0;i<0;i++)`
instead of the real loop bound) until the exact term was isolated. The real fix: never give a
"did we find a valid X" fallback a value that *looks like* legitimate data (distance 0 is a
perfectly plausible real result) — use an explicit `bool found` flag and gate the whole
downstream calculation on it, so "not found" can never be silently indistinguishable from "found
at zero distance."

## Stacking several independently-reasonable auto-animations adds up to "restless," not "alive"

Mode 7's superstring pattern went through a round where, on top of its already-animated growth,
it gained: a continuous diagonal 3D tumble (Knob 2), a bidirectional flow drift (Fader 2), a
traveling sine-wave ripple along every strand's length, and a fast sinusoidal brightness pulse
on every origin core. Each one was individually requested and individually reasonable in
isolation. Together, the feedback was blunt: "don't like it... too much and too fast." The fix
wasn't to tune any single one down — it was to recognize that **a scene reads as "static" or
"alive" based on the total count of independently-moving things, not any one of them**, and cut
back to exactly one source of motion (slow growth) with everything else — rotation, position,
per-vertex shape, core brightness — held perfectly fixed once computed. When a generative visual
gets a vague "too much" complaint after several individually-plausible animated layers were added
across iterations, the first thing to try is removing motion sources entirely rather than
dialing their individual speed/amplitude down, since several "subtle" motions running at once
still reads as busy even when none of them is loud on its own.

## Raw per-band audio values flicker at high strand/particle counts even when "gentle"

Mode 7's superstring strands read `bands[bandIdx]` (the live, unsmoothed 8-band spectrum)
directly each frame for a brightness boost. The multiplier itself was modest
(`0.85 + 0.4*band`, not a huge swing) and reasonable in isolation, but with ~50+ independently
seeded strands each sampling a different raw band, the *aggregate* effect of many small,
fast-changing per-frame values is a persistent flicker across the whole field — diagnosed by
checking the live control values directly (`uGain`, `uBand0-7`, the raw MIDI CC channels) rather
than guessing, which also ruled out an initially-plausible suspect (Fader 2's growth-speed
accumulator) since it was observed to be moving far too slowly to explain a *continuous*
flicker. Fixed by switching to `uStrokeIntensity` — an already-existing, purpose-built
fast-attack/slow-release lagged envelope (a TD Lag CHOP) — instead of raw `bands[]`, for both
the per-strand boost and the final overall "kick" pulse. Reusing an existing smoothed envelope
rather than adding a new one: worth checking what's already in the uniform list before building
a new smoothing mechanism from scratch. General lesson: raw/instantaneous audio values are fine
to read directly when driving ONE thing (a single core's brightness, say), but multiply that
by dozens of independent elements and the combined visual result reads as noise regardless of
how gentle each individual multiplier is — always prefer an already-lagged envelope for
anything applied broadly across many elements at once.
