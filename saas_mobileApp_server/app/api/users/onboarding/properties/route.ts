import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const envOrgId = searchParams.get("envOrgId"); // Passed from client EXPO_PUBLIC_AUTOPILOT_ORG_ID

    const admin = createAdminClient();
    
    let orgId = envOrgId;
    
    if (!orgId) {
      const { data: org } = await admin
        .from('organizations')
        .select('id')
        .or(`code.eq.autopilot,name.ilike.%autopilot%`)
        .limit(1)
        .maybeSingle();
      orgId = org?.id;
    }

    if (!orgId) {
      return NextResponse.json({ success: true, properties: [], orgId: null });
    }

    const { data: properties, error } = await admin
      .from('properties')
      .select('id, name, code, organization_id')
      .eq('organization_id', orgId)
      .order('name');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, properties: properties || [], orgId });
  } catch (error) {
    console.error("[saas-mobile-server] GET /api/users/onboarding/properties error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
