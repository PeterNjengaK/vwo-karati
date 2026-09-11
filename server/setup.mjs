import { createInterface } from 'node:readline/promises';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db.mjs';
import { hashPassword, email, string } from './security.mjs';
const rl=createInterface({input:process.stdin,output:process.stdout});
try {
  const db=openDatabase();
  const address=email(process.env.ADMIN_EMAIL || await rl.question('Administrator email: '));
  const name=string(process.env.ADMIN_NAME || await rl.question('Administrator name: '),'Name');
  const password=process.env.ADMIN_PASSWORD || await rl.question('New password (12+ characters; input is visible): ');
  if(password.length<12||password.length>200) throw new Error('Password must be 12–200 characters.');
  if(db.prepare('SELECT id FROM users WHERE email=?').get(address)) throw new Error('This account already exists. Use the staff portal to manage it.');
  db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run(randomUUID(),name,address,await hashPassword(password),'admin');
  console.log('Administrator created. Start the server and open /admin.');
  db.close();
} catch(error) { console.error(error.message); process.exitCode=1; } finally { rl.close(); }
