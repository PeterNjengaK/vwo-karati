import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,writeFile,rename,readdir,stat,unlink,copyFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
const database=resolve(process.env.DATABASE_PATH||'./data/church.sqlite');
const dir=resolve(dirname(database),'backups'),statusFile=resolve(dir,'scheduled-status.json');
await mkdir(dir,{recursive:true});
let previous={};try{previous=JSON.parse(await readFile(statusFile,'utf8'));}catch{}
const stamp=new Date().toISOString(),name='church-auto-'+stamp.replace(/[:.]/g,'-')+'.sqlite';
const target=resolve(dir,name),partial=target+'.partial',restored=target+'.restore-test';
let source,check;
async function status(data){const temp=statusFile+'.tmp';await writeFile(temp,JSON.stringify(data,null,2),{mode:0o600});await rename(temp,statusFile);}
try{
 source=new DatabaseSync(database,{readOnly:true});await backup(source,partial);source.close();source=null;
 await copyFile(partial,restored);check=new DatabaseSync(restored);
 if(check.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||check.prepare('PRAGMA foreign_key_check').all().length)throw Error('Restore integrity validation failed');
 const counts={};for(const table of ['members','users','content','media','services','attendance','care_tasks','messages','donations'])counts[table]=check.prepare('SELECT COUNT(*) n FROM '+table).get().n;
 check.exec('BEGIN; CREATE TABLE backup_restore_probe(id TEXT);');check.prepare('INSERT INTO backup_restore_probe VALUES(?)').run(randomUUID());check.exec('ROLLBACK');check.close();check=null;
 await rename(partial,target);
 const sha256=createHash('sha256').update(await readFile(target)).digest('hex');
 await status({enabled:true,schedule:'Daily at 02:00 Kenya time',retention_days:14,last_attempt:stamp,last_success:stamp,last_verified:stamp,name,sha256,counts,error:null});
 // Only this job's completed backups are eligible for retention cleanup.
 for(const file of await readdir(dir)){if(!/^church-auto-[\dTZ-]+\.sqlite$/.test(file)||file===name)continue;const path=resolve(dir,file);if((await stat(path)).mtimeMs<Date.now()-14*86400000)await unlink(path);}
 console.log('Verified scheduled backup:',name);
}catch(error){await status({...previous,enabled:true,schedule:'Daily at 02:00 Kenya time',last_attempt:stamp,error:'Scheduled backup failed. Ask the server administrator to check the backup service logs.'});throw error;}
finally{if(source)source.close();if(check)check.close();for(const file of [partial,restored,restored+'-wal',restored+'-shm'])await unlink(file).catch(()=>{});}
