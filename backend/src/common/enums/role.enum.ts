export enum Role {
  DEVELOPER = 'developer',
  TECH_LEAD = 'tech_lead',
  PM = 'pm',
  HR = 'hr',
  ADMIN = 'admin',
}

/**
 * "Manager" here means PM/Tech Lead/Admin — roles that manage people, projects, and skill
 * write-actions. HR is deliberately excluded: HR's access is scoped narrowly to read-only
 * visibility into the skill matrix (see the explicit Role.HR grants on individual endpoints),
 * not general management authority.
 */
export const MANAGER_ROLES = [Role.PM, Role.TECH_LEAD, Role.ADMIN];
