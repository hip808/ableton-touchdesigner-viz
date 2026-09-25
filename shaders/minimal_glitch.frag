// minimal_glitch.frag
// GLSL TOP pixel shader — Alva Noto / Ryoji Ikeda style raster-glitch field.
// Driven entirely by uniforms bound to Ableton audio/tempo data (see ableton_viz_setup.py).
//
// Uniforms (bind these in the GLSL TOP's "Vectors" page, each pointing at a
// channel on /ableton_viz/control, except uMode which you can just type a
// number into):
//   uLevel   float  - overall RMS envelope of the Ableton master, 0..1
//   uBeat    float  - 0..1 ramp per beat, from Ableton Link
//   uBand0-7 float  - 8-band spectrum, 0..1 each
//   uTimeSec float  - elapsed seconds -> op('control')['level'] etc, or type absTime.seconds
//   uMode    float  - which pattern to draw: 0=waveform, 1=multi-wave, 2=aurora,
//                     3=raster bars (ring), 4=chromatic bars, 5=Tron equalizer
//                     (glowing LED bars on black), 6=moire, 7=tunnel (2001-style
//                     light-speed tunnel). type 0-7. (polar burst was removed.)
//
//   Most parameters now come in Base/Rate uniform pairs (e.g. uWaveSize/uWaveSizeRate):
//   Base sets the value, Rate (0..1) sets how much and how fast it self-oscillates around
//   that value via oscParam()/breathe() below. Rate == 0 means fully static -- no forced
//   background wobble, the knob is what turns breathing on at all.
//   uGain    float  - sensitivity multiplier for uLevel/uBand0-7, since raw RMS values
//                     from a real mix are usually small (0.01-0.1). Type a number like
//                     4-15 directly into its Value box and raise/lower until it feels right.
//   uColorMix float - 0 = pure monochrome (white), 1 = full color. 0..1, bind to a MIDI knob.
//   uWaveSize  float - amplitude scale for waveform/multi-wave/aurora traces. try 0.3-2.5.
//   uWaveSpeed float - not read directly by this shader anymore; kept declared for the
//                      Vectors page. The actual speed knob drives a TD-side chain
//                      (midi_lag -> wavespeed_math -> wavespeed_accum, a Speed CHOP) that
//                      feeds uWavePhase below -- multiplying raw elapsed time by a live
//                      knob value causes a big instantaneous jump every time the knob
//                      moves, so animation speed is driven by an accumulated value instead.
//   uWavePhase float - accumulated animation clock, bind to wavespeed_accum's output channel.
//   uMode == 1 is the multi-wave pattern: many overlapping traces sharing one
//   center line (like a dense EEG/oscilloscope tangle), separate from mode 0's single line.

uniform float uLevel;
uniform float uBeat;
uniform float uBand0;
uniform float uBand1;
uniform float uBand2;
uniform float uBand3;
uniform float uBand4;
uniform float uBand5;
uniform float uBand6;
uniform float uBand7;
uniform float uTimeSec;
uniform float uMode;
uniform float uGain;
uniform float uColorMix;
uniform float uWaveSpeed;
uniform float uWavePhase; // accumulated animation clock from a TD Speed CHOP -- see waveformY

// uWavePhase grows forever over a long session (it's a real accumulator, not a bug) --
// wrapped here to a bounded range so float precision in sin()/hash() doesn't degrade
// after the value gets into the thousands. A large modulus means the wrap-around only
// happens once every several minutes, so it's imperceptible in practice.
float wp() { return mod(uWavePhase, 2000.0); }

uniform float uColorMixRate;

uniform float uWaveSize;
uniform float uWaveSizeRate;
uniform float uLineWidth; // global thickness multiplier for all lines/edges. try 0.3-3.0, 1.0 = default
uniform float uLineWidthRate;
uniform float uWaveXScale; // horizontal magnify(>1)/shrink(<1) of the waveform traces (modes 0/1/2), 1.0 = default
uniform float uWaveLineWidth; // dedicated stroke-width multiplier for the waveform traces only (modes 0/1/2), 0 = vanished, unbounded above -- independent of the shared uLineWidth (which also affects gridlines/Moire/Tron)

// mode 5 (Tron equalizer) only:
uniform float uBarWidth;    // 0..1, bar width: 0 = fully vanished, 1 = bars touch with no gap
uniform float uBarWidthRate;
uniform float uHueBase;     // base hue offset for the whole palette (bind to a fader for "color spectrum"), 0..1
uniform float uHueBaseRate; // replaces the old uHueOscillate -- rate=0 means uHueBase sits static
uniform float uLineDensity; // 0..1, mode 5 only: how many evenly-spaced lines subdivide each bar (1 to 14)
uniform float uLineDensityRate;

// mode 4 (chromatic bars) only: blends each bar's hue from "all bars share one evolving
// hue" (0) to "hue spread fully across bar position" (1, the original always-on behavior)
uniform float uHueSpreadBase;
uniform float uHueSpreadRate;

// mode 8 (tunnel) only -- each parameter is a base value (0..1 raw knob/fader) plus its own
// self-oscillation rate (0..1), combined by oscParam() below into a value that continuously
// wobbles around the base instead of sitting static. See oscParam() for how base/rate map
// to actual ranges.
uniform float uTunHueBase;
uniform float uTunHueRate;
uniform float uTunHueSpreadBase;
uniform float uTunHueSpreadRate;
uniform float uTunThicknessBase;
uniform float uTunDensityBase;
uniform float uTunPulseBase;
uniform float uTunPulseRate;
uniform float uTunGlowBase;
uniform float uTunGlowRate;

