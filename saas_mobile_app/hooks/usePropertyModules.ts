import { useState, useEffect, useCallback } from 'react';
import { propertyService } from '@/services/propertyService';

/**
 * Fetches the organization's available_modules for a given property.
 * Mirrors saas_one's module licensing system.
 */
export function usePropertyModules(propertyId?: string) {
  const [modules, setModules] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchModules = useCallback(async () => {
    if (!propertyId) {
      setModules([]);
      return;
    }
    setIsLoading(true);
    try {
      const result = await propertyService.getPropertyFeatures(propertyId);
      if (result.success && result.data) {
        setModules(result.data.map((m) => m.module));
      } else {
        console.error('[usePropertyModules] Failed to fetch:', result.error);
        // Fail-open: if we can't fetch modules, assume all are enabled
        setModules([]);
      }
    } catch (e) {
      console.error('[usePropertyModules] Exception:', e);
      setModules([]);
    } finally {
      setIsLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  return { modules, isLoading, refresh: fetchModules };
}
