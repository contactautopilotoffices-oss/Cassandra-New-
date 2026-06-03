import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';
import type { Property, Organization } from '@/types';

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function mapProperty(row: Record<string, unknown>): Property {
  return {
    id: row.id as string,
    organizationId: row.organization_id as string,
    name: row.name as string,
    type: row.type as Property['type'],
    address: row.address as string,
    city: row.city as string,
    state: row.state as string,
    zip: row.zip as string,
    phone: row.phone as string,
    email: row.email as string,
    status: (row.status ?? 'active') as Property['status'],
    totalUnits: (row.total_units ?? 0) as number,
    occupiedUnits: (row.occupied_units ?? 0) as number,
    amenities: (row.amenities ?? []) as string[],
    code: row.code as string,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function ok<T>(data: T): ApiResponse<T> {
  return { data, error: null };
}

function err<T>(error: string): ApiResponse<T> {
  return { data: null as unknown as T, error };
}

// ---------------------------------------------------------------------------
// Property Service — routes through saas_mobile_server (generic proxy)
// ---------------------------------------------------------------------------

export const propertyService = {
  // List properties the current user has access to
  async getProperties(filters?: { search?: string; organizationId?: string; status?: string }): Promise<ApiResponse<Property[]>> {
    try {
      // Get user's property memberships via server
      const memRes = await serverApi.query<{ property_id: string }[]>({
        table: 'property_memberships',
        action: 'select',
        select: 'property_id',
        filters: [{ op: 'is', column: 'is_active', value: true }],
      });
      if (memRes.error) throw new Error(memRes.error.message);

      const propertyIds = (memRes.data ?? []).map((m) => m.property_id);
      if (propertyIds.length === 0) return ok([]);

      const queryFilters: any[] = [{ op: 'in', column: 'id', values: propertyIds }];
      if (filters?.organizationId) queryFilters.push({ op: 'eq', column: 'organization_id', value: filters.organizationId });
      if (filters?.status) queryFilters.push({ op: 'eq', column: 'status', value: filters.status });

      const res = await serverApi.query<any[]>({
        table: 'properties',
        action: 'select',
        select: 'id, organization_id, name, type, address, city, state, zip, phone, email, status, total_units, occupied_units, amenities, code, created_at, updated_at',
        filters: queryFilters,
        orders: [{ column: 'name', ascending: true }],
      });
      if (res.error) throw new Error(res.error.message);

      let rows = res.data ?? [];
      if (filters?.search) {
        const term = filters.search.toLowerCase();
        rows = rows.filter((r) => (r.name as string).toLowerCase().includes(term));
      }
      return ok(rows.map(mapProperty));
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to fetch properties');
    }
  },

  // Get a single property by ID
  async getProperty(id: string): Promise<ApiResponse<Property>> {
    try {
      const res = await serverApi.query<any>({
        table: 'properties',
        action: 'select',
        select: 'id, organization_id, name, type, address, city, state, zip, phone, email, status, total_units, occupied_units, amenities, code, created_at, updated_at',
        filters: [{ op: 'eq', column: 'id', value: id }],
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return ok(mapProperty(res.data as Record<string, unknown>));
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to fetch property');
    }
  },

  // Create a new property
  async createProperty(data: Partial<Property>): Promise<ApiResponse<Property>> {
    try {
      const payload: Record<string, unknown> = {};
      if (data.organizationId !== undefined) payload.organization_id = data.organizationId;
      if (data.name !== undefined) payload.name = data.name;
      if (data.type !== undefined) payload.type = data.type;
      if (data.address !== undefined) payload.address = data.address;
      if (data.city !== undefined) payload.city = data.city;
      if (data.state !== undefined) payload.state = data.state;
      if (data.zip !== undefined) payload.zip = data.zip;
      if (data.phone !== undefined) payload.phone = data.phone;
      if (data.email !== undefined) payload.email = data.email;
      if (data.status !== undefined) payload.status = data.status;
      if (data.totalUnits !== undefined) payload.total_units = data.totalUnits;
      if (data.occupiedUnits !== undefined) payload.occupied_units = data.occupiedUnits;
      if (data.amenities !== undefined) payload.amenities = data.amenities;
      if (data.code !== undefined) payload.code = data.code;

      const res = await serverApi.query<any>({
        table: 'properties',
        action: 'insert',
        values: payload,
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return ok(mapProperty(res.data as Record<string, unknown>));
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to create property');
    }
  },

  // Update an existing property
  async updateProperty(id: string, data: Partial<Property>): Promise<ApiResponse<Property>> {
    try {
      const payload: Record<string, unknown> = {};
      if (data.organizationId !== undefined) payload.organization_id = data.organizationId;
      if (data.name !== undefined) payload.name = data.name;
      if (data.type !== undefined) payload.type = data.type;
      if (data.address !== undefined) payload.address = data.address;
      if (data.city !== undefined) payload.city = data.city;
      if (data.state !== undefined) payload.state = data.state;
      if (data.zip !== undefined) payload.zip = data.zip;
      if (data.phone !== undefined) payload.phone = data.phone;
      if (data.email !== undefined) payload.email = data.email;
      if (data.status !== undefined) payload.status = data.status;
      if (data.totalUnits !== undefined) payload.total_units = data.totalUnits;
      if (data.occupiedUnits !== undefined) payload.occupied_units = data.occupiedUnits;
      if (data.amenities !== undefined) payload.amenities = data.amenities;
      if (data.code !== undefined) payload.code = data.code;

      const res = await serverApi.query<any>({
        table: 'properties',
        action: 'update',
        values: payload,
        filters: [{ op: 'eq', column: 'id', value: id }],
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return ok(mapProperty(res.data as Record<string, unknown>));
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to update property');
    }
  },

  // Delete a property
  async deleteProperty(id: string): Promise<ApiResponse<void>> {
    try {
      const res = await serverApi.query({
        table: 'properties',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: id }],
      });
      if (res.error) throw new Error(res.error.message);
      return ok(undefined as void);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to delete property');
    }
  },

  // Get enabled modules/features for a property from the parent organization
  async getPropertyFeatures(propertyId: string): Promise<ApiResponse<{ module: string; enabled: boolean }[]>> {
    try {
      const propRes = await serverApi.query<any>({
        table: 'properties',
        action: 'select',
        select: 'organization_id',
        filters: [{ op: 'eq', column: 'id', value: propertyId }],
        single: true,
      });
      if (propRes.error) throw new Error(propRes.error.message);

      const orgRes = await serverApi.query<any>({
        table: 'organizations',
        action: 'select',
        select: 'available_modules',
        filters: [{ op: 'eq', column: 'id', value: propRes.data?.organization_id }],
        single: true,
      });
      if (orgRes.error) throw new Error(orgRes.error.message);

      const modules: { module: string; enabled: boolean }[] = ((orgRes.data?.available_modules ?? []) as string[]).map((m: string) => ({ module: m, enabled: true }));
      return ok(modules);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to fetch property features');
    }
  },

  // Update enabled modules for a property (stored on the organization)
  async updatePropertyFeatures(propertyId: string, features: Record<string, boolean>): Promise<ApiResponse<void>> {
    try {
      const propRes = await serverApi.query<any>({
        table: 'properties',
        action: 'select',
        select: 'organization_id',
        filters: [{ op: 'eq', column: 'id', value: propertyId }],
        single: true,
      });
      if (propRes.error) throw new Error(propRes.error.message);

      const enabledModules = Object.entries(features).filter(([, enabled]) => enabled).map(([module]) => module);

      const res = await serverApi.query({
        table: 'organizations',
        action: 'update',
        values: { available_modules: enabledModules },
        filters: [{ op: 'eq', column: 'id', value: propRes.data?.organization_id }],
      });
      if (res.error) throw new Error(res.error.message);
      return ok(undefined as void);
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to update property features');
    }
  },

  // Join a property using its invite code
  async joinProperty(code: string): Promise<ApiResponse<{ property: Property; organization: Organization }>> {
    try {
      const propRes = await serverApi.query<any>({
        table: 'properties',
        action: 'select',
        select: 'id, organization_id, name, type, address, city, state, zip, phone, email, status, total_units, occupied_units, amenities, code, created_at, updated_at',
        filters: [{ op: 'eq', column: 'code', value: code }],
        single: true,
      });
      if (propRes.error || !propRes.data) throw new Error('Invalid or expired property code');

      const orgRes = await serverApi.query<any>({
        table: 'organizations',
        action: 'select',
        select: 'id, name, slug, logo_url, address, phone, email, created_at, updated_at',
        filters: [{ op: 'eq', column: 'id', value: propRes.data.organization_id }],
        single: true,
      });
      if (orgRes.error) throw new Error(orgRes.error.message);

      // Upsert membership via server
      const memRes = await serverApi.query({
        table: 'property_memberships',
        action: 'upsert',
        values: { property_id: propRes.data.id, role: 'member', is_active: true },
        mutationOptions: { onConflict: 'user_id,property_id' },
      });
      if (memRes.error) throw new Error(memRes.error.message);

      return ok({
        property: mapProperty(propRes.data as Record<string, unknown>),
        organization: {
          id: orgRes.data.id as string,
          name: orgRes.data.name as string,
          slug: orgRes.data.slug as string,
          logoUrl: orgRes.data.logo_url as string | undefined,
          address: orgRes.data.address as string | undefined,
          phone: orgRes.data.phone as string | undefined,
          email: orgRes.data.email as string | undefined,
          settings: { timezone: 'UTC', currency: 'USD', dateFormat: 'YYYY-MM-DD', features: [] } as import('@/types').OrganizationSettings,
          createdAt: orgRes.data.created_at as string,
          updatedAt: orgRes.data.updated_at as string,
        },
      } as { property: Property; organization: Organization });
    } catch (e: unknown) {
      return err(e instanceof Error ? e.message : 'Failed to join property');
    }
  },
};
