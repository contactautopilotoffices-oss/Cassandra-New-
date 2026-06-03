export interface PropertyInfo {
  id: string;
  name: string;
  code: string;
  role: string;
  image_url?: string | null;
}

export interface UserMembership {
  org_id: string | null;
  org_name: string | null;
  org_role: string | null;
  properties: PropertyInfo[];
}

/** True if the user has access to at least one property. */
export function isPropertyMember(membership: UserMembership | null): boolean {
  return (membership?.properties?.length ?? 0) > 0;
}

/** Returns true if the user's property list contains the given property id. */
export function canAccessProperty(
  membership: UserMembership | null,
  propertyId: string
): boolean {
  return membership?.properties.some((p) => p.id === propertyId) ?? false;
}

/** Returns the user's role for a given property, or null if no access. */
export function getPropertyRole(
  membership: UserMembership | null,
  propertyId: string
): string | null {
  return membership?.properties.find((p) => p.id === propertyId)?.role ?? null;
}
