import React, { useEffect, useState } from 'react';
import { collection, dayKey, graphRequest, outageRanges, request, shiftDay, slotsFor, statusInfo } from './api';
import NotificationSettings, { appRequest } from './NotificationSettings';
import './styles.css';
import SearchSelect from './SearchSelect';
const DEFAULT = { city: null, street: null, building: null };
function readSaved(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
const validAddress = a => a?.city?.id && a?.street?.id && typeof a?.building?.buildingName === 'string';
export default function AppRoot() {
  const [context,setContext]=useState(null),[contextError,setContextError]=useState(''),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;appRequest('context').then(data=>{if(active)setContext(data);}).catch(e=>{if(active)setContextError(e.message);});return ()=>{active=false;};},[attempt]);
  if(contextError) return <div className="empty"><p role="alert">{contextError}</p><button onClick={()=>{setContextError('');setAttempt(x=>x+1);}}>Повторити з’єднання</button></div>;
  return context ? <App key={context.userId} context={context} /> : <p className="empty">Завантажуємо налаштування…</p>;
}
function DayCard({ record, group, day, loading }) {
  const slots = slotsFor(record, group);
  const ranges = outageRanges(slots);
  return <section className="schedule-card">
    <header className="card-header"><h2>{day.split('-').reverse().join('.')} <span>Черга {group.split('#')[0]}</span></h2><p>Інформація станом на: <strong>{record?.dateCreate ? String(record.dateCreate).slice(0,10).split('-').reverse().join('.') + ' ' + String(record.dateCreate).slice(11,19) : '—'}</strong></p></header>
    {!slots ? <div className="empty"><h3>{loading ? 'Завантажуємо графік…' : 'Графік ще не опубліковано'}</h3><p>Щойно ТОЕ опублікує дані для цієї черги, вони з’являться тут.</p></div> : <><div className="hours">{Array.from({ length: 24 }, (_, h) => {
      const pair = slots.slice(h * 2, h * 2 + 2);
      const same = pair[0].code === pair[1].code;
      return <div className="hour" key={h}><div className="hour-label">{String(h).padStart(2, '0')}:00<br />{String(h + 1).padStart(2, '0')}:00</div><div className="hour-bar">{pair.map(slot => { const [cls, label] = statusInfo(slot.code); return <div key={slot.time} className={`half ${cls}`} title={`${slot.time}–${slot.end}: ${label}`} aria-label={`${slot.time}–${slot.end}: ${label}`} role="img"></div>; })}{same && ['0','1'].includes(pair[0].code) && <img className="status-icon" src={`./assets/light-${pair[0].code === '0' ? 'on' : 'off'}.svg`} alt="" />}</div></div>;
    })}</div><p className="range-summary">{ranges.length ? ranges.map(r => `${r.start}–${r.end}${r.code === '10' ? ' (перемикання)' : ''}`).join(' · ') : 'Планових відключень у наявних даних немає.'}{slots.some(s => s.code === '?') ? ' Є інтервали без даних.' : ''}</p></>}
  </section>;
}
function App({context}) {
  const storageKey = `toe-settings-v3:${context.userId}`;
  const [saved] = useState(()=>context.available?{address:context.home}:readSaved(storageKey));
  const [address, setAddress] = useState(validAddress(saved.address) ? saved.address : DEFAULT);
  const [draft, setDraft] = useState(address);
  const [cities, setCities] = useState([]), [streets, setStreets] = useState([]), [buildings, setBuildings] = useState([]);
  const [groups, setGroups] = useState([]), [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [settingsError, setSettingsError] = useState('');
  const [revision, setRevision] = useState(0), [updated, setUpdated] = useState(null);
  const [day, setDay] = useState(0), [open, setOpen] = useState(!validAddress(saved.address));
  useEffect(() => { try { !context.available && localStorage.setItem(storageKey, JSON.stringify({ address })); } catch {} }, [address, storageKey]);
  useEffect(()=> {
    if(!context.available) return;
    const c=new AbortController();
    appRequest('home').then(data=>{if(!c.signal.aborted && JSON.stringify(data.home)!==JSON.stringify(address)){setAddress(data.home||DEFAULT);setDraft(data.home||DEFAULT);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);});
    return ()=>c.abort();
  },[revision]);
  async function saveHome() {
    try {
      setSettingsError('');
      if(context.available) await appRequest('home',{address:draft});
      setAddress(draft);setRevision(x=>x+1);setOpen(false);
    }catch(e){setSettingsError(e.message);}
  }
  useEffect(() => {
    const c = new AbortController();
    request('pw_cities', { pagination: 'false', 'otg.id': '' }, c.signal).then(collection).then(items => setCities(items.filter(c => c.name?.trim()).sort((a,b) => a.name.localeCompare(b.name, 'uk')))).catch(e => { if (!c.signal.aborted) setSettingsError(e.message); });
    return () => c.abort();
  }, [revision]);
  useEffect(() => {
    const c = new AbortController(); setStreets([]); setSettingsError('');
    if (draft.city) request('pw_streets', { pagination: 'false', 'city.id': draft.city.id }, c.signal).then(collection).then(items => setStreets(items.filter(s => s.name?.trim()).sort((a,b) => a.name.localeCompare(b.name, 'uk')))).catch(e => { if (!c.signal.aborted) setSettingsError(e.message); });
    return () => c.abort();
  }, [draft.city?.id, revision]);
  useEffect(() => {
    const c = new AbortController(); setBuildings([]); setSettingsError('');
    if (draft.city && draft.street) request('pw-accounts/building-names', { cityId: draft.city.id, streetId: draft.street.id }, c.signal).then(d => { if (!Array.isArray(d.buildingNames)) throw new Error('Не вдалося прочитати список будинків'); setBuildings(d.buildingNames); }).catch(e => { if (!c.signal.aborted) setSettingsError(e.message); });
    return () => c.abort();
  }, [draft.city?.id, draft.street?.id, revision]);
  useEffect(() => {
    const c = new AbortController(); setLoading(true); setError(''); setRecords([]); setGroups([]); setUpdated(null);
    if (!validAddress(address)) { setLoading(false); return () => c.abort(); }
    (async () => {
      const data = await request('pw-accounts/building-groups', { cityId: address.city.id, streetId: address.street.id, buildingNames: address.building?.buildingName || '' }, c.signal);
      if (!Array.isArray(data.buildingGroups)) throw new Error('Невідомий формат черг ТОЕ');
      const list = [...new Set(data.buildingGroups.map(g => String(g.chergGpv).trim()).filter(g => /^\d+\.\d+(?:#\d+)?$/.test(g)))];
      if (c.signal.aborted) return;
      setGroups(list);
      if (list.length) {
        const { params, headers } = graphRequest(address, list);
        const graphs = await request('a_gpv_g', params, c.signal, headers);
        if (!c.signal.aborted) setRecords(collection(graphs));
      }
      if (!c.signal.aborted) setUpdated(new Date());
    })().catch(e => { if (!c.signal.aborted) setError(`${e.message}. Спробуйте оновити.`); }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [address, revision]);
  useEffect(() => { const timer = setInterval(() => setRevision(x => x + 1), 300000); return () => clearInterval(timer); }, []);
  const selectedDay = shiftDay(dayKey(), day);
  const selectedRecord = [...records].filter(r => String(r.dateGraph).slice(0, 10) === selectedDay).sort((a,b) => String(b.dateCreate || '').localeCompare(String(a.dateCreate || '')))[0];
  return <div className={`app ${open ? 'settings-screen' : 'schedule-screen'}`}><aside className="sidebar" aria-label="Налаштування"><div className="settings-heading"><div><p className="eyebrow">СВІТЛО ВДОМА</p><h1>Налаштування</h1></div><button onClick={() => setOpen(false)}>До графіка</button></div><div className="settings-columns"><section className="address-settings"><h2>Адреса дому</h2><p className="muted">Одна адреса й графік для всіх користувачів. Змінює адміністратор Home Assistant.</p><fieldset disabled={!context.isAdmin}>
    <SearchSelect label="Населений пункт" options={cities.map(c=>({value:c.id,label:c.name+(c.otg?.name?` (${c.otg.name} ОТГ)`:''),item:c}))} value={draft.city?.id} fallback={draft.city?.name} placeholder="Почніть вводити назву міста" onChange={city=>setDraft({city,street:null,building:null})} />
    <SearchSelect label="Вулиця" options={streets.map(v=>({value:v.id,label:v.name,item:v}))} value={draft.street?.id} fallback={draft.street?.name} disabled={!draft.city||!streets.length} placeholder="Почніть вводити назву вулиці" onChange={street=>setDraft({...draft,street,building:null})} />
    <SearchSelect label="Будинок" options={buildings.map(v=>({value:v.id,label:v.buildingName,item:v}))} value={draft.building?.id} fallback={draft.building?.buildingName} disabled={!draft.street||!buildings.length} placeholder="Введіть номер будинку" onChange={building=>setDraft({...draft,building})} />
    {settingsError && <p role="alert" className="error">{settingsError}</p>}<button className="primary" disabled={!validAddress(draft)} onClick={saveHome}>Зберегти й показати графік</button></fieldset>
    </section><NotificationSettings context={context} address={address} /></div>
    <a className="source" href="https://poweron.toe.com.ua/" target="_blank" rel="noreferrer">Дані Тернопільобленерго ↗</a>
  </aside><main><div className="topbar"><div><h1>Світло вдома</h1></div><button onClick={() => setOpen(!open)} aria-expanded={open}>Налаштування</button></div><p className="address">{address.city?.name || ''}, {address.street?.name || ''}, буд. {address.building?.buildingName || ''}</p><div className="toolbar"><div className="tabs">{['Сьогодні','Завтра'].map((label, i) => <button key={label} className={i === day ? 'active' : ''} onClick={() => setDay(i)} aria-pressed={i === day}>{label}</button>)}</div><button disabled={loading} onClick={() => setRevision(x => x + 1)}>{loading ? 'Оновлюємо…' : 'Оновити графік'}</button></div>
    {error && <p role="alert" className="error banner">{error}</p>}{groups.length ? groups.map(g => <DayCard key={g} record={selectedRecord} group={g} day={selectedDay} loading={loading} />) : <section className="schedule-card empty"><h2>{loading ? 'Визначаємо чергу…' : error ? 'Дані недоступні' : 'Для адреси немає черги ГПВ'}</h2><p>Перевірте точне написання будинку в налаштуваннях.</p></section>}
    <div className="legend">{[['on','Подача електроенергії'],['switching','Час перемикання — можливе відключення'],['off','Вимкнення електроенергії'],['unknown','Немає даних']].map(([cls,label]) => <div key={cls}><span className={`legend-swatch ${cls}`}>{['on','off'].includes(cls) && <img src={`./assets/light-${cls}.svg`} alt="" />}</span><span>{label}</span></div>)}</div><footer><p>Час за Києвом. Графік може змінюватися та не підтверджує фактичну наявність світла.</p><p>{updated ? `Отримано ${updated.toLocaleTimeString('uk-UA', {timeZone:'Europe/Kyiv'})} · ` : ''}Автоматичне оновлення кожні 5 хвилин.</p></footer>
  </main></div>;
}
