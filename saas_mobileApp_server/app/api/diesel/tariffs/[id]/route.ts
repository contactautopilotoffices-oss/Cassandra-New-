import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";

export async function DELETE(request: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tariffId = params.id;
    if (!tariffId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const admin = createAdminClient();

    // Get the tariff to find its generator_id
    const { data: tariff, error: fetchError } = await admin
      .from("dg_tariffs")
      .select("generator_id")
      .eq("id", tariffId)
      .single();

    if (fetchError || !tariff) return NextResponse.json({ error: "Tariff not found" }, { status: 404 });

    // Delete it
    const { error: deleteError } = await admin.from("dg_tariffs").delete().eq("id", tariffId);
    if (deleteError) return NextResponse.json({ error: "Failed to delete tariff" }, { status: 500 });

    // Reopen previous tariff if exists
    const { data: prevTariff } = await admin
      .from("dg_tariffs")
      .select("id")
      .eq("generator_id", tariff.generator_id)
      .order("effective_from", { ascending: false })
      .limit(1)
      .single();

    if (prevTariff) {
      await admin.from("dg_tariffs").update({ effective_to: null }).eq("id", prevTariff.id);
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[saas-mobile-server] diesel tariffs DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
