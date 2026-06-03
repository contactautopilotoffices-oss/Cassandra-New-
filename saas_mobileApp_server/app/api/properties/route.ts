import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("organizationId");
    const status = searchParams.get("status");

    const admin = createAdminClient();
    
    // Get user's property memberships
    const { data: memberships } = await admin
      .from("property_memberships")
      .select("property_id")
      .eq("user_id", auth.user.id)
      .eq("is_active", true);

    const propertyIds = (memberships ?? []).map(m => m.property_id);
    
    if (propertyIds.length === 0) {
      return NextResponse.json({ properties: [] }, { status: 200 });
    }

    let query = admin
      .from("properties")
      .select("id, organization_id, name, type, address, city, state, zip, phone, email, status, total_units, occupied_units, amenities, code, created_at, updated_at")
      .in("id", propertyIds)
      .order("name", { ascending: true });

    if (orgId) query = query.eq("organization_id", orgId);
    if (status) query = query.eq("status", status);

    const { data: properties, error } = await query;
    
    if (error) return NextResponse.json({ error: "Failed to fetch properties" }, { status: 500 });
    return NextResponse.json({ properties: properties ?? [] }, { status: 200 });
  } catch (error) {
    console.error("[saas-mobile-server] properties GET error:", error);
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
    const admin = createAdminClient();
    
    const { data: property, error } = await admin
      .from("properties")
      .insert(body)
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Failed to create property" }, { status: 500 });
    return NextResponse.json({ property }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] properties POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
