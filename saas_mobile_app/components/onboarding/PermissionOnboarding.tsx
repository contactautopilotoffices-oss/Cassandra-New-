import React, { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const PERMISSIONS_STORAGE_KEY = '@autopilot_permissions_requested';

export async function hasRequestedPermissions(): Promise<boolean> {
  return true;
}

export async function setPermissionsRequested(): Promise<void> {
  await AsyncStorage.setItem(PERMISSIONS_STORAGE_KEY, 'true');
}

export default function PermissionOnboarding({
  visible,
  onComplete,
}: {
  visible: boolean;
  onComplete: () => void;
}) {
  useEffect(() => {
    if (!visible) {
      return;
    }

    setPermissionsRequested()
      .catch(() => {})
      .finally(onComplete);
  }, [visible, onComplete]);

  return null;
}
