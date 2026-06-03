import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const propertyId = String(formData.get("propertyId") || "");
    const submissionId = String(formData.get("submissionId") || "");

    if (!file || !propertyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const fileExt = file.name.split(".").pop() || "jpg";
    const fileName = `${propertyId}/${submissionId || Date.now()}/${Date.now()}.${fileExt}`;

    const { error: uploadError } = await admin.storage
      .from("audit-proofs")
      .upload(fileName, file, {
        contentType: file.type || "image/jpeg",
        upsert: false,
      });

    if (uploadError) {
      console.error("[saas-mobile-server] audit media POST error:", uploadError);
      return NextResponse.json({ error: uploadError.message || "Upload failed" }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from("audit-proofs").getPublicUrl(fileName);
    return NextResponse.json({ success: true, url: urlData.publicUrl, filePath: fileName });
  } catch (error) {
    console.error("[saas-mobile-server] audit media POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const urlParam = request.nextUrl.searchParams.get("url") || "";
    const propertyId = request.nextUrl.searchParams.get("propertyId") || "";

    if (!urlParam || !propertyId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const access = await getPropertyAccess(auth.user.id, propertyId);
    if (!access.authorized) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const admin = createAdminClient();
    const marker = "/audit-proofs/";
    const index = urlParam.indexOf(marker);
    if (index === -1) {
      return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
    }
    const filePath = urlParam.slice(index + marker.length);

    const { error } = await admin.storage.from("audit-proofs").remove([filePath]);
    if (error) {
      return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] audit media DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
