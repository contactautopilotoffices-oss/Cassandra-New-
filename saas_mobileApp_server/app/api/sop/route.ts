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

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get("propertyId");
    const search = searchParams.get("search");
    const category = searchParams.get("category");

    if (!propertyId || propertyId === 'undefined' || propertyId === 'null') {
      return NextResponse.json({ error: 'propertyId is required' }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    let query = admin
      .from("sop_templates")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    if (category) {
      query = query.eq("category", category);
    }

    const { data: sops, error } = await query;

    if (error) {
      console.error("[saas-mobile-server] sop GET error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let filtered = sops ?? [];
    if (search) {
      const term = search.toLowerCase();
      filtered = filtered.filter((s) => 
        (s.title && s.title.toLowerCase().includes(term)) || 
        (s.description && s.description.toLowerCase().includes(term))
      );
    }

    return NextResponse.json({ success: true, sops: filtered });
  } catch (error) {
    console.error("[saas-mobile-server] sop GET error:", error);
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
    const propertyId = body.propertyId || body.property_id;

    if (!propertyId) {
      return NextResponse.json({ error: "Missing property_id" }, { status: 400 });
    }

    if (!(await canManageProperty(auth.user.id, propertyId))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const payload = {
      property_id: propertyId,
      organization_id: body.organizationId || body.organization_id,
      title: body.title,
      description: body.description,
      category: body.category,
      frequency: body.frequency,
      assigned_to: body.assignedRoles || body.assigned_to || [],
      is_active: body.isActive ?? body.is_active ?? true,
    };

    const { data: sop, error } = await admin
      .from("sop_templates")
      .insert(payload)
      .select()
      .single();

    if (error) {
      console.error("[saas-mobile-server] sop POST error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, sop }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] sop POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
