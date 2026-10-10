# Tidal disruption references for Orbit

Research date: 2026-10-10. Reference research only; implementation unchanged.

## Best animation references

- [ESA — Black hole eats a super-Jupiter (13 seconds)](https://www.esa.int/ESA_Multimedia/Videos/2013/03/Black_hole_eats_a_super-Jupiter): closest planet-related example. Its outer layers are stripped and spiral inward. This concerns a gaseous substellar object, possibly a brown dwarf, rather than a rocky planet. ESA's [associated release](https://www.esa.int/Science_Exploration/Space_Science/Black_hole_wakes_up_and_has_a_light_snack) describes partial disruption and a possible surviving core; do not present it as evidence that every object is completely consumed.
- [NASA / Taeho Ryu — Supercomputer Simulations Test Star-destroying Black Holes](https://svs.gsfc.nasa.gov/14000): strongest physical deformation reference. Eight simulated stars stretch and distort during close encounters; some fully become gas streams, others retain cores. Density colours are scientific visualization, not natural visible colours. These are actual stellar simulations, not a rocky-planet simulation.
- [ESO / M. Kornmesser — Death by spaghettification (24 seconds)](https://www.eso.org/public/videos/eso2018b/): artistic stellar-disruption animation useful for readable staging. Material is stretched into strands; the associated event also expelled material outward. Artist's visualization, not direct footage or a rock-fragment simulation.
- [NASA — TESS Catches Its First Star-destroying Black Hole](https://svs.gsfc.nasa.gov/13237): helpful debris-orbit reference. Its description explicitly distinguishes an escaping stream tail from material swinging back around to form a disk. Debris does not universally fall straight inward.

## Physical principle versus Orbit stylization

Gravity differs across the body's extent: the near side is pulled more strongly than the far side. The result is deformation and separation of the original material, rather than a spherical body producing an unrelated exhaust trail. NASA explains this near/far-side difference in [its AT2021ehb article](https://www.nasa.gov/universe/nasa-gets-unusually-close-glimpse-of-black-hole-snacking-on-star/).

The referenced objects are gas-rich stars or a gaseous substellar object. Low-poly rock pieces becoming blue dust are an artistic adaptation. Exact breakup depends on object structure and encounter parameters; there is no universal planet animation. The completed-system reassembly is Orbit's fictional transition, not an established black-hole outcome.

## Proposed animation direction (design inference)

1. Preserve the existing intact contracting half-orbit.
2. Near the centre, distort the planet visibly along the near/far gravity direction, with a modest narrowing perpendicular to that direction. Keep the centre-of-mass moving on its curved path.
3. Open visible gaps between the planet's own coloured facets/chunks. Start separation on the side toward the centre; use a few identifiable pieces before fine grains. Pieces must occupy the original planet volume at release, visibly replacing missing surface mass.
4. Spread those pieces into a short curved debris ribbon: the inner side pulls ahead and inward; the outer material lags. Allow a short outer strand as well as the inward portion so it reads as stretching/shearing, rather than a single emitter behind a spherical head.
5. Dissolve the remaining body into this same debris. Once breakup is complete there should be no intact sphere leading a tail. Let the resulting ribbon continue around and tighten into the centre, then use the existing completed-system accretion.

Keep the Suisei colours and gentle pacing. Do not uniformly shrink a sphere while spawning dust from a point. Angular-rate differences need only be subtle and stable; visible breakup should come from the separation and loss of planet material, not dramatic particle acceleration.
