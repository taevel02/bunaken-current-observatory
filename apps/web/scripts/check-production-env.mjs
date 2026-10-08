/** Never prints credentials. Run with production variables loaded by the operator. */
import { getAdminAuthConfig } from '../src/server/admin-config.mjs';
import { Buffer } from 'node:buffer';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
const env=process.env;
const required=['ADMIN_USERNAME','ADMIN_PASSWORD_HASH','ADMIN_AUTH_VERSION','SESSION_SECRET','IDEMPOTENCY_SECRET','PUBLIC_OBSERVER_ID','GITHUB_WRITE_TOKEN','GITHUB_OWNER','GITHUB_REPO','CANONICAL_ORIGIN'];
const missing=required.filter(key=>!env[key]?.trim());
const errors=[];
if (!getAdminAuthConfig({...env,VERCEL_ENV:'production'}).enabled) errors.push('admin_configuration_invalid_or_disabled');
try { const origin=new URL(env.CANONICAL_ORIGIN);if(origin.protocol!=='https:'||origin.origin!==env.CANONICAL_ORIGIN)errors.push('canonical_https_origin_required'); } catch {errors.push('canonical_origin_invalid');}
if(env.PUBLIC_OBSERVER_ID===env.ADMIN_USERNAME)errors.push('public_observer_must_differ_from_login');
if(env.IDEMPOTENCY_SECRET===env.SESSION_SECRET)errors.push('separate_idempotency_secret_required');
if(!/^[A-Za-z0-9_-]{43}$/.test(env.IDEMPOTENCY_SECRET??'')||Buffer.from(env.IDEMPOTENCY_SECRET??'','base64url').length!==32)errors.push('idempotency_secret_invalid');
if(env.GITHUB_DATA_BRANCH && env.GITHUB_DATA_BRANCH!=='data')errors.push('data_branch_required');
if(env.VERCEL_ENV && env.VERCEL_ENV!=='production')errors.push('production_environment_required');
const forbidden=Object.keys(env).filter(key=>/^NEXT_PUBLIC_.*(TOKEN|SECRET|PASSWORD|ADMIN|IDEMPOTENCY)/.test(key));
if(forbidden.length)errors.push('public_credential_variable_forbidden');
console.log(JSON.stringify({ready:!missing.length&&!errors.length,missing,errors}));
process.exitCode=missing.length||errors.length?1:0;
