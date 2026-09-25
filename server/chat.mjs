import {digest,fail,string} from './security.mjs';
export function churchChat(db){
 db.exec(`CREATE TABLE IF NOT EXISTS chats(id TEXT PRIMARY KEY,name TEXT NOT NULL,updated_at TEXT NOT NULL,unread INTEGER NOT NULL DEFAULT 1);
 CREATE TABLE IF NOT EXISTS chat_messages(id INTEGER PRIMARY KEY,chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE,request_id TEXT NOT NULL,author TEXT NOT NULL,message TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(chat_id,request_id));`);
 const clean=()=>db.prepare('DELETE FROM chats WHERE updated_at<?').run(new Date(Date.now()-30*86400000).toISOString());
 const identify=key=>{if(typeof key!=='string'||!/^[a-f0-9]{64}$/.test(key))fail(401,'This chat session is not valid.');return digest(key);};
 const read=id=>{const thread=db.prepare('SELECT id,name,updated_at FROM chats WHERE id=?').get(id);if(!thread)fail(404,'This conversation has ended or expired.');return {...thread,messages:db.prepare('SELECT id,author,message,created_at FROM chat_messages WHERE chat_id=? ORDER BY id').all(id)};};
 function write(id,b,author){const message=string(b.message,'Message',2000),request=string(b.request_id,'Request ID',80);if(!/^[a-f0-9-]{36}$/.test(request))fail(400,'Invalid message request.');const prior=db.prepare('SELECT author FROM chat_messages WHERE chat_id=? AND request_id=?').get(id,request);if(prior){if(prior.author!==author)fail(409,'Message ID already used.');return;}if(db.prepare('SELECT COUNT(*) n FROM chat_messages WHERE chat_id=?').get(id).n>=200)fail(409,'This conversation has reached its message limit. Please start a new chat.');const now=new Date().toISOString();db.prepare('INSERT INTO chat_messages(chat_id,request_id,author,message,created_at) VALUES(?,?,?,?,?)').run(id,request,author,message,now);db.prepare('UPDATE chats SET updated_at=?,unread=? WHERE id=?').run(now,author==='visitor'?1:0,id);}
 return {
  visitorRead(key){clean();return read(identify(key));},
  visitorSend(key,b){clean();const id=identify(key);db.exec('BEGIN');try{if(!db.prepare('SELECT id FROM chats WHERE id=?').get(id)){if(b.consent!==true)fail(400,'Please agree to the church handling this conversation.');db.prepare('INSERT INTO chats(id,name,updated_at) VALUES(?,?,?)').run(id,string(b.name||'Visitor','Name',100),new Date().toISOString());}write(id,b,'visitor');db.exec('COMMIT');return read(id);}catch(e){db.exec('ROLLBACK');throw e;}},
  list(){clean();return db.prepare('SELECT id,name,updated_at,unread FROM chats ORDER BY unread DESC,updated_at DESC LIMIT 200').all();},
  read(id){clean();const result=read(id);db.prepare('UPDATE chats SET unread=0 WHERE id=?').run(id);return result;},
  reply(id,b){read(id);db.exec('BEGIN');try{write(id,b,'church');db.exec('COMMIT');return read(id);}catch(e){db.exec('ROLLBACK');throw e;}},
  remove(id){db.prepare('DELETE FROM chats WHERE id=?').run(id);}
 };
}
