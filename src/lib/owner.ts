export const DESIGNATED_OWNER_EMAIL = 'aminy3815@gmail.com';

export function isDesignatedOwnerEmail(email: string | undefined) {
  return email?.trim().toLowerCase() === DESIGNATED_OWNER_EMAIL;
}

export function canAccessOwner(role: string | undefined, email: string | undefined) {
  return role === 'OWNER' && isDesignatedOwnerEmail(email);
}
