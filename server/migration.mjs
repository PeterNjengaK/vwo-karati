import { readFileSync, existsSync } from 'node:fs';
import { dirname, basename, resolve, extname, sep } from 'node:path';
import { memberData, fail } from './security.mjs';
export function normalizeLegacy(m) {
  if(!m||typeof m!=='object'||Array.isArray(m)) fail(400,'Each imported member must be an object.');
  return memberData({...m,
    marital_status:m.marital_status||(!['Active','Inactive','Visitor'].includes(m.status)?m.status:'')||'',
    status:['Active','Inactive','Visitor'].includes(m.status)?m.status:'Active',
    gender:['Female','Male','Other','Prefer not to say'].includes(m.gender)?m.gender:'',
    photo:m.photo?.startsWith('data:image/')?m.photo:''
  });
}
export function readLegacy(path) {
  const source=resolve(path),folder=dirname(source),rows=JSON.parse(readFileSync(source,'utf8').replace(/^\uFEFF/,''));
  if(!Array.isArray(rows))throw new Error('The source file must contain a member array.');
  let photos=0;
  const members=rows.map(row=>{
    const m=normalizeLegacy(row);
    if(row.photo&&!m.photo) {
      // Import only image basenames from the member_photos folder beside the source JSON.
      const name=basename(row.photo.replaceAll('\\','/'));
      const target=resolve(folder,'member_photos',name),photoRoot=resolve(folder,'member_photos')+sep;
      const type={'.jpg':'jpeg','.jpeg':'jpeg','.png':'png','.webp':'webp'}[extname(name).toLowerCase()];
      if(target.startsWith(photoRoot)&&type&&existsSync(target)) {
        const bytes=readFileSync(target);if(bytes.length>500*1024)throw new Error('A member photo exceeds 500 KB. Resize it before importing.');
        m.photo=`data:image/${type};base64,${bytes.toString('base64')}`;photos++;
      }
    }
    return m;
  });
  return {members,photos};
}
