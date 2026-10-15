import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export async function createNativeRepository() {
  if (!isTauri()) throw new Error('Live Orbit runs in the Mac app. Use the demo build for browser animation testing.');
  if (await invoke('get_app_mode') !== 'live') throw new Error('Frontend and native build modes do not match. Rebuild Orbit before continuing.');
  return {
    getSnapshot: () => invoke('get_snapshot'),
    subscribe: handler => listen('orbit://snapshot', event => handler(event.payload)),
    setState: (id, orbitState) => invoke('set_orbit_state', { id, orbitState }),
    savePreferences: preferences => invoke('save_preferences', { preferences }),
    connect: (baseUrl, apiKey) => invoke('connect_redmine', { baseUrl, apiKey }),
    disconnect: () => invoke('disconnect_redmine'),
    refresh: () => invoke('refresh_redmine'),
    openSource: id => invoke('open_source_task', { id }),
  };
}
