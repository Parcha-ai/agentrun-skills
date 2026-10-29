import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install, digest } from '../scripts/install.mjs';
import { status, login, credential, main } from '../scripts/cli.mjs';
const source='https://console.example/agentrun-skills', origin='https://api.example';
const response=value=>new Response(JSON.stringify(value));
async function home(t){const dir=await fs.mkdtemp(path.join(os.tmpdir(),'agentrun-skills-test-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));return dir;}
function release(content='first',extra=[]){
 const raw=JSON.stringify({version:'0.1.0',files:[{path:'skills/agentrun/SKILL.md',content},{path:'scripts/cli.mjs',content:'// cli'},{path:'scripts/install.mjs',content:'// install'},...extra]});
 const sha256=digest(raw);return {raw,manifest:{version:'0.1.0',sha256,bundle:`${sha256}.json`}};
}
function server(bundle){return async(url,options)=>{assert.equal(options.redirect,'error');if(url===`${source}/manifest.json`)return response(bundle.manifest);assert.equal(url,`${source}/${bundle.manifest.bundle}`);return new Response(bundle.raw);};}
test('updates managed skills while preserving user-owned skills and credentials',async t=>{
 const dir=await home(t),userSkill=path.join(dir,'.claude/skills/agentrun');
 await fs.mkdir(userSkill,{recursive:true});await fs.writeFile(path.join(userSkill,'SKILL.md'),'user-owned');
 const first=await install({source,home:dir,fetcher:server(release())});assert.deepEqual(first.skipped,[userSkill]);
 assert.equal(await fs.readFile(path.join(dir,'.codex/skills/agentrun/SKILL.md'),'utf8'),'first');
 const secret=path.join(dir,'.agentrun-skills/credentials');await fs.mkdir(secret);await fs.writeFile(path.join(secret,'saved'),'keep');
 const next=await install({source,home:dir,fetcher:server(release('updated'))});assert.equal(next.updated,true);
 assert.equal(await fs.readFile(path.join(dir,'.agents/skills/agentrun/SKILL.md'),'utf8'),'updated');
 assert.equal(await fs.readFile(path.join(userSkill,'SKILL.md'),'utf8'),'user-owned');assert.equal(await fs.readFile(path.join(secret,'saved'),'utf8'),'keep');
 assert.equal((await install({source,home:dir,fetcher:server(release('updated'))})).updated,false);
});
test('rejects corrupt and traversing bundles without changing installed release',async t=>{
 const dir=await home(t),good=release();await install({source,home:dir,fetcher:server(good)});
 await assert.rejects(install({source,home:dir,fetcher:server({...good,raw:good.raw+' '})}),/checksum/);
 await assert.rejects(install({source,home:dir,fetcher:server(release('bad',[{path:'../outside',content:'bad'}]))}),/Unsafe/);
 assert.equal(await fs.readFile(path.join(dir,'.agentrun-skills/current/skills/agentrun/SKILL.md'),'utf8'),'first');
});
test('refuses modified releases and foreign current links',async t=>{
 const dir=await home(t);await install({source,home:dir,fetcher:server(release())});
 await fs.writeFile(path.join(dir,'.agentrun-skills/current/scripts/cli.mjs'),'user modification');
 await assert.rejects(install({source,home:dir,fetcher:server(release())}),/modified/);
 await fs.unlink(path.join(dir,'.agentrun-skills/current'));await fs.symlink('../user-folder',path.join(dir,'.agentrun-skills/current'));
 await assert.rejects(install({source,home:dir,fetcher:server(release('next'))}),/not managed/);
 assert.equal(await fs.readlink(path.join(dir,'.agentrun-skills/current')),'../user-folder');
});
test('rejects credentials for another environment before sending them',async t=>{
 await assert.rejects(status({origin,home:await home(t),env:{AGENTRUN_API_KEY:'secret',AGENTRUN_API_ORIGIN:'https://wrong.example'},fetcher:()=>assert.fail('must not send')}),/origin mismatch/);
});
test('verifies read-only quota without exposing arbitrary upstream fields',async t=>{
 const result=await status({origin,home:await home(t),env:{AGENTRUN_API_KEY:'secret',AGENTRUN_API_ORIGIN:origin},fetcher:async(url,options)=>{
 assert.equal(url,`${origin}/api/v2/quota`);assert.equal(options.headers.Authorization,'Bearer secret');assert.equal(options.redirect,'error');
 return response({credits_remaining:8,credit_quota:10,credits_used_this_period:2,access_token:'secret'});}});
 assert.equal(result.ready,true);assert.equal(result.quota.credits_used_this_period,2);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('permission failure never falls back to signup or another identity',async t=>{
 let count=0;const result=await status({origin,home:await home(t),env:{AGENTRUN_API_KEY:'secret',AGENTRUN_API_ORIGIN:origin},fetcher:async()=>{count++;return new Response('',{status:403});}});
 assert.equal(count,1);assert.equal(result.status,'permission_required');assert.equal(result.ready,false);
});
test('missing issuer reports setup-required and cannot claim headless login',async t=>{
 const options={origin,home:await home(t),env:{},fetcher:async url=>{assert.equal(url,`${origin}/.well-known/oauth-protected-resource/api/v2`);return response({resource:`${origin}/api/v2`});}};
 assert.equal((await status(options)).status,'setup_required');await assert.rejects(login(options),/advertised OAuth issuer/);
});
test('headless OAuth uses correct audience and saves an expiring private token for this origin',async t=>{
 const dir=await home(t),secretFile=path.join(dir,'client.json');await fs.writeFile(secretFile,JSON.stringify({client_secret:'private secret'}),{mode:0o600});
 const result=await login({origin,home:dir,secretFile,env:{AGENTRUN_CLIENT_ID:'client'},fetcher:async(url,options)=>{
 assert.equal(options.redirect,'error');
 if(url.includes('oauth-protected-resource'))return response({resource:`${origin}/api/v2`,authorization_servers:['https://identity.example']});
 if(url.includes('oauth-authorization-server'))return response({issuer:'https://identity.example',grant_types_supported:['client_credentials'],token_endpoint:'https://identity.example/token'});
 if(url.endsWith('/token')){assert.equal(new URLSearchParams(options.body).get('resource'),`${origin}/api/v2`);assert.equal(Buffer.from(options.headers.Authorization.slice(6),'base64').toString(),'client:private+secret');return response({access_token:'issued-token',token_type:'Bearer',expires_in:60});}
 assert.equal(url,`${origin}/api/v2/quota`);assert.equal(options.headers.Authorization,'Bearer issued-token');return response({credits_remaining:5});}});
 assert.equal(result.ready,true);assert.ok(!JSON.stringify(result).includes('issued-token'));
 const file=path.join(dir,'.agentrun-skills/credentials',`${digest(origin)}.json`);assert.equal((await fs.stat(file)).mode & 0o777,0o600);
 assert.equal((await credential({origin,home:dir,env:{}})).token,'issued-token');assert.equal(await credential({origin:'https://other.example',home:dir,env:{}}),null);
 const saved=JSON.parse(await fs.readFile(file));saved.expires_at=Date.now()-1;await fs.writeFile(file,JSON.stringify(saved));assert.equal(await credential({origin,home:dir,env:{}}),null);
});
test('unsupported grant is rejected before reading or sending a secret',async t=>{
 await assert.rejects(login({origin,home:await home(t),env:{},secretFile:'/does-not-exist',fetcher:async url=>url.includes('protected-resource')?response({resource:`${origin}/api/v2`,authorization_servers:['https://identity.example']}):response({issuer:'https://identity.example',grant_types_supported:['authorization_code']})}),/does not advertise/);
});
test('failed update stops ensure before authentication',async t=>{
 let count=0;await assert.rejects(main(['ensure','--source',source,'--api-origin',origin],{home:await home(t),env:{},fetcher:async()=>{count++;return new Response('',{status:503});}}),/HTTP 503/);assert.equal(count,1);
});
