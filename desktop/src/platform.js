import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';

export const desktop = isTauri();

export async function connectVisibility(onChange) {
  if (!desktop) {
    onChange(true);
    return () => {};
  }
  let receivedEvent = false;
  const unlisten = await listen('orbit://render-visibility', event => {
    receivedEvent = true;
    onChange(event.payload);
  });
  try {
    const initial = await invoke('rendering_allowed');
    // An event delivered while the query was in flight is newer than its snapshot.
    if (!receivedEvent) onChange(initial);
  } catch (error) {
    unlisten();
    throw error;
  }
  return unlisten;
}

export async function toggleFullscreen() {
  if (desktop) {
    const window = getCurrentWindow();
    await window.setFullscreen(!await window.isFullscreen());
  } else if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
}

export async function isFullscreen() {
  return desktop ? getCurrentWindow().isFullscreen() : Boolean(document.fullscreenElement);
}

// Opt-in verification logs; Rust discards samples unless ORBIT_DIAGNOSTICS=1.
export function reportRendering(sample) {
  if (desktop) invoke('report_rendering', { sample }).catch(console.error);
}

// The app menu's Settings… item (⌘,) asks the webview to open the station card.
export async function onOpenSettings(handler) {
  addEventListener('keydown', event => {
    if (event.key === ',' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); handler(); }
  });
  if (desktop) await listen('orbit://open-settings', () => handler());
}
