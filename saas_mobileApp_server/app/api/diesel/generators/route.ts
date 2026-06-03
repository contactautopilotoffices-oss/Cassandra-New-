import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
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
    const { data: generators, error } = await admin
      .from("generators")
      .select("*")
      .eq("property_id", propertyId)
      .order("name", { ascending: true });

    if (error) {
      console.error("[saas-mobile-server] generators GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, generators: generators ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] generators GET error:", error);
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
    const propertyId = body.property_id;

    if (!propertyId) {
      return NextResponse.json({ error: "Missing property_id" }, { status: 400 });
    }

    const hasAccess = await canManageProperty(auth.user.id, propertyId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("generators")
      .insert(body)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] generators POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, generator: data });
  } catch (error) {
    console.error("[saas-mobile-server] generators POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
