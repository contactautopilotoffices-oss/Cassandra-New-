import React from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';

// All roles now use the unified sidebar dashboard with capability-based module filtering.
export default function PropertyIndex() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const { user, membership, isLoading, isMembershipLoading } = useAuth();

  // CRITICAL: Wait for BOTH auth and membership loading to finish before
  // deciding where to redirect. Otherwise we flash login on every reopen
  // when membership cache has expired.
  if (isLoading || isMembershipLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#708F96" />
      </View>
    );
  }

  if (!propertyId) {
    return <Redirect href="/" />;
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  if (!membership) {
    // Auth loaded but membership failed — show loading instead of login
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#708F96" />
      </View>
    );
  }

  // Role-based dashboard routing
  const propMembership = membership.properties?.find(
    (p) => p.id.toLowerCase() === propertyId.toLowerCase()
  );
  const propRole = propMembership?.role?.trim()?.toLowerCase();
  const orgRole = (membership.org_role ?? '').trim().toLowerCase();

  const isOrgSuperAdmin = ['org_admin', 'org_super_admin', 'owner'].includes(propRole ?? '') ||
                         ['org_admin', 'org_super_admin', 'owner'].includes(orgRole);

  const isPropertyAdmin = [
    'property_admin', 'admin', 'manager', 'property manager',
    'property_manager', 'facility_manager', 'facility manager',
    'spoc', 'administrator'
  ].includes(propRole ?? '');

  const isMst = ['mst', 'maintenance_staff', 'staff'].includes(propRole ?? '');

  const isTenant = ['tenant', 'super_tenant'].includes(propRole ?? '');

  const isProcurement = propRole === 'procurement' || orgRole === 'procurement';

  const isSecurity = propRole === 'security';

  // Lovable test dashboards — email-gated override
  const userEmail = user.email?.toLowerCase() ?? '';
  if (userEmail === 'srustikarta2022@gmail.com') {
    return <Redirect href={`/property/${propertyId}/lovable-mst`} />;
  }
  if (userEmail === 'lohitexplores@gmail.com') {
    return <Redirect href={`/property/${propertyId}/dashboard`} />;
  }

  if (isOrgSuperAdmin) {
    return <Redirect href={`/property/${propertyId}/dashboard`} />;
  }

  if (isPropertyAdmin) {
    return <Redirect href={`/property/${propertyId}/dashboard`} />;
  }

  // We now have a unified dashboard router at /dashboard that handles MST and Staff
  if (isMst) {
    return <Redirect href={`/property/${propertyId}/dashboard`} />;
  }

  if (isTenant) {
    return <Redirect href={`/property/${propertyId}/tenant`} />;
  }

  if (isProcurement) {
    return <Redirect href={`/property/${propertyId}/procurement`} />;
  }

  if (isSecurity) {
    return <Redirect href={`/property/${propertyId}/security`} />;
  }

  return <Redirect href={`/property/${propertyId}/dashboard`} />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
  },
});
