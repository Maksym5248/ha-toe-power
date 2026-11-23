import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {NotificationService,clientKey,kyivInstant,reminderEvents} from '../notifications.mjs';
import {createAppServer} from '../server.mjs';
import {Readable} from 'node:stream';
const home={city:{id:100,name:'Місто'},street:{id:200,name:'Вулиця'},building:{buildingName:'1-А'}};
const graph=(day,times)=>({dateGraph:day+'T00:00:00Z',dateCreate:day+'T10:00:00Z',dataJson:{'2.2':{times}}});
const times = (offStart=26,offEnd=30)=>Object.fromEntries(Array.from({length:48},(_,i)=>[`${String(i>>1).padStart(2,'0')}:${i%2?'30':'00'}`,i>=offStart&&i<offEnd?'1':'0']));
async function setup(t) {
 const directory=await mkdtemp(join(tmpdir(),'toe-notifications-'));t.after(()=>rm(directory,{recursive:true,force:true}));
 const sends=[];let now=new Date('2026-11-23T06:30:00Z');
 const fetcher=async(url,options={})=>{
  if(String(url).endsWith('/services')) return Response.json([{domain:'notify',services:{mobile_app_alice:{name:'Alice phone'},mobile_app_bob:{name:'Bob phone'},notify:{}}}]);
  if(String(url).includes('/services/notify/')){sends.push({target:String(url).split('/').at(-1),body:JSON.parse(options.body)});return Response.json([]);}
  if(String(url).includes('building-groups'))return Response.json({buildingGroups:[{chergGpv:'2.2'}]});
  if(String(url).includes('a_gpv_g'))return Response.json({'hydra:member':[graph('2026-11-23',times())]});
  throw new Error('Unexpected request '+url);
 };
 const service=new NotificationService({directory,token:'test-token',fetcher,clock:()=>now,pin:()=> '123456'});await service.init();
 return {service,sends,setNow:value=>{now=new Date(value);},directory,fetcher};
}
async function pair(service,user,phone) {const key=clientKey(user);await service.startPairing(key,phone);await service.confirmPairing(key,'123456');return key;}
test('pairing requires possession, isolates accounts and persists across browsers/restarts',async t=>{
 const {service,sends,directory,fetcher}=await setup(t);
 const alice=clientKey('alice'),bob=clientKey('bob');
 await service.startPairing(alice,'mobile_app_alice');
 await assert.rejects(service.confirmPairing(bob,'123456'));
 await assert.rejects(service.confirmPairing(alice,'000000'));
 assert.equal(service.state(alice).paired,false);
 await service.confirmPairing(alice,'123456');
 assert.equal(service.state(bob).paired,false);
 assert.equal(sends[0].target,'mobile_app_alice');
 await service.saveHome(home);
 await service.save(alice,{enabled:true,time:'09:00',beforeOff:true,beforeOn:false});
 const restarted=new NotificationService({directory,token:'test-token',fetcher});await restarted.init();
 assert.equal(restarted.state(clientKey('alice')).beforeOff,true);
 assert.equal(restarted.state(bob).paired,false);
 assert.equal(restarted.home.building.buildingName,'1-А');
 await assert.rejects(service.startPairing(bob,'notify'));
});
test('code expires and six incorrect attempts cannot confirm a phone',async t=>{
 const {service,setNow}=await setup(t);const key=clientKey('alice');
 await service.startPairing(key,'mobile_app_alice');
 setNow('2026-11-23T06:36:00Z');await assert.rejects(service.confirmPairing(key,'123456'));
 await service.startPairing(key,'mobile_app_alice');
 for(let i=0;i<5;i++)await assert.rejects(service.confirmPairing(key,'999999'));
 await assert.rejects(service.confirmPairing(key,'123456'));
});
test('personal toggles deliver only to opted-in phone, with persistent deduplication',async t=>{
 const {service,sends,setNow}=await setup(t);
 const alice=await pair(service,'alice','mobile_app_alice'),bob=await pair(service,'bob','mobile_app_bob');
 await service.saveHome(home);
 await service.save(alice,{enabled:false,time:'09:00',beforeOff:true,beforeOn:true});
 await service.save(bob,{enabled:true,time:'09:00',beforeOff:false,beforeOn:false});
 sends.length=0;
 setNow('2026-11-23T10:30:00Z'); // 12:30 Kyiv: 30 minutes before 13:00 outage.
 await service.tick();await service.tick();
 assert.equal(sends.length,1);assert.equal(sends[0].target,'mobile_app_alice');assert.match(sends[0].body.message,/13:00/);
 setNow('2026-11-23T12:30:00Z'); // 14:30 Kyiv: before 15:00 restoration.
 await service.tick();assert.equal(sends.length,2);assert.match(sends[1].body.message,/очікуване відновлення/);
 await service.save(alice,{enabled:false,time:'09:00',beforeOff:false,beforeOn:false});
 assert.equal(service.state(bob).enabled,true);
});
test('morning uses shared address, persists sent date and does not send a no-outage summary',async t=>{
 const {service,sends,setNow}=await setup(t);const key=await pair(service,'alice','mobile_app_alice');
 await service.saveHome(home);await service.save(key,{enabled:true,time:'09:00',beforeOff:false,beforeOn:false});sends.length=0;
 setNow('2026-11-23T07:00:00Z');await service.tick();await service.tick();assert.equal(sends.length,1);assert.match(sends[0].body.message,/13:00–15:00/);
 service.graphCache=null;service.graphData=async()=>({groups:['2.2'],records:[graph('2026-11-24',times(0,0))]});
 setNow('2026-11-24T07:00:00Z');await service.tick();assert.equal(sends.length,1);
});
test('transition boundaries include switching, cross midnight and never infer from missing slots',()=>{
 const previous=times(47,48),current=times(0,2);current['01:00']='10';
 const events=reminderEvents({groups:['2.2'],records:[graph('2026-11-22',previous),graph('2026-11-23',current)]},'2026-11-23');
 assert.ok(events.some(e=>e.type==='off'&&e.day==='2026-11-22'&&e.time==='23:30'));
 assert.ok(!events.some(e=>e.type==='off'&&e.day==='2026-11-23'&&e.time==='00:00'));
 assert.ok(events.some(e=>e.type==='on'&&e.time==='01:30'));
 assert.equal(kyivInstant('2026-11-23','00:00'),Date.parse('2026-11-22T22:00:00Z'));
 assert.equal(kyivInstant('2026-07-23','00:00'),Date.parse('2026-07-22T21:00:00Z'));
 assert.equal(reminderEvents({groups:['2.2'],records:[graph('2026-11-23',{'13:00':'1','13:30':'0'})]},'2026-11-23').filter(e=>e.type==='off').length,0);
});
function call(server,{url,method='GET',user='alice',body,ip='172.30.32.2'}){
 return new Promise(resolve=>{
  const req=Readable.from(body?[JSON.stringify(body)]:[]);Object.assign(req,{url,method,headers:{'x-remote-user-id':user,'content-type':'application/json'},socket:{remoteAddress:ip}});
  let status;server.emit('request',req,{writeHead:code=>{status=code;},end:text=>resolve({status,body:JSON.parse(text||'{}')})});
 });
}
test('HTTP scopes subscriptions by trusted user, denies forged identity and non-admin home edits',async t=>{
 const {service}=await setup(t);await pair(service,'alice','mobile_app_alice');
 const server=createAppServer({addon:true,notifications:service,profileFor:async id=>({userId:id,isAdmin:id==='admin'})});
 assert.equal((await call(server,{url:'/app-api/notifications',ip:'127.0.0.1'})).status,403);
 assert.equal((await call(server,{url:'/app-api/notifications',user:''})).status,401);
 assert.equal((await call(server,{url:'/app-api/home',method:'POST',body:{address:home}})).status,403);
 assert.equal((await call(server,{url:'/app-api/home',method:'POST',user:'admin',body:{address:home}})).status,200);
 assert.equal((await call(server,{url:'/app-api/notifications',user:'bob'})).body.paired,false);
 assert.equal((await call(server,{url:'/app-api/notifications',user:'alice'})).body.paired,true);
});
test('reminders survive restart without duplicate delivery and handle next-day midnight',async t=>{
 const {service,sends,setNow,directory,fetcher}=await setup(t);const key=await pair(service,'alice','mobile_app_alice');
 await service.saveHome(home);await service.save(key,{enabled:false,time:'09:00',beforeOff:true,beforeOn:true});sends.length=0;
 setNow('2026-11-23T10:30:00Z');await service.tick();assert.equal(sends.length,1);
 const restart=new NotificationService({directory,token:'test-token',fetcher,clock:()=>new Date('2026-11-23T10:30:00Z')});await restart.init();await restart.tick();assert.equal(sends.length,1);
 service.graphData=async()=>({groups:['2.2'],records:[graph('2026-11-23',times(48,48)),graph('2026-11-24',times(0,2))]});service.graphCache=null;
 setNow('2026-11-23T21:30:00Z'); // Kyiv 23:30, next-day outage at midnight.
 await service.tick();assert.equal(sends.length,2);assert.match(sends.at(-1).body.message,/00:00/);
 service.graphData=async()=>({groups:['2.2'],records:[graph('2026-11-23',times(48,48)),graph('2026-11-24',times(48,48))]});service.graphCache=null;
 setNow('2026-11-23T21:31:00Z');await service.tick();assert.equal(sends.length,2);
});
