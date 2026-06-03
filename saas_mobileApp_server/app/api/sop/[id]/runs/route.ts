import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: templateId } = await context.params;
    const admin = createAdminClient();

    // Verify the template exists and user has access to property
    const { data: template } = await admin
      .from("sop_templates")
      .select("property_id")
      .eq("id", templateId)
      .single();

    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    const access = await getPropertyAccess(auth.user.id, template.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: runs, error } = await admin
      .from("sop_completions")
      .select("*")
      .eq("template_id", templateId)
      .order("completed_at", { ascending: false });

    if (error) {
      console.error("[saas-mobile-server] sop runs history GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, runs: runs ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] sop runs history GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
