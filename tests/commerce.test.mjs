import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../server/db.mjs';
import {commerce,commerceData} from '../server/commerce.mjs';
test('paid content requires payment setup and sponsorship requires explicit approval',()=>{
 assert.throws(()=>commerceData({kind:'product',published:true,accepting:true,price:50},{}));
 assert.throws(()=>commerceData({kind:'sponsor',published:true},{}));
 const data={};commerceData({kind:'product',published:true,accepting:true,price:0.29,payment_instructions:'Contact office'},data);assert.equal(data.price,0.29);
 assert.throws(()=>commerceData({kind:'ticket',price:-1},{}));
});
test('requests reject drafts and price tampering, deduplicate retries, and protect stale status changes',()=>{
 const db=openDatabase(':memory:'),shop=commerce(db);
 const item={title:'Book',price:250,accepting:true};db.prepare('INSERT INTO content VALUES(?,?,?,?)').run('book','product',JSON.stringify(item),0);
 const b={content_id:'book',request_key:randomUUID(),name:'Visitor',email:'visitor@example.org',phone:'0712345678',quantity:2,amount:1,consent:true};
 assert.throws(()=>shop.create(b));db.prepare('UPDATE content SET published=1 WHERE id=?').run('book');
 const result=shop.create(b);assert.equal(shop.create(b).id,result.id);assert.equal(shop.list().length,1);assert.equal(shop.list()[0].total,500);
 assert.throws(()=>shop.update(result.id,{version:1,status:'paid'}));shop.update(result.id,{version:1,status:'paid',payment_reference:'Verified-office-reference'});
 assert.throws(()=>shop.update(result.id,{version:1,status:'cancelled'}));assert.equal(shop.list()[0].status,'paid');
 db.prepare('UPDATE content SET data=? WHERE id=?').run(JSON.stringify({...item,accepting:false}),'book');assert.throws(()=>shop.create({...b,request_key:randomUUID()}));db.close();
});
