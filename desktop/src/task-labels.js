// One status vocabulary for every surface, matching the scene's legend and planet labels.
export const stateLabel = state => ({ 'not-started': 'Not started', 'in-progress': 'In progress', completed: 'Done' })[state] ?? state;
// Only states worth a second look get a pill; "not started" is the default and stays quiet.
export function statePill(state) {
  const pill = Object.assign(document.createElement('span'), { className: 'pill' });
  pill.textContent = state === 'not-started' ? '' : stateLabel(state);
  return pill;
}
const eyeIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z"/><circle cx="10" cy="10" r="2.6"/></svg>';
const eyeOffIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10Z"/><path d="M3 17 17 3"/></svg>';
export function eyeButton(hidden, label, onClick) {
  const button = Object.assign(document.createElement('button'), { type: 'button', className: 'eye', innerHTML: hidden ? eyeOffIcon : eyeIcon });
  button.setAttribute('aria-label', (hidden ? 'Show ' : 'Hide ') + label);
  button.setAttribute('aria-pressed', String(hidden));
  button.title = hidden ? 'Hidden. Click to show in the scene' : 'Hide from the scene';
  button.onclick = onClick;
  return button;
}
