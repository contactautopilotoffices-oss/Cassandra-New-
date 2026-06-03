import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const propertyId = request.nextUrl.searchParams.get("propertyId") ?? request.nextUrl.searchParams.get("property_id");
  if (!propertyId) {
    return NextResponse.json({ authorized: false, error: "propertyId is required" }, { status: 400 });
  }

  const auth = await getAuthenticatedUser(request);
  if (auth.response || !auth.user) {
    return auth.response ?? NextResponse.json({ authorized: false }, { status: 401 });
  }

  const result = await getPropertyAccess(auth.user.id, propertyId);
  return NextResponse.json(result, { status: result.authorized ? 200 : 403 });
}
