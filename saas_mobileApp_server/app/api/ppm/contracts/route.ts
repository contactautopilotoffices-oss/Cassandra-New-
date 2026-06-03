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
    const { data: contracts, error } = await admin
      .from("amc_contracts")
      .select("*")
      .eq("property_id", propertyId)
      .order("contract_end_date", { ascending: true });

    if (error) {
      console.error("[saas-mobile-server] ppm contracts GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, contracts: contracts ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] ppm contracts GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
