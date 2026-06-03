import { Redirect } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { View, Text } from 'react-native';
import { useEffect } from 'react';
import SkeletonLoader from '@/components/dashboard/lovable/SkeletonLoader';

export default function Index() {
  const { user, isLoading, membership, isMembershipLoading } = useAuth();

  useEffect(() => {
    if (__DEV__) {
      console.log('[Index] isLoading:', isLoading, 'isMembershipLoading:', isMembershipLoading, 'user:', user?.email, 'membership:', membership?.properties?.length);
    }
  }, [isLoading, isMembershipLoading, user, membership]);

  // Wait for both Auth and Membership to finish loading
  if (isLoading || isMembershipLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <SkeletonLoader />
      </View>
    );
  }

  if (!user) {
    return <Redirect href="/login" />;
  }

  // Super Admin — master admin check
  if (user?.user_metadata?.is_master_admin) {
    return <Redirect href="/super-admin/dashboard" />;
  }

  // If user is authenticated but membership is still loading, keep showing loader
  // instead of redirecting to login. This prevents the login-flash bug when
  // membership cache expires or fetch is slow.
  if (!membership) {
    return (
      <View style={{ flex: 1, backgroundColor: '#121212' }}>
        <SkeletonLoader />
      </View>
    );
  }

  // User is authenticated — redirect directly to first property dashboard
  if (membership.properties && membership.properties.length > 0) {
    const firstProperty = membership.properties[0];
    if (__DEV__) {
      console.log('[Index] Redirecting to property:', firstProperty.id, firstProperty.name);
    }
    return <Redirect href={`/property/${firstProperty.id}`} />;
  }

  // User is authenticated but has no property access — show loading instead of login
  // (they may need to be invited, but we shouldn't log them out)
  return (
    <View style={{ flex: 1, backgroundColor: '#121212', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Text style={{ color: '#fff', fontSize: 18, fontWeight: '600', marginBottom: 8 }}>
        No Properties Assigned
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, textAlign: 'center' }}>
        You don't have access to any properties yet. Contact your administrator.
      </Text>
    </View>
  );
}
