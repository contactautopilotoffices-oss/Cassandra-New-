import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info';
  visible: boolean;
  onClose?: () => void;
  duration?: number;
}

// Apple system icons & colors
const ICON_MAP = {
  success: 'checkmark-circle' as const,
  error: 'alert-circle' as const,
  info: 'information-circle' as const,
};

const ICON_COLOR_MAP = {
  success: '#34C759',
  error: '#FF3B30',
  info: '#2997FF',
};

const TITLE_MAP = {
  success: 'Success',
  error: 'Error',
  info: 'Notification',
};

export const Toast: React.FC<ToastProps> = ({
  message,
  type,
  visible,
  onClose,
  duration = 3000,
}) => {
  const translateY = useRef(new Animated.Value(100)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          damping: 15,
          stiffness: 150,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (duration > 0 && onClose) {
        const timer = setTimeout(onClose, duration);
        return () => clearTimeout(timer);
      }
    } else {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 100,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [visible, duration, onClose]);

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY }],
          opacity,
        },
      ]}
    >
      <View style={styles.content}>
        <Ionicons
          name={ICON_MAP[type]}
          size={22}
          color={ICON_COLOR_MAP[type]}
        />
        <View style={styles.textContainer}>
          <Text style={styles.title}>{TITLE_MAP[type]}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
        {onClose && (
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={16} color="#9CA3AF" />
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
};

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 60,
    left: (width - 340) / 2,
    width: 340,
    zIndex: 9999,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderWidth: 1,
    borderColor: '#E8E8ED',
    shadowColor: 'rgba(0,0,0,0.08)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 16,
    elevation: 4,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1D1D1F',
    letterSpacing: -0.1,
  },
  message: {
    fontSize: 12,
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 2,
    letterSpacing: -0.1,
  },
  closeButton: {
    padding: 4,
  },
});

export default Toast;
