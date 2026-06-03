import { serverApi } from '@/lib/serverApi';

// ---------------------------------------------------------------------------
// Types (aligned with saas_one schema)
// ---------------------------------------------------------------------------

export interface ElectricityMeter {
  id: string;
  property_id: string;
  name: string;
  meter_number?: string | null;
  meter_type: 'main' | 'generator' | 'solar' | 'sub';
  max_load_kw?: number | null;
  status?: string | null;
  last_reading?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface ElectricityReading {
  id: string;
  property_id: string;
  meter_id: string;
  reading_date: string;
  opening_reading: number;
  closing_reading: number;
  computed_units?: number | null;
  final_units?: number | null;
  computed_cost?: number | null;
  multiplier_id?: string | null;
  multiplier_value_used?: number | null;
  tariff_id?: string | null;
  tariff_rate_used?: number | null;
  peak_load_kw?: number | null;
  notes?: string | null;
  alert_status?: string | null;
  photo_url?: string | null;
  ocr_reading?: number | null;
  ocr_confidence?: number | null;
  ocr_status?: string | null;
  created_by?: string | null;
  created_at?: string;
  meter?: ElectricityMeter;
}

export interface GridTariff {
  id: string;
  property_id: string;
  utility_provider?: string | null;
  rate_per_unit: number;
  unit_type?: string | null;
  effective_from: string;
  effective_to?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface MeterMultiplier {
  id: string;
  meter_id: string;
  ct_ratio_primary?: number | null;
  ct_ratio_secondary?: number | null;
  pt_ratio_primary?: number | null;
  pt_ratio_secondary?: number | null;
  meter_constant?: number | null;
  multiplier_value?: number | null;
  effective_from: string;
  effective_to?: string | null;
  reason?: string | null;
  created_by?: string | null;
  created_at?: string;
}

export interface ReadingPayload {
  meter_id: string;
  reading_date: string;
  opening_reading: number;
  closing_reading: number;
  notes?: string | null;
  photo_url?: string | null;
  created_by?: string | null;
}

// ---------------------------------------------------------------------------
// Electricity Service — all operations go through the mobile server API client
// ---------------------------------------------------------------------------

export const electricityService = {
  // ── Fetch Meters ──────────────────────────────────────────────────────────
  async fetchMeters(propertyId: string) {
    const res = await serverApi.query<ElectricityMeter[]>({
      table: 'electricity_meters',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
    });
    return { success: !res.error, data: res.data || [], error: res.error };
  },

  // ── Create Meter ──────────────────────────────────────────────────────────
  async createMeter(payload: Partial<ElectricityMeter> & { initial_multiplier?: Partial<MeterMultiplier> }) {
    const { initial_multiplier, ...meterPayload } = payload;
    const res = await serverApi.query<ElectricityMeter>({
      table: 'electricity_meters',
      action: 'insert',
      values: meterPayload,
      select: '*',
      single: true,
    });
    if (!res.error && res.data && initial_multiplier) {
      await serverApi.query({
        table: 'meter_multipliers',
        action: 'insert',
        values: { ...initial_multiplier, meter_id: res.data.id },
      });
    }
    return { success: !res.error, data: res.data ?? null, error: res.error };
  },

  // ── Delete Meter ──────────────────────────────────────────────────────────
  async deleteMeter(meterId: string) {
    const res = await serverApi.query({
      table: 'electricity_meters',
      action: 'delete',
      filters: [{ op: 'eq', column: 'id', value: meterId }],
    });
    return { success: !res.error, data: null, error: res.error };
  },

  // ── Fetch Readings ────────────────────────────────────────────────────────
  async fetchReadings(propertyId: string, filters?: { meterId?: string; fromDate?: string; toDate?: string }) {
    const queryFilters: any[] = [{ op: 'eq', column: 'property_id', value: propertyId }];
    if (filters?.meterId) queryFilters.push({ op: 'eq', column: 'meter_id', value: filters.meterId });
    if (filters?.fromDate) queryFilters.push({ op: 'gte', column: 'reading_date', value: filters.fromDate });
    if (filters?.toDate) queryFilters.push({ op: 'lte', column: 'reading_date', value: filters.toDate });

    const res = await serverApi.query<ElectricityReading[]>({
      table: 'electricity_readings',
      action: 'select',
      select: '*, meter:electricity_meters(id, name, meter_type)',
      filters: queryFilters,
      orders: [{ column: 'reading_date', ascending: false }],
    });
    return { success: !res.error, data: res.data || [], error: res.error };
  },

  // ── Submit Reading ────────────────────────────────────────────────────────
  async submitReading(propertyId: string, payload: ReadingPayload) {
    const computed_units = payload.closing_reading - payload.opening_reading;
    const res = await serverApi.query<ElectricityReading>({
      table: 'electricity_readings',
      action: 'insert',
      values: {
        property_id: propertyId,
        meter_id: payload.meter_id,
        reading_date: payload.reading_date,
        opening_reading: payload.opening_reading,
        closing_reading: payload.closing_reading,
        computed_units,
        final_units: computed_units,
        notes: payload.notes ?? null,
        photo_url: payload.photo_url ?? null,
        created_by: payload.created_by ?? null,
      },
      select: '*',
      single: true,
    });
    return { success: !res.error, data: res.data ?? null, error: res.error };
  },

  // ── Delete Reading ────────────────────────────────────────────────────────
  async deleteReading(readingId: string, _meterId: string, propertyId: string) {
    const res = await serverApi.query({
      table: 'electricity_readings',
      action: 'delete',
      filters: [
        { op: 'eq', column: 'id', value: readingId },
        { op: 'eq', column: 'property_id', value: propertyId },
      ],
    });
    return { success: !res.error, data: null, error: res.error };
  },

  // ── Fetch Grid Tariffs ────────────────────────────────────────────────────
  async fetchTariffs(propertyId: string) {
    const res = await serverApi.query<GridTariff[]>({
      table: 'grid_tariffs',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      orders: [{ column: 'effective_from', ascending: false }],
    });
    return { success: !res.error, data: res.data ?? [], error: res.error };
  },

  // ── Create Tariff (closes previous active) ────────────────────────────────
  async createTariff(payload: Partial<GridTariff>) {
    if (payload.property_id && payload.effective_from) {
      const prevDate = new Date(payload.effective_from);
      prevDate.setDate(prevDate.getDate() - 1);
      await serverApi.query({
        table: 'grid_tariffs',
        action: 'update',
        values: { effective_to: prevDate.toISOString().split('T')[0] },
        filters: [
          { op: 'eq', column: 'property_id', value: payload.property_id },
          { op: 'is', column: 'effective_to', value: null },
        ],
      });
    }
    const res = await serverApi.query<GridTariff>({
      table: 'grid_tariffs',
      action: 'insert',
      values: payload,
      select: '*',
      single: true,
    });
    return { success: !res.error, data: res.data ?? null, error: res.error };
  },

  // ── Delete Tariff ─────────────────────────────────────────────────────────
  async deleteTariff(tariffId: string, propertyId: string) {
    const { error: delError } = await serverApi.query({
      table: 'grid_tariffs',
      action: 'delete',
      filters: [{ op: 'eq', column: 'id', value: tariffId }],
    });
    if (delError) return { success: false, data: null, error: delError };

    // Re‑open the most recent previous tariff
    const { data: prev } = await serverApi.query<GridTariff>({
      table: 'grid_tariffs',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      orders: [{ column: 'effective_from', ascending: false }],
      limit: 1,
      maybeSingle: true,
    });
    if (prev?.id) {
      await serverApi.query({
        table: 'grid_tariffs',
        action: 'update',
        values: { effective_to: null },
        filters: [{ op: 'eq', column: 'id', value: prev.id }],
      });
    }
    return { success: true, data: null, error: null };
  },

  // ── Fetch Meter Multipliers ───────────────────────────────────────────────
  async fetchMultipliers(meterId: string) {
    const res = await serverApi.query<MeterMultiplier[]>({
      table: 'meter_multipliers',
      action: 'select',
      select: '*',
      filters: [{ op: 'eq', column: 'meter_id', value: meterId }],
      orders: [{ column: 'effective_from', ascending: false }],
    });
    return { success: !res.error, data: res.data ?? [], error: res.error };
  },

  // ── Create Multiplier (closes previous active) ────────────────────────────
  async createMultiplier(payload: Partial<MeterMultiplier>) {
    if (payload.meter_id && payload.effective_from) {
      const prevDate = new Date(payload.effective_from);
      prevDate.setDate(prevDate.getDate() - 1);
      await serverApi.query({
        table: 'meter_multipliers',
        action: 'update',
        values: { effective_to: prevDate.toISOString().split('T')[0] },
        filters: [
          { op: 'eq', column: 'meter_id', value: payload.meter_id },
          { op: 'is', column: 'effective_to', value: null },
        ],
      });
    }
    const res = await serverApi.query<MeterMultiplier>({
      table: 'meter_multipliers',
      action: 'insert',
      values: payload,
      select: '*',
      single: true,
    });
    return { success: !res.error, data: res.data ?? null, error: res.error };
  },
};
