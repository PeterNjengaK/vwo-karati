import { fail } from './security.mjs';
export function uploadedImage(data) {
  if(typeof data!=='string'||data.length>7*1024*1024)fail(400,'Choose an image no larger than 5 MB.');
  const match=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if(!match)fail(400,'Use a JPEG, PNG, or WebP image.');
  const bytes=Buffer.from(match[2],'base64');
  if(!bytes.length||bytes.length>5*1024*1024)fail(400,'Choose an image no larger than 5 MB.');
  const valid=match[1]==='jpeg'?bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255:match[1]==='png'?bytes.length>=24&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes.length>=12&&bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';
  if(!valid)fail(400,'The file is not a valid JPEG, PNG, or WebP image.');
  return {mime:'image/'+match[1],bytes};
}
