import { QueryClient } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

// ── Safe MMKV initialization ───────────────────────────────────────────────
let mmkvStorage: any;
try {
  const { MMKV } = require('react-native-mmkv');
  mmkvStorage = new MMKV({ id: 'react-query-cache' });
} catch (e) {
  console.warn('[queryClient] MMKV not available, falling back to in-memory');
  const store = new Map<string, string>();
  mmkvStorage = {
    set: (key: string, value: string) => store.set(key, value),
    getString: (key: string) => store.get(key),
    delete: (key: string) => store.delete(key),
  };
}

const clientStorage = {
  setItem: (key: string, value: string) => {
    mmkvStorage.set(key, value);
  },
  getItem: (key: string) => {
    const value = mmkvStorage.getString(key);
    return value === undefined ? null : value;
  },
  removeItem: (key: string) => {
    mmkvStorage.delete(key);
  },
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // Data is fresh for 5 mins
      gcTime: 1000 * 60 * 60 * 24, // Cache kept for 24 hours
      retry: 2,
      refetchOnWindowFocus: false, // Mobile uses AppState, not window focus
      networkMode: 'offlineFirst',
    },
    mutations: {
      retry: 1,
      networkMode: 'offlineFirst',
    },
  },
});

export const mmkvPersister = createSyncStoragePersister({
  storage: clientStorage,
  key: 'autopilot-react-query-cache',
  throttleTime: 1000,
});
