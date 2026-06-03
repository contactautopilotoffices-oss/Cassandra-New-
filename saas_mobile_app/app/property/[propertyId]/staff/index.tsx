import StaffDashboard from '@/components/dashboard/StaffDashboard';
import { useLocalSearchParams } from 'expo-router';

export default function StaffPage() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  if (!propertyId) return null;
  return <StaffDashboard propertyId={propertyId} />;
}
