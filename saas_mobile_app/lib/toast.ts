import { Alert, Platform } from 'react-native';

export const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
  if (Platform.OS === 'web') {
    window.alert(`${type.toUpperCase()}: ${message}`);
  } else {
    Alert.alert(type.toUpperCase(), message);
  }
};

export const toast = {
  success: (message: string) => showToast(message, 'success'),
  error: (message: string) => showToast(message, 'error'),
  info: (message: string) => showToast(message, 'info'),
  warning: (message: string) => showToast(message, 'warning'),
};
