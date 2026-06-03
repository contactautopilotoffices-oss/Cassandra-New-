'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getLeaderboard, getMyGamificationStats, LeaderboardEntry, MyStatsResponse } from '@/utils/api/mobileApi';
export type { LeaderboardEntry };
import { supabase } from '@/utils/supabase/client';

export interface GamificationState {
  leaderboard: LeaderboardEntry[];
  myStats: MyStatsResponse | null;
  loading: boolean;
  error: string | null;
  period: 'daily' | 'weekly';
  refetch: () => void;
  setPeriod: (p: 'daily' | 'weekly') => void;
}

export function useGamification(propertyId: string): GamificationState {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myStats, setMyStats] = useState<MyStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<'daily' | 'weekly'>('daily');
  const [refreshKey, setRefreshKey] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;

    setLoading(true);
    setError(null);

    try {
      const [lbRes, statsRes] = await Promise.allSettled([
        getLeaderboard(propertyId, period),
        getMyGamificationStats(propertyId),
      ]);

      if (lbRes.status === 'fulfilled') {
        if (lbRes.value.error) {
          setError(lbRes.value.error);
        } else {
          setLeaderboard(lbRes.value.leaderboard);
        }
      } else {
        setError(lbRes.reason instanceof Error ? lbRes.reason.message : 'Failed to fetch leaderboard');
      }

      if (statsRes.status === 'fulfilled') {
        if (statsRes.value.error) {
          console.warn('[useGamification] myStats error:', statsRes.value.error);
        } else {
          setMyStats(statsRes.value);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId, period, refreshKey]);

  // Subscribe to realtime score updates
  useEffect(() => {
    if (!propertyId) return;

    // TODO: mst_daily_scores does not exist in saas_one schema
    // // Subscribe to score changes
    // const channel = supabase
    //   .channel(`mst_gamification_${propertyId}`)
    //   .on(
    //     'postgres_changes',
    //     {
    //       event: '*',
    //       schema: 'public',
    //       table: 'mst_daily_scores',
    //       filter: `property_id=eq.${propertyId}`,
    //     },
    //     () => {
    //       // Debounce: only refresh once every 5 seconds max
    //       setRefreshKey(prev => prev + 1);
    //     }
    //   )
    //   .subscribe();
    const channel = supabase.channel(`mst_gamification_${propertyId}`).subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [propertyId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    setRefreshKey(prev => prev + 1);
  }, []);

  return {
    leaderboard,
    myStats,
    loading,
    error,
    period,
    refetch,
    setPeriod,
  };
}
