import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await request.json();
    const code = body.code;
    if (!code) return NextResponse.json({ error: "Missing property code" }, { status: 400 });

    const admin = createAdminClient();
    
    const { data: prop, error: propError } = await admin
      .from("properties")
      .select("id, organization_id, name, type, address, city, state, zip, phone, email, status, total_units, occupied_units, amenities, code, created_at, updated_at")
      .eq("code", code)
      .single();

    if (propError || !prop) return NextResponse.json({ error: "Invalid or expired property code" }, { status: 400 });

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, name, slug, logo_url, address, phone, email, created_at, updated_at")
      .eq("id", prop.organization_id)
      .single();

    if (orgError || !org) return NextResponse.json({ error: "Failed to fetch organization" }, { status: 500 });

    // Upsert membership
    const { error: memError } = await admin
      .from("property_memberships")
      .upsert(
        { user_id: auth.user.id, property_id: prop.id, role: "member", is_active: true },
        { onConflict: "user_id,property_id" }
      );

    if (memError) return NextResponse.json({ error: "Failed to join property" }, { status: 500 });

    return NextResponse.json({
      property: prop,
      organization: {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logoUrl: org.logo_url,
        address: org.address,
        phone: org.phone,
        email: org.email,
        settings: { timezone: "UTC", currency: "USD", dateFormat: "YYYY-MM-DD", features: [] },
        createdAt: org.created_at,
        updatedAt: org.updated_at
      }
    }, { status: 200 });
  } catch (error) {
    console.error("[saas-mobile-server] property join POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
