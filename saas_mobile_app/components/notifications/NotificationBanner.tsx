import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useTheme } from '@/context';
import { addBannerListener, hideBanner, type ForegroundNotification } from '@/hooks/usePushNotifications';

const BANNER_HEIGHT = 90;
const AUTO_DISMISS_MS = 5000;

function getIconName(type?: string): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'TICKET_CREATED': return 'alert-circle';
    case 'TICKET_ASSIGNED': return 'time';
    case 'TICKET_COMPLETED': return 'checkmark-circle';
    case 'TICKET_CRITICAL': return 'warning';
    case 'SLA_BREACH': return 'flash';
    case 'SLA_WARNING': return 'timer';
    case 'MATERIAL_REQUEST_PENDING': return 'cube';
    default: return 'notifications';
  }
}

function getIconColor(type?: string): string {
  switch (type) {
    case 'TICKET_CRITICAL':
    case 'SLA_BREACH': return '#EF4444';
    case 'TICKET_CREATED': return '#2997FF';
    case 'TICKET_COMPLETED': return '#10B981';
    case 'MATERIAL_REQUEST_PENDING': return '#FF9F0A';
    default: return '#708F96';
  }
}

function extractRoute(data: Record<string, any>): string | null {
  if (data?.ticket_id) {
    return `/property/${data.property_id || 'all'}/tickets/${data.ticket_id}`;
  }
  if (data?.deep_link) {
    const dl = data.deep_link as string;
    if (dl.includes('/procurement')) return `/property/${data.property_id || 'all'}/stock`;
    if (dl.includes('/security')) return `/property/${data.property_id || 'all'}/security`;
    if (dl.includes('/visitors')) return `/property/${data.property_id || 'all'}/visitors`;
    if (dl.includes('/tickets/')) {
      const match = dl.match(/\/tickets\/([^?]+)/);
      if (match) return `/property/${data.property_id || 'all'}/tickets/${match[1]}`;
    }
  }
  if (data?.screen) return data.screen as string;
  return null;
}

/**
 * Foreground notification banner — slides down from top when a push
 * notification arrives while the app is open. Auto-dismisses after 5s.
 * Tapping navigates to the relevant screen.
 */
export default function NotificationBanner() {
  const router = useRouter();
  const { theme } = useTheme();
  const isDark = theme === 'dark';

  const [notification, setNotification] = useState<ForegroundNotification | null>(null);
  const translateY = useRef(new Animated.Value(-BANNER_HEIGHT - 50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -BANNER_HEIGHT - 50,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setNotification(null);
      hideBanner();
    });
  }, [translateY, opacity]);

  const show = useCallback((notif: ForegroundNotification) => {
    if (timerRef.current) clearTimeout(timerRef.current);

    setNotification(notif);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        friction: 8,
        tension: 60,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    timerRef.current = setTimeout(() => {
      dismiss();
    }, AUTO_DISMISS_MS);
  }, [translateY, opacity, dismiss]);

  useEffect(() => {
    const remove = addBannerListener((notif) => {
      if (notif) {
        show(notif);
      } else {
        dismiss();
      }
    });
    return () => {
      remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, dismiss]);

  const handlePress = () => {
    if (!notification) return;
    const route = extractRoute(notification.data);
    if (route) {
      router.push(route as any);
    }
    dismiss();
  };

  if (!notification) return null;

  const notifType = notification.data?.notification_type as string | undefined;
  const iconName = getIconName(notifType);
  const iconColor = getIconColor(notifType);

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
          backgroundColor: isDark ? 'rgba(25,30,40,0.95)' : 'rgba(255,255,255,0.95)',
          borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        },
      ]}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <TouchableOpacity
        style={styles.inner}
        onPress={handlePress}
        activeOpacity={0.8}
      >
        <View style={[styles.iconCircle, { backgroundColor: `${iconColor}15` }]}>
          <Ionicons name={iconName} size={20} color={iconColor} />
        </View>
        <View style={styles.textBlock}>
          <Text
            style={[styles.title, { color: isDark ? '#F8FAFC' : '#1A2332' }]}
            numberOfLines={1}
          >
            {notification.title}
          </Text>
          <Text
            style={[styles.body, { color: isDark ? 'rgba(230,235,238,0.6)' : 'rgba(26,35,50,0.6)' }]}
            numberOfLines={2}
          >
            {notification.body}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          onPress={(e) => {
            e.stopPropagation();
            dismiss();
          }}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons
            name="close"
            size={16}
            color={isDark ? 'rgba(230,235,238,0.4)' : 'rgba(26,35,50,0.4)'}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    borderBottomWidth: 1,
    paddingTop: (StatusBar.currentHeight ?? 44) + 6,
    paddingBottom: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 10,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  textBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontFamily: 'Poppins-Medium',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  body: {
    fontFamily: 'Urbanist-Regular',
    fontSize: 12,
    lineHeight: 16,
  },
  closeBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
});
