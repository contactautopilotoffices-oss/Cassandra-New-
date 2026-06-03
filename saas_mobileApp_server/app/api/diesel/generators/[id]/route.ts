import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: generatorId } = await context.params;
    const body = await request.json();

    const admin = createAdminClient();

    // Verify ownership
    const { data: gen } = await admin
      .from("generators")
      .select("property_id")
      .eq("id", generatorId)
      .single();

    if (!gen) return NextResponse.json({ error: "Generator not found" }, { status: 404 });

    const hasAccess = await canManageProperty(auth.user.id, gen.property_id);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await admin
      .from("generators")
      .update(body)
      .eq("id", generatorId)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] generators PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, generator: data });
  } catch (error) {
    console.error("[saas-mobile-server] generators PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: generatorId } = await context.params;
    const admin = createAdminClient();

    // Verify ownership
    const { data: gen } = await admin
      .from("generators")
      .select("property_id")
      .eq("id", generatorId)
      .single();

    if (!gen) return NextResponse.json({ error: "Generator not found" }, { status: 404 });

    const hasAccess = await canManageProperty(auth.user.id, gen.property_id);
    if (!hasAccess) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await admin
      .from("generators")
      .delete()
      .eq("id", generatorId);

    if (error) {
      console.error("[saas-mobile-server] generators DELETE error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] generators DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
