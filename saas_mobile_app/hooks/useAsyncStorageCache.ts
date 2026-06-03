import { useState, useEffect, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  propertyId: string;
}

interface UseAsyncStorageCacheOptions {
  key: string;
  propertyId: string;
  staleTime?: number; // ms, default 5 minutes
  gcTime?: number;    // ms, default 24 hours
}

interface UseAsyncStorageCacheResult<T> {
  cachedData: T | null;
  isStale: boolean;
  saveCache: (data: T) => Promise<void>;
  clearCache: () => Promise<void>;
  hasCache: boolean;
}

export function useAsyncStorageCache<T>(
  options: UseAsyncStorageCacheOptions
): UseAsyncStorageCacheResult<T> {
  const { key, propertyId, staleTime = 5 * 60 * 1000, gcTime = 24 * 60 * 60 * 1000 } = options;
  const storageKey = `@autopilot_cache:${key}`;
  const [cachedData, setCachedData] = useState<T | null>(null);
  const [isStale, setIsStale] = useState(true);
  const [hasCache, setHasCache] = useState(false);
  const loadedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!raw) {
          if (!cancelled) {
            setCachedData(null);
            setIsStale(true);
            setHasCache(false);
          }
          return;
        }
        const entry: CacheEntry<T> = JSON.parse(raw);
        const now = Date.now();
        const age = now - entry.timestamp;

        // GC: delete if older than gcTime
        if (age > gcTime) {
          await AsyncStorage.removeItem(storageKey);
          if (!cancelled) {
            setCachedData(null);
            setIsStale(true);
            setHasCache(false);
          }
          return;
        }

        // Check if data is for the same property
        const propertyMatch = entry.propertyId === propertyId;
        if (!propertyMatch) {
          // Different property — treat as stale/missing
          if (!cancelled) {
            setCachedData(null);
            setIsStale(true);
            setHasCache(false);
          }
          return;
        }

        if (!cancelled) {
          setCachedData(entry.data);
          setIsStale(age > staleTime);
          setHasCache(true);
        }
      } catch (err) {
        console.warn(`[useAsyncStorageCache] load error for ${key}:`, err);
        if (!cancelled) {
          setCachedData(null);
          setIsStale(true);
          setHasCache(false);
        }
      } finally {
        loadedRef.current = true;
      }
    }
    load();
    return () => { cancelled = true; };
  }, [storageKey, key, propertyId, staleTime, gcTime]);

  const saveCache = useCallback(
    async (data: T) => {
      try {
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          propertyId,
        };
        await AsyncStorage.setItem(storageKey, JSON.stringify(entry));
        setCachedData(data);
        setIsStale(false);
        setHasCache(true);
      } catch (err) {
        console.warn(`[useAsyncStorageCache] save error for ${storageKey}:`, err);
      }
    },
    [storageKey, propertyId]
  );

  const clearCache = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(storageKey);
      setCachedData(null);
      setIsStale(true);
      setHasCache(false);
    } catch (err) {
      console.warn(`[useAsyncStorageCache] clear error for ${storageKey}:`, err);
    }
  }, [storageKey]);

  return { cachedData, isStale, saveCache, clearCache, hasCache };
}
