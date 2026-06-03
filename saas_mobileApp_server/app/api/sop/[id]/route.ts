import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sopId } = await context.params;
    const admin = createAdminClient();

    const { data: sop, error } = await admin
      .from("sop_templates")
      .select("*")
      .eq("id", sopId)
      .single();

    if (error || !sop) {
      return NextResponse.json({ error: error?.message || "SOP not found" }, { status: 404 });
    }

    const access = await getPropertyAccess(auth.user.id, sop.property_id);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: steps } = await admin
      .from("sop_checklist_items")
      .select("*")
      .eq("template_id", sopId)
      .order("order_index", { ascending: true });

    return NextResponse.json({ success: true, sop, steps: steps ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] sop GET by id error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sopId } = await context.params;
    const body = await request.json();
    const admin = createAdminClient();

    const { data: sop } = await admin
      .from("sop_templates")
      .select("property_id")
      .eq("id", sopId)
      .single();

    if (!sop) return NextResponse.json({ error: "SOP not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, sop.property_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const payload: any = {};
    if (body.title !== undefined) payload.title = body.title;
    if (body.description !== undefined) payload.description = body.description;
    if (body.category !== undefined) payload.category = body.category;
    if (body.frequency !== undefined) payload.frequency = body.frequency;
    if (body.assignedRoles !== undefined) payload.assigned_to = body.assignedRoles;
    if (body.isActive !== undefined) payload.is_active = body.isActive;

    const { data: updatedSop, error } = await admin
      .from("sop_templates")
      .update(payload)
      .eq("id", sopId)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] sop PATCH error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sop: updatedSop });
  } catch (error) {
    console.error("[saas-mobile-server] sop PATCH error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sopId } = await context.params;
    const admin = createAdminClient();

    const { data: sop } = await admin
      .from("sop_templates")
      .select("property_id")
      .eq("id", sopId)
      .single();

    if (!sop) return NextResponse.json({ error: "SOP not found" }, { status: 404 });
    if (!(await canManageProperty(auth.user.id, sop.property_id))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { error } = await admin
      .from("sop_templates")
      .update({ is_active: false })
      .eq("id", sopId);

    if (error) {
      console.error("[saas-mobile-server] sop DELETE error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] sop DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
