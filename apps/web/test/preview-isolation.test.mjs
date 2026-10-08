import test from 'node:test';
import assert from 'node:assert/strict';
import {getAdminAuthConfig} from '../src/server/admin-config.mjs';
test('preview and Vercel development deny admin despite production credentials',()=>{
 for(const VERCEL_ENV of ['preview','development'])assert.deepEqual(getAdminAuthConfig({ADMIN_ENABLED:'true',VERCEL_ENV}),{enabled:false,reason:'disabled'});
 assert.equal(getAdminAuthConfig({ADMIN_ENABLED:'true',VERCEL_ENV:'production'}).reason,'invalid_settings');
});
