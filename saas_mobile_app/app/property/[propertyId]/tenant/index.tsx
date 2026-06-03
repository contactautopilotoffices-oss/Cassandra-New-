import React, { useMemo } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import TenantDashboard from '@/components/tenant/TenantDashboard';

export default function TenantPage() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { user, membership, isLoading } = useAuth();
  const router = useRouter();

  // DEFENSE-IN-DEPTH: Guard against undefined propertyId
  if (!propertyId) {
    if (__DEV__) {
      console.log('[TenantPage] propertyId is undefined — redirecting to index');
    }
    return null;
  }

  // Check if user is tenant or super_tenant for this property
  const roleInfo = useMemo(() => {
    if (!membership || !user) {
      return null;
    }

    // Check property membership
    const propMembership = membership.properties?.find((p: { id: string }) => p.id === propertyId);
    if (propMembership) {
      const isST = propMembership.role === 'super_tenant';
      return {
        role: propMembership.role,
        isSuperTenant: isST,
      };
    }

    // Check org-level roles for super_tenant
    if (['org_admin', 'org_super_admin', 'owner', 'super_tenant'].includes(membership.org_role ?? '')) {
      return { role: membership.org_role, isSuperTenant: true };
    }

    // Org-level super_tenant (not assigned to a specific property)
    if (membership.org_role === 'super_tenant') {
      return { role: membership.org_role, isSuperTenant: true };
    }

    return null;
  }, [membership, propertyId, user]);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#667eea" />
      </View>
    );
  }

  if (!roleInfo) {
    // Redirect to dashboard if not authorized
    router.replace(`/property/${propertyId}/dashboard`);
    return null;
  }

  return (
    <TenantDashboard
      propertyId={propertyId}
      isSuperTenant={roleInfo.isSuperTenant}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
