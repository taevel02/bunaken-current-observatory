import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import process from 'node:process';
import {fileURLToPath,URL} from 'node:url';
const mock=`globalThis.fetch=async(url)=>{const path=new URL(url).pathname;const headers={'cache-control':'private, no-store'};let status=200,body='synthetic';if(path==='/api/admin/observations')status=401;if(path==='/api/auth/login')status=403;if(path==='/api/auth/csrf'){status=Number(process.env.SMOKE_CSRF_STATUS);body=JSON.stringify({data:{csrf_token:'synthetic-token'}});if(process.env.SMOKE_COOKIE!=='missing')headers['set-cookie']='__Host-context=synthetic; Path=/; Secure; HttpOnly; SameSite=Lax';}return new Response(body,{status,headers});};`;
function run(status,cookie='present'){
 const result=spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(mock),fileURLToPath(new URL('../scripts/production-smoke.mjs',import.meta.url)),'https://production.example'],{env:{...process.env,SMOKE_CSRF_STATUS:String(status),SMOKE_COOKIE:cookie},encoding:'utf8'});
 return {exit:result.status,body:JSON.parse(result.stdout)};
}
test('production smoke requires successful CSRF contract and cookie, not only cache headers',()=>{
 assert.equal(run(200).exit,0);
 assert.equal(run(503).exit,1);
 assert.equal(run(200,'missing').exit,1);
 assert.equal(run(503).body.ready,false);
});
