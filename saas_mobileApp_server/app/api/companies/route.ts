import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

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
    const { data: companies, error } = await admin
      .from("companies")
      .select(`
        *,
        members:company_members(
          user_id,
          user:users(id, full_name, email, user_photo_url)
        ),
        credits:meeting_room_credits(
          id,
          monthly_hours,
          remaining_hours
        )
      `)
      .eq("property_id", propertyId);

    if (error) {
      console.error("[saas-mobile-server] companies GET query error:", error);
      return NextResponse.json({ error: error.message || "Failed to fetch companies" }, { status: 500 });
    }

    return NextResponse.json({ success: true, companies: companies ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] companies GET error:", error);
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
    const { property_id, organization_id, name, logo_url } = body;

    if (!property_id || !organization_id || !name) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const hasAccess = await canManageProperty(auth.user.id, property_id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("companies")
      .insert({
        property_id,
        organization_id,
        name,
        logo_url,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] companies POST db error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, company: data });
  } catch (error) {
    console.error("[saas-mobile-server] companies POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
