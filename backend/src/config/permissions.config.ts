export const PERMISSION_CATALOG = {
  user: ["read", "list", "create", "update", "delete"],
} as const satisfies Record<string, readonly string[]>;
