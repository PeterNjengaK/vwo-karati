import {randomUUID} from 'node:crypto';
import {fail,string,email,phone,safeUrl} from './security.mjs';
export const commerceKinds=['project','ticket','product','sponsor'];
export function commerceData(b,data){
 if(!commerceKinds.includes(b.kind))return;
 for(const key of ['price','goal','raised']){const n=Number(b[key]||0);if(!Number.isFinite(n)||n<0||n>100000000||Math.abs(Math.round(n*100)-n*100)>0.000001)fail(400,'Use a valid money amount with up to two decimal places.');data[key]=n;}
 data.payment_instructions=string(b.payment_instructions||'','Payment instructions',2000,false);
 data.checkout_url=safeUrl(b.checkout_url);
 data.location=string(b.location||'','Location / fulfilment',300,false);
 data.accepting=b.accepting===true||b.accepting==='on';
 if(b.kind==='sponsor'&&b.published&&!(b.approved===true||b.approved==='on'))fail(400,'Confirm church approval before publishing a sponsor.');
 data.approved=b.approved===true||b.approved==='on';
 if(['ticket','product'].includes(b.kind)&&data.price>0&&data.accepting&&b.published&&!data.payment_instructions&&!data.checkout_url)fail(400,'Add payment instructions or an HTTPS checkout link before accepting paid requests.');
}
export function commerce(db){
 db.exec(`CREATE TABLE IF NOT EXISTS commerce_requests(id TEXT PRIMARY KEY,request_key TEXT UNIQUE NOT NULL,content_id TEXT NOT NULL,kind TEXT NOT NULL,title TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,phone TEXT NOT NULL,quantity INTEGER NOT NULL,total REAL NOT NULL,status TEXT NOT NULL DEFAULT 'pending',payment_reference TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1);`);
 return {
  create(b){
   const key=string(b.request_key,'Request key',80);if(!/^[a-f0-9-]{36}$/.test(key))fail(400,'Invalid request key.');
   const prior=db.prepare('SELECT id FROM commerce_requests WHERE request_key=?').get(key);if(prior)return prior;
   const row=db.prepare('SELECT * FROM content WHERE id=? AND published=1').get(string(b.content_id,'Item',80));
   if(!row||!['project','ticket','product'].includes(row.kind))fail(404,'This item is not available.');
   const item=JSON.parse(row.data);if(!item.accepting)fail(409,'Requests are closed for this item.');
   if(row.kind==='ticket'&&item.date){const end=Date.parse(item.date.length===10?item.date+'T23:59:59+03:00':item.date+':00+03:00');if(end<Date.now())fail(409,'Registration for this event has ended.');}
   if(b.consent!==true)fail(400,'Please consent to the church processing your request.');
   const quantity=row.kind==='project'?1:Number(b.quantity||1);if(!Number.isSafeInteger(quantity)||quantity<1||quantity>20)fail(400,'Choose a quantity from 1 to 20.');
   const total=row.kind==='project'?Number(b.amount):Math.round(Number(item.price||0)*quantity*100)/100;
   if(!Number.isFinite(total)||total<0||(row.kind==='project'&&total<1)||total>100000000)fail(400,'Enter a valid amount.');
   const id=randomUUID();db.prepare('INSERT INTO commerce_requests(id,request_key,content_id,kind,title,name,email,phone,quantity,total,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,key,row.id,row.kind,item.title,string(b.name,'Name',150),email(b.email),phone(b.phone),quantity,total,new Date().toISOString());return {id};
  },
  list(){return db.prepare('SELECT * FROM commerce_requests ORDER BY created_at DESC LIMIT 500').all();},
  update(id,b){
   if(!['pending','confirmed','paid','completed','cancelled'].includes(b.status))fail(400,'Invalid request status.');
   const reference=string(b.payment_reference||'','Payment reference',150,false),notes=string(b.notes||'','Office notes',2000,false);
   if(b.status==='paid'&&!reference)fail(400,'Enter a verified payment reference before marking paid.');
   const row=db.prepare('SELECT version FROM commerce_requests WHERE id=?').get(id);if(!row)fail(404,'Request not found.');
   if(row.version!==b.version)fail(409,'This request changed. Reopen it before saving.');
   db.prepare('UPDATE commerce_requests SET status=?,payment_reference=?,notes=?,version=version+1 WHERE id=?').run(b.status,reference,notes,id);
  }
 };
}
