import { createInterface } from 'node:readline/promises';
import { openDatabase } from './db.mjs';
import { email, hashPassword } from './security.mjs';
const rl=createInterface({input:process.stdin,output:process.stdout});
const db=openDatabase();
try {
 const address=email(process.env.RESET_EMAIL||await rl.question('Account email: '));
 const user=db.prepare('SELECT id FROM users WHERE email=?').get(address);
 if(!user)throw new Error('Account not found.');
 const password=process.env.RESET_PASSWORD||await rl.question('New password (12+ characters; visible input): ');
 if(password.length<12||password.length>200)throw new Error('Password must be 12–200 characters.');
 const hash=await hashPassword(password);
 db.exec('BEGIN');
 try{db.prepare('UPDATE users SET password=? WHERE id=?').run(hash,user.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);db.prepare('INSERT INTO audit(actor,action,target,created_at) VALUES(?,?,?,?)').run('server-operator','password.reset',user.id,new Date().toISOString());db.exec('COMMIT');}catch(error){db.exec('ROLLBACK');throw error;}
 console.log('Password reset. All account sessions have been signed out.');
}catch(error){console.error(error.message);process.exitCode=1;}finally{rl.close();db.close();}
