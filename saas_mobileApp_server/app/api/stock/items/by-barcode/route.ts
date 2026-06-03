import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const propertyId = request.nextUrl.searchParams.get("propertyId");
    const code = request.nextUrl.searchParams.get("code") || request.nextUrl.searchParams.get("barcode");
    if (!propertyId || !code) {
      return NextResponse.json({ error: "Missing propertyId or code" }, { status: 400 });
    }
    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("stock_items")
      .select("*")
      .eq("property_id", propertyId)
      .or(`barcode.eq.${code},item_code.eq.${code}`)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Failed to fetch stock item" }, { status: 500 });
    return NextResponse.json({ item: data ?? null });
  } catch (error) {
    console.error("[saas-mobile-server] stock by-barcode GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
