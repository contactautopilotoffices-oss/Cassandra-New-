/**
 * useSmartPrefetch Orchestrator
 *
 * Implements the three-tier prefetch strategy described in the architecture doc:
 *   1. Critical Queries (Immediate): Dashboard stats, Recent Tickets, User Profile.
 *   2. Important Queries (InteractionManager): Deferred until screen transitions
 *      /animations finish (Checklists, Rooms, Stock).
 *   3. Background Queries (Delayed): Non-essential analytics and heavy lists.
 *
 * Architecture reference: "Prefetching & Hydration Strategy" section.
 */

import { useEffect, useRef, useState, useMemo } from 'react';
import { InteractionManager } from 'react-native';
import { queryClient } from '@/utils/queryClient';
import { queryKeys } from '@/utils/queryKeys';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface PrefetchQueryConfig {
  queryKey: readonly string[];
  queryFn: () => Promise<any>;
  priority: 'critical' | 'important' | 'background';
}

export interface UseSmartPrefetchOptions {
  propertyId?: string;
  userId?: string;
  enabled?: boolean;
  queries?: PrefetchQueryConfig[];
  additionalQueries?: {
    key: readonly string[];
    fetcher: () => Promise<any>;
    priority: 'critical' | 'important' | 'background';
  }[];
}

// ─────────────────────────────────────────────────────────────────
// Default Query Key Arrays
// ─────────────────────────────────────────────────────────────────

/**
 * Critical query keys (Immediate tier):
 * Dashboard stats, Recent Tickets, User Profile.
 */
export const getDefaultCriticalQueryKeys = (
  propertyId?: string,
  userId?: string
): readonly (readonly string[])[] => [
  ...(propertyId ? [queryKeys.property.dashboard(propertyId)] : []),
  ...(propertyId ? [queryKeys.property.tickets(propertyId)] : []),
  ...(userId ? [queryKeys.user.profile(userId)] : []),
];

/**
 * Important query keys (InteractionManager tier):
 * Checklists, Rooms, Stock.
 */
export const getDefaultImportantQueryKeys = (
  propertyId?: string
): readonly (readonly string[])[] => [
  ...(propertyId ? [queryKeys.property.checklist(propertyId)] : []),
  ...(propertyId ? [queryKeys.property.rooms(propertyId)] : []),
  ...(propertyId ? [queryKeys.property.stock(propertyId)] : []),
];

/**
 * Background query keys (Delayed tier):
 * Non-essential analytics and heavy lists.
 */
export const getDefaultBackgroundQueryKeys = (
  propertyId?: string
): readonly (readonly string[])[] => [
  ...(propertyId ? [queryKeys.analytics.analyticsTab()] : []),
  ...(propertyId ? [queryKeys.property.electricityAnalytics(propertyId)] : []),
  ...(propertyId ? [queryKeys.property.dieselAnalytics(propertyId)] : []),
  ...(propertyId ? [queryKeys.property.procurement(propertyId)] : []),
];

// ─────────────────────────────────────────────────────────────────
// Individual Prefetch Helpers
// ─────────────────────────────────────────────────────────────────

/**
 * Immediately prefetch critical queries.
 */
export const prefetchCriticalQueries = async (
  queries: PrefetchQueryConfig[]
): Promise<void> => {
  if (!queryClient || queries.length === 0) return;
  await Promise.all(
    queries.map((q) =>
      queryClient.prefetchQuery({
        queryKey: q.queryKey,
        queryFn: q.queryFn,
      })
    )
  );
};

/**
 * Prefetch important queries after screen transitions / animations finish.
 */
export const prefetchImportantQueries = async (
  queries: PrefetchQueryConfig[]
): Promise<void> => {
  if (!queryClient || queries.length === 0) return;
  await new Promise<void>((resolve) => {
    InteractionManager.runAfterInteractions(() => resolve());
  });
  await Promise.all(
    queries.map((q) =>
      queryClient.prefetchQuery({
        queryKey: q.queryKey,
        queryFn: q.queryFn,
      })
    )
  );
};

/**
 * Prefetch background queries after a 3000ms delay.
 */
export const prefetchBackgroundQueries = async (
  queries: PrefetchQueryConfig[]
): Promise<void> => {
  if (!queryClient || queries.length === 0) return;
  await new Promise<void>((resolve) => setTimeout(resolve, 3000));
  await Promise.all(
    queries.map((q) =>
      queryClient.prefetchQuery({
        queryKey: q.queryKey,
        queryFn: q.queryFn,
      })
    )
  );
};

// ─────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────

/**
 * Orchestrates three-tier prefetching to control network traffic.
 *
 * @example
 * ```ts
 * const { isPrefetching } = useSmartPrefetch({
 *   propertyId: 'prop-123',
 *   userId: 'user-456',
 *   queries: [
 *     { queryKey: ['tickets'], queryFn: fetchTickets, priority: 'critical' },
 *     { queryKey: ['rooms'], queryFn: fetchRooms, priority: 'important' },
 *     { queryKey: ['analytics'], queryFn: fetchAnalytics, priority: 'background' },
 *   ],
 * });
 * ```
 */
export function useSmartPrefetch(options: UseSmartPrefetchOptions = {}) {
  const { enabled = true, queries = [], additionalQueries = [] } = options;
  const [isPrefetching, setIsPrefetching] = useState(false);
  const hasRun = useRef(false);

  const normalizedAdditional = useMemo<PrefetchQueryConfig[]>(() => {
    return additionalQueries.map((q) => ({
      queryKey: q.key,
      queryFn: q.fetcher,
      priority: q.priority,
    }));
  }, [additionalQueries]);

  const allQueries = useMemo<PrefetchQueryConfig[]>(
    () => [...queries, ...normalizedAdditional],
    [queries, normalizedAdditional]
  );

  const criticalQueries = useMemo(
    () => allQueries.filter((q) => q.priority === 'critical'),
    [allQueries]
  );
  const importantQueries = useMemo(
    () => allQueries.filter((q) => q.priority === 'important'),
    [allQueries]
  );
  const backgroundQueries = useMemo(
    () => allQueries.filter((q) => q.priority === 'background'),
    [allQueries]
  );

  useEffect(() => {
    if (!enabled || hasRun.current || !queryClient) {
      return;
    }

    hasRun.current = true;
    setIsPrefetching(true);

    const runPrefetch = async () => {
      try {
        // 1. Critical — Immediate
        await prefetchCriticalQueries(criticalQueries);

        // 2. Important — After interactions
        await prefetchImportantQueries(importantQueries);

        // 3. Background — Delayed
        await prefetchBackgroundQueries(backgroundQueries);
      } catch (error) {
        console.warn('[useSmartPrefetch] Prefetch failed:', error);
      } finally {
        setIsPrefetching(false);
      }
    };

    runPrefetch();
  }, [enabled, criticalQueries, importantQueries, backgroundQueries]);

  return { isPrefetching };
}
