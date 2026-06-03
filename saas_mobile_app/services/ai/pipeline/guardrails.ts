/**
 * Guardrails — validation layer between intent and tool execution.
 * Prevents dangerous actions, validates permissions, sanitizes inputs.
 */

export interface GuardrailContext {
  userId: string;
  userRole: string;
  propertyId: string;
  organizationId: string;
}

const BLOCKED_PATTERNS = [
  /delete\s+(all\s+)?(tickets?|rooms?|visitors?|data)/i,
  /drop\s+table/i,
  /truncate/i,
  /drop\s+database/i,
  /modify\s+permissions/i,
  /change\s+(user\s+)?role/i,
  /make\s+me\s+(an?\s+)?admin/i,
  /give\s+(me\s+)?admin/i,
  /access\s+(all\s+)?properties/i,
  /export\s+(all\s+)?data/i,
  /bulk\s+delete/i,
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  tenant: ['list_tickets', 'get_ticket_status', 'list_tickets', 'get_property_info',
            'list_visitors', 'list_meeting_rooms', 'book_meeting_room', 'create_ticket'],
  super_tenant: ['list_tickets', 'get_ticket_status', 'list_tickets', 'get_property_info',
                  'list_visitors', 'list_meeting_rooms', 'book_meeting_room', 'create_ticket'],
  mst: ['list_tickets', 'get_ticket_status', 'list_tickets', 'get_property_info',
         'list_visitors', 'list_meeting_rooms', 'book_meeting_room', 'create_ticket'],
  property_admin: ['*'],
  super_admin: ['*'],
};

const ROLE_WRITE_PERMISSIONS: Record<string, string[]> = {
  tenant: ['create_ticket', 'book_meeting_room'],
  super_tenant: ['create_ticket', 'book_meeting_room'],
  mst: ['list_tickets', 'update_ticket', 'create_ticket', 'list_meeting_rooms', 'book_meeting_room'],
  property_admin: ['*'],
  super_admin: ['*'],
};

export interface GuardrailResult {
  allowed: boolean;
  reason?: string;
}

export function checkGuardrails(
  intent: string,
  toolName: string,
  ctx: GuardrailContext
): GuardrailResult {
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(intent)) {
      return { allowed: false, reason: `Action blocked: suspicious pattern detected.` };
    }
  }

  const role = (ctx.userRole ?? 'tenant').toLowerCase();
  const allowedTools = ROLE_PERMISSIONS[role] ?? ROLE_PERMISSIONS['tenant'];

  if (!allowedTools.includes('*') && !allowedTools.includes(toolName)) {
    return { allowed: false, reason: `${role} role cannot use "${toolName}"` };
  }

  const writeTools = ROLE_WRITE_PERMISSIONS[role] ?? [];
  const readOnlyTools = ['list_tickets', 'get_ticket_status', 'get_property_info',
                          'list_visitors', 'list_meeting_rooms'];

  if (!writeTools.includes('*') && writeTools.length > 0) {
    const isWriteTool = !readOnlyTools.includes(toolName);
    if (isWriteTool && !writeTools.includes(toolName)) {
      return { allowed: false, reason: `${role} role cannot perform write action "${toolName}"` };
    }
  }

  return { allowed: true };
}

export function sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      sanitized[key] = value
        .replace(/<[^>]*>/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim();
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}
