import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: companyId } = await context.params;
    const body = await request.json();
    const { user_id, action } = body; // action: 'add' | 'remove'

    if (!user_id || !action) {
      return NextResponse.json({ error: "User ID and action are required" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Fetch company to get property_id and organization_id
    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("property_id, organization_id")
      .eq("id", companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 });
    }

    // Check authorization
    const hasAccess = await canManageProperty(auth.user.id, company.property_id);
    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (action === "remove") {
      const { error } = await admin
        .from("company_members")
        .delete()
        .eq("company_id", companyId)
        .eq("user_id", user_id);

      if (error) {
        console.error("[saas-mobile-server] members remove error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true });
    } else {
      // Add member
      const { data, error } = await admin
        .from("company_members")
        .upsert({
          company_id: companyId,
          user_id: user_id,
          organization_id: company.organization_id,
          role: "member"
        })
        .select()
        .single();

      if (error) {
        console.error("[saas-mobile-server] members add error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({ success: true, member: data });
    }
  } catch (error) {
    console.error("[saas-mobile-server] companies/[id]/members POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
