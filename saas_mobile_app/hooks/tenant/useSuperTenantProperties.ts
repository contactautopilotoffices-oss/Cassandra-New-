'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { getSuperTenantProperties } from '@/utils/api/mobileApi';

export interface SuperTenantProperty {
  id: string;
  property_id: string;
  name: string;
  code: string;
  status: string;
}

/**
 * Fetch properties assigned to a super tenant via the web API.
 * Mirrors GET /api/super-tenant from saas_development/app/api/super-tenant/route.ts
 *
 * Permissions: master admin can query any user; org_super_admin can query their org's;
 * regular users can only query themselves.
 */
export function useSuperTenantProperties(userId: string | undefined) {
  const [properties, setProperties] = useState<SuperTenantProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProperties = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setError(null);

    try {
      const result = await getSuperTenantProperties(userId);

      if (result.error) {
        setError(result.error);
      } else {
        // Map from API response shape to { id, name, code, status }
        const mapped: SuperTenantProperty[] = (result.properties ?? []).map((p) => ({
          id: p.property_id,
          property_id: p.property_id,
          name: p.properties?.name ?? 'Unknown Property',
          code: p.properties?.code ?? '',
          status: p.properties?.status ?? 'active',
        }));
        setProperties(mapped);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch properties');
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    fetchProperties();
  }, [fetchProperties]);

  return { properties, loading, error, refetch: fetchProperties };
}
