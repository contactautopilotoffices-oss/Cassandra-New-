import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import LovableMstDashboard from '@/components/dashboard/LovableMstDashboard';

export default function LovableMstRoute() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  return <LovableMstDashboard propertyId={propertyId} />;
}
