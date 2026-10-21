import type { TeamMembershipBaseline } from '../../../src/domain/contracts.ts';
/** Same exact text-ID contract as source-authoritative copy commands. */
const textId = (value: unknown): value is string =>
  typeof value === 'string' && !!value.trim() && value.length <= 128 && !value.includes('\0') && !/[\uD800-\uDFFF]/u.test(value);
/** Cloud identities are UUIDs; device identities remain exact historical text IDs. */
export function validTeamMembershipBaselines(value: unknown, cloud = false): value is TeamMembershipBaseline[] {
  if (!Array.isArray(value)) return false;
  const users = new Set<string>();
  return Array.from(value).every(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.getPrototypeOf(item) !== Object.prototype) return false;
    if (Object.keys(item).some(key => !['userId', 'teamIds'].includes(key)) || !textId(item.userId) || !Array.isArray(item.teamIds)) return false;
    if (cloud && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.userId)) return false;
    const user = cloud ? item.userId.toLowerCase() : item.userId;
    if (users.has(user) || !Array.from(item.teamIds).every(textId) || new Set(item.teamIds).size !== item.teamIds.length) return false;
    users.add(user);
    return true;
  });
}
