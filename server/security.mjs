import { randomBytes, scrypt as derive, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const scrypt = promisify(derive);
export const token = () => randomBytes(32).toString('hex');
export const digest = value => createHash('sha256').update(value).digest('hex');
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(password,salt,64)).toString('hex')}`;
}
export async function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const actual = await scrypt(password,salt,64);
  return timingSafeEqual(actual, Buffer.from(hash,'hex'));
}
export function fail(status, message) { throw Object.assign(new Error(message), { status }); }
export function string(value, name, max=200, required=true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400,`${name} is required and must be no more than ${max} characters.`);
  return value.trim();
}
export function phone(value) {
  const p = string(value,'Phone number',30).replace(/[\s+()-]/g,'').replace(/^0/,'254');
  if (!/^254[17]\d{8}$/.test(p)) fail(400,'Enter a Kenyan mobile number, for example 0712 345 678.');
  return p;
}
export function email(value) {
  const e = string(value,'Email',254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) fail(400,'Enter a valid email address.');
  return e;
}
export function memberData(body) {
  const data = { full_name: string(body.full_name,'Full name',150), phone:phone(body.phone) };
  for (const key of ['gender','ministry','role','status','marital_status','parent_part','next_of_kin_name','next_of_kin_phone','timestamp','notes','email','address','birth_date','baptism_date']) data[key]=string(body[key]??'',key,key==='notes'?2000:key==='email'?254:300,false);
  if(data.email)data.email=email(data.email);
  for(const key of ['birth_date','baptism_date'])if(data[key]){dateOnly(data[key],key);if(data[key]>new Date().toISOString().slice(0,10))fail(400,'Birth and baptism dates cannot be in the future.');}
  if (data.next_of_kin_phone) data.next_of_kin_phone=phone(data.next_of_kin_phone);
  if(data.timestamp)dateOnly(data.timestamp,'Registration date');
  if (!['Active','Inactive','Visitor'].includes(data.status)) fail(400,'Select a valid membership status.');
  if (!['','Female','Male','Other','Prefer not to say'].includes(data.gender)) fail(400,'Select a valid gender.');
  const photo=body.photo||'';
  if (typeof photo!=='string'||photo.length>700000|| (photo&&!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(photo))) fail(400,'Use a JPEG, PNG, or WebP photo smaller than 500 KB.');
  data.photo=photo;
  return data;
}
export function safeUrl(value, image=false) {
  if (!value) return '';
  const text=string(value,'URL',1000);
  if (image && /^\/images\/[a-zA-Z0-9_.-]+$/.test(text)) return text;
  if (image && /^\/media\/[a-f0-9-]{36}$/.test(text)) return text;
  try { const url=new URL(text); if (url.protocol==='https:') return url.href; } catch {}
  fail(400,'Links must use HTTPS. Images may also use /images/filename.jpg.');
}
export function dateOnly(value,name='Date') {
  const text=string(value,name,10);
  if(!/^\d{4}-\d{2}-\d{2}$/.test(text)||Number.isNaN(Date.parse(text))||new Date(text).toISOString().slice(0,10)!==text)fail(400,`${name} must be a valid date.`);
  return text;
}
