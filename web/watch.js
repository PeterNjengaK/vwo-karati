import {escape as e,api} from './shared.js';
export function sources(c){
 const result=[];
 for(const raw of [c.youtube_url,c.facebook_url,c.tiktok_url,c.url]){
  if(!raw)continue;
  try{const u=new URL(raw);if(u.protocol!=='https:')continue;const h=u.hostname;let name='Website',embed='';
   if(['youtube.com','www.youtube.com','m.youtube.com','youtu.be'].includes(h)){name='YouTube';const id=h==='youtu.be'?u.pathname.slice(1):u.searchParams.get('v')||u.pathname.match(/^\/(?:shorts|live|embed)\/([^/]+)/)?.[1];if(/^[\w-]{11}$/.test(id||''))embed='https://www.youtube-nocookie.com/embed/'+id;}
   if(['facebook.com','www.facebook.com','m.facebook.com','fb.watch'].includes(h)){name='Facebook';if(h!=='fb.watch'&&(/\/videos\/|\/reel\//.test(u.pathname)||u.pathname==='/watch/'))embed='https://www.facebook.com/plugins/video.php?href='+encodeURIComponent(raw)+'&show_text=false';}
   if(['tiktok.com','www.tiktok.com','vm.tiktok.com','vt.tiktok.com'].includes(h)){name='TikTok';const id=u.pathname.match(/\/video\/(\d+)/)?.[1];if(id)embed='https://www.tiktok.com/player/v1/'+id;}
   if(!result.some(s=>s.url===raw))result.push({name,url:raw,embed});
  }catch{}
 }
 return result;
}
const dated=c=>c.date||c.upload_date||'';
export function orderedMedia(data){return data.content.filter(c=>c.kind==='sermon').sort((a,b)=>Number(b.media_type==='Live now')-Number(a.media_type==='Live now')||Number(!!b.featured)-Number(!!a.featured)||dated(b).localeCompare(dated(a)));}
const dateLabel=value=>{if(!value)return '';const date=new Date(value.length===10?value+'T12:00:00+03:00':value+'+03:00');return Number.isFinite(date.getTime())?new Intl.DateTimeFormat('en-KE',{dateStyle:'medium',timeZone:'Africa/Nairobi'}).format(date):'Date to be confirmed';};
export function mediaCard(c){return `<article class="card media-card">${c.image?`<img src="${e(c.image)}" alt="" loading="lazy">`:'<div class="media-art" aria-hidden="true">&#9655;</div>'}<div class="card-body"><span class="eyebrow">${e(c.media_type||'Sermon')}${c.featured?' &middot; FEATURED':''}</span><h3><a href="/watch?video=${encodeURIComponent(c.id)}">${e(c.title)}</a></h3><p>${e(c.description||'')}</p><p>${e([c.speaker,c.date?dateLabel(c.date):c.upload_date?'Uploaded '+dateLabel(c.upload_date):''].filter(Boolean).join(' / '))}</p><a class="text-link" href="/watch?video=${encodeURIComponent(c.id)}">Watch message &#8594;</a></div></article>`;}
export function mediaHome(data){const items=orderedMedia(data).slice(0,3);return `<section class="section wrap"><div class="section-head"><div><span class="eyebrow">WATCH & LISTEN</span><h2>Faith for your everyday.</h2></div><a class="text-link" href="/watch">Explore all messages &#8594;</a></div>${items.length?`<div class="cards">${items.map(mediaCard).join('')}</div>`:'<p>Find worship, teaching, and moments from our church across our social channels.</p><a class="btn outline" href="/watch">Visit our media library</a>'}</section>`;}
export function watchPage(data,shell,head){
 const items=orderedMedia(data),params=new URLSearchParams(location.search);
 const options=(values,all)=>`<option value="">${all}</option>`+[...new Set(values.filter(Boolean))].sort().map(v=>`<option value="${e(v)}">${e(v)}</option>`).join('');
 shell(head('WATCH & LISTEN','A message for every season.','Explore worship, teaching, and stories from VWO Karati. Find a message, revisit a service, or discover something new.')+`<section class="section wrap"><div class="channel-links">${['youtube','facebook','tiktok'].filter(k=>data.settings[k]).map(k=>`<button class="btn outline" type="button" data-channel="${k}" aria-pressed="false">${{youtube:'YouTube',facebook:'Facebook',tiktok:'TikTok'}[k]}</button>`).join('')}</div><p class="muted">Select a channel to browse its recent public content here. Embedded feeds connect to the selected platform.</p><section id="channel-feed" aria-label="Channel content"></section><section id="watch-selected" aria-label="Selected message"></section><form class="media-filters" id="media-search" role="search"><label class="media-query">Search messages<input type="search" name="q" placeholder="Title, topic, preacher, or Bible passage"></label><label><span>Platform</span><select name="platform">${options(['YouTube','Facebook','TikTok'],'All platforms')}</select></label><label><span>Content type</span><select name="type">${options(['Video',...items.map(c=>c.media_type||'Sermon')],'All types')}</select></label><label><span>Preacher</span><select name="speaker">${options(items.map(c=>c.speaker),'All preachers')}</select></label><label><span>Series</span><select name="series">${options(items.map(c=>c.series),'All series')}</select></label><label><span>Date to search</span><select name="dateBy"><option value="date">Service / stream date</option><option value="upload_date">Upload date</option></select></label><label>From<input type="date" name="from"></label><label>To<input type="date" name="to"></label><label><span>Sort</span><select name="sort"><option value="featured">Featured first</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label><button class="btn outline" type="reset">Clear filters</button></form><p id="media-count" role="status"></p><div class="cards" id="media-results"></div><button class="btn outline media-more" id="media-more" hidden>Load more</button></section>`);
 const form=document.querySelector('#media-search'),selected=document.querySelector('#watch-selected');let limit=12;
 for(const key of ['q','platform','type','speaker','series','dateBy','from','to','sort'])if(params.has(key))form.elements[key].value=params.get(key);
 function show(c){if(!c){selected.innerHTML='';return;}const links=sources(c);selected.innerHTML=`<div class="watch-feature"><span class="eyebrow">${e(c.media_type||'Sermon')}</span><h2>${e(c.title)}</h2><p>${e(c.description||'')}</p><p>${e([c.speaker,c.scripture,c.topic,c.series].filter(Boolean).join(' / '))}</p><p>${c.date?'Service / stream: '+e(dateLabel(c.date)):''}${c.upload_date?' / Uploaded: '+e(dateLabel(c.upload_date)):''}</p>${c.detail?`<p class="media-detail">${e(c.detail)}</p>`:''}<p class="muted">Choose a platform to load its player. Playback connects to that platform and follows its privacy policies. If playback is unavailable, open the original video.</p><div class="actions">${links.map((s,i)=>`${s.embed?`<button class="btn" data-play="${i}">Play on ${e(s.name)}</button>`:''}<a class="text-link" href="${e(s.url)}" target="_blank" rel="noopener">Open ${e(s.name)} &#8599;</a>`).join('')}</div><div id="media-player"></div><button class="btn outline small media-close" type="button">Close message</button></div>`;
 selected.querySelectorAll('[data-play]').forEach(button=>button.onclick=()=>{const source=links[Number(button.dataset.play)];const frame=document.createElement('iframe');frame.src=source.embed;frame.title=c.title+' on '+source.name;frame.allow='fullscreen; encrypted-media; picture-in-picture';frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';document.querySelector('#media-player').replaceChildren(frame);});
 selected.querySelector('.media-close').onclick=()=>{show(null);const u=new URL(location.href);u.searchParams.delete('video');history.replaceState(null,'',u);form.elements.q.focus();};
 }
 function render(){const f=Object.fromEntries(new FormData(form)),query=f.q.trim().toLowerCase();let rows=items.filter(c=>(!query||[c.title,c.description,c.detail,c.speaker,c.scripture,c.topic,c.series].join(' ').toLowerCase().includes(query))&&(!f.platform||sources(c).some(s=>s.name===f.platform))&&(!f.type||(c.media_type||'Sermon')===f.type)&&(!f.speaker||c.speaker===f.speaker)&&(!f.series||c.series===f.series)&&(!f.from||(c[f.dateBy]&&c[f.dateBy].slice(0,10)>=f.from))&&(!f.to||(c[f.dateBy]&&c[f.dateBy].slice(0,10)<=f.to)));
 if(f.sort!=='featured')rows.sort((a,b)=>(a[f.dateBy]||'').localeCompare(b[f.dateBy]||'')*(f.sort==='oldest'?1:-1));
 document.querySelector('#media-count').textContent=f.from&&f.to&&f.from>f.to?'Choose an end date on or after the start date.':`${rows.length} message${rows.length===1?'':'s'}`;
 document.querySelector('#media-results').innerHTML=rows.slice(0,limit).map(mediaCard).join('')||`<div class="empty media-empty">${items.length?'No messages match these filters. Try another keyword or clear the filters.':'Choose YouTube, Facebook, or TikTok above to browse the church accounts.'}</div>`;
 document.querySelector('#media-more').hidden=rows.length<=limit;
 const u=new URL(location.href);for(const [k,v] of Object.entries(f)){if(v)u.searchParams.set(k,v);else u.searchParams.delete(k);}history.replaceState(null,'',u);
 }
 form.onsubmit=event=>event.preventDefault();form.oninput=()=>{limit=12;render();};form.onreset=()=>setTimeout(()=>{limit=12;render();},0);document.querySelector('#media-more').onclick=()=>{limit+=12;render();};
 if(params.get('video')?.startsWith('youtube-')&&!items.some(c=>c.id===params.get('video'))){api('/api/channel/youtube').then(feed=>{for(const c of feed.items)if(!items.some(row=>row.id===c.id))items.push(c);const c=items.find(row=>row.id===params.get('video'));if(c)show(c);render();}).catch(()=>{});}
 if(params.has('video')){const c=items.find(c=>c.id===params.get('video'));if(c)show(c);else selected.innerHTML='<p class="notice">This message is no longer available. Browse the library below.</p>';}

 let channelRequest=0;
 document.querySelectorAll('[data-channel]').forEach(button=>button.onclick=async()=>{
  const sequence=++channelRequest,key=button.dataset.channel,names={youtube:'YouTube',facebook:'Facebook',tiktok:'TikTok'},host=document.querySelector('#channel-feed');
  document.querySelectorAll('[data-channel]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  host.innerHTML=`<div class="watch-feature"><h2>${names[key]}</h2><p><a class="text-link" href="${e(data.settings[key])}" target="_blank" rel="noopener">Open the full ${names[key]} account &#8599;</a></p><div id="channel-body" role="status">Loading channel content...</div></div>`;
  const body=host.querySelector('#channel-body');
  if(key==='youtube'){
   try{const feed=await api('/api/channel/youtube');if(sequence!==channelRequest)return;
    for(const c of feed.items){if(!items.some(row=>sources(row).some(s=>s.url===c.youtube_url)))items.push(c);}
    form.elements.platform.value='YouTube';form.elements.dateBy.value='upload_date';form.elements.q.value='';form.elements.from.value='';form.elements.to.value='';form.elements.type.value='';form.elements.speaker.value='';form.elements.series.value='';limit=12;render();
    body.textContent=feed.items.length?`${feed.stale?'Last available':'Recent'} YouTube uploads are listed below. Search and date filters apply to these uploads; the full archive remains on YouTube.`:'No recent uploads were returned. Open the full channel above.';
   }catch(error){if(sequence===channelRequest)body.textContent=error.message;}
  }else{
   form.elements.platform.value=names[key];limit=12;render();
   body.innerHTML='<p>This platform controls the feed shown below. Website search and date filters apply only to the message library, not this embedded feed. If the feed is unavailable or asks you to sign in, open the account above.</p>';
   const frame=document.createElement('iframe');frame.title=names[key]+' church account';frame.className='channel-frame';frame.referrerPolicy='strict-origin-when-cross-origin';
   frame.src=key==='tiktok'?'/channel/tiktok':'https://www.facebook.com/plugins/page.php?href='+encodeURIComponent(data.settings.facebook)+'&tabs=timeline&width=500&height=650&small_header=true&adapt_container_width=true&hide_cover=false&show_facepile=false';body.append(frame);
  }
 });
 render();
}
