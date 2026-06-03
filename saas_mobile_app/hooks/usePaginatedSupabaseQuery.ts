import { useState, useEffect, useCallback, useRef } from 'react';
import { PostgrestFilterBuilder } from '@supabase/postgrest-js';

type SupabaseQuery<T> = PostgrestFilterBuilder<any, any, T[], any, any>;

interface UsePaginatedSupabaseQueryOptions<T> {
  queryBuilder: (rangeFrom: number, rangeTo: number) => SupabaseQuery<T> | null;
  pageSize?: number;
  enabled?: boolean;
}

interface UsePaginatedSupabaseQueryResult<T> {
  data: T[];
  loading: boolean;
  refreshing: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  refresh: () => void;
  loadMore: () => void;
}

export function usePaginatedSupabaseQuery<T>(
  options: UsePaginatedSupabaseQueryOptions<T>
): UsePaginatedSupabaseQueryResult<T> {
  const { queryBuilder, pageSize = 20, enabled = true } = options;
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pageRef = useRef(0);

  const fetchPage = useCallback(
    async (page: number, isRefresh = false) => {
      if (!enabled) return;
      const offset = page * pageSize;
      const q = queryBuilder(offset, offset + pageSize - 1);
      if (!q) return;

      try {
        const { data: pageData, error: pageError } = await q;
        if (pageError) throw pageError;

        const items = (pageData ?? []) as T[];
        setHasMore(items.length === pageSize);

        if (isRefresh || page === 0) {
          setData(items);
        } else {
          setData((prev) => [...prev, ...items]);
        }
        setError(null);
      } catch (err: any) {
        setError(err?.message ?? 'Failed to load data');
      }
    },
    [queryBuilder, pageSize, enabled]
  );

  const refresh = useCallback(() => {
    setRefreshing(true);
    pageRef.current = 0;
    fetchPage(0, true).finally(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextPage = pageRef.current + 1;
    fetchPage(nextPage).finally(() => {
      pageRef.current = nextPage;
      setLoadingMore(false);
    });
  }, [fetchPage, loadingMore, hasMore]);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    setLoading(true);
    pageRef.current = 0;
    fetchPage(0, true).finally(() => setLoading(false));
  }, [fetchPage, enabled]);

  return {
    data,
    loading,
    refreshing,
    loadingMore,
    hasMore,
    error,
    refresh,
    loadMore,
  };
}
