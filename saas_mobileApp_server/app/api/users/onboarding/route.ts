import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = auth.user.id;

    const body = await request.json();
    const { 
      propertyId, 
      orgId, 
      role, 
      phone, 
      userName, 
      skills, 
      envOrgId 
    } = body;

    const admin = createAdminClient();
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    let targetOrgId = orgId || envOrgId;
    if (!targetOrgId) {
      const { data: org } = await admin
        .from('organizations')
        .select('id')
        .or(`code.eq.autopilot,name.ilike.%autopilot%`)
        .limit(1)
        .maybeSingle();
      if (org) targetOrgId = org.id;
    }

    let finalPropId = propertyId;
    if (finalPropId === 'default') {
      if (!targetOrgId) {
        return NextResponse.json({ error: 'No organization configured. Please contact support.' }, { status: 400 });
      }
      const { data: rp } = await admin
        .from('properties')
        .select('id')
        .eq('organization_id', targetOrgId)
        .limit(1)
        .maybeSingle();
      if (rp) finalPropId = rp.id;
      else return NextResponse.json({ error: 'No properties found for this organization.' }, { status: 400 });
    }

    if (!targetOrgId || !UUID_REGEX.test(targetOrgId)) {
      return NextResponse.json({ error: 'Invalid organization ID.' }, { status: 400 });
    }
    if (!finalPropId || !UUID_REGEX.test(finalPropId)) {
      return NextResponse.json({ error: 'Invalid property ID.' }, { status: 400 });
    }

    const finalRole = (role === 'staff' && skills?.includes('soft_service_manager'))
      ? 'soft_service_manager'
      : role;

    // Insert property membership
    const { error: memErr } = await admin
      .from('property_memberships')
      .insert({
        user_id: userId,
        organization_id: targetOrgId,
        property_id: finalPropId,
        role: finalRole,
        is_active: true,
      });

    if (memErr && !memErr.message.toLowerCase().includes('duplicate')) {
      return NextResponse.json({ error: memErr.message }, { status: 500 });
    }

    // Vendor record
    if (role === 'vendor') {
      const { data: dbUserRes } = await admin
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .maybeSingle();
      
      const vendorName = dbUserRes?.full_name || userName;
      await admin
        .from('vendors')
        .insert({
          user_id: userId,
          property_id: finalPropId,
          shop_name: `${userName}'s Shop`,
          vendor_name: vendorName,
          commission_rate: 10,
          status: 'active',
        });
        // Ignore dupes implicitly or handle error? Supabase admin won't crash the server.
    }

    // MST skills
    if (skills && skills.length > 0) {
      const skillsToInsert = skills.map((code: string) => ({ user_id: userId, skill_code: code }));
      await admin.from('mst_skills').insert(skillsToInsert);

      // Resolver stats
      const VALID_MST_SKILLS = ['technical', 'plumbing', 'vendor_coord'];
      const VALID_STAFF_SKILLS = ['soft_services'];
      const skillsForResolver = role === 'mst'
        ? skills.filter((s: string) => VALID_MST_SKILLS.includes(s))
        : (role === 'staff' ? skills.filter((s: string) => VALID_STAFF_SKILLS.includes(s)) : []);

      if (skillsForResolver.length > 0) {
        const { data: sgRes } = await admin
          .from('skill_groups')
          .select('id, code')
          .eq('is_active', true)
          .in('code', skillsForResolver);

        if (sgRes && sgRes.length > 0) {
          const stats = sgRes.map(sg => ({
            user_id: userId,
            property_id: finalPropId,
            skill_group_id: sg.id,
            current_floor: 1,
            avg_resolution_minutes: 60,
            total_resolved: 0,
            is_available: true,
          }));
          await admin.from('resolver_stats').insert(stats);
        }
      }
    }

    // Upsert user profile
    const cleanPhone = phone?.trim() || "";
    const profileUpsert: any = {
      id: userId,
      email: auth.user.email ?? '',
      full_name: userName,
      onboarding_completed: true
    };
    if (cleanPhone.length >= 10) profileUpsert.phone = cleanPhone;

    const { error: userErr } = await admin
      .from('users')
      .upsert(profileUpsert, { onConflict: 'id' });

    if (userErr) {
      console.error("[saas-mobile-server] Upsert users error:", userErr);
      return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[saas-mobile-server] POST /api/users/onboarding error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
