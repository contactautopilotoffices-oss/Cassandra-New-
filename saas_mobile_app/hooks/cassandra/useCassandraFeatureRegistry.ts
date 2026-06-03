/**
 * useCassandraFeatureRegistry — lazy feature availability hook
 *
 * Implements try-and-cache:
 *   1. Check AsyncStorage cache (1-hour TTL)
 *   2. If cached → return immediately
 *   3. If miss → attempt the feature endpoint
 *   4. On success (2xx) → mark 'available'
 *   5. On 404/501/503 → mark 'unavailable' (graceful degradation)
 *   6. On other error → mark 'unknown' (retry next time)
 *
 * The UI shows "Coming soon" for unavailable features.
 * No crashes, no wasted API calls after first discovery.
 */

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchWithAuth } from '@/lib/cassandra';

// ─── Feature definitions ─────────────────────────────────────────────────────

export type FeatureStatus = 'available' | 'unavailable' | 'unknown' | 'checking';

export interface FeatureDef {
  id: string;
  label: string;
  description: string;
  // The endpoint to probe (HEAD or GET). Leave method undefined to skip probe.
  probe?: { method: 'GET' | 'POST'; path: string };
}

export const CASSANDRA_FEATURES: FeatureDef[] = [
  {
    id: 'smart-query',
    label: 'Smart Query',
    description: 'Ask questions in natural language',
    probe: { method: 'POST', path: '/api/v1/features/voice/smart-query' },
  },
  {
    id: 'create-ticket',
    label: 'Voice Ticket',
    description: 'Create tickets from voice commands',
    probe: { method: 'POST', path: '/api/v1/features/voice/ticket' },
  },
  {
    id: 'escalate-ticket',
    label: 'Voice Escalate',
    description: 'Escalate tickets via voice',
    probe: { method: 'POST', path: '/api/v1/features/voice/escalate' },
  },
  {
    id: 'snooze-ticket',
    label: 'Voice Snooze',
    description: 'Snooze tickets via voice',
    probe: { method: 'POST', path: '/api/v1/features/voice/snooze' },
  },
  {
    id: 'research',
    label: 'Research',
    description: 'Deep research on vendors, topics, or properties',
    probe: { method: 'POST', path: '/api/v1/features/chat/research' },
  },
  {
    id: 'reports',
    label: 'Reports',
    description: 'Generate property reports',
    probe: { method: 'POST', path: '/api/v1/features/reports/generate' },
  },
  {
    id: 'predictive-tickets',
    label: 'Predictive Tickets',
    description: 'AI-powered ticket prediction',
    probe: { method: 'POST', path: '/api/v1/features/ai/predictive-tickets' },
  },
  {
    id: 'feasibility-report',
    label: 'Feasibility Report',
    description: 'Business development feasibility analysis',
    probe: { method: 'POST', path: '/api/v1/features/bd/feasibility-report' },
  },
  {
    id: 'opex-estimate',
    label: 'OPEX Estimate',
    description: 'Operational expense estimation',
    probe: { method: 'POST', path: '/api/v1/features/facility/opex-estimate' },
  },
  {
    id: 'memory-search',
    label: 'Memory Search',
    description: 'Search past session context',
    probe: { method: 'GET', path: '/api/v1/memory/search' },
  },
  {
    id: 'memory-write',
    label: 'Memory Write',
    description: 'Write corrections to memory',
    probe: { method: 'POST', path: '/api/v1/memory/write' },
  },
  {
    id: 'ar-process',
    label: 'AR Processing',
    description: 'Augmented reality process guidance',
  },
  {
    id: 'drift-check',
    label: 'Drift Check',
    description: 'Compliance drift detection',
  },
  {
    id: 'notion-push',
    label: 'Notion Sync',
    description: 'Push summaries to Notion',
  },
];

// ─── Cache helpers ────────────────────────────────────────────────────────────

const CACHE_PREFIX = '@cassandra_features:';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

type FeatureMap = Record<string, FeatureStatus>;

