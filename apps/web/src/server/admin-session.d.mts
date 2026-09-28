import type { IronSession } from "iron-session";

export type AdminSessionClaims = {
  sub: string;
  issued_at: number;
  expires_at: number;
  auth_version: string;
  session_id: string;
};

export const ADMIN_SESSION_COOKIE: string;
export const ADMIN_SESSION_SECONDS: number;
export const ADMIN_SUBJECT: string;
export function getAdminSession(): Promise<(IronSession<AdminSessionClaims> & AdminSessionClaims) | null>;
export function createAdminSession(): Promise<IronSession<AdminSessionClaims> & AdminSessionClaims>;
export function destroyAdminSession(): Promise<void>;
