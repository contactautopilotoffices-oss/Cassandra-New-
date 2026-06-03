// ============================================================================
// serverApi — Mobile Fastify Server Proxy
// ============================================================================
// Routes ALL calls through the mobile Fastify server instead of calling
// Supabase directly. The interface is identical so all callers are unaffected.
// ============================================================================

import { getSupabaseToken } from '@/utils/api/mobileApi';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const MOBILE_SERVER_URL = process.env.EXPO_PUBLIC_MOBILE_SERVER_URL ?? 'http://localhost:3001';

// ---------------------------------------------------------------------------
// Response type (kept identical for callers)
// ---------------------------------------------------------------------------

export interface ServerApiResponse<T = unknown> {
  data: T | null;
  error: { message: string; code?: string; details?: string; hint?: string } | null;
  count?: number | null;
}

export class ServerApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code?: string
  ) {
    super(message);
    this.name = 'ServerApiError';
  }
}

// ---------------------------------------------------------------------------
// Filter application helper (kept for type compatibility)
// ---------------------------------------------------------------------------

type FilterOp = 'eq' | 'neq' | 'in' | 'gte' | 'lte' | 'lt' | 'gt' | 'ilike' | 'not' | 'is' | 'or';

interface QueryFilter {
  op: FilterOp;
  column?: string;
  value?: unknown;
  values?: unknown[];
  operator?: string;
  expression?: string;
  foreignTable?: string;
}

// ---------------------------------------------------------------------------
// Internal fetch helper
// ---------------------------------------------------------------------------

async function serverFetch(endpoint: string, body: unknown): Promise<unknown> {
  const token = await getSupabaseToken();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${MOBILE_SERVER_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new ServerApiError(
      `Server error ${response.status}: ${text || response.statusText}`,
      response.status
    );
  }

  return response.json();
}

// ---------------------------------------------------------------------------
// Upload helpers
// ---------------------------------------------------------------------------

async function fileToBase64(file: File | Blob | ArrayBuffer): Promise<string> {
  if (file instanceof ArrayBuffer) {
    const bytes = new Uint8Array(file);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // result is data:*/*;base64,xxxx — strip the prefix
      const base64 = result.split(',')[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Public API — same interface as before
// ---------------------------------------------------------------------------

export const serverApi = {
  // ── Generic Supabase query ──────────────────────────────────────────────
  async query<T = unknown>(body: {
    table: string;
    action: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
    select?: string;
    selectOptions?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean };
    filters?: QueryFilter[];
    orders?: Array<{ column: string; ascending?: boolean }>;
    limit?: number;
    offset?: number;
    single?: boolean;
    maybeSingle?: boolean;
    values?: unknown;
    mutationOptions?: { onConflict?: string; ignoreDuplicates?: boolean; defaultToNull?: boolean };
  }): Promise<ServerApiResponse<T>> {
    try {
      const result = (await serverFetch('/api/query', body)) as ServerApiResponse<T>;
      return result;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  // ── RPC (8 callers) ───────────────────────────────────────────────────────
  async rpc<T = unknown>(functionName: string, params?: Record<string, unknown>): Promise<ServerApiResponse<T>> {
    try {
      const result = (await serverFetch('/api/rpc', { functionName, params })) as ServerApiResponse<T>;
      return result;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  // ── Storage (1 caller each) ───────────────────────────────────────────────
  async upload(
    bucket: string,
    path: string,
    file: File | Blob | ArrayBuffer | { uri: string; name?: string; type?: string },
    contentType?: string,
  ): Promise<ServerApiResponse<{ path: string }>> {
    try {
      let payload: { bucket: string; path: string; contentType?: string; file: unknown };

      if (file instanceof ArrayBuffer || file instanceof Blob || file instanceof File) {
        const base64 = await fileToBase64(file);
        payload = {
          bucket,
          path,
          contentType,
          file: {
            base64,
            name: (file as File).name ?? path.split('/').pop() ?? 'file',
            type: contentType ?? (file as File).type ?? 'application/octet-stream',
          },
        };
      } else {
        // URI object — pass as-is
        payload = {
          bucket,
          path,
          contentType,
          file,
        };
      }

      const result = (await serverFetch('/api/storage/upload', payload)) as ServerApiResponse<{ path: string }>;
      return result;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  async getPublicUrl(bucket: string, path: string): Promise<ServerApiResponse<{ publicUrl: string }>> {
    try {
      const token = await getSupabaseToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(
        `${MOBILE_SERVER_URL}/api/storage/url?bucket=${encodeURIComponent(bucket)}&path=${encodeURIComponent(path)}`,
        { method: 'GET', headers }
      );

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ServerApiError(
          `Server error ${response.status}: ${text || response.statusText}`,
          response.status
        );
      }

      return (await response.json()) as ServerApiResponse<{ publicUrl: string }>;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },

  async removeFile(bucket: string, path: string): Promise<ServerApiResponse<unknown>> {
    try {
      const token = await getSupabaseToken();
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${MOBILE_SERVER_URL}/api/storage/remove`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ bucket, path }),
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new ServerApiError(
          `Server error ${response.status}: ${text || response.statusText}`,
          response.status
        );
      }

      return (await response.json()) as ServerApiResponse<unknown>;
    } catch (err) {
      if (err instanceof ServerApiError) {
        return { data: null, error: { message: err.message, code: String(err.statusCode) } };
      }
      return { data: null, error: { message: err instanceof Error ? err.message : 'Unknown error' } };
    }
  },
};

export default serverApi;
