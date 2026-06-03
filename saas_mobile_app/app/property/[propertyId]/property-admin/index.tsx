import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function LegacyPropertyAdminDashboard() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  return <Redirect href={`/property/${propertyId}/lovable-admin`} />;
}
