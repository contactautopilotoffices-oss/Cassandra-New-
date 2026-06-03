import * as Sentry from '@sentry/react-native';

const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;
const isDev = process.env.NODE_ENV !== 'production';

export function initSentry() {
  if (!SENTRY_DSN) {
    if (isDev) {
      console.warn('[Sentry] EXPO_PUBLIC_SENTRY_DSN is not set. Crash reporting is disabled.');
    }
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    debug: isDev,
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
    // Consider lowering this in production to reduce noise/cost.
    tracesSampleRate: isDev ? 1.0 : 0.2,
    // Enable native crash reporting
    enableNativeCrashHandling: true,
    // Attach stacktraces for JS errors
    attachStacktrace: true,
    // Ignore common non-fatal network errors to reduce noise
    ignoreErrors: [
      'Network request failed',
      'No network connection',
      'TimeoutError',
      'AbortError',
    ],
  });
}

export { Sentry };
