import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const propertyId = request.nextUrl.searchParams.get("propertyId");
    if (!propertyId) {
      return NextResponse.json({ error: "Missing propertyId" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: schedules, error } = await admin
      .from("ppm_schedules")
      .select("status, planned_date")
      .eq("property_id", propertyId);

    if (error) {
      console.error("[saas-mobile-server] ppm stats GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Process stats
    const stats = { total: 0, done: 0, pending: 0, postponed: 0, skipped: 0, overdue: 0 };
    
    const normalizeDate = (value?: string | null): string => {
      if (!value) return '';
      const raw = String(value).trim();
      const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
      if (match) return match[1];
      const parsed = new Date(raw);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
      return '';
    };

    const normalizeStatus = (value?: string | null): string => {
      const normalized = (value ?? '').toLowerCase().trim();
      if (normalized === 'completed') return 'done';
      if (['pending', 'done', 'postponed', 'skipped'].includes(normalized)) return normalized;
      return 'pending';
    };

    const daysUntil = (dateStr: string): number => {
      const normalized = normalizeDate(dateStr);
      if (!normalized) return 999;
      const target = new Date(normalized + 'T12:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      target.setHours(0, 0, 0, 0);
      return Math.ceil((target.getTime() - now.getTime()) / 86400000);
    };

    for (const row of schedules ?? []) {
      stats.total++;
      const status = normalizeStatus(row.status);
      if (status === 'done') stats.done++;
      else if (status === 'pending') {
        if (daysUntil(row.planned_date) < 0) stats.overdue++;
        else stats.pending++;
      } else if (status === 'postponed') stats.postponed++;
      else if (status === 'skipped') stats.skipped++;
    }

    return NextResponse.json({ success: true, stats });
  } catch (error) {
    console.error("[saas-mobile-server] ppm stats GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
