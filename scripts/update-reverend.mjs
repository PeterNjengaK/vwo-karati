import {DatabaseSync,backup} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {uploadedImage} from '../server/media.mjs';
const db=new DatabaseSync('/opt/vwo/data/church.sqlite');
const stamp=new Date().toISOString();
await backup(db,'/opt/vwo/data/backups/before-reverend-'+stamp.replace(/[:.]/g,'-')+'.sqlite');
const photo=uploadedImage('data:image/jpeg;base64,'+readFileSync('/root/vwo-reverend-kamau.jpg').toString('base64'));
db.exec('BEGIN IMMEDIATE');
try {
 const row=db.prepare("SELECT * FROM content WHERE id='pastor-kamau' AND kind='leader'").get();
 if(!row)throw Error('Expected leadership record not found');
 const data=JSON.parse(row.data),id=randomUUID();
 data.title='Reverend Kamau';data.position='Reverend';data.image='/media/'+id;
 db.prepare('INSERT INTO media VALUES(?,?,?,?)').run(id,photo.mime,photo.bytes,stamp);
 db.prepare('UPDATE content SET data=? WHERE id=?').run(JSON.stringify(data),row.id);
 db.prepare('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)').run('server-operator','content.updated',row.id,stamp);
 db.exec('COMMIT');console.log('Reverend Kamau title and portrait updated.');
}catch(error){db.exec('ROLLBACK');throw error;}finally{db.close();}
