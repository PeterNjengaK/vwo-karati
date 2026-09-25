import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdtempSync,mkdirSync} from 'node:fs';
import {openDatabase} from '../server/db.mjs';
import {hashPassword} from '../server/security.mjs';
import {createApp} from '../server/index.mjs';
import {parseFeed,channelFeeds} from '../server/channels.mjs';
import {sources} from '../web/watch.js';
test('media sources accept only trusted HTTPS embed hosts',()=>{
 assert.equal(sources({url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'})[0].embed,'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
 assert.equal(sources({url:'https://youtube.com.attacker.test/watch?v=dQw4w9WgXcQ'})[0].embed,'');
 assert.deepEqual(sources({url:'javascript:alert(1)'}),[]);
 assert.equal(sources({url:'https://www.tiktok.com/@church/video/123456789'})[0].embed,'https://www.tiktok.com/player/v1/123456789');
});
test('admin media publication, filters, consent playback, and mobile layout',async()=>{
 mkdirSync('test-results',{recursive:true});const dir=mkdtempSync('test-results/media-');const db=openDatabase(':memory:');
 const password='Media-test-password-123!';db.prepare('INSERT INTO users(id,name,email,password,role) VALUES(?,?,?,?,?)').run('media-admin','Media Admin','media@test.org',await hashPassword(password),'admin');
 const base='http://127.0.0.1:3117',server=createApp({db,env:{PUBLIC_ORIGIN:base,DATABASE_PATH:dir+'/church.sqlite'}});await new Promise(r=>server.listen(3117,'127.0.0.1',r));let browser;
 try{
 browser=await chromium.launch({headless:true,...(process.platform==='win32'?{executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}:{})});
 const p=await browser.newPage({viewport:{width:1440,height:950}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base+'/admin');await p.getByLabel('Email address').fill('media@test.org');await p.getByLabel('Password',{exact:true}).fill(password);await p.getByRole('button',{name:'Sign in to church office'}).click();await p.getByRole('button',{name:'Website content',exact:true}).click();
 await p.getByRole('button',{name:'Add media / sermon'}).click();await p.getByLabel('Title',{exact:true}).fill('Walking in faith');await p.getByLabel('Preacher / speaker').fill('Reverend Kamau');await p.getByLabel('Topic',{exact:true}).fill('Hope');await p.getByLabel('Bible passage').fill('Hebrews 11');await p.getByLabel('Series',{exact:true}).fill('Faith in action');await p.getByLabel('Date (Kenya time)',{exact:true}).fill('2026-09-20T10:00');await p.getByLabel('Upload date',{exact:true}).fill('2026-09-22');await p.getByLabel('YouTube video URL').fill('https://www.youtube.com/watch?v=dQw4w9WgXcQ');await p.getByLabel('Facebook video URL').fill('https://www.facebook.com/church/videos/123456789');await p.getByLabel('Feature on the homepage').check();await p.getByLabel('Publish on the website').check();await p.getByRole('button',{name:'Save content'}).click();await p.getByText('Website content saved.',{exact:true}).waitFor();
 const content=db.prepare("SELECT * FROM content WHERE kind='sermon'").get();assert.equal(JSON.parse(content.data).speaker,'Reverend Kamau');
 db.prepare('INSERT INTO content VALUES(?,?,?,0)').run('private-message','sermon',JSON.stringify({title:'Private draft',url:'https://youtu.be/dQw4w9WgXcQ'}));
 const response=await fetch(base+'/api/public');assert.ok(!(await response.json()).content.some(c=>c.id==='private-message'));
 const publicPage=await browser.newPage({viewport:{width:1440,height:950}});publicPage.on('pageerror',e=>errors.push(e.message));await publicPage.goto(base+'/watch');await publicPage.getByRole('heading',{name:'Walking in faith'}).waitFor();await publicPage.getByLabel('Search messages').fill('Hebrews');await publicPage.getByRole('combobox',{name:/^Platform/}).selectOption('Facebook');assert.equal(await publicPage.locator('.media-card').count(),1);
 await publicPage.getByLabel('From',{exact:true}).fill('2026-09-21');assert.equal(await publicPage.locator('.media-card').count(),0);await publicPage.getByRole('combobox',{name:/^Date to search/}).selectOption('upload_date');assert.equal(await publicPage.locator('.media-card').count(),1);
 await publicPage.getByRole('link',{name:'Watch message',exact:false}).click();await publicPage.getByRole('heading',{name:'Walking in faith'}).first().waitFor();assert.equal(await publicPage.locator('iframe').count(),0);
 await publicPage.route('https://www.youtube-nocookie.com/**',r=>r.fulfill({contentType:'text/html',body:'Test player'}));await publicPage.getByRole('button',{name:'Play on YouTube'}).click();assert.equal(await publicPage.locator('iframe').count(),1);
 await publicPage.screenshot({path:'test-results/media-desktop.png',fullPage:true});await publicPage.getByRole('button',{name:'Close message'}).click();assert.equal(await publicPage.locator('iframe').count(),0);
 await publicPage.setViewportSize({width:390,height:844});assert.ok(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await publicPage.screenshot({path:'test-results/media-mobile.png',fullPage:true});
 await publicPage.route('**/api/channel/youtube',r=>r.fulfill({json:{items:[{id:'youtube-fL8wUivifJA',kind:'sermon',title:'Recent channel service',youtube_url:'https://www.youtube.com/watch?v=fL8wUivifJA',upload_date:'2026-09-20',media_type:'Video'}]}}));
 await publicPage.getByRole('button',{name:'YouTube',exact:true}).click();await publicPage.getByRole('heading',{name:'Recent channel service'}).waitFor();
 await publicPage.getByRole('button',{name:'Facebook',exact:true}).click();assert.match(await publicPage.locator('.channel-frame').getAttribute('src'),/^https:\/\/www.facebook.com\/plugins\/page.php/);
 await publicPage.getByRole('button',{name:'TikTok',exact:true}).click();assert.equal(await publicPage.locator('.channel-frame').getAttribute('src'),'/channel/tiktok');
 await publicPage.goto(base);await publicPage.getByRole('heading',{name:'Faith for your everyday.'}).waitFor();await publicPage.getByRole('heading',{name:'Walking in faith'}).waitFor();
 assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));db.close();}
});

test('YouTube feed parsing, caching, and URL restrictions',async()=>{
 const xml='<feed><entry><yt:videoId>fL8wUivifJA</yt:videoId><title>Worship &amp; teaching</title><published>2026-09-20T10:00:00Z</published><media:description>Welcome</media:description></entry><entry><yt:videoId>invalid</yt:videoId></entry></feed>';
 assert.equal(parseFeed(xml).length,1);assert.equal(parseFeed(xml)[0].title,'Worship & teaching');
 let calls=0;const feeds=channelFeeds(async()=>{calls++;return new Response(xml);});
 await feeds('https://www.youtube.com/channel/UCDo3G1rdEls0kfGyJwqcppg');await feeds('https://www.youtube.com/channel/UCDo3G1rdEls0kfGyJwqcppg');assert.equal(calls,1);
 await assert.rejects(feeds('https://attacker.test/channel/UCDo3G1rdEls0kfGyJwqcppg'));assert.equal(calls,1);
});
