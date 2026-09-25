import {channelFeeds} from './channels.mjs';
import {commerce,commerceData} from './commerce.mjs';
import {trafficAnalytics} from './traffic.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { openDatabase } from './db.mjs';
import { checkPassword, hashPassword, token, digest, fail, string, phone, email, memberData, safeUrl } from './security.mjs';
import { createMpesa, paymentConfig } from './mpesa.mjs';
import { normalizeLegacy } from './migration.mjs';
import { officeOperations } from './operations.mjs';
import { eventCalendar } from './calendar.mjs';
import { uploadedImage } from './media.mjs';
const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const date=()=>new Date().toISOString();
export function createApp({db=openDatabase(),env=process.env,mpesa=createMpesa(env)}={}) {
  const origin=env.PUBLIC_ORIGIN||'http://localhost:3000';
  const production=env.NODE_ENV==='production';
  if(production&&!origin.startsWith('https://')) throw new Error('Production requires an HTTPS PUBLIC_ORIGIN.');
  const audit=(actor,action,target='')=>db.prepare('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)').run(actor,action,target,date());
  const operations=officeOperations({db,env,audit});
  const traffic=trafficAnalytics(db);
  const shop=commerce(db);
  const youtubeFeed=channelFeeds();
  const contentRows=rows=>rows.map(r=>({id:r.id,kind:r.kind,published:!!r.published,...JSON.parse(r.data)}));
  const members=()=>db.prepare('SELECT * FROM members ORDER BY created_at DESC').all().map(r=>({id:r.id,...JSON.parse(r.data),version:r.version,created_at:r.created_at,updated_at:r.updated_at}));
  function limit(key,max,ms) {
    const now=Date.now();
    db.prepare('DELETE FROM limits WHERE expires<?').run(now);
    const row=db.prepare('SELECT * FROM limits WHERE key=?').get(key);
    if(row&&row.count>=max) fail(429,'Too many attempts. Please try again later.');
    db.prepare('INSERT INTO limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+ms);
  }
  async function body(req) {
    if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'Send JSON data.');
    let size=0, chunks=[];
    for await(const chunk of req) { size+=chunk.length; if(size>8*1024*1024) fail(413,'Upload is too large (maximum 8 MB).'); chunks.push(chunk); }
    try {const data=JSON.parse(Buffer.concat(chunks).toString()); if(!data||typeof data!=='object'||Array.isArray(data)) fail(400,'Expected a JSON object.'); return data;} catch(error) {if(error.status) throw error; fail(400,'Invalid JSON.');}
  }
  function session(req) {
    const raw=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('vwo_session='))?.slice(12);
    if(!raw) fail(401,'Please sign in to continue.');
    const row=db.prepare('SELECT u.id,u.name,u.email,u.role,s.csrf,s.token FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(digest(raw),Date.now());
    if(!row) fail(401,'Your session has expired. Please sign in again.');
    return row;
  }
  function updateMember(id,b,user) {
    const data=memberData(b), current=db.prepare('SELECT version FROM members WHERE id=?').get(id);
    if(!current) fail(404,'Member not found.');
    if(b.version!==current.version) fail(409,'This member was updated elsewhere. Refresh and try again.');
    db.prepare('UPDATE members SET data=?, version=version+1, updated_at=? WHERE id=?').run(JSON.stringify(data),date(),id);
    audit(user.id,'member.updated',id);
  }
  async function reconcile(row) {
    if(!row||!row.checkout||!['pending','unknown'].includes(row.status)) return row;
    if(row.mode!==env.MPESA_MODE) fail(409,'This request belongs to a different M-Pesa environment. Reconcile it in the original environment.');
    const result=await mpesa.query(row.checkout);
    if(String(result.ResultCode)==='0') db.prepare("UPDATE donations SET status='paid',note='Confirmed by M-Pesa status query' WHERE id=? AND status IN ('pending','unknown')").run(row.id);
    else if(['1032','1037','1','2001'].includes(String(result.ResultCode))) db.prepare("UPDATE donations SET status='failed',note=? WHERE id=? AND status IN ('pending','unknown')").run(String(result.ResultDesc||'Payment was not completed.').slice(0,500),row.id);
    return db.prepare('SELECT * FROM donations WHERE id=?').get(row.id);
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; font-src 'self'; frame-src 'self' https://maps.google.com https://www.google.com https://www.youtube-nocookie.com https://www.facebook.com https://www.tiktok.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if(production) res.setHeader('Strict-Transport-Security','max-age=31536000');
    const send=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
    try {
      const url=new URL(req.url,origin), path=url.pathname, method=req.method;
      const peer=req.socket.remoteAddress||'unknown';
      const proxyIp=req.headers['x-real-ip'];
      const ip=env.TRUST_LOCAL_PROXY==='true'&&['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer)&&typeof proxyIp==='string'&&isIP(proxyIp)?proxyIp:peer;
      if(path==='/api/channel/youtube'&&method==='GET'){
        const settings=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data);
        try{return send(await youtubeFeed(settings.youtube));}catch{return send({items:[],error:'YouTube is temporarily unavailable. Please try again or open the channel.'},503);}
      }
      if(path==='/channel/tiktok'&&method==='GET'){
        const settings=JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data);
        let handle='';try{const u=new URL(settings.tiktok);if(u.protocol==='https:'&&['www.tiktok.com','tiktok.com'].includes(u.hostname))handle=u.pathname.match(/^\/@([\w.-]+)\/?$/)?.[1]||'';}catch{}
        if(!handle)fail(404,'TikTok channel is not configured.');
        res.setHeader('X-Frame-Options','SAMEORIGIN');
        res.setHeader('Content-Security-Policy',"default-src 'none'; script-src https://www.tiktok.com https://lf16-tiktok-web.tiktokcdn-us.com; style-src 'unsafe-inline' https://lf16-tiktok-web.tiktokcdn-us.com; img-src https: data:; frame-src https://www.tiktok.com; connect-src https://www.tiktok.com; frame-ancestors 'self'; base-uri 'none'");
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});return res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>TikTok church videos</title></head><body><blockquote class="tiktok-embed" cite="https://www.tiktok.com/@${handle}" data-unique-id="${handle}" data-embed-type="creator"><section><a target="_blank" rel="noopener" href="https://www.tiktok.com/@${handle}">View @${handle} on TikTok</a></section></blockquote><script async src="https://www.tiktok.com/embed.js"></script></body></html>`);
      }
      if(path==='/api/health'&&method==='GET') return send({ok:true});
      if(!path.startsWith('/api/')) {
        if(method!=='GET'&&method!=='HEAD') fail(405,'Method not allowed.');
        if(/^\/media\/[a-f0-9-]{36}$/.test(path)) {
          const media=db.prepare("SELECT m.mime,m.bytes FROM media m WHERE m.id=? AND EXISTS(SELECT 1 FROM content c WHERE c.published=1 AND json_extract(c.data,'$.image')=?)").get(path.slice(7),path);
          if(!media)fail(404,'Image not found.');res.writeHead(200,{'Content-Type':media.mime});return res.end(method==='HEAD'?undefined:media.bytes);
        }
        if(path==='/downloads/VWO-Church-Office-Setup.exe') {
          const bytes=await readFile(resolve(root,'ChurchRegister/release/VWO-Church-Office-Setup.exe'));
          res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':'attachment; filename="VWO-Church-Office-Setup.exe"'});return res.end(method==='HEAD'?undefined:bytes);
        }
        const aliases={'/':'index.html','/index.html':'index.html','/watch':'index.html','/about':'index.html','/about.html':'index.html','/programs':'index.html','/programs.html':'index.html','/gallery':'index.html','/Gallery.html':'index.html','/contact':'index.html','/contacts.html':'index.html','/give':'index.html','/projects':'index.html','/events':'index.html','/shop':'index.html','/partners':'index.html','/privacy':'index.html','/admin':'admin.html','/desktop':'admin.html'};
        let file;
        if(path.startsWith('/images/')) {
          const name=decodeURIComponent(path.slice(8));
          if(!/^[\w.-]+\.(jpg|jpeg|png|webp|ico)$/i.test(name)) fail(404,'Not found.');
          file=resolve(root,'Website/images',name);
        } else {
          const name=aliases[path]||path.slice(1);
          if(!['index.html','admin.html','styles.css','site.js','admin.js','shared.js','office-features.js','content-editor.js','commerce-public.js','watch.js','public-extras.js','install.js','office.webmanifest','office-icon-192.svg','office-icon-512.svg'].includes(name)) fail(404,'Not found.');
          file=resolve(root,'web',name);
        }
        const data=await readFile(file);
        try{traffic.record(req,path,ip);}catch{/* Analytics must not interrupt the public site. */}
        const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
        res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});return res.end(method==='HEAD'?undefined:data);
      }
      const callback=path.startsWith('/api/mpesa/callback/');
      if(!['GET','HEAD'].includes(method)&&!callback&&req.headers.origin!==origin) fail(403,'This request must come from the church website.');
      if(path==='/api/public'&&method==='GET') return send({settings:JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data),content:contentRows(db.prepare('SELECT * FROM content WHERE published=1 ORDER BY rowid').all()),giving:paymentConfig(env)});
      if(/^\/api\/calendar\/[\w-]+$/.test(path)&&method==='GET'){
        const row=db.prepare("SELECT * FROM content WHERE id=? AND kind='event' AND published=1").get(path.split('/').pop());if(!row)fail(404,'Event not found.');
        const calendar=eventCalendar({id:row.id,...JSON.parse(row.data)},JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data));
        res.writeHead(200,{'Content-Type':'text/calendar; charset=utf-8','Content-Disposition':'attachment; filename="vwo-event.ics"'});return res.end(calendar);
      }
      if(path==='/api/login'&&method==='POST') {
        limit('login:'+ip,10,15*60000);
        const b=await body(req), address=email(b.email), password=string(b.password,'Password',200);
        const user=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(address);
        const fallback='0'.repeat(32)+':'+ '0'.repeat(128);
        if(!await checkPassword(password,user?.password||fallback)||!user) fail(401,'Email or password is incorrect.');
        const raw=token(),csrf=token();
        db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
        db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(raw),user.id,csrf,Date.now()+30*60000);
        res.setHeader('Set-Cookie',`vwo_session=${raw}; HttpOnly; SameSite=Strict; Path=/${production?'; Secure':''}`);
        audit(user.id,'session.login');
        return send({user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf});
      }
      if(path==='/api/session/close'&&method==='POST') {
        const b=await body(req),key=string(b.csrf,'Session key',64);
        const closing=db.prepare('SELECT user_id,token FROM sessions WHERE csrf=?').get(key);
        if(closing){db.prepare('DELETE FROM sessions WHERE token=?').run(closing.token);audit(closing.user_id,'session.closed');}
        // Do not clear a cookie: a different window may have signed in while this beacon was in flight.
        return send({ok:true});
      }
      if(path==='/api/commerce/requests'&&method==='POST'){limit('commerce:'+ip,12,3600000);return send(shop.create(await body(req)),201);}
      if(path==='/api/messages'&&method==='POST') {
        limit('message:'+ip,5,3600000);
        const b=await body(req); if(b.consent!==true) fail(400,'Please consent to the church responding to your message.');
        if(!['General enquiry','Prayer request','Plan a visit','Join a ministry'].includes(b.category)) fail(400,'Select a message category.');
        db.prepare('INSERT INTO messages(id,name,email,category,message,created_at) VALUES(?,?,?,?,?,?)').run(randomUUID(),string(b.name,'Name',150),email(b.email),b.category,string(b.message,'Message',4000),date());
        return send({message:'Thank you. Your message has reached the church office.'},201);
      }
      if(path==='/api/giving'&&method==='POST') {
        limit('giving:'+ip,5,3600000);
        const b=await body(req), mobile=phone(b.phone);
        if(!Number.isSafeInteger(b.amount)||b.amount<1||b.amount>150000) fail(400,'Enter a whole amount between KES 1 and 150,000.');
        if(!['Offering','Tithe','Missions','Church development'].includes(b.purpose)) fail(400,'Select a valid giving purpose.');
        const key=string(b.request_key,'Request ID',80); if(!/^[\w-]{20,80}$/.test(key)) fail(400,'Invalid request ID.');
        if(!paymentConfig(env).enabled) fail(503,'Online giving is not yet available. Please contact the church office.');
        const existing=db.prepare('SELECT * FROM donations WHERE request_key=?').get(key);
        if(existing) {if(existing.phone!==mobile||existing.amount!==b.amount||existing.purpose!==b.purpose) fail(409,'This request ID has already been used.'); return send({id:existing.id,status:existing.status});}
        const id=token();
        db.prepare('INSERT INTO donations(id,request_key,phone,amount,purpose,mode,status,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id,key,mobile,b.amount,b.purpose,env.MPESA_MODE,'pending',date());
        try {
          const result=await mpesa.initiate({id,phone:mobile,amount:b.amount,purpose:b.purpose});
          if(String(result.ResponseCode)!=='0'||!result.CheckoutRequestID) {
            db.prepare("UPDATE donations SET status='failed',note='M-Pesa did not accept the request' WHERE id=?").run(id);
            fail(502,'M-Pesa did not accept this request. Please try again later.');
          }
          db.prepare('UPDATE donations SET checkout=? WHERE id=?').run(result.CheckoutRequestID,id);
        } catch(error) {
          db.prepare("UPDATE donations SET status='unknown',note='Request interrupted; reconcile before retrying' WHERE id=? AND status='pending'").run(id);
          return send({id,status:db.prepare('SELECT status FROM donations WHERE id=?').get(id).status,message:'We could not confirm the request. Keep this page open and contact the office before retrying.'},202);
        }
        return send({id,status:'pending',message:'Check your phone for the M-Pesa prompt.'},202);
      }
      if(/^\/api\/giving\/[a-f0-9]{64}$/.test(path)&&method==='GET') {
        const id=path.split('/').pop(); limit('status:'+ip,120,60000);
        const row=db.prepare('SELECT * FROM donations WHERE id=?').get(id); if(!row) fail(404,'Payment not found.');
        return send({id:row.id,status:row.status,purpose:row.purpose,amount:row.amount,mode:row.mode});
      }
      if(callback&&method==='POST') {
        if(!paymentConfig(env).enabled||path!==`/api/mpesa/callback/${env.MPESA_CALLBACK_SECRET}`) fail(404,'Not found.');
        const b=await body(req), c=b.Body?.stkCallback;
        if(!c||typeof c.CheckoutRequestID!=='string') fail(400,'Invalid callback.');
        let row=db.prepare('SELECT * FROM donations WHERE checkout=?').get(c.CheckoutRequestID);
        if(row&&['pending','unknown'].includes(row.status)) {
          // Callbacks are only a trigger. Confirm the outcome with authenticated Daraja query.
          try {row=await reconcile(row);} catch {return send({ResultCode:1,ResultDesc:'Please retry'},503);}
        }
        return send({ResultCode:0,ResultDesc:'Accepted'});
      }
      const user=session(req);
      // A cookie alone cannot resume a closed window. This proof exists only in the signed-in page's memory.
      if(['GET','HEAD'].includes(method)&&req.headers['x-csrf-token']!==user.csrf)fail(401,'Please sign in in this window.');
      if(!['GET','HEAD'].includes(method)&&req.headers['x-csrf-token']!==user.csrf) fail(403,'Session verification failed. Refresh the page.');
      if(await operations({path,method,url,req,res,user,body,send}))return;
      if(path==='/api/session'&&method==='GET') return send({user:{id:user.id,name:user.name,email:user.email,role:user.role},csrf:user.csrf});
      if(path==='/api/logout'&&method==='POST') {db.prepare('DELETE FROM sessions WHERE token=?').run(user.token);res.setHeader('Set-Cookie','vwo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return send({ok:true});}
      if(path==='/api/password'&&method==='PUT') {
        limit('password:'+user.id,5,15*60000);
        const b=await body(req), password=string(b.password,'New password',200);
        if(password.length<12) fail(400,'Use at least 12 characters.');
        if(!await checkPassword(string(b.current,'Current password',200),db.prepare('SELECT password FROM users WHERE id=?').get(user.id).password)) fail(400,'Current password is incorrect.');
        db.prepare('UPDATE users SET password=? WHERE id=?').run(await hashPassword(password),user.id);
        db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);audit(user.id,'password.changed');return send({ok:true});
      }
      if(path==='/api/members'&&method==='GET') return send(members());
      if(path==='/api/members'&&method==='POST') {
        const b=await body(req),data=memberData(b), id=randomUUID();
        db.prepare('INSERT INTO members VALUES(?,?,1,?,?)').run(id,JSON.stringify(data),date(),date());audit(user.id,'member.created',id);return send({id},201);
      }
      if(/^\/api\/members\/[\w-]+$/.test(path)) {
        const id=path.split('/').pop();
        if(method==='PUT') {updateMember(id,await body(req),user);return send({ok:true});}
        if(method==='DELETE') {
          if(user.role!=='admin') fail(403,'Only administrators can delete members.');
          const b=await body(req);
          const result=db.prepare('DELETE FROM members WHERE id=? AND version=?').run(id,b.version??-1);
          if(!result.changes) fail(409,'Member changed or no longer exists. Refresh first.');
          audit(user.id,'member.deleted',id);return send({ok:true});
        }
      }
      if(user.role!=='admin') fail(403,'Administrator access required.');
      if(path==='/api/admin/overview'&&method==='GET') return send({members:db.prepare('SELECT COUNT(*) AS n FROM members').get().n,messages:db.prepare("SELECT COUNT(*) AS n FROM messages WHERE status='new'").get().n,giving:db.prepare("SELECT COALESCE(SUM(amount),0) AS n FROM donations WHERE status='paid' AND mode='production'").get().n,audit:db.prepare('SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 12').all(),payments:paymentConfig(env)});
      if(path==='/api/admin/import'&&method==='POST') {
        const b=await body(req); if(!Array.isArray(b.members)||b.members.length>2000) fail(400,'Import up to 2,000 members at a time.');
        const validated=b.members.map(normalizeLegacy);
        const fingerprints=new Set(members().map(m=>m.full_name.toLowerCase()+'|'+m.phone));
        let imported=0,skipped=0;
        db.exec('BEGIN');
        try {for(const m of validated) {const key=m.full_name.toLowerCase()+'|'+m.phone;if(fingerprints.has(key)){skipped++;continue;}const id=randomUUID();db.prepare('INSERT INTO members VALUES(?,?,1,?,?)').run(id,JSON.stringify(m),date(),date());fingerprints.add(key);imported++;}audit(user.id,'members.imported',String(imported));db.exec('COMMIT');} catch(error){db.exec('ROLLBACK');throw error;}
        return send({imported,skipped});
      }
      if(path==='/api/admin/commerce'&&method==='GET')return send(shop.list());
      if(path.startsWith('/api/admin/commerce/')&&method==='PUT'){const id=path.split('/').pop();shop.update(id,await body(req));audit(user.id,'commerce.updated',id);return send({ok:true});}
      if(path==='/api/admin/content'&&method==='GET') return send(contentRows(db.prepare('SELECT * FROM content ORDER BY rowid DESC').all()));
      if(path==='/api/admin/content'&&method==='POST') {
        const b=await body(req),id=b.id||randomUUID();
        if(!['ministry','event','sermon','gallery','leader','announcement','project','ticket','product','sponsor'].includes(b.kind)) fail(400,'Invalid content type.');
        const data={title:string(b.title,'Title',180),description:string(b.description??'','Description',2000,false),detail:string(b.detail??'','Details',5000,false),date:string(b.date??'','Date',40,false),image:safeUrl(b.image,true),url:safeUrl(b.url)};
        if(data.date&&!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(data.date)) fail(400,'Use a valid event date.');
        if(typeof b.published!=='boolean') fail(400,'Select publication status.');
        string(id,'ID',80);
        if(b.kind==='announcement'){
          for(const key of ['starts','expires']){data[key]=string(b[key]||'',key,40,false);if(data[key]&&(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(data[key])||!Number.isFinite(Date.parse(data[key]+'+03:00'))))fail(400,'Use a valid announcement date and time.');}
          if(data.starts&&data.expires&&data.expires<=data.starts)fail(400,'The end time must be after the start time.');
        }
        if(b.kind==='leader')data.position=string(b.position,'Leadership title',120);
        for(const key of ['speaker','topic','scripture','series','album','meeting','leader'])data[key]=string(b[key]||'',key,200,false);
        if(b.kind==='sermon'){
          data.media_type=string(b.media_type||'Sermon','Media type',40);
          if(!['Sermon','Worship','Livestream recording','Short clip','Live now'].includes(data.media_type))fail(400,'Choose a valid media type.');
          data.featured=b.featured===true||b.featured==='on';
          data.upload_date=string(b.upload_date||'','Upload date',10,false);
          if(data.upload_date&&(!/^\d{4}-\d{2}-\d{2}$/.test(data.upload_date)||!Number.isFinite(Date.parse(data.upload_date))))fail(400,'Use a valid upload date.');
          for(const key of ['youtube_url','facebook_url','tiktok_url']){
            data[key]=safeUrl(b[key]);
            if(data[key]){const host=new URL(data[key]).hostname;const allowed=key==='youtube_url'?['youtube.com','www.youtube.com','youtu.be','m.youtube.com']:key==='facebook_url'?['facebook.com','www.facebook.com','m.facebook.com','fb.watch']:['tiktok.com','www.tiktok.com','vm.tiktok.com','vt.tiktok.com'];if(!allowed.includes(host))fail(400,'Use a matching platform URL for '+key);}
          }
          if(b.published&&!data.url&&!data.youtube_url&&!data.facebook_url&&!data.tiktok_url)fail(400,'Add a video link before publishing.');
        }
        commerceData(b,data);
        const upload=b.image_data?uploadedImage(b.image_data):null;
        if(!upload&&data.image.startsWith('/media/')&&!db.prepare('SELECT id FROM media WHERE id=?').get(data.image.slice(7)))fail(400,'Uploaded image not found.');
        db.exec('BEGIN');try{
          if(upload){const mediaId=randomUUID();db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(mediaId,upload.mime,upload.bytes,date());data.image='/media/'+mediaId;}
          db.prepare('INSERT INTO content VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,data=excluded.data,published=excluded.published').run(id,b.kind,JSON.stringify(data),Number(b.published));audit(user.id,'content.saved',id);
          db.prepare("DELETE FROM media WHERE NOT EXISTS(SELECT 1 FROM content c WHERE json_extract(c.data,'$.image')='/media/'||media.id)").run();
          db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}return send({id});
      }
      if(/^\/api\/admin\/media\/[a-f0-9-]{36}$/.test(path)&&method==='GET'){
        const row=db.prepare('SELECT mime,bytes FROM media WHERE id=?').get(path.split('/').pop());if(!row)fail(404,'Image not found.');return send({image:`data:${row.mime};base64,${Buffer.from(row.bytes).toString('base64')}`});
      }
      if(path.startsWith('/api/admin/content/')&&method==='DELETE') {const id=path.split('/').pop();db.prepare('DELETE FROM content WHERE id=?').run(id);audit(user.id,'content.deleted',id);return send({ok:true});}
      if(path==='/api/admin/traffic'&&method==='GET'){const days=Number(url.searchParams.get('days')||7);if(![7,14,30].includes(days))fail(400,'Choose 7, 14, or 30 days.');return send(traffic.report(days));}
      if(path==='/api/admin/settings'&&method==='GET') return send(JSON.parse(db.prepare('SELECT data FROM settings WHERE id=1').get().data));
      if(path==='/api/admin/settings'&&method==='PUT') {
        const b=await body(req),data={};
        for(const key of ['name','tagline','welcome','mission','story','address','service_times']) data[key]=string(b[key],key,3000);
        data.email=email(b.email);data.phone=b.phone?phone(b.phone):'';
        for(const key of ['youtube','facebook','tiktok']) data[key]=safeUrl(b[key]);
        data.whatsapp=string(b.whatsapp||'','WhatsApp number',25,false).replace(/[ +()-]/g,'');
        if(data.whatsapp&&!/^[1-9]\d{7,14}$/.test(data.whatsapp))fail(400,'Enter a WhatsApp number with country code.');
        data.home_video=safeUrl(b.home_video);
        if(b.home_video_minutes!==undefined||b.home_video_seconds!==undefined){
          const minutes=Number(b.home_video_minutes),seconds=Number(b.home_video_seconds);
          if(!/^\d+$/.test(String(b.home_video_minutes))||!/^\d+$/.test(String(b.home_video_seconds))||!Number.isInteger(minutes)||!Number.isInteger(seconds)||minutes<0||minutes>1439||seconds<0||seconds>59)fail(400,'Use whole minutes (0-1439) and seconds (0-59) for the video start time.');
          if(data.home_video){const u=new URL(data.home_video);u.searchParams.delete('t');u.searchParams.delete('start');u.searchParams.set('t',String(minutes*60+seconds)+'s');data.home_video=u.href;}
        }

        if(data.home_video){const u=new URL(data.home_video);const id=u.hostname==='youtu.be'?u.pathname.slice(1):['youtube.com','www.youtube.com','m.youtube.com'].includes(u.hostname)?u.searchParams.get('v')||u.pathname.match(/^\/(?:live|shorts|embed)\/([^/]+)/)?.[1]:'';if(!/^[\w-]{11}$/.test(id||''))fail(400,'Use a direct YouTube video link for the homepage.');}

        for(const key of ['visit_info','transport_info','children_info'])data[key]=string(b[key]||'',key,3000,false);
        db.prepare('UPDATE settings SET data=? WHERE id=1').run(JSON.stringify(data));audit(user.id,'settings.updated');return send({ok:true});
      }
      if(path==='/api/admin/messages'&&method==='GET') return send(db.prepare('SELECT * FROM messages ORDER BY created_at DESC').all());
      if(path.startsWith('/api/admin/messages/')&&method==='PUT') {const b=await body(req);if(!['new','resolved'].includes(b.status)) fail(400,'Invalid status.');const id=path.split('/').pop();db.prepare('UPDATE messages SET status=? WHERE id=?').run(b.status,id);audit(user.id,'message.updated',id);return send({ok:true});}
      if(path.startsWith('/api/admin/messages/')&&method==='DELETE') {const id=path.split('/').pop();db.prepare('DELETE FROM messages WHERE id=?').run(id);audit(user.id,'message.deleted',id);return send({ok:true});}
      if(path==='/api/admin/donations'&&method==='GET') return send(db.prepare('SELECT id,phone,amount,purpose,mode,status,receipt,note,created_at FROM donations ORDER BY created_at DESC').all());
      if(path.startsWith('/api/admin/reconcile/')&&method==='POST') {const row=db.prepare('SELECT * FROM donations WHERE id=?').get(path.split('/').pop());if(!row) fail(404,'Payment not found.');const result=await reconcile(row);audit(user.id,'payment.reconciled',row.id);return send({status:result.status});}
      if(path==='/api/admin/users'&&method==='GET') return send(db.prepare('SELECT id,name,email,role,active FROM users ORDER BY name').all());
      if(path==='/api/admin/users'&&method==='POST') {
        const b=await body(req),password=string(b.password,'Password',200);if(password.length<12) fail(400,'Use at least 12 characters.');
        if(!['admin','registrar'].includes(b.role)) fail(400,'Invalid role.');
        const address=email(b.email);if(db.prepare('SELECT id FROM users WHERE email=?').get(address)) fail(409,'An account already uses this email.');
        const id=randomUUID();db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run(id,string(b.name,'Name',150),address,await hashPassword(password),b.role);audit(user.id,'user.created',id);return send({id},201);
      }
      if(path.startsWith('/api/admin/users/')&&method==='PUT') {
        const id=path.split('/').pop(),b=await body(req);if(id===user.id) fail(400,'You cannot disable or change your own role here.');
        if(!['admin','registrar'].includes(b.role)||typeof b.active!=='boolean') fail(400,'Invalid account settings.');
        db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(b.role,Number(b.active),id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);audit(user.id,'user.updated',id);return send({ok:true});
      }
      fail(404,'Not found.');
    } catch(error) {
      const status=error.status||(error.code==='ENOENT'?404:500);
      if(status===500) console.error('Request failed:',error.code||error.name);
      if(!res.headersSent) send({error:status===500?'Something went wrong. Please try again.':status===404?'Not found.':error.message},status);else res.end();
    }
  });
  // Recover lost callbacks using authenticated status queries; never infer success from timeouts.
  let working=false;
  const timer=setInterval(async()=>{
    if(working||!paymentConfig(env).enabled)return;
    working=true;
    try {
      const rows=db.prepare("SELECT * FROM donations WHERE status IN ('pending','unknown') AND checkout IS NOT NULL AND created_at>? ORDER BY created_at LIMIT 20").all(new Date(Date.now()-24*3600000).toISOString());
      for(const row of rows) {try{await reconcile(row);}catch{/* Keep pending for another query or manual reconciliation. */}}
    }finally{working=false;}
  },30000);
  timer.unref();server.on('close',()=>clearInterval(timer));
  server.requestTimeout=30000;
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const server=createApp();
  server.listen(Number(process.env.PORT||3000),process.env.HOST||'127.0.0.1',()=>console.log(`VWO Karati is running at ${process.env.PUBLIC_ORIGIN||'http://localhost:3000'}`));
}
