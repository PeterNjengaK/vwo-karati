export const $=selector=>document.querySelector(selector);
export const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=value=>'KES '+Number(value||0).toLocaleString('en-KE');
export const prettyDate=value=>{
  if(!value)return 'Date to be announced';
  let text=String(value);
  if(/^\d{4}-\d{2}-\d{2}$/.test(text))text+='T12:00:00+03:00';
  else if(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text))text+=':00+03:00';
  return new Date(text).toLocaleDateString('en-KE',{day:'numeric',month:'short',year:'numeric',timeZone:'Africa/Nairobi'});
};
export const icon=(name)=>({arrow:'↗',right:'→',plus:'＋',close:'×',search:'⌕',heart:'♡',check:'✓',menu:'☰',grid:'▦',people:'♧',content:'▤',message:'✉',settings:'⚙',logout:'↪'}[name]||'◇');
let csrf='';
export const setCsrf=value=>csrf=value;
export function closeOfficeSession() {
  const key=csrf;csrf='';
  if(!key)return;
  const body=JSON.stringify({csrf:key});
  try {
    if(navigator.sendBeacon('/api/session/close',new Blob([body],{type:'application/json'})))return;
  }catch{}
  fetch('/api/session/close',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body,keepalive:true}).catch(()=>{});
}
export async function downloadPrivate(path,name) {
  const response=await fetch(path,{credentials:'same-origin',cache:'no-store',headers:{'X-CSRF-Token':csrf}});
  if(!response.ok){const result=await response.json();throw new Error(result.error||'Unable to download this file.');}
  download(name,await response.blob(),'application/octet-stream');
}
export async function api(path,{method='GET',body}={}) {
  let response;
  try {response=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:{...(body!==undefined?{'Content-Type':'application/json'}:{}),...(csrf?{'X-CSRF-Token':csrf}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});} catch {throw new Error('Connection lost. Check your internet connection and try again.');}
  const data=await response.json();
  if(!response.ok) throw Object.assign(new Error(data.error||'Request failed.'),{status:response.status});
  return data;
}
export function toast(message) {const el=$('#toast');el.textContent=message;el.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.classList.remove('show'),5000);}
export function field(label,name,value='',type='text',extra='') {return `<label>${escape(label)}<input name="${name}" type="${type}" value="${escape(value)}" ${extra}></label>`;}
export function textarea(label,name,value='',extra='') {return `<label class="span-2">${escape(label)}<textarea name="${name}" rows="4" ${extra}>${escape(value)}</textarea></label>`;}
export function select(label,name,values,current='') {return `<label>${escape(label)}<select name="${name}">${values.map(v=>`<option ${v===current?'selected':''}>${escape(v)}</option>`).join('')}</select></label>`;}
export function formData(form) {return Object.fromEntries(new FormData(form));}
export function download(name,data,type='text/csv;charset=utf-8') {const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export function csv(rows,keys) {return '\uFEFF'+[keys,...rows.map(r=>keys.map(k=>r[k]??''))].map(row=>row.map(v=>{let text=String(v);if(/^[\s]*[=+@\-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');}
export function bindForm(form,handler) {form.addEventListener('submit',async event=>{event.preventDefault();const submit=form.querySelector('[type="submit"]');const error=form.querySelector('.form-error');if(error)error.textContent='';submit.disabled=true;try{await handler(formData(form),form);}catch(e){if(error)error.textContent=e.message;else toast(e.message);}finally{submit.disabled=false;}});}
