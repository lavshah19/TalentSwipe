// Every resource/action pair the API checks with authorize(resource, action).
export const PERMISSION_CATALOG = {
  user: ["read", "list", "create", "update", "delete"],
  company: ["read", "create", "update"],
  job: ["read", "list", "create", "update"],
  candidate: ["read", "update"],
  resume: ["read", "create"],
  swipe: ["create"],
  match: ["read", "list", "update"],
  message: ["read", "create"],
  notification: ["read", "update"],
  admin: ["read", "update"],
} as const satisfies Record<string, readonly string[]>;

type Catalog = typeof PERMISSION_CATALOG;

// A role's grants: any subset of the catalog. Typos in resource or action fail to compile.
export type RolePermissions = { [R in keyof Catalog]?: readonly Catalog[R][number][] };

// Ownership (e.g. "only your own company's jobs") is checked in services, not here.
export const RECRUITER_PERMISSIONS = {
  company: ["read", "create", "update"],
  job: ["read", "list", "create", "update"],
  candidate: ["read"],
  swipe: ["create"],
  match: ["read", "list", "update"],
  message: ["read", "create"],
  notification: ["read", "update"],
} as const satisfies RolePermissions;

export const JOB_SEEKER_PERMISSIONS = {
  candidate: ["read", "update"],
  resume: ["read", "create"],
  job: ["read", "list"],
  swipe: ["create"],
  match: ["read", "list", "update"], // update = withdraw
  message: ["read", "create"],
  notification: ["read", "update"],
} as const satisfies RolePermissions;
