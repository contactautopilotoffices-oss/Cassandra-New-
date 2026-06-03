import React from 'react';
import { View } from 'react-native';
import { useCapabilities, hasCapability } from '@/hooks/useCapabilities';
import { CapabilityDomain, CapabilityAction } from '@/types/rbac';

interface CapabilityWrapperProps {
  domain: CapabilityDomain;
  action?: CapabilityAction;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  propertyId?: string;
}

/**
 * Mobile-native capability gate.
 * Mirrors saas_one/frontend/components/auth/CapabilityWrapper.tsx
 * but resolves capabilities synchronously from AuthContext membership data
 * instead of making an async authService call.
 */
export default function CapabilityWrapper({
  domain,
  action = 'view',
  children,
  fallback = null,
  propertyId,
}: CapabilityWrapperProps) {
  const { capabilities } = useCapabilities(propertyId);
  const permitted = hasCapability(capabilities, domain, action);

  if (!permitted) return fallback as React.ReactElement;
  return children as React.ReactElement;
}
