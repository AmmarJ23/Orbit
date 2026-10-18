import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export async function createNativeRepository() {
  if (!isTauri()) throw new Error('Live Orbit runs in the Mac app. Use the demo build for browser animation testing.');
  if (await invoke('get_app_mode') !== 'live') throw new Error('Frontend and native build modes do not match. Rebuild Orbit before continuing.');
  return {
    getSnapshot: () => invoke('get_snapshot'),
    subscribe: handler => listen('orbit://snapshot', event => handler(event.payload)),
    setState: (id, orbitState) => invoke('set_orbit_state', { id, orbitState }),
    setHidden: (ids, hidden) => invoke('set_hidden', { ids, hidden }),
    savePreferences: preferences => invoke('save_preferences', { preferences }),
    connect: (source, { baseUrl = null, apiKey, workspaceId = null }) => invoke('connect_source', { source, baseUrl, apiKey, workspaceId }),
    listWorkspaces: (source, apiKey) => invoke('list_workspaces', { source, apiKey }),
    disconnect: source => invoke('disconnect_source', { source }),
    refresh: source => invoke('refresh_source', { source }),
    openSource: id => invoke('open_source_task', { id }),
    listVpns: () => invoke('list_vpns'),
  };
}
