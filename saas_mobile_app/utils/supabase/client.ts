import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import type { Database } from '@/types/database.types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ─── Environment detection ─────────────────────────────────────────────────

// Browser: has window + localStorage
const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
const isServerRender = Platform.OS === 'web' && !isBrowser;

// React Native: check at runtime. We import AsyncStorage statically
// to avoid dynamic import failures in production APK builds.
let _asyncStorage: any = null;
let _asyncStorageInitialized = false;

async function initAsyncStorage(): Promise<void> {
  if (isServerRender) return;
  if (_asyncStorageInitialized) return;
  _asyncStorageInitialized = true;

  try {
    // Static import is more reliable than dynamic import in RN production builds
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    if (AsyncStorage) {
      _asyncStorage = AsyncStorage;
    }
  } catch {
    // Not in React Native or package not available
  }
}

// ─── Storage adapter (browser → localStorage, native → AsyncStorage, SSR → no-op)

const customStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (isBrowser) return window.localStorage.getItem(key);
    if (isServerRender) return null;
    await initAsyncStorage();
    if (_asyncStorage) return _asyncStorage.getItem(key);
    return null;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (isBrowser) {
      window.localStorage.setItem(key, value);
      return;
    }
    if (isServerRender) return;
    await initAsyncStorage();
    if (_asyncStorage) await _asyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (isBrowser) {
      window.localStorage.removeItem(key);
      return;
    }
    if (isServerRender) return;
    await initAsyncStorage();
    if (_asyncStorage) await _asyncStorage.removeItem(key);
  },
};

// ─── Lazy-initialized singleton ────────────────────────────────────────────
// Module-level initialization is deferred so Metro/SSR don't crash.

let _supabase: ReturnType<typeof createSupabaseClient<Database>> | null = null;

function getSupabaseClient() {
  if (!_supabase) {
    _supabase = createSupabaseClient<Database>(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: customStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
  return _supabase;
}

export const supabase = new Proxy({} as ReturnType<typeof createSupabaseClient<Database>>, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof ReturnType<typeof createSupabaseClient>];
  },
});

export function createClient() {
  return getSupabaseClient();
}
