import React from 'react';
import { View, Text } from 'react-native';

export default function SecurityDashboard({ propertyId }: { propertyId?: string }) {
  return (
    <View>
      <Text>Placeholder Security Dashboard {propertyId}</Text>
    </View>
  );
}
