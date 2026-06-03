import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const admin = createAdminClient();
    
    // Get user details
    const { data: dbUser } = await admin
      .from('users')
      .select('full_name, phone')
      .eq('id', auth.user.id)
      .maybeSingle();

    // Check voice enrollment
    const { data: emb } = await admin
      .from('user_voice_embeddings')
      .select('id')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    return NextResponse.json({
      success: true,
      user: {
        full_name: dbUser?.full_name || null,
        phone: dbUser?.phone || null,
      },
      voiceEnrolled: !!emb
    });
  } catch (error) {
    console.error("[saas-mobile-server] GET /api/users/onboarding/init error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
