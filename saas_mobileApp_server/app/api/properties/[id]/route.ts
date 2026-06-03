import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function GET(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const admin = createAdminClient();
    const { data: property, error } = await admin
      .from("properties")
      .select("id, organization_id, name, type, address, city, state, zip, phone, email, status, total_units, occupied_units, amenities, code, created_at, updated_at")
      .eq("id", params.id)
      .single();

    if (error) return NextResponse.json({ error: "Failed to fetch property" }, { status: 500 });
    return NextResponse.json({ property }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const body = await request.json();
    const admin = createAdminClient();
    const { data: property, error } = await admin
      .from("properties")
      .update(body)
      .eq("id", params.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: "Failed to update property" }, { status: 500 });
    return NextResponse.json({ property }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    
    const admin = createAdminClient();
    const { error } = await admin.from("properties").delete().eq("id", params.id);

    if (error) return NextResponse.json({ error: "Failed to delete property" }, { status: 500 });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