// the ring continuously travels from center to off-screen and loops. uTunRingAmount scales
// its overall visibility (0 = fully vanished/stopped).
uniform float uTunRingBand;
uniform float uTunRingAmount;
// independent, always-forward accumulator (TD Speed CHOP, fed only by Knob 5's rate) -- the
// ring's own clock, completely decoupled from uWavePhase/Fader 2's Speed. Fader 2 is bipolar
// and can stop or reverse; if the ring rode on it, it would freeze or run backward too, so
// it gets its own accumulator instead, wrapped the same way as uWavePhase for precision.
uniform float uRingPhaseRaw;
float ringWp() { return mod(uRingPhaseRaw, 2000.0); }

// spoke rotation: its own independent, bipolar accumulator (TD Speed CHOP, fed by Knob 2),
// completely separate from wp() (Fader 2's travel speed) and ringWp() (the ring's own
// clock). Middle of Knob 2 = stationary, left = counter-clockwise, right = clockwise.
uniform float uSpokeRotRaw;
float rotWp() { return mod(uSpokeRotRaw, 2000.0); }
uniform float uSpokeRotRateRaw; // instantaneous spoke rotation rate (same units/sec as uSpokeRotRaw), motion-blur only

// gain-scaled stroke intensity with a fast-attack/slow-release envelope (TD Lag CHOP,
// separate rise/fall times) -- ramps up quickly on a hit but eases back down more
// gradually, since a shader has no memory across frames to do this kind of envelope itself.
uniform float uStrokeIntensity;

// mode 3's scattered rings' own grow/shrink/dissolve clock -- independent of rotWp()
// (spoke rotation stays untouched). Fader 2 alone controls both direction (in/out) and
// speed, bipolar log curve, center = stop -- same pattern as Knob 5 does for the central
// ring, just on Fader 2 here instead.
uniform float uShapeGrowRaw;
float shapeWp() { return mod(uShapeGrowRaw, 2000.0); }

// Knob 6 rotates the scattered rings' arrangement around screen center -- independent
// clock, bipolar log curve. Does NOT affect the central ring (that one stays put).
uniform float uRingsOrbitRaw;
float ringsOrbitWp() { return mod(uRingsOrbitRaw, 2000.0); }

// Fader 7's diversity/spread value, pre-smoothed with a slow (2.5s) TD-side Lag CHOP so
// changing it drifts the scattered rings organically to their new spread instead of
// snapping instantly (a shader alone has no memory to do this kind of lag itself).
uniform float uDiversitySmooth;

// Fader 8 (free in this mode since the old scanline/crosshair background was removed)
// scales ring/shape thickness from a thin line to effectively solid-filled ("infinity").
// Scattered rings only -- the central ring stays as-is, same as Knob 6's rotation above.
uniform float uRingsThicknessBase;

out vec4 fragColor;

