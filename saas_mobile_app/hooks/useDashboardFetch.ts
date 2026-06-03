import { useQuery } from '@tanstack/react-query';

/**
 * Wraps a data fetch function with React Query caching.
 *
 * This gives us:
 * - Automatic caching of the "last fetched" state
 * - Background refetch after staleTime (5 min default)
 * - No duplicate parallel fetches
 * - Retry on failure
 * - Pull-to-refresh via `refetch()`
 *
 * The actual data is typically stored in local state or Zustand store.
 * This hook just ensures we don't hammer the API on every mount.
 */
export function useDashboardFetch(
  queryKey: readonly string[],
  fetchFn: () => Promise<void>,
  options?: { staleTime?: number; enabled?: boolean }
) {
  const { staleTime = 1000 * 60 * 5, enabled = true } = options ?? {};

  const result = useQuery({
    queryKey,
    queryFn: async () => {
      await fetchFn();
      return Date.now();
    },
    staleTime,
    enabled: enabled && !!queryKey[queryKey.length - 1],
    refetchOnWindowFocus: false,
    retry: 2,
  });

  return result;
}
