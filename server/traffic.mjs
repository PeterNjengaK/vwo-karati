import {createHmac,randomBytes} from 'node:crypto';
export function trafficAnalytics(db){
 db.exec(`CREATE TABLE IF NOT EXISTS traffic_secret(id INTEGER PRIMARY KEY,secret TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS traffic(id INTEGER PRIMARY KEY,day TEXT NOT NULL,path TEXT NOT NULL,visitor TEXT NOT NULL,network TEXT NOT NULL,device TEXT NOT NULL,referrer TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS traffic_day ON traffic(day);`);
 db.prepare('INSERT OR IGNORE INTO traffic_secret VALUES(1,?)').run(randomBytes(32).toString('hex'));
 const secret=db.prepare('SELECT secret FROM traffic_secret WHERE id=1').get().secret;
 const aliases={'/index.html':'/','/about.html':'/about','/programs.html':'/programs','/Gallery.html':'/gallery','/contacts.html':'/contact'};
 const pages=new Set(['/','/about','/programs','/gallery','/watch','/contact','/give','/privacy']);
 let cleaned='';
 function record(req,path,ip){
  path=aliases[path]||path;if(!pages.has(path)||req.method!=='GET'||req.headers.dnt==='1'||req.headers['sec-gpc']==='1')return;
  const agent=String(req.headers['user-agent']||'');if(/bot|crawler|spider|headless|preview|monitor/i.test(agent))return;
  const day=new Date(Date.now()+3*3600000).toISOString().slice(0,10);
  if(cleaned!==day){db.prepare('DELETE FROM traffic WHERE day<?').run(new Date(Date.now()-30*86400000).toISOString().slice(0,10));cleaned=day;}
  const visitor=createHmac('sha256',secret).update(day+'|'+ip+'|'+agent).digest('hex');
  let network=ip.replace(/^::ffff:/,'');network=network.includes('.')?network.split('.').slice(0,3).join('.')+'.0/24':network.includes(':')?network.split(':').slice(0,3).join(':')+'::/48':'Unknown';
  let referrer='Direct / unknown';try{const ref=new URL(req.headers.referer);if(ref.hostname!==String(req.headers.host||'').split(':')[0])referrer=ref.hostname;}catch{}
  const device=/ipad|tablet/i.test(agent)?'Tablet':/mobile|android|iphone/i.test(agent)?'Mobile':'Desktop / other';
  db.prepare('INSERT INTO traffic(day,path,visitor,network,device,referrer) VALUES(?,?,?,?,?,?)').run(day,path,visitor,network,device,referrer);
 }
 function report(days){
  const since=new Date(Date.now()+3*3600000-(days-1)*86400000).toISOString().slice(0,10);
  const summary=db.prepare('SELECT COUNT(*) views,COUNT(DISTINCT visitor) visitor_days FROM traffic WHERE day>=?').get(since);
  const group=column=>db.prepare(`SELECT ${column} label,COUNT(*) views FROM traffic WHERE day>=? GROUP BY ${column} ORDER BY views DESC LIMIT 20`).all(since);
  return {...summary,days,since,daily:db.prepare('SELECT day,COUNT(*) views,COUNT(DISTINCT visitor) visitors FROM traffic WHERE day>=? GROUP BY day ORDER BY day').all(since),pages:group('path'),devices:group('device'),referrers:group('referrer'),networks:group('network'),location_available:false};
 }
 return {record,report};
}