// standard HSV -> RGB, h/s/v all 0..1
vec3 hsv2rgb(vec3 c) {
	vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
	vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
	return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// combines a base (0..1 raw knob) and a rate (0..1 raw knob) into a value that continuously
// self-oscillates around the base, mapped into [lo,hi]. rate01 controls BOTH oscillation
// speed and wobble amount together, so rate01 == 0 means truly static (zero speed, zero
// amplitude) -- there is no forced/background breathing, turning the knob up is what
// introduces it at all, at a rate proportional to the knob.
float oscParam(float base01, float rate01, float lo, float hi, float wobbleFrac) {
	float center = mix(lo, hi, clamp(base01, 0.0, 1.0));
	float amt = clamp(rate01, 0.0, 1.0);
	float speedHz = amt * 3.0;
	float wob = sin(wp() * speedHz) * amt;
	float range = (hi - lo) * wobbleFrac;
	return clamp(center + wob * range * 0.5, lo, hi);
}

// same zero-at-rate=0 self-oscillation idea as oscParam(), but multiplicative -- for
// uniforms that are already pre-scaled to their real range (uWaveSize, uLineWidth,
// uBarWidth) rather than a raw 0..1 fraction, so there's no separate [lo,hi] to remap into.
float breathe(float value, float rate01) {
	float amt = clamp(rate01, 0.0, 1.0);
	float wob = sin(wp() * amt * 3.0) * amt;
	return value * (1.0 + wob * 0.3);
}

// white when uColorMix is 0, shifts toward a hue-cycled color as it rises toward 1.
// full saturation (was 0.85) -- blue/purple hues at less than full saturation read as
// noticeably dimmer/grayer than green at the same setting to the human eye, so partial
// saturation made some colors in the cycle look washed out relative to others
vec3 tint(float hue) {
	float cm = oscParam(uColorMix, uColorMixRate, 0.0, 1.0, 1.0);
	return mix(vec3(1.0), hsv2rgb(vec3(hue, 1.0, 1.0)), cm);
}

// uHueBase, self-oscillating via uHueBaseRate (replaces the old fixed uHueOscillate).
float hueBase() { return oscParam(uHueBase, uHueBaseRate, 0.0, 1.0, 1.0); }

// full-screen drifting rainbow stripes, used as a background wash for the "rich/bright"
// modes -- kept darker than the foreground line work so lines/bars still read clearly.
vec3 rainbowBG(vec2 uv) {
	// small fixed-rate baseline (always flows, never jumps -- constant coefficient) plus
	// an accumulator-driven component tied to the speed knob (also jump-free, see uWavePhase)
	float hue = fract(uv.y * 1.4 + uTimeSec * 0.008 + wp() * 0.02);
	return hsv2rgb(vec3(hue, 0.85, 0.55));
}

// gained + clamped versions of the raw audio uniforms -- use these instead of
// uLevel/uBand0-7 directly anywhere you want sensitivity to track uGain.
float gLevel() { return clamp(uLevel * uGain, 0.0, 1.0); }
float gBand(float b) { return clamp(b * uGain, 0.0, 1.0); }

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

// the Odyssey ring, shared: a single pulse that travels center -> off-screen and loops,
// dissolving into smoke by halfway through the trip. Always a perfect circle -- shape is
// detached from gain/audio entirely (only brightness still pops with level). Used by
// sceneTunnel/sceneMoire/sceneRasterBars so "the ring" behaves and is controlled
// identically wherever it appears (same uTunRingAmount/uTunHueBase/uTunGlowBase, same
// ringWp() clock driven by Knob 5 in Odyssey mode).
void renderTravelingRing(vec2 p, float bands[8], inout vec3 col) {
	float r = length(p) + 0.0001;

	float hueBase = oscParam(uTunHueBase, uTunHueRate, 0.0, 1.0, 1.0);
	float glow = oscParam(uTunGlowBase, uTunGlowRate, 0.4, 2.2, 0.3);
	float ringVisible = clamp(uTunRingAmount, 0.0, 1.0);
	float level = gLevel();

	float ringPhase = fract(ringWp());

	float ringRadius = mix(0.0, 1.9, ringPhase);
	float dissolveT = smoothstep(0.0, 0.5, ringPhase);
	float ringW = mix(0.006, 0.3, dissolveT);
	float distFromRing = abs(r - ringRadius);
	float ringShape = exp(-(distFromRing * distFromRing) / (2.0 * ringW * ringW + 1e-5));
	float ringOpacity = (1.0 - dissolveT) * ringVisible;
	// extra brightness pop from the bass/kick band specifically (bands[0], already
	// Gain-scaled), on top of the overall-level response, so low end hits punch harder
	float bassBoost = bands[0] * 2.0;
	float ringBrightness = ringShape * ringOpacity * (0.5 + 0.5 * level + bassBoost) * glow;
	col += tint(fract(hueBase + 0.3)) * ringBrightness;
}

// mode 5: Tron-style LED equalizer -- 8 glowing vertical bars over a plain black
// background. uBarWidth reshapes the bars themselves, uHueBase shifts the whole
// palette (bind to a fader for a live "color spectrum" sweep).
// subdivides each mirrored band column into several evenly-spaced thin lines, all sharing
// that band's own height (same silhouette as the main bar) -- uLineDensity controls how
// many lines per column, uBarWidth controls their individual thickness (same knob as the
// main bars). This replaces solid fill with an evenly-spaced "comb" that still traces the
// exact same equalizer shape, rather than random independent decoration.
void addExtraLines(vec2 uv, float bands[8], inout vec3 col) {
	float mx = abs(uv.x - 0.5) * 2.0;
	float colF = mx * 8.0;
	int idx = clamp(int(floor(colF)), 0, 7);
	float localX = fract(colF);
	float bandVal = bands[idx];

	float N = floor(mix(1.0, 14.0, clamp(breathe(uLineDensity, uLineDensityRate), 0.0, 1.0)));
	float cellPos = fract(localX * N);
	float distToLine = abs(cellPos - 0.5) / N;
	float w = mix(0.0008, 0.018, clamp(breathe(uBarWidth, uBarWidthRate), 0.0, 1.0));
	// floor the AA falloff distance to roughly one screen pixel so a thin line's center still
	// hits full brightness (same fix as neonFalloff) -- the old symmetric w+/-aa band let the
	// AA ramp dominate once w shrank below aa, capping peak brightness well under 1.0
	float aa = fwidth(distToLine) * 0.8 + 1e-5;
	float coreW = max(w, aa);
	float lineMask = smoothstep(coreW, 0.0, distToLine);

	// exact same height/edges as the main bar in sceneTronEQ, so every line traces the
	// same silhouette instead of having its own independent shape
	float halfH = clamp(bandVal * 0.58, 0.0, 0.49);
	float top = 0.5 + halfH;
	float bottom = 0.5 - halfH;
	float edgeAA = fwidth(uv.y) * 1.5 + 0.0015;
	float lit = smoothstep(top + edgeAA, top - edgeAA, uv.y) * smoothstep(bottom - edgeAA, bottom + edgeAA, uv.y);

	vec3 lineColor = tint(fract(hueBase() + float(idx) / 8.0 * 0.4));
	// everything renders additively, so adding a matching color on top of an already-lit
	// bar just brightens/washes that patch out instead of blending in. scale the
	// contribution down wherever col is already bright, so lines recede into lit bars and
	// only stand out clearly in the dark gaps around/between them
	float existing = max(col.r, max(col.g, col.b));
	float headroom = 1.0 - clamp(existing, 0.0, 1.0);
	col += lineColor * lineMask * lit * headroom * 0.9;
}

void sceneTronEQ(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	col = vec3(0.0); // plain black background

	// mirror left/right around the center for a balanced, symmetric layout -- lowest band
	// in the two center columns, highest band at the two outer edges
	float mx = abs(uv.x - 0.5) * 2.0;
	int idx = clamp(int(floor(mx * 8.0)), 0, 7);
	float bandVal = bands[idx];
	float localX = fract(mx * 8.0);

	float halfGap = clamp((1.0 - breathe(uBarWidth, uBarWidthRate)) * 0.5, 0.0, 0.5); // 0.5 at uBarWidth=0 -> fully vanished
	float barHalfW = 0.5 - halfGap; // true intended half-width, 0 at uBarWidth=0
	float distX = abs(localX - 0.5);
	// soft (anti-aliased) left/right edges instead of a hard step -- a hard step reads as
	// a flat-walled box once the bar gets wide; this keeps it looking like a glowing
	// column with feathered sides no matter how wide it gets. Below ~1 screen pixel wide,
	// the old symmetric-band AA made the whole bar dim instead of just narrow (the two
	// edges' falloffs overlapped before either reached full brightness) -- floor the AA
	// width to render a solid, fully-bright ~1px column, then fade *that* out toward zero
	// as uBarWidth approaches 0 via a separate visibility term, so "thin" still reads as
	// bright and crisp while true 0 still fully vanishes as designed.
	float edgeAAx = fwidth(localX) * 1.5 + 0.006;
	float coreHalfW = max(barHalfW, edgeAAx);
	float inColumn = smoothstep(coreHalfW + edgeAAx, coreHalfW - edgeAAx, distX);
	float visibility = smoothstep(0.0, edgeAAx, barHalfW);
	inColumn *= visibility;

	// a slow traveling wave rides on top of the audio-driven height, phase-offset per band so
	// it visibly sweeps across the mirrored row instead of all 8 bars pulsing in lockstep.
	// Fixed amplitude, not tied to uWaveSize -- position 7 (uWaveSize's knob) now means
	// uLineDensity in this mode instead, so reusing uWaveSize here would fight that control.
	float wave = sin(wp() * 0.9 + float(idx) * 0.8) * 0.05;
	float halfH = clamp(bandVal * 0.58 + wave, 0.0, 0.49); // bars grow outward from the center, both ways
	float top = 0.5 + halfH;
	float bottom = 0.5 - halfH;
	// anti-aliased edges instead of a hard step -- a hard threshold means the bar snaps
	// fully lit/unlit as the audio-driven height crosses a pixel row, which reads as flicker
	float edgeAA = fwidth(uv.y) * 1.5 + 0.0015;
	float litTop = smoothstep(top + edgeAA, top - edgeAA, uv.y);
	float litBottom = smoothstep(bottom - edgeAA, bottom + edgeAA, uv.y);
	float lit = litTop * litBottom;

	vec3 barColor = tint(fract(hueBase() + float(idx) / 8.0 * 0.4));
	// solid full-brightness bar body -- unlike the old version, this never gets dimmed by
	// the glow below, since the glow only adds brightness beyond the core, it doesn't
	// replace or blend with it
	col += barColor * inColumn * lit;

	// soft blurred glow at just the top and bottom tips (not the whole bar) -- purely
	// additive on top of the already-solid core above, so it softens the ends without
	// washing out the crisp/bright body the way the old whole-bar-dimming glow did
	float tipGlowTop = exp(-abs(uv.y - top) * 22.0) * step(uv.y, top + 0.06);
	float tipGlowBottom = exp(-abs(uv.y - bottom) * 22.0) * step(bottom - 0.06, uv.y);
	col += barColor * inColumn * (tipGlowTop + tipGlowBottom) * 0.5;

	addExtraLines(uv, bands, col);
}

// unbounded version of breathe() (above, shared by everything else) used only for F8's
// blur breathing -- the shared one clamps rate to 1.0, which caps how fast/deep it can ever
// get. Knob 8 is meant to reach genuine strobing/flashing at high values, so this has no
// ceiling: speed and depth both keep scaling with rate all the way to infinity.
float breatheUnbounded(float value, float rate) {
	float amt = max(rate, 0.0);
	float wob = sin(wp() * amt * 3.0) * amt;
	return value * (1.0 + wob * 0.3);
}

// F8 (uLineWidth) now controls ONLY a soft glow halo layered outside every line's hard core
// -- never the core's own width. No growth until the raw value passes 10, then a slow ramp,
// capped so it can never swallow the whole screen.
float lineBlurWidth() {
	float w = breatheUnbounded(uLineWidth, uLineWidthRate); // Knob 8: 0 = static, up = faster + deeper, unbounded
	return clamp(max(w - 10.0, 0.0) * 0.001, 0.0, 0.5);
}

// hard-edged core (always sharp, full brightness across its width, AA'd to ~1 screen pixel)
// plus an optional soft glow halo extending beyond it. coreWidth sets the sharp stroke's own
// thickness and is never softened by blurWidth -- the two are fully independent controls.
float neonFalloff(float d, float coreWidth, float blurWidth) {
	float aa = fwidth(d) * 0.8 + 1e-5;
	float halfCore = max(coreWidth, 0.0) * 0.5;
	float core = smoothstep(halfCore + aa, halfCore - aa, d);
	float glowOuter = halfCore + max(blurWidth, 0.0) + aa;
	float glow = smoothstep(glowOuter, halfCore + aa, d) * 0.6;
	return clamp(max(core, glow), 0.0, 1.0);
}

// thin monochrome grid line, width controlled by band energy. Core width is fixed per
// caller; the F8 glow halo still layers on top globally.
float gridLine(float coord, float cells, float width) {
	float f = fract(coord * cells);
	float d = min(f, 1.0 - f);
	return neonFalloff(d, width, lineBlurWidth());
}

// thin horizontal line at height y0, thickness "width" in uv units. Core width is fixed;
// the F8 glow halo still layers on top globally.
float hLine(float y, float y0, float width) {
	return neonFalloff(abs(y - y0), width, lineBlurWidth());
}

// renders the 8-bar field at a given rotation/translation, scaled by opacity -- called once
// at the current transform and several more times at slightly earlier phase (see below) to
// build a fading shadow-trail behind the moving bars, all in a single shader pass.
// each of the 8 shapes is now a hollow ring, identical in style to the central ring,
// scattered at random positions across the screen. It grows from nothing to far off-screen
// and dissolves into a soft blur, looping. shapeWp() (combining Knob 2 for direction and
// Fader 2 for speed, see uShapeGrowRaw above) drives it -- positive phase = growing outward,
// negative = shrinking inward, exactly mirroring how Knob 5 drives the central ring.
// Fader 7 (uDiversitySmooth, pre-lagged) controls diversity: how widely scattered the
// random positions are, from clustered near center to spread across the whole frame --
// smoothed so changing it drifts the rings there organically instead of snapping. Fader 5
// (uTunRingAmount) gates all rings at once, this one included, same as the central ring.
// Fader 8 (uRingsThicknessBase, pre-lagged) scales these rings' thickness -- solid, crisp
// thin line at minimum (not vanished/blurred). Curve tuned so ~75% of the fader's travel
// covers only the first 25% of the thickness adjustment (pow(0.75, 4.82) = 0.25), leaving
// even more room for fine thin-line control, with the ramp to fully filled ("infinity")
// concentrated in the last quarter of travel.
void renderBarFieldAtPhase(vec2 pOrig, vec2 res, float bands[8], float opacity, inout vec3 col) {
	float diversity = clamp(uDiversitySmooth, 0.0, 1.0);
	float spreadExtent = mix(0.05, 0.9, diversity);
	float ringVisible = clamp(uTunRingAmount, 0.0, 1.0);
	// 0 = thin solid line, 1 = a width so large the ring reads as a solid filled disc
	float thicknessNorm = pow(clamp(uRingsThicknessBase, 0.0, 1.0), 4.82);
	float thicknessMult = mix(0.005, 80.0, thicknessNorm); // pushed down further so the AA floor (below) is what actually limits minimum thinness
	// extra brightness pop that's strongest at the thin end and fades out as it fills in --
	// a thin line reads as sharper/more laser-like when it's also brighter, not just smaller
	float thinBrightBoost = mix(2.0, 1.0, thicknessNorm);

	for (int i = 0; i < 8; i++) {
		float fi = float(i);
		float bandVal = bands[i];

		// fixed-per-index pseudo-random position, scattered by the diversity-controlled
		// spread, scaled by the same aspect factor already baked into pOrig
		vec2 rnd = vec2(hash(vec2(fi, 11.3)), hash(vec2(fi, 37.7))) * 2.0 - 1.0;
		vec2 homeCenter = vec2(rnd.x * spreadExtent * (res.x / res.y), rnd.y * spreadExtent);
		// Knob 6 rotates the whole scattered arrangement around screen center -- the
		// central ring (rendered separately) is never touched by this
		float ringsRot = ringsOrbitWp();
		homeCenter = vec2(
			homeCenter.x * cos(ringsRot) - homeCenter.y * sin(ringsRot),
			homeCenter.x * sin(ringsRot) + homeCenter.y * cos(ringsRot)
		);
		vec2 lpRaw = pOrig - homeCenter;
		float r = length(lpRaw);

		// per-shape phase offset so they don't all grow/dissolve in lockstep
		float shapePhase = fract(shapeWp() + fi * 0.37);
		float dissolveT = smoothstep(0.0, 0.5, shapePhase);

		// grows from nothing (0) to far past the frame edge (1.9, same "infinity" range as
		// the central ring), then dissolves/loops
		float ringRadius = mix(0.0, 1.9, shapePhase);
		float distFromRing = abs(r - ringRadius);
		// floor ringW at roughly one screen pixel (fwidth-based, not a fixed epsilon) so the
		// line can genuinely get pixel-thin instead of hitting an invisible minimum-blur
		// floor that a fixed epsilon in the Gaussian denominator was silently imposing
		float aaFloor = fwidth(distFromRing) * 0.6 + 1e-6;
		float ringW = max(mix(0.006, 0.3, dissolveT) * thicknessMult, aaFloor);
		float ringShape = exp(-(distFromRing * distFromRing) / (2.0 * ringW * ringW));
		float shapeOpacity = 1.0 - dissolveT;

		// extra brightness pop from the bass/kick band (bands[0], already Gain-scaled),
		// applied to every shape regardless of which band it's individually keyed to, so
		// low end hits make all of them punch together
		float bassBoost = bands[0] * 2.0;
		col += tint(fi / 8.0) * ringShape * shapeOpacity * ringVisible * (0.55 + 0.45 * bandVal + bassBoost) * thinBrightBoost * opacity;
	}
}

void sceneRasterBars(vec2 uv, vec2 res, vec2 pix, float bands[8], inout vec3 col, bool showRing) {
	vec2 pOrig = uv - 0.5;
	pOrig.x *= res.x / res.y;

	// --- 8 shapes at fixed positions around a circle, each growing/shrinking and dissolving
	// like the central ring (see renderBarFieldAtPhase). Detached from the background
	// (scan/cross below stay on the untransformed uv, steady).
	renderBarFieldAtPhase(pOrig, res, bands, 1.0, col);

	// background left plain black -- the old scanline/crosshair grid (many closely-spaced
	// thin lines) added up to a hazy gray wash rather than reading as a clean black canvas
	// behind the rings/shapes

	if (showRing) {
		// same shared Odyssey ring as sceneMoire/sceneTunnel -- grows from center to fully
		// off-screen and loops, dissolving into smoke by halfway, with the identical
		// inward/outward speed control (Knob 5, bipolar) and visibility (Fader 5)
		renderTravelingRing(pOrig, bands, col);
	}
}

// one synthesized oscilloscope trace: sum of sine waves, one per band, amplitude = band
// energy. this is the classic Alva Noto "test tone" look -- not real audio samples, but a
// waveform genuinely built from your live band levels. laneAmp = how tall it's allowed to
// get, phase = offset so multiple traces don't all move in lockstep, speedMult = a fixed
// relative multiplier (NOT the live speed knob -- that's already baked into uWavePhase,
// which is an accumulated value from TD's Speed CHOP, not raw elapsed time. Using elapsed
// time * a live-changing speed knob directly causes a huge instantaneous phase jump every
// time the knob moves, since elapsed time keeps growing for the whole session -- the
// accumulator avoids that entirely).
float waveformY(float x, float bands[8], float laneAmp, float phase, float speedMult) {
	float y = 0.0;
	for (int i = 0; i < 8; i++) {
		float freq = 3.0 + float(i) * 5.0;
		float amp = bands[i] * laneAmp; // 0 when silent -> perfectly straight line
		y += sin(x * freq * 6.2831 + phase + wp() * speedMult * (1.0 + float(i) * 0.3)) * amp;
	}
	return y;
}

// analytic dy/dx of waveformY -- used to widen a trace's hit-test width just enough to
// catch it every pixel in steep/fast regions, closing gaps. This no longer risks a blurry
// look at any width: neonFalloff now renders a hard-edged solid stroke, not a gradient, so
// widening the width only widens the solid interior -- it stays laser-sharp regardless.
float waveformSlope(float x, float bands[8], float laneAmp, float phase, float speedMult) {
	float dy = 0.0;
	for (int i = 0; i < 8; i++) {
		float freq = 3.0 + float(i) * 5.0;
		float amp = bands[i] * laneAmp;
		float w = freq * 6.2831;
		dy += cos(x * w + phase + wp() * speedMult * (1.0 + float(i) * 0.3)) * amp * w;
	}
	return dy;
}

float waveformLine(float uvX, float uvY, float baseY, float bands[8], float laneAmp, float phase, float speedMult, float width, float dx) {
	float xScale = max(uWaveXScale, 0.05);
	float sx = (uvX - 0.5) / xScale + 0.5;
	float sdx = dx / xScale;
	float y = waveformY(sx, bands, laneAmp, phase, speedMult);
	float slope = waveformSlope(sx, bands, laneAmp, phase, speedMult) / xScale; // dy/duvX, screen-space slope
	float vertDist = abs(uvY - baseY - y);
	float coreWidth = width * max(uWaveLineWidth, 0.0);
	// small additive anti-gap term (not a divide-based projection -- that caused a steep
	// slope to collapse the hit-test toward 0 for a whole column of pixels, painting a
	// spurious vertical streak at every steep zero-crossing). This only ever widens the hit
	// test by a bounded, screen-space amount, just enough to keep fast segments from
	// dotting out between samples.
	float gapFloor = min(abs(slope) * sdx * 1.5, sdx * 4.0);
	float hitWidth = max(coreWidth, gapFloor);
	return neonFalloff(vertDist, hitWidth, lineBlurWidth());
}

// mode 1: single oscilloscope trace, centered on the middle of the frame
void sceneWaveform(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	float amp = 0.09 * breathe(uWaveSize, uWaveSizeRate);
	float line = waveformLine(uv.x, uv.y, 0.5, bands, amp, 0.0, 1.0, 0.0025, fwidth(uv.x));
	col += tint(fract(uTimeSec * 0.05)) * line * 1.6;

	col += vec3(0.15) * hLine(uv.y, 0.5, 0.0008);
}

// mode 1: many overlapping traces sharing one center line, each at a different
// frequency/phase -- the dense tangled-EEG look. uWaveSpeed and uWaveSize control
// the whole cluster's animation speed and amplitude.
void sceneMultiWave(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	const int TRACES = 14;
	float size = breathe(uWaveSize, uWaveSizeRate);
	float dx = fwidth(uv.x);
	for (int j = 0; j < TRACES; j++) {
		float fj = float(j);
		float phase = fj * 1.7;
		float laneAmp = (0.05 + 0.01 * fj) * size;
		float speedMult = 0.6 + 0.08 * fj;
		float line = waveformLine(uv.x, uv.y, 0.5, bands, laneAmp, phase, speedMult, 0.0016, dx);
		float hue = fract(fj / float(TRACES) + wp() * 0.06);
		col += tint(hue) * line * 1.3;
	}

	col += vec3(0.1) * hLine(uv.y, 0.5, 0.0006);
}

// mode 4: dense rainbow bar chart with a soft glow halo, over a drifting rainbow-stripe
// background -- the "rich and bright" chromatic EQ look.
void sceneChromaticBars(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	col = rainbowBG(uv) * 0.5;

	const int N = 32; // denser than the 8 raw bands -- each band drives 4 neighboring bars
	float barW = 1.0 / float(N);
	for (int k = 0; k < N; k++) {
		float fk = float(k);
		int bandIdx = int(mod(fk * 0.25, 8.0));
		float bandVal = bands[bandIdx];
		float cx = (fk + 0.5) * barW;
		float distX = abs(uv.x - cx);

		float waveSize = breathe(uWaveSize, uWaveSizeRate);
		float top = 0.5 + bandVal * 0.48 * waveSize;
		float bottom = 0.5 - bandVal * 0.48 * waveSize;
		float inBand = step(bottom, uv.y) * step(uv.y, top);

		// blends each bar's hue from "all bars share one evolving hue" (spread=0) to "hue
		// spread fully across bar position" (spread=1, the original always-on look)
		float spread = oscParam(uHueSpreadBase, uHueSpreadRate, 0.0, 1.0, 1.0);
		float hue = fract(mix(uTimeSec * 0.02, cx + uTimeSec * 0.02, spread));
		vec3 c = hsv2rgb(vec3(hue, 0.9, 1.0));

		float core = step(distX, barW * 0.35) * inBand;
		col += c * core;

		float halo = smoothstep(barW * 2.5, 0.0, distX) * inBand;
		col += c * halo * 0.35 * bandVal;
	}
}

// mode 2: Tron-style -- near-black background, a big waveform silhouette rendered as a
// glowing neon edge (not a solid fill), plus thin bright traces on top. uColorMix still
// controls whether the neon glow and traces are white/cyan or shift through hues.
void sceneAurora(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	// near-black bg with a faint glow toward the horizontal center, like a dark horizon
	float horizon = exp(-abs(uv.y - 0.5) * 3.0);
	col = vec3(0.0, 0.015, 0.03) + vec3(0.0, 0.08, 0.14) * horizon;

	float auroraXScale = max(uWaveXScale, 0.05);
	float auroraSx = (uv.x - 0.5) / auroraXScale + 0.5;
	float env = abs(waveformY(auroraSx, bands, 0.4 * breathe(uWaveSize, uWaveSizeRate), 0.0, 0.5)) + 0.015;
	float top = 0.5 + env;
	float bottom = 0.5 - env;

	// subtle dark interior tint (not a bright solid fill -- keeps the Tron "negative space" feel)
	float inside = step(bottom, uv.y) * step(uv.y, top);
	col += vec3(0.0, 0.03, 0.05) * inside;

	// glowing neon edge along the top and bottom of the silhouette
	vec3 neon = tint(0.52); // cyan by default, shifts with uColorMix
	float lw = uLineWidth;
	float glowTop = exp(-abs(uv.y - top) * 60.0 / max(lw, 0.05));
	float glowBottom = exp(-abs(uv.y - bottom) * 60.0 / max(lw, 0.05));
	col += neon * (glowTop + glowBottom) * 0.9;
	col += vec3(1.0) * hLine(uv.y, top, 0.0015);
	col += vec3(1.0) * hLine(uv.y, bottom, 0.0015);

	const int TRACES = 4;
	float dx = fwidth(uv.x);
	for (int j = 0; j < TRACES; j++) {
		float fj = float(j);
		float amp = 0.12 * breathe(uWaveSize, uWaveSizeRate);
		float phase = fj * 1.7;
		float line = waveformLine(uv.x, uv.y, 0.5, bands, amp, phase, 1.0, 0.0018, dx);
		float hue = fract(fj / float(TRACES) + uTimeSec * 0.05);
		col += tint(hue) * line * 1.4;
	}
}

void sceneMoire(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	vec2 pOrig = uv - 0.5;

	// the whole background grid pattern moves left/right and rotates via the exact same
	// controls as Odyssey's spokes -- Fader 2/wp() for translation, Knob 2/rotWp() for
	// rotation -- applied as one rigid transform to the pattern before the internal
	// relative-angle drift (below) that actually creates the moire fringes. The ring stays
	// on pOrig, untransformed, same as Odyssey (Knob 2/Fader 2 never affect its ring either).
	float overallRot = rotWp();
	vec2 p = vec2(
		pOrig.x * cos(overallRot) - pOrig.y * sin(overallRot),
		pOrig.x * sin(overallRot) + pOrig.y * cos(overallRot)
	);
	p.x -= wp() * 0.1;

	// two overlapping line grids at a slight relative rotation -> interference pattern.
	// rotation speed and density respond to level/time for a slow generative drift.
	float ang = uTimeSec * 0.05 + gLevel() * 0.4;
	vec2 p2 = vec2(p.x * cos(ang) - p.y * sin(ang), p.x * sin(ang) + p.y * cos(ang));

	float density = mix(40.0, 90.0, gLevel());
	float g1 = gridLine(p.x, density, 0.08);
	float g2 = gridLine(p2.x, density, 0.08);
	col += tint(uTimeSec * 0.03) * min(g1, g2) * 0.9; // bright where both grids overlap (moire fringes)
	col += vec3(0.06) * max(g1, g2);            // faint where only one grid hits

	vec2 pRing = pOrig;
	pRing.x *= res.x / res.y;
	renderTravelingRing(pRing, bands, col);
}

// mode 7: 2001-style light-speed tunnel -- radiating streaks and pulse rings rushing outward
// from a bright vanishing point at screen center, everything audio- and MIDI-reactive.
void sceneTunnel(vec2 uv, vec2 res, float bands[8], inout vec3 col) {
	vec2 p = uv - 0.5;
	p.x *= res.x / res.y;
	float r = length(p) + 0.0001;
	float a = atan(p.y, p.x);

	// thickness/density are plain, non-oscillating values -- the spokes' own motion comes
	// entirely from wp() (Fader 2's Speed, via the flow/streak pulse below), not from a
	// local breathing speed layered on top. Spokes no longer rotate at all -- only the
	// ring rotates now (see ringWp() below), so the spoke pattern itself stays angularly
	// fixed regardless of Speed or anything else.
	float hueBase = oscParam(uTunHueBase, uTunHueRate, 0.0, 1.0, 1.0);
	float hueSpread = oscParam(uTunHueSpreadBase, uTunHueSpreadRate, 0.0, 1.0, 0.3);
	float thickness = mix(0.01, 0.45, clamp(uTunThicknessBase, 0.0, 1.0));
	float pulse = oscParam(uTunPulseBase, uTunPulseRate, 0.1, 1.0, 0.4);
	float glow = oscParam(uTunGlowBase, uTunGlowRate, 0.4, 2.2, 0.3);

	// radial streaks fanning out from center, rotating via Knob 2 (see rotWp() above) --
	// independent of Fader 2's travel speed and the ring's own rotation

	// Density (Fader 7) used to directly rescale spoke count, which repositioned every
	// spoke as it changed -- reading as the whole pattern spiraling. Instead: octave
	// doubling. Existing spokes never move; each doubling fades in a second, phase-shifted
	// copy of the current spoke count sitting exactly at the midpoints between them, so new
	// lines genuinely grow in between rather than the pattern rearranging itself. Log-curve
	// (pow 2.5) on the fader for fine control at low density; base 4 spokes doubling up to
	// 6 times maxes out at 256 -- fully filled in.
	float densityCurved = pow(clamp(uTunDensityBase, 0.0, 1.0), 2.5);
	float levelProgress = densityCurved * 6.0;
	float levelInt = floor(levelProgress);
	float levelFrac = fract(levelProgress);
	float segOld = 4.0 * pow(2.0, levelInt);
	float halfSectorShift = 3.14159265 / segOld;

	// solid flat-brightness core (so cranking thickness up genuinely fills the segment,
	// all the way to spokes touching), with a soft blur only at the transition edge --
	// unlike a Gaussian falloff, the middle of the spoke doesn't dim, only the boundary
	// blurs into the gap/neighboring spoke. edgeSoft scales with thickness (capped at the
	// old fixed 0.08 for thick spokes) instead of staying a fixed width -- a fixed blur
	// wider than a thin spoke swallowed the whole thing, leaving no crisp core at all, so
	// a slim spoke read as pure blur instead of a sharp laser-thin line.
	float edgeSoft = clamp(thickness * 0.6, 0.0015, 0.08);

	// motion blur: sample the spoke mask at several angles spanning this frame's rotation
	// and average them. A fast rotation caught at a single instant per frame aliases into
	// an apparent reverse spin (the classic wagon-wheel effect) once the per-frame angular
	// step passes half a spoke's angular spacing -- blurring across the frame's actual
	// rotation reads as a smear/streak instead of a strobe, at any speed.
	const int MB_SAMPLES = 6;
	const float FRAME_DUR = 1.0 / 60.0; // assumed frame duration for the blur window
	float spokeMask = 0.0;
	for (int mb = 0; mb < MB_SAMPLES; mb++) {
		float bt = (float(mb) / float(MB_SAMPLES - 1) - 0.5) * FRAME_DUR;
		float aWarp = a - (rotWp() + uSpokeRotRateRaw * bt);

		float cellOld = fract(aWarp * segOld / 6.2831853);
		float distOld = abs(cellOld - 0.5);
		// the "new" spokes are the same count as the old ones, just offset by exactly half a
		// sector -- geometrically identical to the interleaved midpoints of a doubled grid
		float cellNew = fract((aWarp + halfSectorShift) * segOld / 6.2831853);
		float distNew = abs(cellNew - 0.5);

		float spokeMaskOld = smoothstep(thickness + edgeSoft, thickness - edgeSoft, distOld);
		float spokeMaskNew = smoothstep(thickness + edgeSoft, thickness - edgeSoft, distNew) * levelFrac;
		spokeMask += max(spokeMaskOld, spokeMaskNew);
	}
	spokeMask /= float(MB_SAMPLES);

	// traveling comet-like pulses flowing outward along each spoke -- driven directly by
	// wp() (Fader 2's Speed/direction), nothing else layered on top
	float flow = fract(r * 6.0 - wp());
	float streakPulse = smoothstep(0.0, 0.18, flow) * smoothstep(0.4, 0.18, flow);

	float radialFade = smoothstep(0.0, 0.06, r); // avoid a hard singularity right at center
	// small floor (0.05, was 0.3) so strokes are barely visible at rest instead of already
	// near-bright -- widens the swing between quiet and loud considerably
	float streakBright = spokeMask * (0.25 + 0.75 * streakPulse) * radialFade * (0.05 + 0.95 * uStrokeIntensity);

	// hue driven by sin(a) rather than raw angle a -- atan2's principal value jumps by a
	// full 2*pi right at the negative-x axis (9 o'clock), and scaling that raw jump by
	// hueSpread (rarely exactly 1.0) left a visible color seam there. sin() is continuous
	// straight through that branch cut, so there's no seam possible regardless of hueSpread.
	float hue = fract(hueBase + (0.5 + 0.5 * sin(a)) * hueSpread + r * 0.15);
	vec3 streakColor = tint(hue); // respects uColorMix -- white at 0, full hue-cycled color at 1
	col += streakColor * streakBright * glow;

	// single ring that continuously travels from center to fully off-screen and loops --
	// shared with sceneMoire via renderTravelingRing() so it behaves and is controlled
	// identically in both modes
	renderTravelingRing(p, bands, col);

	// bright vanishing-point core at the very center -- grows up to 5x larger at full
	// level/gain, on top of its own pulse animation. Uses uStrokeIntensity (the same
	// already-lagged, Gain-scaled envelope driving the spoke brightness pop above) instead
	// of raw gLevel() so the size change eases in/out smoothly (fast attack, slow release)
	// rather than jumping instantly with every audio sample.
	float coreSizeBoost = mix(1.0, 2.5, uStrokeIntensity);
	float core = exp(-r * 10.0 / (max(pulse, 0.1) * coreSizeBoost));
	vec3 coreColor = tint(hueBase); // same color system as the strokes -- white at uColorMix=0, hue-cycled at 1
	col += coreColor * core * glow * 0.9;

	// whole scene pulses brighter on the kick/low end (band0, ~60Hz) -- bands[] is already
	// uGain-scaled and clamped, so Fader 1/Gain directly sets how strong this reaction is,
	// down to none at all when gain is low
	float kickPulse = 1.0 + bands[0] * 2.0;
	col *= kickPulse;
}

void main() {
	vec2 uv = vUV.st; // TD provides vUV in [0,1] across the render target
	vec2 res = uTDOutputInfo.res.zw; // output resolution
	vec2 pix = uv * res;

	vec3 col = vec3(0.0); // pure black canvas
	float bands[8] = float[8](
		gBand(uBand0), gBand(uBand1), gBand(uBand2), gBand(uBand3),
		gBand(uBand4), gBand(uBand5), gBand(uBand6), gBand(uBand7)
	);

	// uMode mapping: 0=waveform, 1=multi-wave, 2=aurora, 3=raster bars (with ring),
	// 4=chromatic bars, 5=Tron equalizer, 6=moire, 7=tunnel.
	// anything out of range falls back to plain raster bars (no ring).
	int mode = int(uMode + 0.5);
	if (mode == 0) {
		sceneWaveform(uv, res, bands, col);
	} else if (mode == 1) {
		sceneMultiWave(uv, res, bands, col);
	} else if (mode == 2) {
		sceneAurora(uv, res, bands, col);
	} else if (mode == 3) {
		sceneRasterBars(uv, res, pix, bands, col, true);
	} else if (mode == 4) {
		sceneChromaticBars(uv, res, bands, col);
	} else if (mode == 5) {
		sceneTronEQ(uv, res, bands, col);
	} else if (mode == 6) {
		sceneMoire(uv, res, bands, col);
	} else if (mode == 7) {
		sceneTunnel(uv, res, bands, col);
	} else {
		sceneRasterBars(uv, res, pix, bands, col, false);
	}

	fragColor = TDOutputSwizzle(vec4(col, 1.0));
}
