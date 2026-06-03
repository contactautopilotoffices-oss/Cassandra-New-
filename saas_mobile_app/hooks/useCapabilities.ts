import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { CAPABILITY_MATRIX, ROLE_LEVEL_MAP } from '@/constants/capabilities';
import { RoleKey, CapabilityDomain, CapabilityAction, CapabilityMatrix } from '@/types/rbac';

export interface CapabilitiesContext {
  roleKey: RoleKey;
  roleLevel: number;
  capabilities: CapabilityMatrix;
}

/**
 * Resolve capabilities for the current user based on their property membership role.
 * Mirrors the logic from saas_one/backend/services/authService.ts
 */
export function useCapabilities(propertyId?: string): CapabilitiesContext {
  const { membership } = useAuth();

  return useMemo(() => {
    const propMembership = membership?.properties?.find((p) => p.id === propertyId);
    const roleKey = (propMembership?.role || 'staff') as RoleKey;
    const roleLevel = ROLE_LEVEL_MAP[roleKey] ?? 4;
    const capabilities = CAPABILITY_MATRIX[roleKey] || {};

    return {
      roleKey,
      roleLevel,
      capabilities,
    };
  }, [membership, propertyId]);
}

/**
 * Synchronous capability checker — safe for conditional rendering.
 */
export function hasCapability(
  capabilities: CapabilityMatrix,
  domain: CapabilityDomain,
  action: CapabilityAction
): boolean {
  return capabilities[domain]?.includes(action) ?? false;
}
