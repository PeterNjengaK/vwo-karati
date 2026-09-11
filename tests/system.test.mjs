import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { openDatabase } from '../server/db.mjs';
import { createApp } from '../server/index.mjs';
import { hashPassword } from '../server/security.mjs';
import { createMpesa } from '../server/mpesa.mjs';
import { normalizeLegacy } from '../server/migration.mjs';
import { mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { prettyDate, csv } from '../web/shared.js';
let server,db,base,admin,registrar;
const origin='http://localhost:3000';
const password='A-test-password-123!';
let checkout=0,queryCode='0';
const env={PUBLIC_ORIGIN:origin,MPESA_MODE:'sandbox',MPESA_CONSUMER_KEY:'test',MPESA_CONSUMER_SECRET:'test',MPESA_SHORTCODE:'174379',MPESA_PASSKEY:'test',MPESA_CALLBACK_SECRET:'a'.repeat(32)};
// HTTPS origin is required to enable Daraja; test request Origin matches this configured value.
env.PUBLIC_ORIGIN='https://church.test';
const member={full_name:'Test Member',phone:'0712345678',gender:'Male',status:'Active',marital_status:'Single',ministry:'Youth',role:'Member'};
async function call(path,{method='GET',body,auth,origin=env.PUBLIC_ORIGIN,csrf=true}={}) {
 const response=await fetch(base+path,{method,headers:{Origin:origin,...(body!==undefined?{'Content-Type':'application/json'}:{}),...(auth?{Cookie:auth.cookie,...(csrf?{'X-CSRF-Token':auth.csrf}:{})}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
}
async function signIn(email){const r=await call('/api/login',{method:'POST',body:{email,password}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf};}
before(async()=>{
 db=openDatabase(':memory:');
 for(const role of ['admin','registrar'])db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run(role,role,role+'@test.org',await hashPassword(password),role);
 server=createApp({db,env,mpesa:{initiate:async()=>({ResponseCode:'0',CheckoutRequestID:'checkout-'+(++checkout)}),query:async()=>({ResultCode:queryCode,ResultDesc:'test result'})}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 admin=await signIn('admin@test.org');registrar=await signIn('registrar@test.org');
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
test('public routes are available while private files and member data are protected',async()=>{
 for(const path of ['/','/about','/programs','/gallery','/give','/contact','/admin','/desktop']) assert.equal((await call(path)).status,200,path);
 for(const path of ['/ChurchRegister/dist/members.json','/data/church.sqlite','/.env','/server/index.mjs','/images/..%2f..%2f.env'])assert.equal((await call(path)).status,404,path);
 assert.equal((await call('/api/members')).status,401);
 const pub=await call('/api/public');assert.equal(pub.status,200);assert.ok(!('members' in pub.data));
 assert.match((await call('/admin')).headers.get('cache-control'),/no-store/);
});
test('staff access, CSRF and request origin are enforced',async()=>{
 assert.equal((await call('/api/admin/users',{auth:registrar})).status,403);
 assert.equal((await call('/api/admin/donations',{auth:registrar})).status,403);
 assert.equal((await call('/api/admin/messages',{auth:registrar})).status,403);
 assert.equal((await call('/api/members',{method:'POST',body:member,auth:admin,csrf:false})).status,403);
 assert.equal((await call('/api/members',{method:'POST',body:member,auth:admin,origin:'https://evil.test'})).status,403);
});
test('closed sessions reject cookie restoration and preserve newer logins',async()=>{
 const old=await signIn('admin@test.org');assert.equal((await call('/api/session',{auth:old,csrf:false})).status,401);
 const newer=await signIn('admin@test.org');
 assert.equal((await call('/api/session/close',{method:'POST',body:{csrf:old.csrf},origin:'https://evil.test'})).status,403);
 assert.equal((await call('/api/session/close',{method:'POST',body:{csrf:old.csrf},auth:newer})).status,200);
 assert.equal((await call('/api/session',{auth:old})).status,401);assert.equal((await call('/api/session',{auth:newer})).status,200);
});
test('gallery uploads stay private until published and reject invalid files',async()=>{
 const image='data:image/jpeg;base64,'+readFileSync('Website/images/logo.jpg').toString('base64');
 const item={kind:'gallery',title:'Uploaded picture',image_data:image,published:false};
 assert.equal((await call('/api/admin/content',{method:'POST',auth:registrar,body:item})).status,403);
 const saved=await call('/api/admin/content',{method:'POST',auth:admin,body:item});assert.equal(saved.status,200);
 const stored=JSON.parse(db.prepare('SELECT data FROM content WHERE id=?').get(saved.data.id).data);
 assert.equal((await call(stored.image)).status,404);
 assert.equal((await call('/api/admin/media/'+stored.image.slice(7),{auth:admin})).data.image,image);
 assert.equal((await call('/api/admin/content',{method:'POST',auth:admin,body:{...stored,id:saved.data.id,kind:'gallery',published:true}})).status,200);
 const response=await fetch(base+stored.image);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/jpeg');assert.deepEqual(Buffer.from(await response.arrayBuffer()),readFileSync('Website/images/logo.jpg'));
 for(const invalid of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/png;base64,YmFk'])assert.equal((await call('/api/admin/content',{method:'POST',auth:admin,body:{...item,image_data:invalid}})).status,400);
});

test('members support create, shared reads, update conflicts, validation and restricted deletion',async()=>{
 const added=await call('/api/members',{method:'POST',body:member,auth:registrar});assert.equal(added.status,201);
 const rows=(await call('/api/members',{auth:admin})).data;const row=rows.find(m=>m.id===added.data.id);assert.equal(row.phone,'254712345678');
 const path='/api/members/'+row.id;
 assert.equal((await call(path,{method:'PUT',body:{...row,role:'Volunteer'},auth:admin})).status,200);
 assert.equal((await call(path,{method:'PUT',body:{...row,role:'Stale edit'},auth:registrar})).status,409);
 assert.equal((await call(path,{method:'DELETE',body:{version:2},auth:registrar})).status,403);
 assert.equal((await call('/api/members',{method:'POST',body:{...member,phone:'wrong'},auth:admin})).status,400);
 assert.equal((await call(path,{method:'DELETE',body:{version:1},auth:admin})).status,409);
 assert.equal((await call(path,{method:'DELETE',body:{version:2},auth:admin})).status,200);
});
test('legacy import preserves marital status, skips duplicates and rolls back invalid batches',async()=>{
 const legacy={...member,status:'Single',photo:'member_photos/test.jpg'};
 assert.equal(normalizeLegacy(legacy).marital_status,'Single');assert.equal(normalizeLegacy(legacy).status,'Active');
 const first=await call('/api/admin/import',{method:'POST',auth:admin,body:{members:[legacy,legacy]}});assert.deepEqual(first.data,{imported:1,skipped:1});
 const second=await call('/api/admin/import',{method:'POST',auth:admin,body:{members:[legacy]}});assert.equal(second.data.skipped,1);
 const before=db.prepare('SELECT COUNT(*) n FROM members').get().n;
 assert.equal((await call('/api/admin/import',{method:'POST',auth:admin,body:{members:[{...legacy,full_name:'Another'}, {...legacy,phone:'bad'}]}})).status,400);
 assert.equal(db.prepare('SELECT COUNT(*) n FROM members').get().n,before);
});
test('draft content is hidden, publishing reaches website, unsafe links are rejected',async()=>{
 const item={title:'A new event',kind:'event',description:'Gather with us',date:'2026-12-01T10:00',published:false};
 const saved=await call('/api/admin/content',{method:'POST',auth:admin,body:item});assert.equal(saved.status,200);
 assert.ok(!(await call('/api/public')).data.content.some(c=>c.id===saved.data.id));
 assert.equal((await call('/api/admin/content',{method:'POST',auth:admin,body:{...item,id:saved.data.id,published:true}})).status,200);
 assert.ok((await call('/api/public')).data.content.some(c=>c.id===saved.data.id));
 assert.equal((await call('/api/admin/content',{method:'POST',auth:admin,body:{...item,url:'javascript:alert(1)'}})).status,400);
});
test('contact messages require consent, reach the private inbox and can be resolved',async()=>{
 const message={name:'Visitor',email:'visitor@test.org',category:'Prayer request',message:'A private prayer request.'};
 assert.equal((await call('/api/messages',{method:'POST',body:message})).status,400);
 assert.equal((await call('/api/messages',{method:'POST',body:{...message,consent:true}})).status,201);
 const rows=(await call('/api/admin/messages',{auth:admin})).data;
 assert.equal(rows[0].message,message.message);
 assert.equal((await call('/api/admin/messages/'+rows[0].id,{method:'PUT',auth:admin,body:{status:'resolved'}})).status,200);
});
test('giving uses idempotency, rejects forged callbacks and confirms using an independent query',async()=>{
 const b={phone:'0712345678',amount:100,purpose:'Offering',request_key:randomUUID()};
 const first=await call('/api/giving',{method:'POST',body:b});assert.equal(first.status,202);assert.equal(first.data.status,'pending');
 const again=await call('/api/giving',{method:'POST',body:b});assert.equal(again.data.id,first.data.id);assert.equal(checkout,1);
 const callback={Body:{stkCallback:{CheckoutRequestID:'checkout-1',ResultCode:0}}};
 assert.equal((await call('/api/mpesa/callback/wrong',{method:'POST',body:callback})).status,404);
 queryCode='1032';
 await call('/api/mpesa/callback/'+env.MPESA_CALLBACK_SECRET,{method:'POST',body:callback});
 assert.equal((await call('/api/giving/'+first.data.id)).data.status,'failed');
 queryCode='0';
 const second=await call('/api/giving',{method:'POST',body:{...b,request_key:randomUUID()}});
 callback.Body.stkCallback.CheckoutRequestID='checkout-2';
 await call('/api/mpesa/callback/'+env.MPESA_CALLBACK_SECRET,{method:'POST',body:callback});
 await call('/api/mpesa/callback/'+env.MPESA_CALLBACK_SECRET,{method:'POST',body:callback});
 assert.equal((await call('/api/giving/'+second.data.id)).data.status,'paid');
 assert.equal((await call('/api/admin/overview',{auth:admin})).data.giving,0,'Sandbox payments must not increase production totals');
});
test('Daraja adapter authenticates and sends the expected STK and query payloads',async()=>{
 const calls=[];const gateway=createMpesa(env,async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>url.includes('oauth')?{access_token:'token'}:{ResponseCode:'0'}};});
 await gateway.initiate({id:'reference12345',phone:'254712345678',amount:250,purpose:'Tithe'});
 const b=JSON.parse(calls[1].options.body);assert.equal(b.Amount,250);assert.equal(b.PhoneNumber,'254712345678');assert.equal(b.TransactionType,'CustomerPayBillOnline');assert.match(b.CallBackURL,/^https:\/\/church.test\/api\/mpesa\/callback\//);assert.equal(b.Timestamp.length,14);assert.equal(calls[1].options.headers.Authorization,'Bearer token');
 await gateway.query('checkout');assert.equal(JSON.parse(calls[3].options.body).CheckoutRequestID,'checkout');
});
test('Kenya dates are stable and spreadsheet formulas are neutralized',()=>{
 assert.match(prettyDate('2026-09-09'),/^9 Sept? 2026$/);
 assert.match(csv([{name:'=HYPERLINK("https://example.org")'}],['name']),/"'=HYPERLINK/);
});
test('deleting seeded website content persists across server restarts',()=>{
 mkdirSync('test-results',{recursive:true});const directory=mkdtempSync('test-results/persistence-');const path=directory+'/church.sqlite';
 let persistent=openDatabase(path);persistent.prepare('DELETE FROM content WHERE id=?').run('men');persistent.close();
 persistent=openDatabase(path);assert.equal(persistent.prepare('SELECT id FROM content WHERE id=?').get('men'),undefined);persistent.close();
});
test('disabled payments are unavailable and interrupted requests stay unknown without duplicate initiation',async()=>{
 for(const mode of ['disabled','sandbox']){
  const local=openDatabase(':memory:');let initiations=0;
  const application=createApp({db:local,env:{...env,MPESA_MODE:mode},mpesa:{initiate:async()=>{initiations++;throw new Error('Connection interrupted');},query:async()=>({})}});
  await new Promise(resolve=>application.listen(0,'127.0.0.1',resolve));
  try{
   const endpoint='http://127.0.0.1:'+application.address().port+'/api/giving';
   const options={method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/json'},body:JSON.stringify({phone:'0712345678',amount:100,purpose:'Tithe',request_key:randomUUID()})};
   const result=await fetch(endpoint,options);const data=await result.json();
   if(mode==='disabled'){assert.equal(result.status,503);assert.equal(initiations,0);}else{assert.equal(result.status,202);assert.equal(data.status,'unknown');const retry=await fetch(endpoint,options);assert.equal((await retry.json()).id,data.id);assert.equal(initiations,1);}
  }finally{await new Promise(resolve=>application.close(resolve));local.close();}
 }
});
test('disabled accounts lose access immediately and password changes invalidate sessions',async()=>{
 assert.equal((await call('/api/admin/users/registrar',{method:'PUT',auth:admin,body:{role:'registrar',active:false}})).status,200);
 assert.equal((await call('/api/session',{auth:registrar})).status,401);
 assert.equal((await call('/api/password',{method:'PUT',auth:admin,body:{current:password,password:'Replacement-password-123!'}})).status,200);
 assert.equal((await call('/api/session',{auth:admin})).status,401);
});
test('mission and leadership initialization preserves later edits and deletions',()=>{
 mkdirSync('test-results',{recursive:true});const directory=mkdtempSync('test-results/leadership-');const path=directory+'/church.sqlite';let store=openDatabase(path);
 const settings=JSON.parse(store.prepare('SELECT data FROM settings WHERE id=1').get().data);assert.equal(settings.mission,'Worship, winning souls, and community');
 settings.mission='Edited mission';store.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(settings));store.prepare('DELETE FROM content WHERE id=?').run('pastor-kamau');store.close();store=openDatabase(path);
 assert.equal(JSON.parse(store.prepare('SELECT data FROM settings WHERE id=1').get().data).mission,'Edited mission');assert.equal(store.prepare('SELECT id FROM content WHERE id=?').get('pastor-kamau'),undefined);store.close();
});
