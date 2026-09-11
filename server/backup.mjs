import { backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { openDatabase } from './db.mjs';
mkdirSync('./data/backups',{recursive:true});
const db=openDatabase();
const destination=`./data/backups/church-${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
await backup(db,destination);
db.close();
console.log(`Consistent database backup saved to ${destination}. Store a protected copy off the server.`);
