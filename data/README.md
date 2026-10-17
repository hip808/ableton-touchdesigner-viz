# Data

## `cp1919_pulsar.csv`

The actual dataset behind Joy Division's *Unknown Pleasures* album cover: 80 successive radio
pulses from pulsar CP1919 (now PSR B1919+21, the first pulsar ever discovered, found by
Jocelyn Bell Burnell in 1967), 300 time-bins per pulse (24,000 rows total, columns `x,y,z` —
time-bin, pulse index, intensity).

The original plot was made by radio astronomer Harold Craft from Arecibo Observatory data, for
his 1970 PhD thesis *Radio observations of the pulse profiles and dispersion measures of
twelve pulsars*. Joy Division's Stephen Morris found it reprinted in *The Cambridge
Encyclopaedia of Astronomy* (1977) and the band had Peter Saville use it, uncredited, on the
album cover. The original raw telescope readings aren't known to survive — this CSV was traced
from the published plot image by creative coder Michael Zoellner, and sourced here via
[github.com/pachadotdev/cp1919](https://github.com/pachadotdev/cp1919) (CC0 license).

Used by Mode 6 ("Unknown Pleasures") in `height_script1` (`/ableton_viz/ridgeline`): loaded
once at startup and bilinearly resampled to the live grid size every cook. See
[CONTROLS.md](../CONTROLS.md)'s "Mode 6's 3D mesh" section for how it's rendered.
