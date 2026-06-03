// ============================================
// User Service — routes through serverApi
// ============================================

import { serverApi } from '@/lib/serverApi';
import { supabase } from '@/utils/supabase/client';
import { ApiResponse, User, UserRole } from '@/types';

export interface CreateUserData {
  email: string;
  fullName: string;
  role: UserRole;
  organizationId?: string;
  propertyId?: string;
  phone?: string;
}

export interface UpdateUserData {
  fullName?: string;
  role?: UserRole;
  organizationId?: string;
  propertyId?: string;
  phone?: string;
  isActive?: boolean;
}

export interface UserFilters {
  organizationId?: string;
  propertyId?: string;
  role?: UserRole | UserRole[];
  isActive?: boolean;
  search?: string;
}

export const userService = {
  // Get all users
  async getUsers(filters?: UserFilters): Promise<ApiResponse<User[]>> {
    try {
      const queryFilters: any[] = [];
      if (filters?.organizationId) queryFilters.push({ op: 'eq', column: 'organization_id', value: filters.organizationId });
      if (filters?.propertyId) queryFilters.push({ op: 'eq', column: 'property_id', value: filters.propertyId });
      if (filters?.isActive !== undefined) queryFilters.push({ op: 'eq', column: 'is_active', value: filters.isActive });
      if (filters?.search) {
        const s = `%${filters.search}%`;
        queryFilters.push({ op: 'or', expression: `full_name.ilike.${s},email.ilike.${s}` });
      }
      if (filters?.role) {
        if (Array.isArray(filters.role)) {
          queryFilters.push({ op: 'in', column: 'role', values: filters.role });
        } else {
          queryFilters.push({ op: 'eq', column: 'role', value: filters.role });
        }
      }

      const res = await serverApi.query<User[]>({
        table: 'users',
        action: 'select',
        select: '*',
        filters: queryFilters,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to fetch users');
      return { data: res.data ?? [], error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Get single user
  async getUser(id: string): Promise<ApiResponse<User>> {
    try {
      const res = await serverApi.query<User>({
        table: 'users',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: id }],
        single: true,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to fetch user');
      return { data: res.data ?? null, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Create user (admin only)
  // Note: This inserts a user profile row only. Creating an auth user requires
  // admin privileges (service key) which is not available from the mobile client.
  // Use the 'invite-user' Edge Function (inviteUser) to provision auth + profile.
  async createUser(data: CreateUserData): Promise<ApiResponse<User>> {
    try {
      const res = await serverApi.query<User>({
        table: 'users',
        action: 'insert',
        values: {
          email: data.email,
          full_name: data.fullName,
          role: data.role,
          organization_id: data.organizationId ?? null,
          property_id: data.propertyId ?? null,
          phone: data.phone ?? null,
          is_active: true,
        },
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to create user');
      return { data: res.data ?? null, error: null, status: 201 };
    } catch (error) {
      return { data: null, error: error as Error, status: 400 };
    }
  },

  // Update user
  async updateUser(id: string, data: UpdateUserData): Promise<ApiResponse<User>> {
    const updateData: Record<string, any> = {};
    if (data.fullName !== undefined) updateData.full_name = data.fullName;
    if (data.phone !== undefined) updateData.phone = data.phone;
    updateData.updated_at = new Date().toISOString();

    const res = await serverApi.query<User>({
      table: 'users',
      action: 'update',
      values: updateData,
      filters: [{ op: 'eq', column: 'id', value: id }],
      single: true,
    });
    return { data: res.data, error: res.error?.message ?? null, status: res.error ? 400 : 200, success: !res.error };
  },

  // Update user role
  async updateRole(userId: string, role: UserRole, propertyId?: string, organizationId?: string): Promise<ApiResponse<User>> {
    try {
      // Update the users table role
      const userRes = await serverApi.query<User>({
        table: 'users',
        action: 'update',
        values: { role, updated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: userId }],
        select: '*',
        single: true,
      });
      if (userRes.error) throw new Error(userRes.error.message ?? 'Failed to update role');

      // Also update organization_memberships if orgId provided
      if (organizationId) {
        await serverApi.query({
          table: 'organization_memberships',
          action: 'update',
          values: { role },
          filters: [
            { op: 'eq', column: 'user_id', value: userId },
            { op: 'eq', column: 'organization_id', value: organizationId },
          ],
        });
      }

      return { data: userRes.data ?? null, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Delete user (soft delete)
  async deleteUser(id: string): Promise<ApiResponse<User>> {
    const res = await serverApi.query<User>({
      table: 'users',
      action: 'update',
      values: { is_active: false, deleted_at: new Date().toISOString() },
      filters: [{ op: 'eq', column: 'id', value: id }],
      single: true,
    });
    return { data: res.data, error: res.error?.message ?? null, status: res.error ? 400 : 200, success: !res.error };
  },

  // Hard delete user (admin only)
  // Note: This deletes the users profile row only. The auth.users record cannot
  // be deleted from the mobile client (requires admin/service key). Use a
  // server-side admin endpoint or Edge Function for full auth deletion.
  async hardDeleteUser(id: string): Promise<ApiResponse<void>> {
    try {
      const res = await serverApi.query({
        table: 'users',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: id }],
      });
      if (res.error) throw new Error(res.error.message ?? 'Failed to hard delete user');
      return { data: undefined, error: null, status: 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Assign property to user
  async assignProperty(userId: string, propertyId: string, role?: UserRole): Promise<ApiResponse<User>> {
    return this.updateRole(userId, role ?? 'tenant', propertyId);
  },

  // Get user statistics
  async getUserStats(organizationId?: string): Promise<ApiResponse<any>> {
    try {
      const res = await serverApi.query<any[]>({
        table: 'users',
        action: 'select',
        select: '*, property_memberships(role, is_active)',
      });
      if (res.error) throw new Error(res.error?.message ?? 'Failed to fetch stats');
      const rows = res.data ?? [];
      return {
        data: { total: rows.length, byRole: {}, active: 0, inactive: 0 },
        error: null,
        status: 200,
      };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },

  // Invite user by email
  async inviteUser(email: string, role: UserRole, organizationId?: string, propertyId?: string): Promise<ApiResponse<void>> {
    try {
      const { error } = await supabase.functions.invoke('invite-user', {
        body: { email, role, organizationId, propertyId },
      });
      return { data: undefined, error, status: error ? 400 : 200 };
    } catch (error) {
      return { data: null, error: error as Error, status: 500 };
    }
  },
};

export default userService;
