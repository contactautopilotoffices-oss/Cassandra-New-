import { ApiResponse } from '@/types';
import { serverApi } from '@/lib/serverApi';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StockItem {
  id: string;
  property_id: string;
  organization_id?: string;
  name: string;
  item_code: string;
  description: string | null;
  category: string | null;
  quantity: number;
  unit: string | null;
  min_threshold: number;
  per_unit_cost: number;
  unit_price: number;
  location: string | null;
  barcode: string | null;
  barcode_format: string | null;
  qr_code_data: any;
  barcode_generated_at: string | null;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  item_id: string;
  property_id: string;
  action: 'add' | 'remove' | 'adjust' | 'initial';
  quantity_change: number;
  quantity_before: number;
  quantity_after: number;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  stock_items?: { name: string; item_code: string; unit?: string } | null;
  users?: { full_name: string } | null;
}

export interface StockReport {
  id: string;
  property_id: string;
  report_date: string;
  total_items: number;
  low_stock_count: number;
  total_added: number;
  total_removed: number;
  report_data: any;
  generated_by: string | null;
  generated_at: string;
}

export interface BarcodeDetails {
  barcode: string;
  barcode_format: string;
  qr_code_data: any;
  item_name: string;
  item_code: string;
}

type LegacyGetStockFilters = {
  propertyId?: string;
  search?: string;
  category?: string;
  lowStockOnly?: boolean;
  barcode?: string;
};

type LegacyMovementInput = {
  propertyId: string;
  itemId: string;
  action: 'add' | 'remove' | 'adjust' | 'in' | 'out';
  quantity?: number;
  quantityChange?: number;
  quantityBefore?: number;
  quantityAfter?: number;
  notes?: string;
  userId?: string;
};

function normalizeStockItem(item: any): StockItem {
  const unitPrice = Number(item?.unit_price ?? item?.per_unit_cost ?? 0);
  return {
    ...item,
    per_unit_cost: unitPrice,
    unit_price: unitPrice,
  } as StockItem;
}

