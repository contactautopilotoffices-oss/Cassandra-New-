import React from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Soft Service Manager — Redirected to unified dashboard
 * All staff and soft-service roles now use the glass LovableStaffDashboard
 */
export default function SoftServiceManagerPage() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();

  if (!propertyId) {
    return null;
  }

  return <Redirect href={`/property/${propertyId}/dashboard`} />;
}
