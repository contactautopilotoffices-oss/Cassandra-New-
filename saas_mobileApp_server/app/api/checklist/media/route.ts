import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createAnonClient } from "@/lib/supabase/client";
import { getAuthenticatedUser } from "@/lib/auth";

function bucketForType(type: string) {
  return type === "video" ? "sop_videos" : "sop_photos";
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthenticatedUser(request);
    if (auth.response || !auth.user || !auth.token) {
      return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const propertyId = String(formData.get("propertyId") || "");
    const completionId = String(formData.get("completionId") || "");
    const itemId = String(formData.get("itemId") || "");
    const type = String(formData.get("type") || "photo");
    if (!file || !propertyId || !completionId || !itemId) {
      return NextResponse.json({ error: "Missing media fields" }, { status: 400 });
    }

    const bucket = bucketForType(type);
    const fileExt = file.name.split(".").pop() || (type === "video" ? "mp4" : "webp");
    const fileName = `${propertyId}/${completionId}/${itemId}-${Date.now()}.${fileExt}`;
    const supabase = createAnonClient(auth.token);
    const { error } = await supabase.storage.from(bucket).upload(fileName, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || (type === "video" ? "video/mp4" : "image/webp"),
    });
    if (error) return NextResponse.json({ error: "Failed to upload media" }, { status: 500 });

    const { data } = supabase.storage.from(bucket).getPublicUrl(fileName);
    return NextResponse.json({ success: true, url: data.publicUrl, bucket, filePath: fileName });
  } catch (error) {
    console.error("[saas-mobile-server] checklist media POST error:", error);
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
    const type = request.nextUrl.searchParams.get("type") || "photo";
    const bucket = bucketForType(type);
    const marker = `/${bucket}/`;
    const index = urlParam.indexOf(marker);
    if (!urlParam || index === -1) {
      return NextResponse.json({ error: "Invalid media URL" }, { status: 400 });
    }
    const filePath = urlParam.slice(index + marker.length);
    const admin = createAdminClient();
    const { error } = await admin.storage.from(bucket).remove([filePath]);
    if (error) return NextResponse.json({ error: "Failed to delete media" }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[saas-mobile-server] checklist media DELETE error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
