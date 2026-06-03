import { serverApi } from '@/lib/serverApi';
import { ApiResponse } from '@/types';
import { getCurrentUserId } from '@/utils/api/mobileApi';
import type { SOP, SOPStep, SOPChecklistRun, StepResult } from '@/types';

// ---------------------------------------------------------------------------
// Row → domain mapper helpers
// ---------------------------------------------------------------------------

function rowToSOP(row: Record<string, unknown>, steps: SOPStep[] = []): SOP {
  return {
    id: row.id as string,
    propertyId: row.property_id as string,
    organizationId: row.organization_id as string,
    title: row.title as string,
    description: row.description as string | undefined,
    category: row.category as string,
    frequency: row.frequency as SOP['frequency'],
    assignedRoles: (row.assigned_to ?? []) as string[],
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
    steps,
  };
}

function rowToRun(row: Record<string, unknown>): SOPChecklistRun {
  return {
    id: row.id as string,
    sopId: row.template_id as string,
    propertyId: row.property_id as string,
    startedBy: undefined as any,
    startedAt: undefined as any,
    completedAt: row.completed_at as string | undefined,
    status: row.status as SOPChecklistRun['status'],
    createdAt: row.created_at as string | undefined,
  };
}

export const sopService = {
  // ---------------------------------------------------------------------------
  // SOP Templates
  // ---------------------------------------------------------------------------

  async getSOPs(filters?: { propertyId?: string; search?: string; category?: string }): Promise<ApiResponse<SOP[]>> {
    try {
      const queryFilters: any[] = [];
      if (filters?.propertyId) queryFilters.push({ op: 'eq', column: 'property_id', value: filters.propertyId });
      if (filters?.category) queryFilters.push({ op: 'eq', column: 'category', value: filters.category });
      if (filters?.search) queryFilters.push({ op: 'ilike', column: 'title', value: `%${filters.search}%` });

      const { data, error } = await serverApi.query({
        table: 'sop_templates',
        action: 'select',
        select: '*',
        orders: [{ column: 'created_at', ascending: false }],
        filters: queryFilters,
      });
      if (error) throw new Error(error.message);

      const sops: SOP[] = ((data as any[]) ?? []).map((row: any) => rowToSOP(row));
      return { data: sops, error: null };
    } catch (err) {
      console.error('sopService.getSOPs error:', err);
      return { data: [], error: err as Error | string | null };
    }
  },

  async getSOP(id: string): Promise<ApiResponse<SOP>> {
    try {
      const [{ data: template, error: tErr }, { data: stepsRaw, error: sErr }] = await Promise.all([
        serverApi.query({
          table: 'sop_templates',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'id', value: id }],
          single: true,
        }),
        serverApi.query({
          table: 'sop_checklist_items',
          action: 'select',
          select: '*',
          filters: [{ op: 'eq', column: 'template_id', value: id }],
          orders: [{ column: 'order_index', ascending: true }],
        }),
      ]);

      if (tErr) throw new Error(tErr.message);
      if (sErr) throw new Error(sErr.message);

      const steps: SOPStep[] = ((stepsRaw as any[]) ?? []).map((row: any) => ({
        id: row.id as string,
        sopId: row.template_id as string,
        order: row.order_index as number,
        title: row.title as string,
        description: row.description as string | undefined,
        requiresPhoto: row.requires_photo as boolean,
        requiresSignature: false,
        requiresNote: false,
        section: undefined,
      }));

      return { data: rowToSOP(template as Record<string, unknown>, steps), error: null };
    } catch (err) {
      console.error('sopService.getSOP error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  async createSOP(data: Partial<SOP>): Promise<ApiResponse<SOP>> {
    try {
      const userId = await getCurrentUserId();

      const insertPayload: Record<string, any> = {
        property_id: data.propertyId,
        organization_id: data.organizationId,
        title: data.title,
        description: data.description ?? null,
        category: data.category,
        frequency: data.frequency,
        assigned_to: data.assignedRoles ?? [],
        is_active: data.isActive ?? true,
        created_by: userId ?? null,
      };

      const { data: row, error } = await serverApi.query({
        table: 'sop_templates',
        action: 'insert',
        select: '*',
        values: insertPayload,
        single: true,
      });

      if (error) throw new Error(error.message);
      return { data: rowToSOP(row as Record<string, unknown>), error: null };
    } catch (err) {
      console.error('sopService.createSOP error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  async updateSOP(id: string, data: Partial<SOP>): Promise<ApiResponse<SOP>> {
    try {
      const updatePayload: Record<string, any> = {};
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.description !== undefined) updatePayload.description = data.description;
      if (data.category !== undefined) updatePayload.category = data.category;
      if (data.frequency !== undefined) updatePayload.frequency = data.frequency;
      if (data.assignedRoles !== undefined) updatePayload.assigned_to = data.assignedRoles;
      if (data.isActive !== undefined) updatePayload.is_active = data.isActive;

      const { data: row, error } = await serverApi.query({
        table: 'sop_templates',
        action: 'update',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: id }],
        values: updatePayload,
        single: true,
      });

      if (error) throw new Error(error.message);
      return { data: rowToSOP(row as Record<string, unknown>), error: null };
    } catch (err) {
      console.error('sopService.updateSOP error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  async deleteSOP(id: string): Promise<ApiResponse<void>> {
    try {
      // Soft-delete: mark as inactive
      const { error } = await serverApi.query({
        table: 'sop_templates',
        action: 'update',
        filters: [{ op: 'eq', column: 'id', value: id }],
        values: { is_active: false },
      });

      if (error) throw new Error(error.message);
      return { data: undefined, error: null };
    } catch (err) {
      console.error('sopService.deleteSOP error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  // ---------------------------------------------------------------------------
  // Checklist Runs
  // ---------------------------------------------------------------------------

  async startChecklistRun(templateId: string, propertyId: string): Promise<ApiResponse<SOPChecklistRun>> {
    try {
      const userId = await getCurrentUserId();

      const { data: row, error } = await serverApi.query({
        table: 'sop_runs',
        action: 'insert',
        select: '*',
        values: {
          template_id: templateId,
          property_id: propertyId,
          started_by: userId ?? null,
          status: 'in_progress',
        },
        single: true,
      });

      if (error) throw new Error(error.message);
      return { data: rowToRun(row as Record<string, unknown>), error: null };
    } catch (err) {
      console.error('sopService.startChecklistRun error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  async completeStep(_runId: string, _stepId: string, _result: StepResult): Promise<ApiResponse<StepResult>> {
    return { data: null, error: 'sop_step_results table does not exist' };
  },

  async completeChecklistRun(runId: string): Promise<ApiResponse<SOPChecklistRun>> {
    try {
      const { data: row, error } = await serverApi.query({
        table: 'sop_runs',
        action: 'update',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: runId }],
        values: { status: 'completed', completed_at: new Date().toISOString() },
        single: true,
      });

      if (error) throw new Error(error.message);
      return { data: rowToRun(row as Record<string, unknown>), error: null };
    } catch (err) {
      console.error('sopService.completeChecklistRun error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  async abandonChecklistRun(runId: string): Promise<ApiResponse<SOPChecklistRun>> {
    try {
      const { data: row, error } = await serverApi.query({
        table: 'sop_runs',
        action: 'update',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: runId }],
        values: { status: 'abandoned' },
        single: true,
      });

      if (error) throw new Error(error.message);
      return { data: rowToRun(row as Record<string, unknown>), error: null };
    } catch (err) {
      console.error('sopService.abandonChecklistRun error:', err);
      return { data: null, error: err as Error | string | null };
    }
  },

  async getChecklistRunHistory(templateId: string): Promise<ApiResponse<SOPChecklistRun[]>> {
    try {
      const { data, error } = await serverApi.query({
        table: 'sop_runs',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'template_id', value: templateId }],
        orders: [{ column: 'created_at', ascending: false }],
      });

      if (error) throw new Error(error.message);

      const runs: SOPChecklistRun[] = ((data as any[]) ?? []).map((row: any) => rowToRun(row as Record<string, unknown>));
      return { data: runs, error: null };
    } catch (err) {
      console.error('sopService.getChecklistRunHistory error:', err);
      return { data: [], error: err as Error | string | null };
    }
  },
};
