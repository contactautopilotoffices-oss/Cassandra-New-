/**
 * Rooms Stack Layout — wraps the room list and detail screens
 */

import React from 'react';
import { Stack } from 'expo-router';
import { Colors } from '@/constants/cassandra-theme';

export default function RoomsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.bgDeep },
        animation: 'slide_from_right',
      }}
    />
  );
}
