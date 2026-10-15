// Native visibility and document visibility are independent gates. Losing focus
// is intentionally not a gate: Orbit keeps moving on a second screen.
export function createRenderLoop({ render, reset, requestFrame, cancelFrame, now }) {
  const visibility = new Map();
  let frame = null;

  function tick(timestamp) {
    frame = null;
    render(timestamp);
    if ([...visibility.values()].every(Boolean)) frame = requestFrame(tick);
  }

  function setVisible(source, visible) {
    visibility.set(source, visible);
    const running = [...visibility.values()].every(Boolean);
    if (!running && frame !== null) {
      cancelFrame(frame);
      frame = null;
    } else if (running && frame === null) {
      reset(now());
      frame = requestFrame(tick);
    }
  }

  return { setVisible };
}
