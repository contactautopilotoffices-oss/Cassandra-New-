import { useState, useEffect, useCallback } from 'react';
import { serverApi } from '@/lib/serverApi';
import { useAuth } from './useAuth';

export interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  user_photo_url: string | null;
  role: string | null;
  designation: string | null;
}

/**
 * Fetches the user's profile row from the `users` table.
 * Includes photo, name, phone, role.
 */
export function useUserProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(null);
      return;
    }
    setIsLoading(true);
    try {
      const { data, error } = await serverApi.query({
        table: 'users',
        action: 'select',
        select: 'id, full_name, email, phone, user_photo_url, role, designation',
        filters: [{ column: 'id', op: 'eq', value: user.id }],
        maybeSingle: true,
      });

      if (error) {
        console.error('[useUserProfile] fetch error:', error);
        setProfile(null);
      } else if (data) {
        setProfile(data as UserProfile);
      }
    } catch (e) {
      console.error('[useUserProfile] exception:', e);
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  return { profile, isLoading, refresh: fetchProfile };
}

/**
 * Get initials from a full name.
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}
