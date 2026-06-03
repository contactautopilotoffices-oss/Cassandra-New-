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
    const { data: prop, error: propError } = await admin
      .from("properties")
      .select("organization_id")
      .eq("id", params.id)
      .single();

    if (propError || !prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("available_modules")
      .eq("id", prop.organization_id)
      .single();

    if (orgError) return NextResponse.json({ error: "Failed to fetch organization modules" }, { status: 500 });
    
    const modules = (org?.available_modules ?? []).map((m: string) => ({ module: m, enabled: true }));
    return NextResponse.json({ features: modules }, { status: 200 });
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
    const enabledModules = Object.entries(body.features || {}).filter(([, enabled]) => enabled).map(([module]) => module);

    const admin = createAdminClient();
    const { data: prop, error: propError } = await admin
      .from("properties")
      .select("organization_id")
      .eq("id", params.id)
      .single();

    if (propError || !prop) return NextResponse.json({ error: "Property not found" }, { status: 404 });

    const { error: orgError } = await admin
      .from("organizations")
      .update({ available_modules: enabledModules })
      .eq("id", prop.organization_id);

    if (orgError) return NextResponse.json({ error: "Failed to update organization modules" }, { status: 500 });
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
