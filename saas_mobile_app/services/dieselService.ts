import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one schema)
// ---------------------------------------------------------------------------

export interface Generator {
  id: string;
  property_id: string;
  name: string;
  make?: string | null;
  capacity_kva?: number | null;
  tank_capacity_litres?: number | null;
  status: string;
  initial_run_hours?: number | null;
  initial_kwh_reading?: number | null;
  initial_diesel_level?: number | null;
  effective_from_date?: string | null;
  created_at?: string;
}

export interface DieselReading {
  id: string;
  property_id: string;
  generator_id: string;
  reading_date: string;
  opening_hours: number;
  closing_hours: number;
  opening_kwh?: number | null;
  closing_kwh?: number | null;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  computed_consumed_litres?: number | null;
  computed_run_hours?: number | null;
  computed_cost?: number | null;
  tariff_id?: string | null;
  tariff_rate_used?: number | null;
  notes?: string | null;
  alert_status?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface DGTariff {
  id: string;
  generator_id: string;
  cost_per_litre: number;
  effective_from: string;
  effective_to?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface ReadingPayload {
  property_id: string;
  generator_id: string;
  reading_date: string;
  opening_hours: number;
  closing_hours: number;
  opening_kwh?: number;
  closing_kwh?: number;
  opening_diesel_level: number;
  closing_diesel_level: number;
  diesel_added_litres: number;
  notes?: string | null;
}

// ---------------------------------------------------------------------------
// Diesel Service — routes through saas_mobile_server
// ---------------------------------------------------------------------------

export const dieselService = {
  // ── Fetch all diesel data (generators + readings) ─────────────────────────
  async fetchAll(propertyId: string): Promise<ApiResponse<{ generators: Generator[]; readings: DieselReading[] }>> {
    try {
      const [genRes, readRes] = await Promise.all([
        serverApi.query<Generator[]>({
          table: 'generators',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        }),
        serverApi.query<DieselReading[]>({
          table: 'diesel_readings',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
          orders: [{ column: 'reading_date', ascending: false }],
        }),
      ]);
      if (genRes.error) throw new Error(genRes.error.message);
      if (readRes.error) throw new Error(readRes.error.message);
      return { success: true, data: { generators: genRes.data ?? [], readings: readRes.data ?? [] }, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Fetch Generators ──────────────────────────────────────────────────────
  async fetchGenerators(propertyId: string): Promise<ApiResponse<Generator[]>> {
    try {
      const res = await serverApi.query<Generator[]>({
        table: 'generators',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      });
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Generator ──────────────────────────────────────────────────────
  async createGenerator(payload: Partial<Generator>): Promise<ApiResponse<Generator>> {
    try {
      const res = await serverApi.query<Generator>({
        table: 'generators',
        action: 'insert',
        values: payload,
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data as any, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Update Generator ──────────────────────────────────────────────────────
  async updateGenerator(generatorId: string, payload: Partial<Generator>): Promise<ApiResponse<Generator>> {
    try {
      const res = await serverApi.query<Generator>({
        table: 'generators',
        action: 'update',
        values: payload,
        filters: [{ op: 'eq', column: 'id', value: generatorId }],
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: res.data as any, status: 200 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Generator ──────────────────────────────────────────────────────
  async deleteGenerator(generatorId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.query({
        table: 'generators',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: generatorId }],
      });
      if (res.error) throw new Error(res.error.message || 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Readings ────────────────────────────────────────────────────────
  async fetchReadings(propertyId: string, filters?: { generatorId?: string; fromDate?: string; toDate?: string }): Promise<ApiResponse<DieselReading[]>> {
    try {
      const queryFilters: any[] = [{ op: 'eq', column: 'property_id', value: propertyId }];
      if (filters?.generatorId) queryFilters.push({ op: 'eq', column: 'generator_id', value: filters.generatorId });
      if (filters?.fromDate) queryFilters.push({ op: 'gte', column: 'reading_date', value: filters.fromDate });
      if (filters?.toDate) queryFilters.push({ op: 'lte', column: 'reading_date', value: filters.toDate });

      const { data, error } = await serverApi.query<DieselReading[]>({
        table: 'diesel_readings',
        action: 'select',
        select: '*',
        filters: queryFilters,
        orders: [{ column: 'reading_date', ascending: false }],
      });
      if (error) throw new Error(error.message || 'Unknown error');
      return { success: true, data: data || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Submit Reading ────────────────────────────────────────────────────────
  async submitReading(payload: ReadingPayload): Promise<ApiResponse<DieselReading>> {
    try {
      const computed_run_hours = payload.closing_hours - payload.opening_hours;
      const computed_consumed_litres = payload.opening_diesel_level + payload.diesel_added_litres - payload.closing_diesel_level;

      const res = await serverApi.query<DieselReading>({
        table: 'diesel_readings',
        action: 'insert',
        values: {
          property_id: payload.property_id,
          generator_id: payload.generator_id,
          reading_date: payload.reading_date,
          opening_hours: payload.opening_hours,
          closing_hours: payload.closing_hours,
          opening_kwh: payload.opening_kwh ?? null,
          closing_kwh: payload.closing_kwh ?? null,
          opening_diesel_level: payload.opening_diesel_level,
          closing_diesel_level: payload.closing_diesel_level,
          diesel_added_litres: payload.diesel_added_litres,
          computed_run_hours,
          computed_consumed_litres,
          notes: payload.notes ?? null,
        },
        select: '*',
        single: true,
      });
      if (res.error) throw new Error(res.error.message ?? 'Unknown error');
      return { success: true, data: res.data as any, status: 201 };
    } catch (err: any) {
      console.error('dieselService.submitReading:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Reading ────────────────────────────────────────────────────────
  async deleteReading(readingId: string, propertyId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.query({
        table: 'diesel_readings',
        action: 'delete',
        filters: [
          { op: 'eq', column: 'id', value: readingId },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
      });
      if (res.error) throw new Error(res.error.message ?? 'Unknown error');
      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Tariffs ─────────────────────────────────────────────────────────
  async fetchTariffs(generatorId: string): Promise<ApiResponse<DGTariff[]>> {
    try {
      const res = await serverApi.query<DGTariff[]>({
        table: 'dg_tariffs',
        action: 'select',
        filters: [{ op: 'eq', column: 'generator_id', value: generatorId }],
        orders: [{ column: 'effective_from', ascending: false }],
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data || [], status: 200 };
    } catch (err: any) {
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Create Tariff (closes previous active) ────────────────────────────────
  async createTariff(payload: Partial<DGTariff>): Promise<ApiResponse<DGTariff>> {
    try {
      if (payload.generator_id && payload.effective_from) {
        const prevDate = new Date(payload.effective_from);
        prevDate.setDate(prevDate.getDate() - 1);
        await serverApi.query({
          table: 'dg_tariffs',
          action: 'update',
          values: { effective_to: prevDate.toISOString().split('T')[0] },
          filters: [
            { op: 'eq', column: 'generator_id', value: payload.generator_id },
            { op: 'is', column: 'effective_to', value: null },
          ],
        });
      }

      const res = await serverApi.query<DGTariff>({
        table: 'dg_tariffs',
        action: 'insert',
        values: payload,
        single: true,
      });
      if (res.error) throw new Error(res.error.message);
      return { success: true, data: res.data as any, status: 201 };
    } catch (err: any) {
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Delete Tariff ─────────────────────────────────────────────────────────
  async deleteTariff(tariffId: string, generatorId: string): Promise<ApiResponse<boolean>> {
    try {
      const res = await serverApi.query({
        table: 'dg_tariffs',
        action: 'delete',
        filters: [{ op: 'eq', column: 'id', value: tariffId }],
      });
      if (res.error) throw new Error(res.error.message);

      // Reopen previous tariff
      const prev = await serverApi.query<DGTariff>({
        table: 'dg_tariffs',
        action: 'select',
        filters: [{ op: 'eq', column: 'generator_id', value: generatorId }],
        orders: [{ column: 'effective_from', ascending: false }],
        limit: 1,
        single: true,
      });
      if (prev.data?.id) {
        await serverApi.query({
          table: 'dg_tariffs',
          action: 'update',
          values: { effective_to: null },
          filters: [{ op: 'eq', column: 'id', value: prev.data.id }],
        });
      }

      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },
};
