import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAnonClient } from "@/lib/supabase/client";

export interface QueryFilter {
  op: "eq" | "neq" | "in" | "gte" | "lte" | "lt" | "gt" | "ilike" | "not" | "or" | "is";
  column?: string;
  value?: unknown;
  values?: unknown[];
  operator?: string;
  expression?: string;
  foreignTable?: string;
}

export interface QueryOrder {
  column: string;
  ascending?: boolean;
}

export interface SelectOptions {
  count?: "exact" | "planned" | "estimated";
  head?: boolean;
}

export interface MutationOptions {
  onConflict?: string;
  ignoreDuplicates?: boolean;
  defaultToNull?: boolean;
}

export interface QueryRequestBody {
  table: string;
  action: "select" | "insert" | "update" | "delete" | "upsert";
  select?: string;
  selectOptions?: SelectOptions;
  filters?: QueryFilter[];
  orders?: QueryOrder[];
  limit?: number;
  offset?: number;
  single?: boolean;
  maybeSingle?: boolean;
  values?: unknown;
  mutationOptions?: MutationOptions;
}

export async function getAuthorizedSupabase(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.response || !auth.user || !auth.token) {
    return {
      user: null,
      token: null,
      client: null,
      response:
        auth.response ??
        NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  return {
    user: auth.user,
    token: auth.token,
    client: createAnonClient(auth.token),
  };
}

/**
 * Try to extract a property-scoping identifier from a generic query body.
 * Most property-scoped tables use `property_id`; the `properties` table itself
 * uses `id` when fetching a single property.
 */
export function extractPropertyIdFromQuery(body: QueryRequestBody): string | null {
  if (!body.filters) return null;

  // Standard property-scoped tables
  const propFilter = body.filters.find(
    (f) => f.op === "eq" && f.column === "property_id" && typeof f.value === "string"
  );
  if (propFilter) return propFilter.value as string;

  // Properties table queried by id
  if (body.table === "properties") {
    const idFilter = body.filters.find(
      (f) => f.op === "eq" && f.column === "id" && typeof f.value === "string"
    );
    if (idFilter) return idFilter.value as string;
  }

  return null;
}

/**
 * Extract property_id from RPC params (common naming conventions).
 */
export function extractPropertyIdFromRpc(params: Record<string, unknown>): string | null {
  const val = params.p_property_id ?? params.property_id ?? params.prop_id;
  return typeof val === "string" ? val : null;
}

export function applyQueryFilters(query: any, filters: QueryFilter[] = []) {
  let nextQuery = query;

  for (const filter of filters) {
    switch (filter.op) {
      case "eq":
        nextQuery = nextQuery.eq(filter.column, filter.value);
        break;
      case "neq":
        nextQuery = nextQuery.neq(filter.column, filter.value);
        break;
      case "in":
        nextQuery = nextQuery.in(filter.column, filter.values ?? []);
        break;
      case "gte":
        nextQuery = nextQuery.gte(filter.column, filter.value);
        break;
      case "lte":
        nextQuery = nextQuery.lte(filter.column, filter.value);
        break;
      case "lt":
        nextQuery = nextQuery.lt(filter.column, filter.value);
        break;
      case "gt":
        nextQuery = nextQuery.gt(filter.column, filter.value);
        break;
      case "ilike":
        nextQuery = nextQuery.ilike(filter.column, filter.value);
        break;
      case "is":
        nextQuery = nextQuery.is(filter.column, filter.value);
        break;
      case "not":
        nextQuery = nextQuery.not(filter.column, filter.operator, filter.value);
        break;
      case "or":
        nextQuery = nextQuery.or(filter.expression ?? "", filter.foreignTable ? { foreignTable: filter.foreignTable } : undefined);
        break;
      default:
        break;
    }
  }

  return nextQuery;
}

export function applyQueryOrdering(query: any, orders: QueryOrder[] = [], limit?: number, offset?: number) {
  let nextQuery = query;

  for (const order of orders) {
    nextQuery = nextQuery.order(order.column, {
      ascending: order.ascending ?? true,
    });
  }

  if (typeof limit === "number" && typeof offset === "number") {
    nextQuery = nextQuery.range(offset, offset + limit - 1);
  } else if (typeof limit === "number") {
    nextQuery = nextQuery.limit(limit);
  }

  return nextQuery;
}
