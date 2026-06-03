import { NextRequest, NextResponse } from "next/server";
import { createAnonClient } from "@/lib/supabase/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, getPropertyAccess } from "@/lib/auth";
import { classifyTicketEnhanced, logClassification, resolveClassification } from "@/lib/ticketing";
import { deleteCache } from "@/lib/cache";

function extractFloorNumber(description: string): number | null {
  const lowerDesc = description.toLowerCase();
  if (
    lowerDesc.includes("ground floor") ||
    lowerDesc.includes("grourd floor") ||
    lowerDesc.includes("groud floor") ||
    lowerDesc.includes("floor 0") ||
    lowerDesc.includes("level 0")
  ) {
    return 0;
  }
  if (lowerDesc.includes("basement") || lowerDesc.includes("b1")) return -1;
  if (lowerDesc.includes("b2")) return -2;

  const floorPatterns = [/(\d+)(?:st|nd|rd|th)\s*floor/i, /floor\s*(\d+)/i, /(\d+)\s*floor/i, /level\s*(\d+)/i];
  for (const pattern of floorPatterns) {
    const match = description.match(pattern);
    if (match) return parseInt(match[1], 10);
  }
  return null;
}

function extractLocation(description: string): string | null {
  const locations: Record<string, string[]> = {
    Cafeteria: ["cafeteria", "canteen", "pantry", "kitchen", "mess"],
    Reception: ["lobby", "reception", "front desk", "entrance"],
    Parking: ["parking", "basement", "garage"],
    Terrace: ["terrace", "roof", "rooftop"],
    Washroom: ["washroom", "restroom", "toilet", "bathroom", "loo"],
    "Conference Room": ["conference", "meeting room", "board room"],
    Cabin: ["cabin", "cubicle", "desk", "workstation"],
    "Server Room": ["server room", "data center", "hub room"],
    "Electrical Room": ["electrical room", "ups room", "dg room"]
  };

  const lowerDesc = description.toLowerCase();
  for (const [location, keywords] of Object.entries(locations)) {
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${keyword}\\b`, "i");
      if (regex.test(lowerDesc)) return location;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.response || !auth.user || !auth.token) {
    return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient(auth.token);
  const searchParams = request.nextUrl.searchParams;
  const propertyId = searchParams.get("propertyId") || searchParams.get("property_id");
  const organizationId = searchParams.get("organizationId") || searchParams.get("organization_id");
  const status = searchParams.get("status");
  const assignedTo = searchParams.get("assignedTo");
  const raisedBy = searchParams.get("raisedBy") || searchParams.get("raised_by");
  const limitParam = searchParams.get("limit");
  const offsetParam = searchParams.get("offset");
  const internalOnly = searchParams.get("internalOnly") === "true";
  const materialsRequired = searchParams.get("materialsRequired") === "true";
  const slaBreached = searchParams.get("slaBreached");
  const dateFrom = searchParams.get("dateFrom");
  const dateTo = searchParams.get("dateTo");
  const search = searchParams.get("search");
  const raisedByRole = searchParams.get("raisedByRole");

  let query = supabase
    .from("tickets")
    .select(
      `
      id, ticket_number, title, description, status, priority, created_at, internal, raised_by, assigned_to,
      resolved_at, property_id, organization_id, photo_before_url, photo_after_url,
      category:issue_categories(id, code, name),
      skill_group:skill_groups(id, code, name),
      creator:users!raised_by(id, full_name, email, user_photo_url, property_memberships(role, property_id)),
      assignee:users!assigned_to(id, full_name, email, user_photo_url),
      property:properties(id, name, code),
      ticket_escalation_logs(from_level, to_level, escalated_at, from_employee:users!from_employee_id(full_name, user_photo_url), to_employee:users!to_employee_id(full_name, user_photo_url))
      `,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(
      offsetParam ? parseInt(offsetParam, 10) : 0,
      (offsetParam ? parseInt(offsetParam, 10) : 0) + (limitParam ? parseInt(limitParam, 10) : 100) - 1
    );

  if (propertyId) query = query.eq("property_id", propertyId);
  if (organizationId) query = query.eq("organization_id", organizationId);
  if (status) query = status.includes(",") ? query.in("status", status.split(",").map((value) => value.trim())) : query.eq("status", status);
  if (assignedTo) query = query.eq("assigned_to", assignedTo);
  if (raisedBy) query = query.eq("raised_by", raisedBy);
  if (internalOnly) query = query.eq("internal", true);
  
  if (slaBreached === 'true') {
    query = query
      .or(`sla_deadline.lt.${new Date().toISOString()},sla_breached.eq.true`)
      .not('status', 'in', '("resolved","closed")');
  } else if (slaBreached === 'false') {
    query = query.or(`sla_deadline.gte.${new Date().toISOString()},sla_deadline.is.null,status.in.("resolved","closed")`);
  }

  if (dateFrom) {
    const fromStr = dateFrom.includes('T') ? dateFrom : `${dateFrom}T00:00:00+05:30`;
    query = query.gte('created_at', fromStr);
  }
  if (dateTo) {
    const toStr = dateTo.includes('T') ? dateTo : `${dateTo}T23:59:59+05:30`;
    query = query.lte('created_at', toStr);
  }

  if (search) {
    query = query.or(`ticket_number.ilike.%${search}%,title.ilike.%${search}%`);
  }

  if (raisedByRole) {
    let membershipQuery;
    if (propertyId) {
      membershipQuery = supabase
        .from('property_memberships')
        .select('user_id')
        .eq('property_id', propertyId)
        .eq('role', raisedByRole)
        .eq('is_active', true);
    } else if (organizationId) {
      membershipQuery = supabase
        .from('property_memberships')
        .select('user_id, properties!inner(organization_id)')
        .eq('properties.organization_id', organizationId)
        .eq('role', raisedByRole)
        .eq('is_active', true);
    } else {
      membershipQuery = supabase
        .from('property_memberships')
        .select('user_id')
        .eq('role', raisedByRole)
        .eq('is_active', true);
    }

    const { data: members, error: memberError } = await membershipQuery;
    if (memberError) {
      console.error('[saas-mobile-server] Error fetching members by role:', memberError);
    } else if (members && members.length > 0) {
      const userIds = [...new Set(members.map((m: any) => m.user_id))];
      query = query.in('raised_by', userIds);
    } else {
      return NextResponse.json({ tickets: [], total: 0 });
    }
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[saas-mobile-server] ticket list error:", error);
    return NextResponse.json({ error: "Failed to fetch tickets" }, { status: 500 });
  }

  return NextResponse.json({
    tickets: data ?? [],
    total: typeof count === "number" ? count : (data?.length ?? 0)
  });
}

export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.response || !auth.user || !auth.token) {
    return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient(auth.token);
  const admin = createAdminClient();
  const body = await request.json();
  const description = body.description;
  const title = body.title;
  const propertyId = body.property_id || body.propertyId;
  const organizationId = body.organization_id || body.organizationId;
  const isInternal = body.is_internal ?? body.isInternal ?? false;
  const explicitPriority = body.priority ?? null;
  const assignedTo = body.assignedTo ?? body.assigned_to ?? null;

  if (!description || !propertyId || !organizationId) {
    return NextResponse.json(
      { error: "Missing required fields: description, propertyId, organizationId" },
      { status: 400 }
    );
  }

  const access = await getPropertyAccess(auth.user.id, propertyId);
  if (!access.authorized) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const preClassification = classifyTicketEnhanced(title || description);
  let categoryId: string | null = null;
  let skillGroupId: string | null = null;
  let priority = explicitPriority || "medium";
  let slaHours = 24;

  if (preClassification.issue_code) {
    const { data: preCategory } = await admin
      .from("issue_categories")
      .select("id, skill_group_id, priority, sla_hours")
      .eq("code", preClassification.issue_code)
      .limit(1)
      .maybeSingle();

    if (preCategory) {
      categoryId = preCategory.id;
      skillGroupId = preCategory.skill_group_id;
      priority = explicitPriority || preCategory.priority || "medium";
      slaHours = preCategory.sla_hours || 24;
    }
  }

  const resolution = await resolveClassification(title || description, priority);
  if (resolution.issue_code && resolution.issue_code !== preClassification.issue_code) {
    const { data: category } = await admin
      .from("issue_categories")
      .select("id, skill_group_id, priority, sla_hours")
      .eq("code", resolution.issue_code)
      .limit(1)
      .maybeSingle();

    if (category) {
      categoryId = category.id;
      skillGroupId = category.skill_group_id;
      priority = explicitPriority || category.priority || priority;
      slaHours = category.sla_hours || slaHours;
    }
  }

  if (!skillGroupId) {
    const { data: fallbackSkillGroup } = await admin
      .from("skill_groups")
      .select("id, code")
      .eq("code", resolution.skill_group)
      .limit(1)
      .maybeSingle();

    if (fallbackSkillGroup) {
      skillGroupId = fallbackSkillGroup.id;
    }
  }

  const floorNumber = extractFloorNumber(description);
  const location = extractLocation(description);
  const slaDeadline = new Date(Date.now() + slaHours * 60 * 60 * 1000).toISOString();

  const insertPayload = {
    title: title || description.slice(0, 120),
    description,
    property_id: propertyId,
    organization_id: organizationId,
    raised_by: auth.user.id,
    assigned_to: assignedTo,
    internal: isInternal,
    status: assignedTo ? "assigned" : "open",
    priority: explicitPriority || resolution.priority?.toLowerCase() || priority,
    category_id: categoryId,
    skill_group_id: skillGroupId,
    skill_group_code: resolution.skill_group,
    floor_number: floorNumber,
    location,
    classification_source: resolution.decisionSource,
    classification_confidence: resolution.confidence,
    classification_zone: resolution.zone,
    enhanced_classification: resolution.enhancedClassification,
    risk_flag: resolution.risk_flag ?? null,
    llm_reasoning: resolution.llm_reasoning ?? null,
    sla_deadline: slaDeadline
  };

  const { data: ticket, error } = await supabase.from("tickets").insert(insertPayload).select("*").single();
  if (error || !ticket) {
    console.error("[saas-mobile-server] ticket create error:", error);
    return NextResponse.json({ error: error?.message || "Failed to create ticket" }, { status: 500 });
  }

  await logClassification(ticket.id, resolution);
  
  // Invalidate cache for dashboard
  await deleteCache(`dashboard:${propertyId}:${auth.user.id}`);

  return NextResponse.json(
    {
      success: true,
      ticket,
      classification: {
        issue_code: resolution.issue_code,
        skill_group: resolution.skill_group,
        confidence: resolution.confidence,
        decisionSource: resolution.decisionSource,
        priority: resolution.priority || insertPayload.priority,
        risk_flag: resolution.risk_flag ?? null,
        reasoning: resolution.llm_reasoning ?? null,
        enhancedClassification: resolution.enhancedClassification,
        zone: resolution.zone
      }
    },
    { status: 201 }
  );
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthenticatedUser(request);
  if (auth.response || !auth.user || !auth.token) {
    return auth.response ?? NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAnonClient(auth.token);
  const body = await request.json();
  const ticketIds = body.ticketIds;
  const assignedTo = body.assignedTo;

  if (!ticketIds || !Array.isArray(ticketIds) || ticketIds.length === 0 || !assignedTo) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("tickets")
    .update({ assigned_to: assignedTo, updated_at: new Date().toISOString() })
    .in("id", ticketIds);

  if (error) {
    console.error("[saas-mobile-server] ticket bulk update error:", error);
    return NextResponse.json({ error: "Failed to bulk update tickets" }, { status: 500 });
  }

  return NextResponse.json({ success: true }, { status: 200 });
}
