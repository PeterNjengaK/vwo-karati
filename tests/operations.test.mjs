import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {openDatabase} from '../server/db.mjs';
import {hashPassword} from '../server/security.mjs';
import {createApp} from '../server/index.mjs';
import {eventCalendar} from '../server/calendar.mjs';
let db,server,base,admin,registrar,memberId,serviceId,taskId,temp;
const origin='http://localhost:3000';
const password='Operations-password-123!';
async function call(path,{auth=admin,method='GET',body}={}){
 const response=await fetch(base+path,{method,headers:{Origin:origin,...(auth?{Cookie:auth.cookie,'X-CSRF-Token':auth.csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
 const bytes=Buffer.from(await response.arrayBuffer());let data;try{data=JSON.parse(bytes);}catch{data=bytes;}return {status:response.status,data,headers:response.headers};
}
before(async()=>{
 mkdirSync('test-results',{recursive:true});temp=mkdtempSync('test-results/operations-');db=openDatabase(':memory:');
 for(const role of ['admin','registrar'])db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run(role,role,role+'@test.org',await hashPassword(password),role);
 server=createApp({db,env:{PUBLIC_ORIGIN:origin,DATABASE_PATH:temp+'/church.sqlite'}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));base='http://127.0.0.1:'+server.address().port;
 for(const role of ['admin','registrar']){const r=await call('/api/login',{auth:null,method:'POST',body:{email:role+'@test.org',password}});const auth={cookie:r.headers.get('set-cookie').split(';')[0],csrf:r.data.csrf};if(role==='admin')admin=auth;else registrar=auth;}
});
after(async()=>{await new Promise(resolve=>server.close(resolve));db.close();});
test('member contact and milestone fields are stored, dates and email validated',async()=>{
 const today=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
 const member={full_name:'Care Member',phone:'0712345678',status:'Active',email:'member@test.org',address:'Karati',birth_date:'2000'+today.slice(4),baptism_date:'2020-01-01'};
 const r=await call('/api/members',{method:'POST',body:member});assert.equal(r.status,201);memberId=r.data.id;
 const rows=(await call('/api/members',{auth:registrar})).data;assert.equal(rows[0].address,'Karati');assert.equal(rows[0].birth_date,member.birth_date);
 assert.equal((await call('/api/members',{method:'POST',body:{...member,birth_date:'2025-02-30'}})).status,400);
 assert.equal((await call('/api/members',{method:'POST',body:{...member,email:'bad'}})).status,400);
});
test('attendance is shared, deduplicated, validated, and protected from stale updates',async()=>{
 const r=await call('/api/services',{method:'POST',auth:registrar,body:{title:'Sunday gathering',service_date:'2026-09-06'}});assert.equal(r.status,201);serviceId=r.data.id;
 const body={title:'Sunday gathering',service_date:'2026-09-06',member_ids:[memberId,memberId],visitors:3,notes:'Welcome visitors',version:1};
 assert.equal((await call('/api/services/'+serviceId,{method:'PUT',body})).status,200);
 assert.equal((await call('/api/services/'+serviceId,{method:'PUT',auth:registrar,body})).status,409);
 const service=(await call('/api/services/'+serviceId)).data;assert.deepEqual(service.member_ids,[memberId]);assert.equal(service.version,2);
 assert.equal((await call('/api/services/'+serviceId,{method:'PUT',body:{...body,version:2,member_ids:['missing']}})).status,400);
 assert.equal((await call('/api/services/'+serviceId,{method:'DELETE',auth:registrar,body:{version:2}})).status,403);
 assert.equal((await call('/api/member-history/'+memberId,{auth:registrar})).data.length,1);
 assert.equal((await call('/api/services',{auth:null})).status,401);
});
test('care tasks remain admin-only and use version checks',async()=>{
 const task={title:'Arrange welcome visit',member_id:memberId,assigned_to:'admin',due_date:'2026-09-15',priority:'urgent',status:'open',notes:'Private care notes'};
 assert.equal((await call('/api/admin/care',{method:'POST',auth:registrar,body:task})).status,403);
 const r=await call('/api/admin/care',{method:'POST',body:task});assert.equal(r.status,200);taskId=r.data.id;
 assert.equal((await call('/api/admin/care',{auth:registrar})).status,403);
 assert.equal((await call('/api/admin/care',{method:'POST',body:{...task,id:taskId,version:1,status:'done'}})).status,200);
 assert.equal((await call('/api/admin/care',{method:'POST',body:{...task,id:taskId,version:1}})).status,409);
 assert.equal((await call('/api/admin/care')).data[0].member_name,'Care Member');
});
test('reports separate real giving, count visits, and include upcoming birthdays',async()=>{
 const r=await call('/api/admin/reports?from=2026-09-01&to=2026-09-30');assert.equal(r.status,200);assert.equal(r.data.services[0].members_present,1);assert.equal(r.data.services[0].visitors,3);assert.equal(r.data.birthdays.length,1);assert.equal(r.data.birthdays[0].days,0);
 assert.equal((await call('/api/admin/reports?from=2026-10-01&to=2026-09-01')).status,400);
 assert.equal((await call('/api/admin/reports',{auth:registrar})).status,403);
});
test('admin backups download as a restorable database and are denied to registrars',async()=>{
 const r=await call('/api/admin/backups',{method:'POST',body:{}});assert.equal(r.status,201);
 const file=await call('/api/admin/backups/'+r.data.name);assert.equal(file.status,200);assert.equal(file.data.subarray(0,15).toString(),'SQLite format 3');
 writeFileSync(temp+'/restored.sqlite',file.data);const restored=openDatabase(temp+'/restored.sqlite');assert.equal(restored.prepare('SELECT COUNT(*) n FROM attendance').get().n,1);assert.equal(restored.prepare('SELECT COUNT(*) n FROM care_tasks').get().n,1);restored.close();
 assert.equal((await call('/api/admin/backups/'+r.data.name,{auth:registrar})).status,403);
 assert.equal((await call('/api/admin/backups',{method:'POST',auth:registrar,body:{}})).status,403);
 assert.equal((await call('/api/admin/backups/%2e%2e%2f.env')).status,404);
 assert.ok((await call('/api/admin/audit')).data.rows.some(a=>a.action==='backup.created'));
});
test('public calendars are correctly escaped, use Kenya time, and hide drafts',async()=>{
 const event={title:'Gathering, together',kind:'event',description:'Line one\nSUMMARY:Injected',date:'2026-09-20T10:00',published:false};
 const r=await call('/api/admin/content',{method:'POST',body:event});assert.equal((await call('/api/calendar/'+r.data.id,{auth:null})).status,404);
 await call('/api/admin/content',{method:'POST',body:{...event,id:r.data.id,published:true}});
 const calendar=(await call('/api/calendar/'+r.data.id,{auth:null})).data.toString();assert.match(calendar,/DTSTART:20260920T070000Z/);assert.match(calendar,/SUMMARY:Gathering\\, together/);assert.equal(calendar.split('\r\n').filter(l=>l.startsWith('SUMMARY:')).length,1);
 const long=eventCalendar({id:'test',...event,description:'é'.repeat(200)},{address:'Karati'});assert.ok(long.split('\r\n').every(line=>Buffer.byteLength(line)<=75));
});
test('deleting a member removes attendance links and keeps the care task without a dangling member',async()=>{
 const m=(await call('/api/members')).data.find(m=>m.id===memberId);assert.equal((await call('/api/members/'+memberId,{method:'DELETE',body:{version:m.version}})).status,200);
 assert.equal((await call('/api/services/'+serviceId)).data.member_ids.length,0);assert.equal((await call('/api/admin/care')).data[0].member_id,null);
});
