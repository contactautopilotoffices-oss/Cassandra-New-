import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: runId } = await context.params;
    const body = await request.json();
    const admin = createAdminClient();

    // Verify the run exists and get propertyId
    const { data: runData } = await admin
      .from("sop_completions")
      .select("property_id")
      .eq("id", runId)
      .single();

    if (!runData) return NextResponse.json({ error: "Run not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, runData.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const payload: any = {
      status: body.status,
    };
    
    if (body.status === 'completed' || body.status === 'abandoned') {
      payload.completed_at = new Date().toISOString();
    }

    const { data: updatedRun, error } = await admin
      .from("sop_completions")
      .update(payload)
      .eq("id", runId)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] sop runs PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, run: updatedRun });
  } catch (error) {
    console.error("[saas-mobile-server] sop runs PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
