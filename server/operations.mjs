import { randomUUID } from 'node:crypto';
import { backup } from 'node:sqlite';
import { mkdir, readdir, stat, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fail, string, dateOnly } from './security.mjs';
const now=()=>new Date().toISOString();
const kenyaDate=()=>new Date(Date.now()+3*3600000).toISOString().slice(0,10);
function nextBirthday(birth,today){
  const occurrence=year=>{const month=Number(birth.slice(5,7)),day=Number(birth.slice(8,10));const last=new Date(Date.UTC(year,month,0)).getUTCDate();return `${year}-${String(month).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;};
  let year=Number(today.slice(0,4)),next=occurrence(year);if(next<today)next=occurrence(year+1);return next;
}
export function officeOperations({db,env,audit}) {
  const backupDir=resolve(dirname(env.DATABASE_PATH||'./data/church.sqlite'),'backups');
  let backingUp=false;
  const memberExists=id=>!!db.prepare('SELECT id FROM members WHERE id=?').get(id);
  const serviceList=()=>db.prepare('SELECT s.*, (SELECT COUNT(*) FROM attendance a WHERE a.service_id=s.id) AS members_present FROM services s ORDER BY service_date DESC,created_at DESC').all();
  const taskList=()=>db.prepare("SELECT t.*,json_extract(m.data,'$.full_name') AS member_name,u.name AS assigned_name FROM care_tasks t LEFT JOIN members m ON m.id=t.member_id LEFT JOIN users u ON u.id=t.assigned_to ORDER BY CASE t.status WHEN 'done' THEN 1 ELSE 0 END,t.due_date,t.created_at").all();
  return async({path,method,url,req,res,user,body,send})=>{
    if(path==='/api/services'&&method==='GET'){send(serviceList());return true;}
    if(path==='/api/services'&&method==='POST') {
      const b=await body(req),id=randomUUID();
      db.prepare('INSERT INTO services(id,title,service_date,created_at) VALUES(?,?,?,?)').run(id,string(b.title,'Service name',150),dateOnly(b.service_date,'Service date'),now());
      audit(user.id,'service.created',id);send({id},201);return true;
    }
    if(/^\/api\/services\/[\w-]+$/.test(path)) {
      const id=path.split('/').pop(),row=db.prepare('SELECT * FROM services WHERE id=?').get(id);if(!row)fail(404,'Service not found.');
      if(method==='GET'){send({...row,member_ids:db.prepare('SELECT member_id FROM attendance WHERE service_id=?').all(id).map(r=>r.member_id)});return true;}
      if(method==='PUT') {
        const b=await body(req);if(b.version!==row.version)fail(409,'Attendance was updated by another person. Close this screen and reopen the service.');
        if(!Array.isArray(b.member_ids)||b.member_ids.length>20000||b.member_ids.some(id=>typeof id!=='string'||!memberExists(id)))fail(400,'Select existing members for attendance.');
        if(!Number.isSafeInteger(b.visitors)||b.visitors<0||b.visitors>100000)fail(400,'Visitor count must be a whole number between 0 and 100,000.');
        const title=string(b.title,'Service name',150),date=dateOnly(b.service_date,'Service date'),notes=string(b.notes??'','Service notes',2000,false);
        db.exec('BEGIN');try{
          // Recheck the version inside the transaction after the asynchronous request body read.
          const changed=db.prepare('UPDATE services SET title=?,service_date=?,visitors=?,notes=?,version=version+1 WHERE id=? AND version=?').run(title,date,b.visitors,notes,id,b.version);
          if(!changed.changes)fail(409,'Attendance changed. Reopen the service before saving.');
          db.prepare('DELETE FROM attendance WHERE service_id=?').run(id);
          for(const memberId of new Set(b.member_ids))db.prepare('INSERT INTO attendance VALUES(?,?,?)').run(id,memberId,now());
          audit(user.id,'attendance.saved',id);db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}send({ok:true});return true;
      }
      if(method==='DELETE'){if(user.role!=='admin')fail(403,'Only administrators can delete services.');const b=await body(req);const result=db.prepare('DELETE FROM services WHERE id=? AND version=?').run(id,b.version??-1);if(!result.changes)fail(409,'Service changed. Reopen it before deleting.');audit(user.id,'service.deleted',id);send({ok:true});return true;}
    }
    if(/^\/api\/member-history\/[\w-]+$/.test(path)&&method==='GET') {
      const id=path.split('/').pop();if(!memberExists(id))fail(404,'Member not found.');
      send(db.prepare('SELECT s.id,s.title,s.service_date FROM attendance a JOIN services s ON s.id=a.service_id WHERE a.member_id=? ORDER BY s.service_date DESC LIMIT 50').all(id));return true;
    }
    if(!path.startsWith('/api/admin/'))return false;
    if(user.role!=='admin')fail(403,'Administrator access required.');
    if(path==='/api/admin/care'&&method==='GET'){send(taskList());return true;}
    if(path==='/api/admin/care'&&method==='POST') {
      const b=await body(req),id=b.id?string(b.id,'Task ID',80):randomUUID();
      const title=string(b.title,'Task title',180),notes=string(b.notes??'','Notes',3000,false),due=dateOnly(b.due_date,'Due date');
      if(!['normal','urgent'].includes(b.priority)||!['open','in_progress','done'].includes(b.status))fail(400,'Choose a valid task priority and status.');
      if(b.member_id&&!memberExists(b.member_id))fail(400,'Member not found.');
      if(b.assigned_to&&!db.prepare("SELECT id FROM users WHERE id=? AND active=1 AND role='admin'").get(b.assigned_to))fail(400,'Assign care tasks to an active administrator.');
      if(b.id){
        const result=db.prepare('UPDATE care_tasks SET title=?,member_id=?,assigned_to=?,due_date=?,priority=?,status=?,notes=?,version=version+1,updated_at=? WHERE id=? AND version=?').run(title,b.member_id||null,b.assigned_to||null,due,b.priority,b.status,notes,now(),id,b.version??-1);
        if(!result.changes)fail(409,'Task changed or was deleted. Refresh the care board.');
      }else db.prepare('INSERT INTO care_tasks VALUES(?,?,?,?,?,?,?,?,1,?,?)').run(id,title,b.member_id||null,b.assigned_to||null,due,b.priority,b.status,notes,now(),now());
      audit(user.id,'care.saved',id);send({id});return true;
    }
    if(/^\/api\/admin\/care\/[\w-]+$/.test(path)&&method==='DELETE') {
      const b=await body(req),id=path.split('/').pop();const result=db.prepare('DELETE FROM care_tasks WHERE id=? AND version=?').run(id,b.version??-1);if(!result.changes)fail(409,'Task changed. Refresh before deleting.');audit(user.id,'care.deleted',id);send({ok:true});return true;
    }
    if(path==='/api/admin/reports'&&method==='GET') {
      const to=dateOnly(url.searchParams.get('to')||kenyaDate(),'End date');
      const from=dateOnly(url.searchParams.get('from')||to.slice(0,7)+'-01','Start date');if(from>to)fail(400,'Start date must be before the end date.');
      const all=db.prepare('SELECT id,data,created_at FROM members').all().map(r=>({id:r.id,...JSON.parse(r.data),created_at:r.created_at}));
      const breakdown=key=>Object.entries(all.reduce((counts,m)=>{const v=m[key]||'Not recorded';counts[v]=(counts[v]||0)+1;return counts;},{})).map(([label,count])=>({label,count})).sort((a,b)=>b.count-a.count);
      const services=serviceList().filter(s=>s.service_date>=from&&s.service_date<=to);
      const giving=db.prepare("SELECT purpose,SUM(amount) AS amount,COUNT(*) AS payments FROM donations WHERE status='paid' AND mode='production' AND date(created_at,'+3 hours') BETWEEN ? AND ? GROUP BY purpose").all(from,to);
      const today=kenyaDate(),birthdays=all.filter(m=>m.birth_date).map(m=>{const next=nextBirthday(m.birth_date,today);return {id:m.id,name:m.full_name,date:next,days:Math.round((Date.parse(next)-Date.parse(today))/86400000)};}).filter(m=>m.days>=0&&m.days<=30).sort((a,b)=>a.days-b.days);
      send({from,to,total:all.length,new_members:all.filter(m=>m.created_at.slice(0,10)>=from&&m.created_at.slice(0,10)<=to).length,statuses:breakdown('status'),ministries:breakdown('ministry'),services,giving,birthdays,open_care:db.prepare("SELECT COUNT(*) AS n FROM care_tasks WHERE status!='done'").get().n});return true;
    }
    if(path==='/api/admin/audit'&&method==='GET') {
      const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0)fail(400,'Invalid page.');
      send({total:db.prepare('SELECT COUNT(*) AS n FROM audit').get().n,rows:db.prepare('SELECT a.*,u.name FROM audit a LEFT JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 50 OFFSET ?').all(offset)});return true;
    }
    if(path==='/api/admin/backup-status'&&method==='GET') {
      let status;try{status=JSON.parse(await readFile(resolve(backupDir,'scheduled-status.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;status={enabled:false};}
      let offserver=null;try{offserver=JSON.parse((await readFile(resolve(backupDir,'offserver-status.json'),'utf8')).replace(/^\uFEFF/,''));}catch{}
      send({...status,offserver,overdue:status.enabled&&(!status.last_success||Date.now()-Date.parse(status.last_success)>36*3600000)});return true;
    }
    if(path==='/api/admin/backups'&&method==='GET') {
      await mkdir(backupDir,{recursive:true});const names=(await readdir(backupDir)).filter(n=>/^church-[\w.-]+\.sqlite$/.test(n));
      const rows=await Promise.all(names.map(async name=>{const info=await stat(resolve(backupDir,name));return {name,size:info.size,created_at:info.mtime.toISOString()};}));send(rows.sort((a,b)=>b.created_at.localeCompare(a.created_at)));return true;
    }
    if(path==='/api/admin/backups'&&method==='POST') {
      if(backingUp)fail(409,'A backup is already running.');backingUp=true;
      try{await mkdir(backupDir,{recursive:true});const name='church-'+now().replace(/[:.]/g,'-')+'-'+randomUUID().slice(0,8)+'.sqlite';await backup(db,resolve(backupDir,name));audit(user.id,'backup.created',name);send({name},201);}finally{backingUp=false;}return true;
    }
    if(path.startsWith('/api/admin/backups/')&&method==='GET') {
      const name=path.split('/').pop();if(!/^church-[\w.-]+\.sqlite$/.test(name))fail(404,'Backup not found.');
      const bytes=await readFile(resolve(backupDir,name));audit(user.id,'backup.downloaded',name);res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${name}"`});res.end(bytes);return true;
    }
    return false;
  };
}
