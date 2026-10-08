/** Read-only HTTPS deployment checks. No cookies, credential bodies or IPs in output. */
import {performance} from 'node:perf_hooks';
import process from 'node:process';
import console from 'node:console';
import { URL } from 'node:url';
const {fetch,AbortSignal}=globalThis;
const args=process.argv.slice(2);const raw=args[0];const origin=new URL(raw);
if(origin.protocol!=='https:'||origin.origin!==raw)throw new Error('canonical_https_origin_required');
const checks=[];
for(const path of ['/?lang=ko','/?lang=en','/research?lang=ko','/research?lang=en','/api/auth/csrf','/api/admin/observations']){
 const start=performance.now();const response=await fetch(raw+path,{redirect:'manual',signal:AbortSignal.timeout(30_000)});
 const cache=response.headers.get('cache-control')??'';
 checks.push({path,status:response.status,elapsed_ms:Math.round(performance.now()-start),private_no_store:path.startsWith('/api/')?/private/.test(cache)&&/no-store/.test(cache):null});
 if(path==='/api/auth/csrf'){
  let body;try{body=await response.json();}catch{body=null;}
  checks.at(-1).csrf_contract_valid=response.status===200&&typeof body?.data?.csrf_token==='string'&&body.data.csrf_token.length>0&&response.headers.has('set-cookie');
 }else await response.arrayBuffer();
}
let originPass=true;
if(args.includes('--rate-limit')){
 const statuses=[];
 for(let index=0;index<11;index++){
  const response=await fetch(raw+'/api/auth/login',{method:'POST',headers:{origin:raw,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30_000)});
  statuses.push(response.status);await response.arrayBuffer();
 }
 const limited=statuses.slice(0,10).every(status=>status!==429)&&statuses[10]===429;
 checks.push({path:'waf_post_limit',statuses,limited});
 checks.push({path:'foreign_origin_login',skipped:'separate_fresh_ip_or_after_5_minutes_required'});
}else{
 const foreign=await fetch(raw+'/api/auth/login',{method:'POST',headers:{origin:'https://invalid.example','content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(30_000)});
 originPass=foreign.status===403;checks.push({path:'foreign_origin_login',status:foreign.status});
}
const ready=checks.filter(c=>c.path.startsWith('/?')||c.path.startsWith('/research')).every(c=>c.status===200)
 &&checks.find(c=>c.path==='/api/admin/observations').status===401
 &&checks.find(c=>c.path==='/api/auth/csrf').csrf_contract_valid
 &&checks.filter(c=>c.path.startsWith('/api/')).every(c=>c.private_no_store)
 &&originPass&&(!args.includes('--rate-limit')||checks.find(c=>c.path==='waf_post_limit').limited);
console.log(JSON.stringify({origin:raw,ready,checks},null,2));process.exitCode=ready?0:1;
