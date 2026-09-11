import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {openDatabase} from '../server/db.mjs';
test('scheduled backup verifies a restorable snapshot and preserves success metadata on failure',()=>{
 mkdirSync('test-results',{recursive:true});const dir=resolve(mkdtempSync('test-results/scheduled-')),path=resolve(dir,'church.sqlite');
 const db=openDatabase(path);db.close();
 const run=()=>spawnSync(process.execPath,['server/scheduled-backup.mjs'],{env:{...process.env,DATABASE_PATH:path},encoding:'utf8'});
 const result=run();assert.equal(result.status,0,result.stderr);
 const status=JSON.parse(readFileSync(resolve(dir,'backups/scheduled-status.json'),'utf8'));assert.ok(status.last_verified);assert.equal(status.error,null);
 const restored=new DatabaseSync(resolve(dir,'backups',status.name),{readOnly:true});assert.equal(restored.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.equal(restored.prepare('SELECT COUNT(*) n FROM content').get().n,status.counts.content);restored.close();
 writeFileSync(path,'invalid database');assert.notEqual(run().status,0);
 const failed=JSON.parse(readFileSync(resolve(dir,'backups/scheduled-status.json'),'utf8'));assert.ok(failed.error);assert.equal(failed.last_success,status.last_success);
});
