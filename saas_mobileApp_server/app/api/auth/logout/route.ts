import { NextRequest, NextResponse } from "next/server";
import { getAuthorizedSupabase } from "@/lib/mobileClient";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthorizedSupabase(request);
    if (auth.client) {
      await auth.client.auth.signOut();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] auth/logout error:", error);
    return NextResponse.json({ success: true });
  }
}
