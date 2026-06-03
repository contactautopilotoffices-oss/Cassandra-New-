import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MaintenanceVendor {
  id: string;
  company_name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  specialization?: string[];
  is_active?: boolean;
}

export interface PPMSchedule {
  id: string;
  organization_id?: string | null;
  property_id?: string | null;
  si_no?: string;
  system_name: string;
  detail_name?: string;
  scope_of_work?: string;
  frequency: string;
  location?: string;
  maker?: string;
  checker?: string;
  vendor_name?: string;
  vendor_phone?: string;
  vendor_contact_person?: string;
  vendor_id?: string;
  planned_date: string;
  done_date?: string;
  remark?: string;
  status: 'pending' | 'done' | 'postponed' | 'skipped';
  completion_photos?: string[] | null;
  completion_doc_url?: string | null;
  invoice_url?: string | null;
  verification_status?: 'pending' | 'submitted' | 'verified' | 'rejected';
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  attachments?: {
    photos?: string[];
    certificate?: string;
    invoice?: string;
    completed_by?: string;
    completed_by_name?: string;
    completed_at?: string;
  } | null;
  completed_by?: string | null;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
  maintenance_vendors?: MaintenanceVendor | null;
}

export interface AMCContract {
  id: string;
  organization_id: string;
  property_id: string | null;
  system_name: string;
  vendor_name: string;
  vendor_contact: string | null;
  contract_start_date: string;
  contract_end_date: string;
  contract_value: number | null;
  payment_terms: string | null;
  scope_of_work: string | null;
  notes: string | null;
  status: 'active' | 'expired' | 'expiring_soon' | 'renewed';
  created_at: string;
}

export interface PPMStats {
  total: number;
  done: number;
  pending: number;
  postponed: number;
  skipped: number;
  overdue: number;
}