function normalizeMovement(movement: any): StockMovement & {
  item_name?: string;
  item_code?: string;
  unit?: string;
  user_name?: string;
} {
  return {
    ...movement,
    item_name: movement?.item_name ?? movement?.stock_items?.name ?? undefined,
    item_code: movement?.item_code ?? movement?.stock_items?.item_code ?? undefined,
    unit: movement?.unit ?? movement?.stock_items?.unit ?? undefined,
    user_name: movement?.user_name ?? movement?.users?.full_name ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Stock Service — routes through saas_mobile_server
// Aligned with saas_one web app stock module
// ---------------------------------------------------------------------------

export const stockService: any = {
  // ── Get Stock Items ───────────────────────────────────────────────────────
  async getStockItems(
    filtersOrPropertyId?: LegacyGetStockFilters | string,
    maybeFilters?: Omit<LegacyGetStockFilters, 'propertyId'>
  ): Promise<ApiResponse<StockItem[]>> {
    try {
      const filters: LegacyGetStockFilters =
        typeof filtersOrPropertyId === 'string'
          ? { propertyId: filtersOrPropertyId, ...(maybeFilters ?? {}) }
          : (filtersOrPropertyId ?? {});

      const queryFilters: any[] = [];
      if (filters?.propertyId) queryFilters.push({ op: 'eq', column: 'property_id', value: filters.propertyId });
      if (filters?.category) queryFilters.push({ op: 'eq', column: 'category', value: filters.category });
      if (filters?.barcode) queryFilters.push({ op: 'eq', column: 'barcode', value: filters.barcode });
      if (filters?.search) {
        const s = `%${filters.search}%`;
        queryFilters.push({ op: 'or', expression: `name.ilike.${s},item_code.ilike.${s}` });
      }

      const { data, error } = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters: queryFilters,
        orders: [{ column: 'name', ascending: true }],
      });

      if (error) throw new Error(error.message ?? 'Failed to fetch stock items');

      let items = (data ?? []).map(normalizeStockItem);
      if (filters?.lowStockOnly) {
        items = items.filter(i => i.quantity <= i.min_threshold);
      }
      return { success: true, data: items };
    } catch (err: any) {
      console.error('[Stock] getStockItems error:', err);
      return { success: false, data: [], error: err.message };
    }
  },

  // ── Get Single Stock Item ─────────────────────────────────────────────────
  async getStockItem(id: string, propertyId?: string): Promise<ApiResponse<StockItem>> {
    try {
      const filters: any[] = [{ op: 'eq', column: 'id', value: id }];
      if (propertyId) filters.push({ op: 'eq', column: 'property_id', value: propertyId });

      const { data, error } = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters,
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to fetch stock item');
      return { success: true, data: data ? normalizeStockItem(data) : null as any };
    } catch (err: any) {
      console.error('[Stock] getStockItem error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Create Stock Item ─────────────────────────────────────────────────────
  async createStockItem(data: {
    propertyId: string;
    name: string;
    item_code?: string;
    description?: string;
    category?: string;
    quantity?: number;
    unit?: string;
    min_threshold?: number;
    per_unit_cost?: number;
    location?: string;
  }): Promise<ApiResponse<StockItem>> {
    try {
      const { data: item, error } = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'insert',
        values: {
          property_id: data.propertyId,
          name: data.name,
          item_code: data.item_code,
          description: data.description ?? null,
          category: data.category ?? null,
          quantity: data.quantity ?? 0,
          unit: data.unit ?? null,
          min_threshold: data.min_threshold ?? 10,
          per_unit_cost: data.per_unit_cost ?? 0,
          unit_price: data.per_unit_cost ?? 0,
          location: data.location ?? null,
        },
        select: '*',
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to create stock item');
      return { success: true, data: item ? normalizeStockItem(item) : null as any };
    } catch (err: any) {
      console.error('[Stock] createStockItem error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Update Stock Item ─────────────────────────────────────────────────────
  async updateStockItem(id: string, data: Partial<StockItem>): Promise<ApiResponse<StockItem>> {
    try {
      const payload: any = {};
      if (data.name !== undefined) payload.name = data.name;
      if (data.item_code !== undefined) payload.item_code = data.item_code;
      if (data.description !== undefined) payload.description = data.description;
      if (data.category !== undefined) payload.category = data.category;
      if (data.quantity !== undefined) payload.quantity = data.quantity;
      if (data.unit !== undefined) payload.unit = data.unit;
      if (data.min_threshold !== undefined) payload.min_threshold = data.min_threshold;
      if (data.per_unit_cost !== undefined) { payload.per_unit_cost = data.per_unit_cost; payload.unit_price = data.per_unit_cost; }
      if (data.location !== undefined) payload.location = data.location;
      if (data.barcode !== undefined) payload.barcode = data.barcode;

      const { data: item, error } = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'update',
        values: payload,
        filters: [{ op: 'eq', column: 'id', value: id }],
        select: '*',
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to update stock item');
      return { success: true, data: item ? normalizeStockItem(item) : null as any };
    } catch (err: any) {
      console.error('[Stock] updateStockItem error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Delete Single Stock Item ──────────────────────────────────────────────
  async deleteStockItem(id: string, propertyId?: string): Promise<ApiResponse<void>> {
    try {
      const filters: any[] = [{ op: 'eq', column: 'id', value: id }];
      if (propertyId) filters.push({ op: 'eq', column: 'property_id', value: propertyId });

      const { error } = await serverApi.query<unknown>({
        table: 'stock_items',
        action: 'delete',
        filters,
      });
      if (error) throw new Error(error.message ?? 'Failed to delete stock item');
      return { success: true, data: undefined };
    } catch (err: any) {
      console.error('[Stock] deleteStockItem error:', err);
      return { success: false, data: null as unknown as void, error: err.message };
    }
  },

  // ── Bulk Delete Stock Items ───────────────────────────────────────────────
  async bulkDeleteStockItems(propertyId: string, itemIds: string[]): Promise<ApiResponse<{ deletedCount: number }>> {
    try {
      const { error, count } = await serverApi.query<unknown>({
        table: 'stock_items',
        action: 'delete',
        selectOptions: { count: 'exact' },
        filters: [
          { op: 'in', column: 'id', values: itemIds },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
      });
      if (error) throw new Error(error.message ?? 'Failed to delete stock items');
      return { success: true, data: { deletedCount: count ?? itemIds.length } };
    } catch (err: any) {
      console.error('[Stock] bulkDeleteStockItems error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Get Stock Movements ───────────────────────────────────────────────────
  async getStockMovements(propertyId: string, filters?: { itemId?: string; limit?: number }): Promise<ApiResponse<StockMovement[]>> {
    try {
      const queryFilters: any[] = [
        { op: 'eq', column: 'property_id', value: propertyId },
      ];
      if (filters?.itemId) queryFilters.push({ op: 'eq', column: 'item_id', value: filters.itemId });

      const { data, error } = await serverApi.query<StockMovement[]>({
        table: 'stock_movements',
        action: 'select',
        select: '*, stock_items(name, item_code, unit), users(full_name)',
        filters: queryFilters,
        orders: [{ column: 'created_at', ascending: false }],
        limit: filters?.limit,
      });
      if (error) throw new Error(error.message ?? 'Failed to fetch stock movements');
      return { success: true, data: (data ?? []).map(normalizeMovement) };
    } catch (err: any) {
      console.error('[Stock] getStockMovements error:', err);
      return { success: false, data: [], error: err.message };
    }
  },

  // ── Record Stock Movement ─────────────────────────────────────────────────
  async recordMovement(data: LegacyMovementInput): Promise<ApiResponse<{ movement: StockMovement; item: StockItem; quantityAfter?: number }>> {
    try {
      const quantity = Math.abs(Number(data.quantity ?? data.quantityChange ?? 0));

      // Fetch current item quantity
      const { data: itemRow, error: itemErr } = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'id', value: data.itemId }],
        single: true,
      });
      if (itemErr) throw new Error(itemErr.message ?? 'Item not found');

      const quantity_before = (itemRow as any)?.quantity ?? 0;
      const normalizedAction = (data.action === 'in' ? 'add' : data.action === 'out' ? 'remove' : data.action) as StockMovement['action'];
      const quantity_change = (normalizedAction === 'remove') ? -quantity : quantity;
      const quantity_after = Math.max(0, quantity_before + quantity_change);

      // Insert movement
      const { data: movement, error: movErr } = await serverApi.query<StockMovement>({
        table: 'stock_movements',
        action: 'insert',
        values: {
          item_id: data.itemId,
          property_id: data.propertyId,
          action: normalizedAction,
          quantity_change,
          quantity_before,
          quantity_after,
          notes: data.notes ?? null,
          user_id: data.userId ?? null,
        },
        select: '*',
        single: true,
      });
      if (movErr) throw new Error(movErr.message ?? 'Failed to record movement');

      // Update item quantity
      const { data: updatedItem, error: updErr } = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'update',
        values: { quantity: quantity_after, updated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: data.itemId }],
        select: '*',
        single: true,
      });
      if (updErr) throw new Error(updErr.message ?? 'Failed to update item quantity');

      return {
        success: true,
        data: {
          movement: normalizeMovement(movement),
          item: normalizeStockItem(updatedItem),
          quantityAfter: quantity_after,
        },
      };
    } catch (err: any) {
      console.error('[Stock] recordMovement error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Scan Item (lookup by barcode + record movement) ───────────────────────
  async scanItem(data: {
    propertyId: string;
    itemId: string;
    action: 'in' | 'out' | 'add' | 'remove' | 'adjust';
    quantity: number;
    notes?: string;
  }): Promise<ApiResponse<{ movement: StockMovement; newQuantity: number; item_name: string }>> {
    try {
      const result = await stockService.recordMovement({
        propertyId: data.propertyId,
        itemId: data.itemId,
        action: data.action,
        quantity: data.quantity,
        notes: data.notes ?? 'Scanned via Mobile',
      });
      if (!result.success) throw new Error(result.error ?? 'Scan failed');
      return {
        success: true,
        data: {
          movement: result.data!.movement,
          newQuantity: result.data!.quantityAfter ?? 0,
          item_name: result.data!.item?.name ?? '',
        },
      };
    } catch (err: any) {
      console.error('[Stock] scanItem error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Get Stock Item by Barcode ─────────────────────────────────────────────
  async getStockByBarcode(barcode: string, propertyId: string): Promise<ApiResponse<StockItem>> {
    try {
      const { data, error } = await serverApi.query<StockItem>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters: [
          { op: 'eq', column: 'barcode', value: barcode },
          { op: 'eq', column: 'property_id', value: propertyId },
        ],
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to fetch by barcode');
      return { success: true, data: data ? normalizeStockItem(data) : null as any };
    } catch (err: any) {
      console.error('[Stock] getStockByBarcode error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Get Barcode Details ───────────────────────────────────────────────────
  async getBarcodeDetails(itemId: string): Promise<ApiResponse<BarcodeDetails>> {
    try {
      const { data, error } = await serverApi.query<{ barcode?: string; barcode_format?: string; qr_code_data?: any; name?: string; item_code?: string }>({
        table: 'stock_items',
        action: 'select',
        select: 'barcode, barcode_format, qr_code_data, name, item_code',
        filters: [{ op: 'eq', column: 'id', value: itemId }],
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to fetch barcode');
      return {
        success: true,
        data: {
          barcode: data?.barcode ?? '',
          barcode_format: data?.barcode_format ?? '',
          qr_code_data: data?.qr_code_data,
          item_name: data?.name ?? '',
          item_code: data?.item_code ?? '',
        },
      };
    } catch (err: any) {
      console.error('[Stock] getBarcodeDetails error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Regenerate Barcode ────────────────────────────────────────────────────
  // Note: barcode generation logic (UUID-based) is done client-side here since
  // the server endpoint is no longer available.
  async regenerateBarcode(itemId: string): Promise<ApiResponse<BarcodeDetails>> {
    try {
      // Fetch item details for QR data
      const { data: item, error: fetchErr } = await serverApi.query<{ name?: string; item_code?: string }>({
        table: 'stock_items',
        action: 'select',
        select: 'name, item_code',
        filters: [{ op: 'eq', column: 'id', value: itemId }],
        single: true,
      });
      if (fetchErr) throw new Error(fetchErr.message ?? 'Item not found');

      const newBarcode = itemId; // Use UUID as barcode
      const qrData = JSON.stringify({ id: itemId, name: item?.name, item_code: item?.item_code });

      const { data, error } = await serverApi.query<{ barcode?: string; barcode_format?: string; qr_code_data?: any; name?: string; item_code?: string }>({
        table: 'stock_items',
        action: 'update',
        values: { barcode: newBarcode, barcode_format: 'QR', qr_code_data: qrData, barcode_generated_at: new Date().toISOString() },
        filters: [{ op: 'eq', column: 'id', value: itemId }],
        select: 'barcode, barcode_format, qr_code_data, name, item_code',
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to regenerate barcode');
      return {
        success: true,
        data: {
          barcode: data?.barcode ?? '',
          barcode_format: data?.barcode_format ?? '',
          qr_code_data: data?.qr_code_data,
          item_name: data?.name ?? '',
          item_code: data?.item_code ?? '',
        },
      };
    } catch (err: any) {
      console.error('[Stock] regenerateBarcode error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },

  // ── Get Stock Reports ─────────────────────────────────────────────────────
  async getReports(propertyId: string, filters?: { startDate?: string; endDate?: string; limit?: number }): Promise<ApiResponse<StockReport[]>> {
    try {
      const queryFilters: any[] = [
        { op: 'eq', column: 'property_id', value: propertyId },
      ];
      if (filters?.startDate) queryFilters.push({ op: 'gte', column: 'report_date', value: filters.startDate });
      if (filters?.endDate) queryFilters.push({ op: 'lte', column: 'report_date', value: filters.endDate });

      const { data, error } = await serverApi.query<StockReport[]>({
        table: 'stock_reports',
        action: 'select',
        select: '*',
        filters: queryFilters,
        orders: [{ column: 'report_date', ascending: false }],
        limit: filters?.limit,
      });
      if (error) throw new Error(error.message ?? 'Failed to fetch reports');
      return { success: true, data: data ?? [] };
    } catch (err: any) {
      console.error('[Stock] getReports error:', err);
      return { success: false, data: [], error: err.message };
    }
  },

  // ── Generate Stock Report ─────────────────────────────────────────────────
  async generateReport(propertyId: string, reportDate: string): Promise<ApiResponse<StockReport>> {
    try {
      // Compute stats from current stock state
      const { data: items, error: itemsErr } = await serverApi.query<StockItem[]>({
        table: 'stock_items',
        action: 'select',
        select: '*',
        filters: [{ op: 'eq', column: 'property_id', value: propertyId }],
      });
      if (itemsErr) throw new Error(itemsErr.message ?? 'Failed to fetch stock items');

      const totalItems = items?.length ?? 0;
      const lowStockCount = (items ?? []).filter(i => i.quantity <= i.min_threshold).length;

      const { data, error } = await serverApi.query<StockReport>({
        table: 'stock_reports',
        action: 'insert',
        values: {
          property_id: propertyId,
          report_date: reportDate,
          total_items: totalItems,
          low_stock_count: lowStockCount,
          total_added: 0,
          total_removed: 0,
          report_data: { items },
          generated_at: new Date().toISOString(),
        },
        select: '*',
        single: true,
      });
      if (error) throw new Error(error.message ?? 'Failed to generate report');
      return { success: true, data };
    } catch (err: any) {
      console.error('[Stock] generateReport error:', err);
      return { success: false, data: null as any, error: err.message };
    }
  },
};

stockService.createItem = async (data: {
  propertyId: string;
  name: string;
  item_code?: string;
  description?: string;
  category?: string;
  quantity?: number;
  unit?: string;
  min_threshold?: number;
  unit_price?: number;
  location?: string;
}) =>
  stockService.createStockItem({
    ...data,
    per_unit_cost: data.unit_price,
  });

stockService.getMovements = async (propertyId: string, filters?: { itemId?: string; limit?: number }) =>
  stockService.getStockMovements(propertyId, filters);

stockService.getBarcode = async (itemId: string) =>
  stockService.getBarcodeDetails(itemId);

stockService.scanBarcode = async (barcode: string, propertyId: string) =>
  stockService.getStockByBarcode(barcode, propertyId);

export default stockService;
