import { fail, dateOnly } from './security.mjs';
const text=value=>String(value||'').replaceAll('\\','\\\\').replace(/\r\n|\r|\n/g,'\\n').replaceAll(';','\\;').replaceAll(',','\\,');
function fold(line){let output='',length=0;for(const char of line){const bytes=Buffer.byteLength(char);if(length+bytes>75){output+='\r\n ';length=1;}output+=char;length+=bytes;}return output;}
export function eventCalendar(item,settings){
  if(!item.date)fail(404,'This event has no scheduled date.');
  dateOnly(item.date.slice(0,10),'Event date');
  let start;
  if(item.date.length===10)start='DTSTART;VALUE=DATE:'+item.date.replaceAll('-','');
  else {const instant=new Date(item.date+':00+03:00');if(Number.isNaN(instant.getTime()))fail(400,'Invalid event time.');start='DTSTART:'+instant.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');}
  return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//VWO Karati//Church Events//EN','CALSCALE:GREGORIAN','BEGIN:VEVENT','UID:'+text(item.id)+'@vwo-church-office','DTSTAMP:'+new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,''),start,'SUMMARY:'+text(item.title),'DESCRIPTION:'+text([item.description,item.detail].filter(Boolean).join('\n\n')),'LOCATION:'+text(settings.address),'END:VEVENT','END:VCALENDAR'].map(fold).join('\r\n')+'\r\n';
}
