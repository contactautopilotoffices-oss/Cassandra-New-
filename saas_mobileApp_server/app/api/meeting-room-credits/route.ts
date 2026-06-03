import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageMeetingRoomCredits } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const propertyId = searchParams.get("propertyId");
    const userId = searchParams.get("userId");
    const companyId = searchParams.get("companyId");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const isAdmin = await canManageMeetingRoomCredits(auth.user.id, propertyId);

    if (isAdmin) {
      let query = admin
        .from("meeting_room_credits")
        .select("*, tenant:users!user_id(id, full_name, email), company:companies!company_id(id, name, logo_url), assigned_by_user:users!assigned_by(full_name)")
        .eq("property_id", propertyId)
        .order("updated_at", { ascending: false });

      if (userId) query = query.eq("user_id", userId);
      if (companyId) query = query.eq("company_id", companyId);

      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ credits: data ?? [] });
    }

    const { data: companyMember } = await admin
      .from("company_members")
      .select("company_id, company:companies(name, logo_url)")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    let query = admin.from("meeting_room_credits").select("*").eq("property_id", propertyId);
    query = companyMember?.company_id ? query.eq("company_id", companyMember.company_id) : query.eq("user_id", auth.user.id);

    const { data: credit, error } = await query.maybeSingle();
    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      credit: credit || null,
      company: companyMember?.company || null
    });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-room-credits GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const propertyId = body.propertyId;
    const userId = body.userId;
    const companyId = body.companyId;
    const monthlyHours = body.monthlyHours;
    const remainingHours = body.remainingHours;

    if (!propertyId || (!userId && !companyId) || (monthlyHours == null && remainingHours == null)) {
      return NextResponse.json(
        { error: "propertyId, (userId or companyId), and at least one of monthlyHours/remainingHours required" },
        { status: 400 }
      );
    }

    if (!(await canManageMeetingRoomCredits(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data: property, error: propertyError } = await admin
      .from("properties")
      .select("organization_id")
      .eq("id", propertyId)
      .single();

    if (propertyError) {
      return NextResponse.json({ error: propertyError.message }, { status: 500 });
    }

    let existingQuery = admin
      .from("meeting_room_credits")
      .select("id, remaining_hours, monthly_hours, next_reset_at, last_reset_at")
      .eq("property_id", propertyId);

    existingQuery = userId ? existingQuery.eq("user_id", userId) : existingQuery.eq("company_id", companyId);
    const { data: existing, error: existingError } = await existingQuery.maybeSingle();
    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }

    const nextReset = new Date();
    nextReset.setMonth(nextReset.getMonth() + 1);
    nextReset.setDate(1);
    nextReset.setHours(0, 0, 0, 0);

    let credit: any;
    if (existing) {
      const newMonthly = monthlyHours != null ? Number(monthlyHours) : Number(existing.monthly_hours);
      let newRemaining = Number(existing.remaining_hours);
      let nextResetAt = existing.next_reset_at;
      let lastResetAt = existing.last_reset_at;

      if (remainingHours != null) {
        newRemaining = Number(remainingHours);
      } else if (monthlyHours != null) {
        const diff = newMonthly - Number(existing.monthly_hours);
        newRemaining = Math.max(0, Number(existing.remaining_hours) + diff);
        nextResetAt = nextReset.toISOString();
        lastResetAt = new Date().toISOString();
      }

      const { data, error } = await admin
        .from("meeting_room_credits")
        .update({
          monthly_hours: newMonthly,
          remaining_hours: newRemaining,
          organization_id: property.organization_id,
          assigned_by: auth.user.id,
          last_reset_at: lastResetAt,
          next_reset_at: nextResetAt,
          updated_at: new Date().toISOString()
        })
        .eq("id", existing.id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      credit = data;

      await admin.from("meeting_room_credit_log").insert({
        credit_id: existing.id,
        user_id: userId || null,
        company_id: companyId || null,
        organization_id: property.organization_id,
        action: "assigned",
        hours_changed: newRemaining - Number(existing.remaining_hours),
        hours_after: newRemaining,
        performed_by: auth.user.id,
        notes: `Manual update: Quota=${newMonthly}h, Balance=${newRemaining}h`
      });
    } else {
      const initialMonthly = monthlyHours != null ? Number(monthlyHours) : 0;
      const initialRemaining = remainingHours != null ? Number(remainingHours) : initialMonthly;

      const { data, error } = await admin
        .from("meeting_room_credits")
        .insert({
          property_id: propertyId,
          organization_id: property.organization_id,
          user_id: userId || null,
          company_id: companyId || null,
          assigned_by: auth.user.id,
          monthly_hours: initialMonthly,
          remaining_hours: initialRemaining,
          last_reset_at: new Date().toISOString(),
          next_reset_at: nextReset.toISOString()
        })
        .select()
        .single();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      credit = data;

      await admin.from("meeting_room_credit_log").insert({
        credit_id: credit.id,
        user_id: userId || null,
        company_id: companyId || null,
        organization_id: property.organization_id,
        action: "assigned",
        hours_changed: initialRemaining,
        hours_after: initialRemaining,
        performed_by: auth.user.id,
        notes: `Initial allocation: Quota=${initialMonthly}h, Balance=${initialRemaining}h`
      });
    }

    return NextResponse.json({ success: true, credit });
  } catch (error) {
    console.error("[saas-mobile-server] meeting-room-credits POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
