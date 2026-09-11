import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,randomBytes} from 'node:crypto';
import {hashPassword} from '../server/security.mjs';
const db=new DatabaseSync('/opt/vwo/data/church.sqlite');
const id=randomUUID(),email=`deployment-${id}@example.invalid`,password=randomBytes(32).toString('hex');
const base='https://vwokarati.com';
try {
  db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run(id,'Deployment verification',email,await hashPassword(password),'admin');
  const response=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email,password})});
  assert.equal(response.status,200);
  const result=await response.json(),cookie=response.headers.get('set-cookie');
  assert.match(cookie,/Secure/);assert.match(cookie,/HttpOnly/);
  const headers={Origin:base,Cookie:cookie.split(';')[0],'X-CSRF-Token':result.csrf};
  assert.equal((await fetch(base+'/api/members',{headers})).status,200);
  assert.equal((await fetch(base+'/api/session',{headers:{Cookie:headers.Cookie}})).status,401);
  const publicData=await (await fetch(base+'/api/public')).json();
  for(const row of publicData.content.filter(c=>c.image))assert.equal((await fetch(new URL(row.image,base))).status,200);
  await fetch(base+'/api/session/close',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({csrf:result.csrf})});
  assert.equal((await fetch(base+'/api/session',{headers})).status,401);
  for(const origin of ['http://vwokarati.com','https://www.vwokarati.com'])assert.equal((await fetch(origin,{redirect:'manual'})).headers.get('location'),base+'/');
  console.log('PASS: live login, secure cookie, private access, image delivery, close revocation, and canonical redirects.');
} finally {
  db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  db.close();
}
