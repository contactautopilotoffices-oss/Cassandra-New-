import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import PremiumMstDashboard from '@/components/dashboard/PremiumMstDashboard';

export default function PremiumMstRoute() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return <PremiumMstDashboard propertyId={propertyId} />;
}