export interface PPMUpdatePayload {
  id: string;
  status: 'pending' | 'done' | 'postponed' | 'skipped';
  done_date?: string;
  remark?: string;
  verification_status?: string;
  vendor_id?: string | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_contact_person?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeDate(value?: string | null): string {
  if (!value) return '';
  const raw = String(value).trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
  return '';
}

function normalizeFrequency(value?: string | null): string {
  const normalized = (value ?? '').toLowerCase().trim();
  if (normalized === 'annual') return 'yearly';
  if (['yearly', 'quarterly', 'monthly', 'weekly'].includes(normalized)) return normalized;
  return 'monthly';
}

function normalizeStatus(value?: string | null): PPMSchedule['status'] {
  const normalized = (value ?? '').toLowerCase().trim();
  if (normalized === 'completed') return 'done';
  if (['pending', 'done', 'postponed', 'skipped'].includes(normalized)) return normalized as PPMSchedule['status'];
  return 'pending';
}

function normalizeSchedule(row: any): PPMSchedule {
  return {
    ...row,
    organization_id: row.organization_id ?? null,
    property_id: row.property_id ?? null,
    system_name: row.system_name ?? row.asset_name ?? row.detail_name ?? 'PPM Task',
    detail_name: row.detail_name ?? row.description ?? null,
    scope_of_work: row.scope_of_work ?? row.description ?? null,
    frequency: normalizeFrequency(row.frequency ?? row.schedule_type),
    planned_date: normalizeDate(row.planned_date ?? row.next_due),
    done_date: normalizeDate(row.done_date ?? row.last_completed) || undefined,
    status: normalizeStatus(row.status),
  };
}

function daysUntil(dateStr: string): number {
  const normalized = normalizeDate(dateStr);
  if (!normalized) return 999;
  const target = new Date(normalized + 'T12:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - now.getTime()) / 86400000);
}

function computeAMCStatus(endDate: string): AMCContract['status'] {
  const days = daysUntil(endDate);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring_soon';
  return 'active';
}

// ---------------------------------------------------------------------------
// PPM Service — routes through saas_mobile_server
// ---------------------------------------------------------------------------

export const ppmService = {
  // ── Fetch Schedules ───────────────────────────────────────────────────────
  async fetchSchedules(propertyId: string, organizationId?: string | null): Promise<ApiResponse<PPMSchedule[]>> {
    try {
      if (__DEV__) console.log('[PPM] fetchSchedules start, propertyId:', propertyId, 'orgId:', organizationId);

      const queryFilters: any[] = [{ op: 'eq', column: 'property_id', value: propertyId }];
      if (organizationId) queryFilters.push({ op: 'eq', column: 'organization_id', value: organizationId });

      const { data, error } = await serverApi.query({
        table: 'ppm_schedules',
        action: 'select',
        select: '*, maintenance_vendors(id, company_name, contact_person, phone)',
        filters: queryFilters,
        orders: [{ column: 'planned_date', ascending: true }],
      });

      if (__DEV__) console.log('[PPM] fetchSchedules result:', (data as any[])?.length, 'rows, error:', error?.message);
      if (error) throw new Error(error.message ?? 'Failed to fetch PPM');

      const schedules = ((data as any[]) ?? []).map(normalizeSchedule).filter((s: PPMSchedule) => s.planned_date);
      if (__DEV__) console.log('[PPM] fetchSchedules parsed:', schedules.length, 'schedules');

      return { success: true, data: schedules, status: 200 };
    } catch (err: any) {
      console.error('[PPM] fetchSchedules error:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Fetch AMC Contracts ───────────────────────────────────────────────────
  async fetchContracts(propertyId: string): Promise<ApiResponse<AMCContract[]>> {
    try {
      const { data, error } = await serverApi.query({
        table: 'amc_contracts',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        orders: [{ column: 'contract_end_date', ascending: true }],
      });
      if (error) throw new Error(error.message || 'Unknown error');
      const contracts = ((data as any[]) ?? []).map((c: any) => ({ ...c, status: computeAMCStatus(c.contract_end_date) }));
      return { success: true, data: contracts, status: 200 };
    } catch (err: any) {
      console.error('ppmService.fetchContracts:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Fetch Stats ───────────────────────────────────────────────────────────
  async fetchStats(propertyId: string): Promise<ApiResponse<PPMStats>> {
    try {
      if (__DEV__) console.log('[PPM] fetchStats start, propertyId:', propertyId);
      const today = new Date().toISOString().split('T')[0];

      const [total, done, pending, postponed, skipped, overdue] = await Promise.all([
        serverApi.query({
          table: 'ppm_schedules',
          action: 'select',
          select: 'id',
          selectOptions: { count: 'exact', head: true },
          filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
        }),
        serverApi.query({
          table: 'ppm_schedules',
          action: 'select',
          select: 'id',
          selectOptions: { count: 'exact', head: true },
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'status', value: 'done' },
          ],
        }),
        serverApi.query({
          table: 'ppm_schedules',
          action: 'select',
          select: 'id',
          selectOptions: { count: 'exact', head: true },
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'status', value: 'pending' },
          ],
        }),
        serverApi.query({
          table: 'ppm_schedules',
          action: 'select',
          select: 'id',
          selectOptions: { count: 'exact', head: true },
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'status', value: 'postponed' },
          ],
        }),
        serverApi.query({
          table: 'ppm_schedules',
          action: 'select',
          select: 'id',
          selectOptions: { count: 'exact', head: true },
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'status', value: 'skipped' },
          ],
        }),
        serverApi.query({
          table: 'ppm_schedules',
          action: 'select',
          select: 'id',
          selectOptions: { count: 'exact', head: true },
          filters: [
            { op: 'eq', column: 'property_id', value: propertyId },
            { op: 'eq', column: 'status', value: 'pending' },
            { op: 'lt', column: 'planned_date', value: today },
          ],
        }),
      ]);

      const firstError = [total, done, pending, postponed, skipped, overdue].find(r => r.error);
      if (firstError?.error) throw new Error(firstError.error.message || 'Unknown error');

      const stats: PPMStats = {
        total: total.count ?? 0,
        done: done.count ?? 0,
        pending: pending.count ?? 0,
        postponed: postponed.count ?? 0,
        skipped: skipped.count ?? 0,
        overdue: overdue.count ?? 0,
      };
      if (__DEV__) console.log('[PPM] fetchStats result:', stats);
      return { success: true, data: stats, status: 200 };
    } catch (err: any) {
      console.error('[PPM] fetchStats error:', err);
      return { success: false, data: { total: 0, done: 0, pending: 0, postponed: 0, skipped: 0, overdue: 0 }, error: err.message, status: 500 };
    }
  },

