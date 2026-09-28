export type AdminAuthConfig = {
  enabled: true;
  username: string;
  passwordHash: string;
  authVersion: string;
  sessionSecret: string;
} | {
  enabled: false;
  reason: "disabled" | "invalid_settings";
  missingKeys?: string[];
  invalidKeys?: string[];
};

export function getAdminAuthConfig(env?: Readonly<Record<string, string | undefined>>): AdminAuthConfig;
