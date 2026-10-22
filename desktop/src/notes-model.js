// What every notes surface agrees on: a note's colour, where its probes are, and how a
// linked task reads. The Notes tab and side card use it now; the scene's probes will too.
import redmineLogo from './assets/redmine.svg';
import clickupLogo from './assets/clickup.svg';

export const logos = { Redmine: redmineLogo, ClickUp: clickupLogo };
// Hand-tuned glows for the navy sky. They avoid Redmine red, ClickUp purple and the core's blue.
export const PALETTE = ['#f5c76a', '#ff9a76', '#f78fc0', '#e09cf2', '#6fdcb4', '#b4e36e', '#4fd1c5', '#ffe08a'];
// Pinned notes always dock, so this also caps pins (DOCK_SLOTS in model.rs).
export const DOCK_SLOTS = 10;

export function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}
// Hashed colours spread over the hues left once red (340–20°) and blue to purple (195–265°)
// are taken out.
export function noteHue(note) {
  const step = hash(note.id) % 250;
  return step < 175 ? 20 + step : 265 + step - 175;
}
export const noteColor = (note, mode) => mode === 'hashed' ? `hsl(${noteHue(note)} 75% 72%)` : PALETTE[note.palette % PALETTE.length];
// Sort key that puts similar colours together in either mode.
export const colourKey = (note, mode) => mode === 'hashed' ? noteHue(note) : note.palette % PALETTE.length;

// Unlinked probes rest at the station first (pinned, then first come, first served) and
// drift on the outer belt once its docks are full.
export function restingPlaces(notes) {
  const resting = notes.filter(note => !note.links.length)
    .sort((a, b) => (b.pinned - a.pinned) || (a.rested - b.rested) || (a.created - b.created));
  return new Map(resting.map((note, i) => [note.id, i < DOCK_SLOTS ? 'docked' : 'belt']));
}
export function linkStatus(id, tasksById) {
  const task = tasksById.get(id);
  if (!task) return 'unavailable';
  if (task.hidden) return 'out-of-range';
  return task.state === 'completed' ? 'completed' : 'orbit';
}
export function noteLocations(note, tasksById, resting) {
  return note.links.length ? note.links.map(id => linkStatus(id, tasksById)) : [resting.get(note.id) ?? 'docked'];
}
export const locationLabels = {
  docked: 'Docked', belt: 'Belt', orbit: 'In orbit', completed: 'Completed system', 'out-of-range': 'Out of range', unavailable: 'Unavailable',
};
export const taskLabel = task => task.id.startsWith('demo:') || task.source === 'ClickUp' ? task.title : '#' + task.externalId + ' ' + task.title;
export const noteTitle = note => note.title || 'Untitled note';
