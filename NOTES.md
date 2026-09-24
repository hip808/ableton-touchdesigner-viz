# TouchDesigner gotchas found while building this

A list of things that failed *silently* — no error, no crash, just wrong behavior — while
building this project. Worth reading before extending the network, since several of these
cost significant debugging time.

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

## Bluetooth MIDI devices need TD's own MIDI subsystem to "see" them first

A MIDI In CHOP pointed at a Device ID with nothing registered there fails with "Could not
open the MIDI interface" — even if the OS (Audio MIDI Setup) and other apps (Ableton Live)
already see the device fine. Open **Dialogs -> MIDI Mapper** once (and use "Check MIDI
Devices" if needed) to get TD to actually scan and populate `/local/midi/device`.

## `Connector.connect()` silently replaces without needing `.disconnect()` first

Calling `.connect(newSource)` on an already-connected input just rewires it — no need to
call `.disconnect()` first. (`.disconnect()` on a `Connector` object doesn't exist as an
`isConnected` check either; that attribute isn't there in this build.) Rewiring a single
input in a multi-input Merge CHOP by index after the fact can also silently shift *other*
inputs if you're not careful about how many connectors currently exist — rebuild the full
input list explicitly if in doubt, rather than patching indices one at a time.
