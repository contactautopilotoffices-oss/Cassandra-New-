// ============================================
// Auth Service — Direct Supabase Auth
// ============================================
// All auth operations go through Supabase Auth directly.
// No Fastify proxy. No apiClient.

import { createClient } from '@/utils/supabase/client';
import { ApiResponse, User, UserRole } from '@/types';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface SignupData {
  email: string;
  password: string;
  fullName: string;
  organizationId?: string;
  propertyId?: string;
}

export interface ResetPasswordData {
  email: string;
}

export interface UpdatePasswordData {
  password: string;
}

export const authService = {
  // Login with email/password
  async login(credentials: LoginCredentials): Promise<ApiResponse<{ user: User; session: any }>> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: credentials.email,
        password: credentials.password,
      });
      if (error) throw error;
      // Fetch the users row to get the app-level User shape
      const { data: userRow } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.user!.id)
        .maybeSingle();
      return { data: { user: userRow as User, session: data.session }, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 401 };
    }
  },

  // Sign up new user
  async signup(data: SignupData): Promise<ApiResponse<{ user: User }>> {
    try {
      const supabase = createClient();
      const { data: authData, error } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: { data: { full_name: data.fullName } },
      });
      if (error) throw error;
      const { data: userRow } = await supabase
        .from('users')
        .select('*')
        .eq('id', authData.user!.id)
        .maybeSingle();
      return { data: { user: userRow as User }, error: null, status: 201 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Logout
  async logout(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Forgot password
  async forgotPassword(data: ResetPasswordData): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(data.email);
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Update password
  async updatePassword(data: UpdatePasswordData): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.updateUser({ password: data.password });
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Get current session
  async getSession(): Promise<ApiResponse<{ user: User | null; session: any }>> {
    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!data.session) return { data: { user: null, session: null }, error: null, status: 200 };
      const { data: userRow } = await supabase
        .from('users')
        .select('*')
        .eq('id', data.session.user.id)
        .maybeSingle();
      return { data: { user: userRow as User, session: data.session }, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 401 };
    }
  },

  // Google OAuth
  async signInWithGoogle(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'autopilot://callback' },
      });
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Zoho OAuth (mapped to Google provider)
  async signInWithZoho(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google' as any,
        options: { redirectTo: 'autopilot://callback' },
      });
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Refresh session
  async refreshSession(): Promise<ApiResponse<void>> {
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.refreshSession();
      if (error) throw error;
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 401 };
    }
  },
};

export default authService;
