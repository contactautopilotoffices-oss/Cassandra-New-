import React, { useEffect, Component, ReactNode, useState, useCallback, useRef } from 'react';
import { initSentry, Sentry } from '@/lib/sentry';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Font from 'expo-font';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { AuthProvider, ThemeProvider } from '@/context';
import { useColorScheme, View, Text, StyleSheet, Platform } from 'react-native';
import AutopilotSplash from '@/components/splash/AutopilotSplash';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import NotificationBanner from '@/components/notifications/NotificationBanner';
import BiometricGate from '@/components/security/BiometricGate';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, mmkvPersister } from '@/utils/queryClient';

// Initialize Sentry crash reporting before anything else
initSentry();

// Global error handler to catch silent crashes (fallback when Sentry is not configured)
if (typeof window !== 'undefined') {
  const originalOnError = window.onerror;
  window.onerror = (msg, src, line, col, err) => {
    console.log('[GLOBAL ERROR]', msg, 'at', src, 'line:', line, 'col:', col, err?.stack);
    if (originalOnError) return originalOnError(msg, src, line, col, err);
    return false;
  };
  const originalOnUnhandledRejection = window.onunhandledrejection;
  window.onunhandledrejection = (e: PromiseRejectionEvent) => {
    console.log('[UNHANDLED REJECTION]', e.reason);
    if (originalOnUnhandledRejection) return originalOnUnhandledRejection.call(window, e);
    return undefined;
  };
}

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

// Error boundary to catch silent crashes
class ErrorBoundary extends Component<{ children: ReactNode; fallback?: ReactNode }, { hasError: boolean; error?: Error }> {
  constructor(props: { children: ReactNode; fallback?: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.log('[ErrorBoundary] Caught:', error.message, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>App Error</Text>
          <Text style={styles.errorMsg}>{this.state.error?.message}</Text>
          <Text style={styles.errorStack}>{this.state.error?.stack?.slice(0, 500)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  errorContainer: { flex: 1, backgroundColor: '#ffcccc', padding: 20, justifyContent: 'center' },
  errorTitle: { fontSize: 20, fontWeight: '700', color: '#cc0000', marginBottom: 8 },
  errorMsg: { fontSize: 14, color: '#333', marginBottom: 8 },
  errorStack: { fontSize: 10, color: '#666', fontFamily: 'monospace' },
});

function RootLayoutInner() {
  const colorScheme = useColorScheme();
  const [showSplash, setShowSplash] = useState(true);
  const [appReady, setAppReady] = useState(false);
  const appReadyRef = useRef(false);

  console.log('[RootLayout] Rendering...');

  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [fontError, setFontError] = useState<Error | null>(null);

  // Load custom fonts (Consistently on both Web and Native with try-catch safety)
  useEffect(() => {
    async function loadFonts() {
      try {
        await Promise.race([
          Font.loadAsync({
            'Poppins-Regular': require('../assets/fonts/Poppins-Regular.ttf'),
            'Poppins-Medium': require('../assets/fonts/Poppins-Medium.ttf'),
            'Poppins-SemiBold': require('../assets/fonts/Poppins-SemiBold.ttf'),
            'Poppins-Bold': require('../assets/fonts/Poppins-Bold.ttf'),
            'Urbanist-Regular': require('../assets/fonts/Urbanist.ttf'),
            'Urbanist-Medium': require('../assets/fonts/Urbanist.ttf'),
            'Urbanist-SemiBold': require('../assets/fonts/Urbanist.ttf'),
            'Urbanist-Bold': require('../assets/fonts/Urbanist.ttf'),
            'PressStart2P': require('../assets/fonts/PressStart2P.ttf'),
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Font loading timed out after 3000ms')), 3000)
          ),
        ]);
        setFontsLoaded(true);
      } catch (err: any) {
        console.warn('[RootLayout] Font loading failed or timed out, using system fallback fonts:', err.message);
        setFontError(err);
        setFontsLoaded(true); // Proceed with system font fallbacks to prevent crash
      }
    }
    loadFonts();
  }, []);

  // Mark app ready when fonts are loaded (or errored)
  useEffect(() => {
    if (fontsLoaded || fontError) {
      setAppReady(true);
      appReadyRef.current = true;
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  if (!appReady) {
    return null;
  }

  if (showSplash && Platform.OS !== 'web') {
    return (
      <AutopilotSplash
        key="splash"
        onComplete={handleSplashComplete}
      />
    );
  }

  return (
    <ErrorBoundary>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister: mmkvPersister }}
      >
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ThemeProvider>
              <AuthProvider>
                <BottomSheetModalProvider>
                  <AppContent colorScheme={colorScheme} />
                </BottomSheetModalProvider>
              </AuthProvider>
            </ThemeProvider>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </PersistQueryClientProvider>
    </ErrorBoundary>
  );
}

export default Sentry.wrap(RootLayoutInner);

function AppContent({ colorScheme }: { colorScheme: any }) {
  // Register push notifications inside AuthProvider context
  usePushNotifications();

  return (
    <BiometricGate>
      <NotificationBanner />
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
    </BiometricGate>
  );
}
