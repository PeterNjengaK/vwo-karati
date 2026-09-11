import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {trafficAnalytics} from '../server/traffic.mjs';
test('traffic counts public requests, masks networks and respects privacy and bot filters',()=>{
 const db=new DatabaseSync(':memory:'),traffic=trafficAnalytics(db);
 const req={method:'GET',headers:{host:'church.test','user-agent':'Example Mobile Browser',referer:'https://example.org/path?private=secret'}};
 traffic.record(req,'/','192.0.2.123');traffic.record(req,'/about','192.0.2.123');
 traffic.record(req,'/admin','192.0.2.123');traffic.record({...req,headers:{...req.headers,dnt:'1'}},'/','192.0.2.125');
 traffic.record({...req,headers:{...req.headers,'sec-gpc':'1'}},'/','192.0.2.125');traffic.record({...req,headers:{...req.headers,'user-agent':'Googlebot'}},'/','192.0.2.125');
 const r=traffic.report(7);assert.equal(r.views,2);assert.equal(r.visitor_days,1);assert.equal(r.networks[0].label,'192.0.2.0/24');assert.equal(r.referrers[0].label,'example.org');assert.equal(r.devices[0].label,'Mobile');
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM traffic').all()).includes('192.0.2.123'));db.close();
});
