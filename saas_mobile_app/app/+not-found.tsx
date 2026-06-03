import { View, StyleSheet, Text } from 'react-native';
import { Link, Stack } from 'expo-router';
import { useTheme } from '@/context';
import { Colors } from '@/constants/Colors';
import { H1, Button } from '@/components/ui';
import { Home, AlertTriangle } from 'lucide-react-native';

export default function NotFoundScreen() {
  const { theme } = useTheme();
  const colors = Colors[theme];

  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={[styles.iconContainer, { backgroundColor: colors.error + '15' }]}>
          <AlertTriangle size={48} color={colors.error} />
        </View>

        <H1 style={[styles.title, { color: colors.text }]}>Page Not Found</H1>

        <Text style={[styles.description, { color: colors.textSecondary }]}>
          The page you're looking for doesn't exist or has been moved.
        </Text>

        <Link href="/" asChild>
          <Button style={styles.button}>
            <Home size={18} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 15, marginLeft: 8 }}>Go Home</Text>
          </Button>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 96,
    height: 96,
    borderRadius: 48,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 32,
    maxWidth: 300,
  },
  button: {
    minWidth: 160,
  },
});
