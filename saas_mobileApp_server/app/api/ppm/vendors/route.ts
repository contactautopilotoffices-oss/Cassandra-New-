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

    const { data: property } = await admin
      .from("properties")
      .select("organization_id")
      .eq("id", propertyId)
      .maybeSingle();

    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 });
    }

    const { data: vendors, error } = await admin
      .from("maintenance_vendors")
      .select("id, company_name, contact_person, phone, email, specialization, is_active")
      .eq("organization_id", property.organization_id)
      .eq("is_active", true)
      .order("company_name", { ascending: true });

    if (error) {
      console.error("[saas-mobile-server] ppm vendors GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, vendors: vendors ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] ppm vendors GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
