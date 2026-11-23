import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { dayKey, graphRequest, collection, slotsFor, outageRanges, shiftDay } from './src/api.js';
const hash = value => createHash('sha256').update(value).digest('hex');
export const clientKey = user => hash(user);
export function validAddress(a) { return a && /^\d+$/.test(String(a.city?.id)) && /^\d+$/.test(String(a.street?.id)) && typeof a.building?.buildingName === 'string' && a.building.buildingName.length > 0 && a.building.buildingName.length <= 120; }
export function kyivClock(date) {
  return { day: dayKey(date), time: new Intl.DateTimeFormat('en-GB', { timeZone:'Europe/Kyiv',hour:'2-digit',minute:'2-digit',hourCycle:'h23' }).format(date) };
}
export class NotificationService {
  constructor({ directory, token, fetcher = fetch, clock = () => new Date(), pin = () => String(randomInt(100000,1000000)) }) {
    Object.assign(this,{directory,token,fetcher,clock,pin}); this.records = {}; this.home = null; this.pairings = new Map(); this.limits = new Map(); this.running = false; this.queue = Promise.resolve();
  }
  async init() {
    await mkdir(this.directory,{recursive:true});
    try { const saved = JSON.parse(await readFile(join(this.directory,'subscriptions.json'),'utf8')); this.records = saved.subscriptions || {}; this.home = saved.home || null; }
    catch(e) { if(e.code !== 'ENOENT') throw e; }
  }
  async persist() {
    this.queue = this.queue.catch(()=>{}).then(async()=>{
      const file = join(this.directory,'subscriptions.json');
      await writeFile(file+'.tmp',JSON.stringify({home:this.home,subscriptions:this.records}),{mode:0o600}); await rename(file+'.tmp',file);
    });
    return this.queue;
  }
  async ha(path, body) {
    const response = await this.fetcher(`http://supervisor/core/api/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
    if(!response.ok) throw new Error('Home Assistant не виконав запит. Перевірте журнал add-on.');
    return response.json();
  }
  async devices() {
    const services = await this.ha('services');
    const notify = services.find(s=>s.domain==='notify')?.services || {};
    return Object.entries(notify).filter(([id])=>/^mobile_app_[a-z0-9_]+$/.test(id)).map(([id,info])=>({id,name:info.name || id.slice(11).replaceAll('_',' ')}));
  }
  state(key) {
    const r = this.records[key];
    return r ? { paired:true,device:r.device,enabled:r.enabled,time:r.time,beforeOff:!!r.beforeOff,beforeOn:!!r.beforeOn,lastSent:r.lastSent || null } : {paired:false,enabled:false,beforeOff:false,beforeOn:false,time:'09:00'};
  }
  async startPairing(key, target) {
    if(!(await this.devices()).some(d=>d.id===target)) throw new Error('Оберіть телефон із застосунком Home Assistant.');
    const now = +this.clock();
    const old = this.limits.get(key);
    if(old && now-old < 60000) throw new Error('Зачекайте хвилину перед повторним кодом.');
    const deviceLimit = this.limits.get('target:'+target);
    if(deviceLimit && now-deviceLimit < 60000) throw new Error('Код для цього телефона вже надіслано. Зачекайте хвилину.');
    const code = this.pin();
    this.limits.set(key,now); this.limits.set('target:'+target,now);
    this.pairings.set(key,{target,digest:hash(code),expires:now+300000,attempts:0});
    await this.ha(`services/notify/${target}`,{title:'Світло вдома — підтвердження телефона',message:`Ваш код: ${code}. Введіть його в налаштуваннях «Світло вдома». Діє 5 хвилин.`});
  }
  async confirmPairing(key, code) {
    const p = this.pairings.get(key);
    if(!p || p.expires < +this.clock() || ++p.attempts > 5) {this.pairings.delete(key);throw new Error('Код закінчився. Запросіть новий.');}
    if(!timingSafeEqual(Buffer.from(p.digest),Buffer.from(hash(String(code))))) throw new Error('Неправильний код.');
    // One phone may be paired to only one subscription, avoiding duplicate delivery
    // or another browser overriding its schedule. Re-pairing proves possession.
    const devices = await this.devices();
    if(!devices.some(d=>d.id===p.target)) throw new Error('Телефон більше недоступний.');
    for(const [id,r] of Object.entries(this.records)) if(id!==key && r.device.id===p.target) delete this.records[id];
    const old = this.records[key];
    this.records[key]={device:devices.find(d=>d.id===p.target),enabled:false,time:old?.time || '09:00',beforeOff:false,beforeOn:false,lastSent:old?.device.id===p.target?old.lastSent:null};
    this.pairings.delete(key); await this.persist(); return this.state(key);
  }
  async save(key, input) {
    const old = this.records[key]; if(!old) throw new Error('Спочатку підтвердьте свій телефон.');
    if(typeof input.enabled!=='boolean' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error('Перевірте час сповіщення.');
    if(typeof input.beforeOff!=='boolean' || typeof input.beforeOn!=='boolean') throw new Error('Перевірте параметри нагадувань.');
    if((input.enabled||input.beforeOff||input.beforeOn) && !validAddress(this.home)) throw new Error('Адміністратор має зберегти адресу дому.');
    if((input.enabled||input.beforeOff||input.beforeOn) && !(await this.devices()).some(d=>d.id===old.device.id)) throw new Error('Телефон недоступний у Home Assistant.');
    this.records[key]={...old,enabled:input.enabled,time:input.time,beforeOff:input.beforeOff,beforeOn:input.beforeOn}; await this.persist();return this.state(key);
  }
  async saveHome(address) {
    if(!validAddress(address)) throw new Error('Перевірте адресу дому.');
    const name=v=>typeof v==='string'?v.slice(0,160):'';
    this.home={city:{id:address.city.id,name:name(address.city.name)},street:{id:address.street.id,name:name(address.street.name)},building:{buildingName:address.building.buildingName}};
    this.graphCache=null; await this.persist();return this.home;
  }
  async test(key) {
    const r = this.records[key]; if(!r) throw new Error('Спочатку підтвердьте телефон.');
    const now = +this.clock(); if(now-(this.limits.get('test:'+key)||0)<60000) throw new Error('Зачекайте хвилину перед повторним тестом.');
    this.limits.set('test:'+key,now);
    await this.ha(`services/notify/${r.device.id}`,{title:'Світло вдома',message:'Сповіщення для цього телефона налаштовані правильно.'});
  }
  async graphData(address, date) {
    const get = async(path,params,headers={})=> {
      const response = await this.fetcher(`https://api-poweron.toe.com.ua/api/${path}?${params}`,{headers:{Accept:'application/json',...headers},signal:AbortSignal.timeout(20000)});
      if(!response.ok) throw new Error('TOE unavailable');return response.json();
    };
    const data = await get('pw-accounts/building-groups',new URLSearchParams({cityId:address.city.id,streetId:address.street.id,buildingNames:address.building.buildingName}));
    if(!Array.isArray(data.buildingGroups)) throw new Error('Invalid groups');
    const groups = [...new Set(data.buildingGroups.map(g=>g.chergGpv).filter(g=>/^\d+\.\d+(?:#\d+)?$/.test(g)))];
    if(!groups.length) return {groups:[],records:[]};
    const {params,headers} = graphRequest(address,groups,date);
    params.set('after', `${shiftDay(date,-2)}T12:00:00+00:00`);
    const records = collection(await get('a_gpv_g',params,headers));
    return {groups,records};
  }
  morningMessage({groups,records},date) {
    if(!groups.length) return 'Для адреси дому немає черги ГПВ. Перевірте налаштування адреси.';
    records=records.filter(r=>String(r.dateGraph).slice(0,10)===date).sort((a,b)=>String(b.dateCreate||'').localeCompare(String(a.dateCreate||'')));
    const messages=[];
    for(const group of groups) {
      const slots=slotsFor(records[0],group);
      if(!slots) {messages.push(`Черга ${group}: графік ще не опубліковано.`);continue;}
      const ranges=outageRanges(slots);
      if(ranges.length) messages.push(`Черга ${group}: ${ranges.map(r=>`${r.start}–${r.end}${r.code==='10'?' (перемикання)':''}`).join(', ')}.`);
      if(slots.some(s=>s.code==='?')) messages.push(`Черга ${group}: є інтервали без даних.`);
    }
    return messages.join('\n');
  }
  async tick() {
    if(this.running || !validAddress(this.home)) return;this.running=true;
    try {
      const now=this.clock(),{day,time}=kyivClock(now),home=this.home;
      const minutes=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
      const active=Object.values(this.records).some(r=>r.enabled||r.beforeOff||r.beforeOn);
      if(!active) return;
      if(!this.graphCache || +now-this.graphCache.fetched>60000) this.graphCache={data:await this.graphData(home,day),fetched:+now};
      const data=this.graphCache.data;
      if(this.home!==home) return;
      const events=reminderEvents(data,day);
      for(const [key,r] of Object.entries(this.records)) {
        if(r.retryAfter && +now<r.retryAfter) continue;
        try {
          if(r.enabled && r.lastSent!==day && time>=r.time && minutes(time)-minutes(r.time)<=60) {
            const message=this.morningMessage(data,day);
            if(message) await this.ha(`services/notify/${r.device.id}`,{title:`Світло вдома · ${day.split('-').reverse().join('.')}`,message:message+'\nЧас за Києвом. Графік може змінюватися.'});
            if(this.records[key]!==r) continue;
            r.lastSent=day; await this.persist();
          }
          for(const event of events) {
            if(this.records[key]!==r || this.home!==home) break;
            if(!(event.type==='off'?r.beforeOff:r.beforeOn)) continue;
            const until=event.at-+now;
            // Only remind before the event, within 30 min. Skip stale alerts after outages.
            if(until<=0 || until>1800000) continue;
            const id=hash(`${JSON.stringify(home)}:${event.group}:${event.type}:${event.day}:${event.time}`);
            if(r.sent?.[id]) continue;
            const left=Math.ceil(until/60000);
            const message=event.type==='off'?`Черга ${event.group}: ${event.possible?'можливе відключення / перемикання':'планове відключення'} о ${event.time} (приблизно через ${left} хв).`:`Черга ${event.group}: очікуване відновлення за графіком о ${event.time} (приблизно через ${left} хв). Фактичну наявність світла не вимірюємо.`;
            await this.ha(`services/notify/${r.device.id}`,{title:event.type==='off'?'Світло вдома — перед відключенням':'Світло вдома — перед відновленням',message:message+' Час за Києвом. Графік може змінитися.'});
            if(this.records[key]!==r) break;
            r.sent=Object.fromEntries(Object.entries(r.sent||{}).filter(([,stamp])=>+now-stamp<259200000));r.sent[id]=+now;await this.persist();
          }
          delete r.retryAfter;
        } catch {r.retryAfter=+now+60000;console.error('Notification delivery failed; retry in one minute.');}
      }
    } finally {this.running=false;}
  }
}
// The source publishes local civil times. Convert using Kyiv's offset for that date.
export function kyivInstant(day,time) {
  const utc=Date.parse(`${day}T${time}:00Z`);
  const offset=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Kyiv',timeZoneName:'shortOffset'}).formatToParts(new Date(utc)).find(p=>p.type==='timeZoneName').value;
  const match=offset.match(/GMT([+-])(\d+)(?::(\d+))?/);
  return utc-(match?(match[1]==='+'?1:-1)*(Number(match[2])*60+Number(match[3]||0))*60000:0);
}
export function reminderEvents({groups,records},today) {
  const events=[];
  for(const group of groups) {
    let previous=null;
    for(const day of [shiftDay(today,-1),today,shiftDay(today,1)]) {
      const record=records.filter(r=>String(r.dateGraph).slice(0,10)===day).sort((a,b)=>String(b.dateCreate||'').localeCompare(String(a.dateCreate||'')))[0];
      const slots=slotsFor(record,group);
      if(!slots){previous=null;continue;}
      for(const slot of slots) {
        const unavailable=['1','10'].includes(slot.code);
        if(previous && previous.code==='0' && unavailable) events.push({group,type:'off',day,time:slot.time,at:kyivInstant(day,slot.time),possible:slot.code==='10'});
        if(previous && ['1','10'].includes(previous.code) && slot.code==='0') events.push({group,type:'on',day,time:slot.time,at:kyivInstant(day,slot.time)});
        previous=slot;
      }
    }
  }
  return events;
}
