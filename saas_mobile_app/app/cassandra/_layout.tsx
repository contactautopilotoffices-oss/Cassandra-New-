import { Stack } from 'expo-router';

export default function CassandraLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0a0a0f' },
        animation: 'slide_from_right',
      }}
    />
  );
}
