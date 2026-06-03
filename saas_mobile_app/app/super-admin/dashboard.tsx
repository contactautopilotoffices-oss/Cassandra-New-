import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import LovableSuperAdminDashboard from '@/components/dashboard/LovableSuperAdminDashboard';

export default function SuperAdminDashboardScreen() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <ActivityIndicator size="large" color="#708F96" />
        <Text style={{ marginTop: 16, color: '#666', fontSize: 14 }}>Loading Super Admin Dashboard...</Text>
      </SafeAreaView>
    );
  }

  // Guard: ensure only master admin can access this screen
  if (!user?.user_metadata?.is_master_admin) {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#FFFFFF' }}>
        <Text style={{ color: '#ff4444', fontSize: 16 }}>Access denied: Super Admin required.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <LovableSuperAdminDashboard />
    </SafeAreaView>
  );
}
