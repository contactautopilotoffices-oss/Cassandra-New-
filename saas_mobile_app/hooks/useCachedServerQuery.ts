import { useState, useEffect, useCallback } from 'react';
import { useAsyncStorageCache } from './useAsyncStorageCache';

interface UseCachedServerQueryOptions<T> {
  key: string;
  propertyId: string;
  fetcher: () => Promise<T>;
  enabled?: boolean;
}

interface UseCachedServerQueryResult<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  hasCache: boolean;
}

/**
 * Wraps a serverApi call with AsyncStorage caching.
 *
 * On first mount:
 *   1. Returns cached data immediately (if available)
 *   2. Calls serverApi in background
 *   3. Updates cache + UI when server responds
 *
 * This makes screens feel INSTANT on app reopen while keeping
 * serverApi as the security layer.
 */
export function useCachedServerQuery<T>(
  options: UseCachedServerQueryOptions<T>
): UseCachedServerQueryResult<T> {
  const { key, propertyId, fetcher, enabled = true } = options;

  const { cachedData, hasCache, saveCache, isStale } = useAsyncStorageCache<T>({
    key,
    propertyId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const [data, setData] = useState<T | null>(cachedData ?? null);
  const [loading, setLoading] = useState(!hasCache);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from cache on mount
  useEffect(() => {
    if (cachedData && hasCache) {
      setData(cachedData);
    }
  }, [cachedData, hasCache]);

  const executeFetch = useCallback(
    async (isRefresh = false) => {
      if (!enabled) return;
      if (!isRefresh) setLoading(true);
      setError(null);

      try {
        const result = await fetcher();
        setData(result);
        await saveCache(result);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to fetch');
        // On error, keep cached data if available
        if (cachedData) {
          setData(cachedData);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [fetcher, enabled, saveCache, cachedData]
  );

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await executeFetch(true);
  }, [executeFetch]);

  // Initial fetch (background if cache exists, blocking if not)
  useEffect(() => {
    if (!enabled) return;
    // If we have fresh cache, don't show loading spinner
    if (hasCache && !isStale) {
      setLoading(false);
    }
    executeFetch();
  }, [enabled, hasCache, isStale, executeFetch]);

  return {
    data,
    loading,
    refreshing,
    error,
    refresh,
    hasCache,
  };
}