async function loadCache(): Promise<FeatureMap | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + 'map');
    if (!raw) return null;
    const { map, timestamp } = JSON.parse(raw) as { map: FeatureMap; timestamp: number };
    if (Date.now() - timestamp < CACHE_TTL_MS) return map;
  } catch { /* corrupt cache */ }
  return null;
}

async function saveCache(map: FeatureMap): Promise<void> {
  try {
    await AsyncStorage.setItem(CACHE_PREFIX + 'map', JSON.stringify({ map, timestamp: Date.now() }));
  } catch { /* non-fatal */ }
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useCassandraFeatureRegistry() {
  const [features, setFeatures] = useState<FeatureMap>(() => {
    // Initialize all features as unknown
    return Object.fromEntries(CASSANDRA_FEATURES.map((f) => [f.id, 'unknown']));
  });
  const [isLoaded, setIsLoaded] = useState(false);

  // Load cache on mount
  useEffect(() => {
    loadCache().then((cached) => {
      if (cached) {
        setFeatures(cached);
        // Re-check features that are 'unknown' (never checked)
        setFeatures((prev) => {
          const updated = { ...prev };
          let changed = false;
          for (const [id, status] of Object.entries(updated)) {
            if (status === 'unknown') changed = true;
            else if (status === 'checking') {
              updated[id] = 'unknown';
              changed = true;
            }
          }
          return changed ? updated : prev;
        });
      }
      setIsLoaded(true);
    });
  }, []);

  // Probe a single feature
  const probeFeature = useCallback(async (feature: FeatureDef): Promise<FeatureStatus> => {
    if (!feature.probe) return 'unavailable'; // No endpoint = not implemented

    try {
      const res = await fetchWithAuth(feature.probe.path, { method: feature.probe.method });
      return res.ok ? 'available' : 'unavailable';
    } catch {
      return 'unknown';
    }
  }, []);

  // Check all unknown features (called after cache miss)
  const checkAllFeatures = useCallback(async () => {
    const unknownIds = CASSANDRA_FEATURES.filter((f) => features[f.id] === 'unknown').map((f) => f.id);
    if (unknownIds.length === 0) return;

    // Mark as checking
    setFeatures((prev) => {
      const next = { ...prev };
      unknownIds.forEach((id) => { next[id] = 'checking'; });
      return next;
    });

    // Probe in parallel (max 4 at a time to avoid rate limiting)
    const results: FeatureMap = {};
    const batchSize = 4;
    for (let i = 0; i < unknownIds.length; i += batchSize) {
      const batch = unknownIds.slice(i, i + batchSize);
      const probed = await Promise.all(
        batch.map(async (id) => {
          const def = CASSANDRA_FEATURES.find((f) => f.id === id)!;
          const status = await probeFeature(def);
          return { id, status } as { id: string; status: FeatureStatus };
        })
      );
      probed.forEach(({ id, status }) => { results[id] = status; });
      setFeatures((prev) => ({ ...prev, ...results }));
    }

    await saveCache({ ...features, ...results });
  }, [features, probeFeature]);

  // Auto-check on mount after cache miss
  useEffect(() => {
    if (!isLoaded) return;
    const needsCheck = Object.values(features).some((s) => s === 'unknown');
    if (needsCheck) {
      checkAllFeatures();
    }
  }, [isLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Check a specific feature on demand
  const checkFeature = useCallback(async (featureId: string) => {
    const def = CASSANDRA_FEATURES.find((f) => f.id === featureId);
    if (!def) return;
    setFeatures((prev) => ({ ...prev, [featureId]: 'checking' }));
    const status = await probeFeature(def);
    setFeatures((prev) => {
      const next = { ...prev, [featureId]: status };
      saveCache(next);
      return next;
    });
  }, [probeFeature]);

  // Is a feature available?
  const isAvailable = useCallback(
    (featureId: string): boolean => features[featureId] === 'available',
    [features]
  );

  // Is a feature available or unknown (show loading)?
  const isReady = useCallback(
    (featureId: string): boolean =>
      features[featureId] === 'available' || features[featureId] === 'unavailable',
    [features]
  );

  return {
    features,
    isLoaded,
    checkFeature,
    checkAllFeatures,
    isAvailable,
    isReady,
  };
}
