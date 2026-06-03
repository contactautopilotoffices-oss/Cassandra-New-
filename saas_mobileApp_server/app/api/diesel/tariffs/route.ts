import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth";
import { canManageProperty } from "@/lib/authorization";

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const generatorId = request.nextUrl.searchParams.get("generatorId");
    if (!generatorId) return NextResponse.json({ error: "Missing generatorId" }, { status: 400 });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("dg_tariffs")
      .select("*")
      .eq("generator_id", generatorId)
      .order("effective_from", { ascending: false });

    if (error) return NextResponse.json({ error: "Failed to fetch tariffs" }, { status: 500 });
    return NextResponse.json({ tariffs: data ?? [] });
  } catch (error) {
    console.error("[saas-mobile-server] diesel tariffs GET error:", error);
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
    if (!body.generator_id || !body.effective_from || !body.cost_per_litre) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const admin = createAdminClient();

    // Close previous active tariff
    const prevDate = new Date(body.effective_from);
    prevDate.setDate(prevDate.getDate() - 1);
    await admin
      .from("dg_tariffs")
      .update({ effective_to: prevDate.toISOString().split("T")[0] })
      .eq("generator_id", body.generator_id)
      .is("effective_to", null);

    // Insert new tariff
    const { data, error } = await admin
      .from("dg_tariffs")
      .insert({
        generator_id: body.generator_id,
        cost_per_litre: body.cost_per_litre,
        effective_from: body.effective_from,
        effective_to: body.effective_to ?? null,
        created_by: auth.user.id,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: "Failed to create tariff" }, { status: 500 });
    return NextResponse.json({ tariff: data }, { status: 201 });
  } catch (error) {
    console.error("[saas-mobile-server] diesel tariffs POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