  // ── Lookup Asset (for scanner) ────────────────────────────────────────────
  async lookupAsset(propertyId: string, searchTerm: string): Promise<ApiResponse<PPMSchedule[]>> {
    try {
      const q = `%${searchTerm}%`;
      const { data, error } = await serverApi.query({
        table: 'ppm_schedules',
        action: 'select',
        select: '*',
        filters: [
          { op: 'eq', column: 'property_id', value: propertyId },
          { op: 'or', expression: `system_name.ilike.${q},detail_name.ilike.${q}` },
        ],
      });
      if (error) throw new Error(error.message || 'Unknown error');
      return { success: true, data: ((data as any[]) ?? []).map(normalizeSchedule), status: 200 };
    } catch (err: any) {
      console.error('ppmService.lookupAsset:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },

  // ── Update Schedule Status ────────────────────────────────────────────────
  async updateSchedule(payload: PPMUpdatePayload): Promise<ApiResponse<PPMSchedule>> {
    try {
      const body: any = {};
      if (payload.status !== undefined) body.status = payload.status;
      if (payload.done_date !== undefined) body.done_date = payload.done_date || null;
      if (payload.remark !== undefined) body.remark = payload.remark || null;
      if (payload.verification_status !== undefined) body.verification_status = payload.verification_status;
      if (payload.vendor_id !== undefined) body.vendor_id = payload.vendor_id;
      if (payload.vendor_name !== undefined) body.vendor_name = payload.vendor_name;
      if (payload.vendor_phone !== undefined) body.vendor_phone = payload.vendor_phone;
      if (payload.vendor_contact_person !== undefined) body.vendor_contact_person = payload.vendor_contact_person;

      const { data, error } = await serverApi.query({
        table: 'ppm_schedules',
        action: 'update',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: payload.id }],
        values: body,
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Update failed');
      return { success: true, data: normalizeSchedule(data), status: 200 };
    } catch (err: any) {
      console.error('[PPM] updateSchedule error:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Create Schedule ───────────────────────────────────────────────────────
  async createSchedule(payload: {
    organization_id?: string | null;
    property_id?: string | null;
    system_name: string;
    detail_name?: string | null;
    scope_of_work?: string | null;
    frequency?: string;
    location?: string | null;
    vendor_name?: string | null;
    vendor_phone?: string | null;
    vendor_contact_person?: string | null;
    planned_date: string;
    status?: string;
    remark?: string | null;
  }): Promise<ApiResponse<PPMSchedule>> {
    try {
      const { data, error } = await serverApi.query({
        table: 'ppm_schedules',
        action: 'insert',
        select: '*',
        values: {
          organization_id: payload.organization_id,
          property_id: payload.property_id,
          system_name: payload.system_name?.trim(),
          detail_name: payload.detail_name?.trim() || null,
          scope_of_work: payload.scope_of_work?.trim() || null,
          frequency: payload.frequency || 'monthly',
          location: payload.location?.trim() || null,
          vendor_name: payload.vendor_name?.trim() || null,
          vendor_phone: payload.vendor_phone?.trim() || null,
          vendor_contact_person: payload.vendor_contact_person?.trim() || null,
          planned_date: payload.planned_date,
          status: payload.status || 'pending',
          remark: payload.remark || null,
        },
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Create failed');
      return { success: true, data: normalizeSchedule(data), status: 201 };
    } catch (err: any) {
      console.error('ppmService.createSchedule:', err);
      return { success: false, data: null as any, error: err.message, status: 500 };
    }
  },

  // ── Upload Attachment ─────────────────────────────────────────────────────
  async uploadAttachment(_propertyId: string, scheduleId: string, uri: string, type: 'photo' | 'certificate' | 'invoice'): Promise<ApiResponse<string>> {
    try {
      const attachType = type === 'certificate' ? 'doc' : type;
      const ext = uri.split('.').pop() || 'jpg';
      const mimeType = ext === 'webp' ? 'image/webp' : 'image/jpeg';
      const filename = `${scheduleId}/${attachType}_${Date.now()}.${ext}`;

      // Fetch the file as an ArrayBuffer for storage upload
      const response = await fetch(uri);
      const arrayBuffer = await response.arrayBuffer();

      const { data: uploadData, error: uploadError } = await serverApi.upload('ppm-attachments', filename, arrayBuffer, mimeType);

      if (uploadError) throw new Error(uploadError.message ?? 'Upload failed');

      const { data: urlData } = await serverApi.getPublicUrl('ppm-attachments', uploadData?.path ?? filename);
      const publicUrl = urlData?.publicUrl ?? '';

      // Update the schedule row with the new URL
      const columnMap: Record<string, string> = { photo: 'completion_photos', doc: 'completion_doc_url', invoice: 'invoice_url' };
      const column = columnMap[attachType];

      if (column === 'completion_photos') {
        // Append to the photos array
        const { data: existing } = await serverApi.query<{ completion_photos: string[] | null }>({
          table: 'ppm_schedules',
          action: 'select',
          select: 'completion_photos',
          filters: [{ op: 'eq', column: 'id', value: scheduleId }],
          single: true,
        });
        const photos = [...(existing?.completion_photos ?? []), publicUrl];
        await serverApi.query({
          table: 'ppm_schedules',
          action: 'update',
          values: { completion_photos: photos },
          filters: [{ op: 'eq', column: 'id', value: scheduleId }],
        });
      } else {
        await serverApi.query({
          table: 'ppm_schedules',
          action: 'update',
          values: { [column]: publicUrl },
          filters: [{ op: 'eq', column: 'id', value: scheduleId }],
        });
      }

      return { success: true, data: publicUrl, status: 200 };
    } catch (err: any) {
      console.error('[PPM] uploadAttachment error:', err);
      return { success: false, data: '', error: err.message, status: 500 };
    }
  },

  // ── Delete Attachment ─────────────────────────────────────────────────────
  async deleteAttachment(scheduleId: string, url: string, type: 'photo' | 'certificate' | 'invoice'): Promise<ApiResponse<boolean>> {
    try {
      const attachType = type === 'certificate' ? 'doc' : type;
      const columnMap: Record<string, string> = { photo: 'completion_photos', doc: 'completion_doc_url', invoice: 'invoice_url' };
      const column = columnMap[attachType];

      if (column === 'completion_photos') {
        const { data: existing } = await serverApi.query<{ completion_photos: string[] | null }>({
          table: 'ppm_schedules',
          action: 'select',
          select: 'completion_photos',
          filters: [{ op: 'eq', column: 'id', value: scheduleId }],
          single: true,
        });
        const photos = (existing?.completion_photos ?? []).filter((p: string) => p !== url);
        const { error } = await serverApi.query({
          table: 'ppm_schedules',
          action: 'update',
          values: { completion_photos: photos },
          filters: [{ op: 'eq', column: 'id', value: scheduleId }],
        });
        if (error) throw new Error(error.message ?? 'Delete failed');
      } else {
        const { error } = await serverApi.query({
          table: 'ppm_schedules',
          action: 'update',
          values: { [column]: null },
          filters: [{ op: 'eq', column: 'id', value: scheduleId }],
        });
        if (error) throw new Error(error.message ?? 'Delete failed');
      }

      return { success: true, data: true, status: 200 };
    } catch (err: any) {
      console.error('[PPM] deleteAttachment error:', err);
      return { success: false, data: false, error: err.message, status: 500 };
    }
  },

  // ── Fetch Maintenance Vendors ─────────────────────────────────────────────
  async fetchVendors(_propertyId: string): Promise<ApiResponse<MaintenanceVendor[]>> {
    try {
      const { data, error } = await serverApi.query({
        table: 'maintenance_vendors',
        action: 'select',
        select: 'id, company_name, contact_person, phone, email, specialization, is_active',
        filters: [{ op: 'eq', column: 'is_active', value: true }],
      });
      if (error) throw new Error(error.message || 'Unknown error');
      return { success: true, data: (data as MaintenanceVendor[]) ?? [], status: 200 };
    } catch (err: any) {
      console.error('ppmService.fetchVendors:', err);
      return { success: false, data: [], error: err.message, status: 500 };
    }
  },
};
