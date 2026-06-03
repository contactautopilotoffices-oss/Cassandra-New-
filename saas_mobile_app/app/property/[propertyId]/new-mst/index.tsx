import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import NewMstDashboard from '@/components/dashboard/NewMstDashboard';

export default function NewMstRoute() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return <NewMstDashboard propertyId={propertyId} />;
}
