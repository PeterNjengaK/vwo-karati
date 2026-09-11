import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.mjs';
import { readLegacy } from './migration.mjs';
const path=process.argv[2];
if(!path) {console.error('Usage: node --env-file-if-exists=.env server/import.mjs path/to/members.json [--apply]');process.exit(1);}
const {members,photos}=readLegacy(path),db=openDatabase();
const existing=new Set(db.prepare('SELECT data FROM members').all().map(r=>{const m=JSON.parse(r.data);return m.full_name.toLowerCase()+'|'+m.phone;}));
const pending=[];
for(const m of members){const key=m.full_name.toLowerCase()+'|'+m.phone;if(!existing.has(key)){pending.push(m);existing.add(key);}}
console.log(`Validated ${members.length} records, ${photos} local photos. ${pending.length} new members; ${members.length-pending.length} duplicates skipped.`);
if(process.argv.includes('--apply')) {
  db.exec('BEGIN');
  try {for(const m of pending){const now=new Date().toISOString();db.prepare('INSERT INTO members VALUES(?,?,1,?,?)').run(randomUUID(),JSON.stringify(m),now,now);}db.prepare('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)').run('migration','members.imported',String(pending.length),new Date().toISOString());db.exec('COMMIT');console.log('Import complete. Original files were not changed.');}catch(error){db.exec('ROLLBACK');throw error;}
}else console.log('Preview only. Add --apply to import.');
db.close();
