export function createFramePacer(start) {
  let previous = start;
  let remainder = 0;
  let previousLimit;
  return {
    reset(now) { previous = now; remainder = 0; },
    advance(now, limit) {
      if (limit !== previousLimit) {
        remainder = 0;
        previousLimit = limit;
      }
      const elapsed = now - previous;
      const interval = limit ? 1000 / limit : 0;
      if (elapsed + remainder < interval - 0.5) return null;
      // Carry fractional display frames forward instead of rounding every
      // render up to a whole number of vsync callbacks. Discard whole missed
      // frames after a stall rather than trying to catch up in a burst.
      remainder = interval ? Math.max(0, elapsed + remainder - interval) % interval : 0;
      previous = now;
      return Math.min(elapsed / 1000, 0.1);
    },
  };
}
