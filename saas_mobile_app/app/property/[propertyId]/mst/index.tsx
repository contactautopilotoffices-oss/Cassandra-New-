import React from 'react';
import { useLocalSearchParams } from 'expo-router';
import MstDashboard from '../../../../components/dashboard/MstDashboard';

export default function MstDashboardPage() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();

  if (!propertyId) {
    return null;
  }

  return <MstDashboard propertyId={propertyId} />;
}
