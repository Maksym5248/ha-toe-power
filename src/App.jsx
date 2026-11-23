import React, { useEffect, useState } from 'react';
import { addressKey, collection, dayKey, graphRequest, outageRanges, request, shiftDay, slotsFor, statusInfo } from './api';
import notificationTemplate from '../home-assistant/toe_morning.yaml?raw';
import './styles.css';
const DEFAULT = { city: null, street: null, building: null };
function readSaved() { try { return JSON.parse(localStorage.getItem('toe-settings-v2')) || {}; } catch { return {}; } }
const saved = readSaved();
const validAddress = a => a?.city?.id && a?.street?.id && typeof a?.building?.buildingName === 'string';
function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/yaml;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
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
export default function App() {
  const [address, setAddress] = useState(validAddress(saved.address) ? saved.address : DEFAULT);
  const [draft, setDraft] = useState(address);
  const [cities, setCities] = useState([]), [streets, setStreets] = useState([]), [buildings, setBuildings] = useState([]);
  const [groups, setGroups] = useState([]), [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''), [settingsError, setSettingsError] = useState('');
  const [revision, setRevision] = useState(0), [updated, setUpdated] = useState(null);
  const [day, setDay] = useState(0), [open, setOpen] = useState(!validAddress(saved.address));
  const [notifications, setNotifications] = useState(saved.notifications ?? false);
  const [time, setTime] = useState(saved.time || '09:00');
  const [notifyAction, setNotifyAction] = useState(saved.notifyAction || 'persistent_notification.create');
  const [exported, setExported] = useState(false);
  useEffect(() => { try { localStorage.setItem('toe-settings-v2', JSON.stringify({ address, notifications, time, notifyAction })); } catch {} }, [address, notifications, time, notifyAction]);
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
  function exportNotifications() {
    const quote = JSON.stringify;
    // One automation per supply group; each gets its own stable ID.
    const documents = groups.map((group, index) => {
      let text = notificationTemplate.replace('initial: "09:00:00"', `initial: ${quote(time + ':00')}`)
        .replace('group: "__TOE_GROUP__"', `group: ${quote(group)}`).replace('address_key: "__TOE_ADDRESS__"', `address_key: ${quote(addressKey(address))}`)
        .replace('notification_action: persistent_notification.create', `notification_action: ${quote(notifyAction)}`)
        .replace('id: toe_morning_outages', `id: toe_morning_outages_${group.replace(/[^\w]/g, '_')}`)
        .replace('    mode: single', `    initial_state: ${notifications ? 'true' : 'false'}\n    mode: single`);
      return index ? text.slice(text.indexOf('  - id:')) : text;
    });
    download('toe_morning.yaml', documents.join('\n')); setExported(true);
  }
  return <div className={`app ${open ? 'settings-screen' : 'schedule-screen'}`}><aside className="sidebar" aria-label="Налаштування"><div className="settings-heading"><div><p className="eyebrow">СВІТЛО ВДОМА</p><h1>Налаштування</h1></div><button onClick={() => setOpen(false)}>До графіка</button></div><div className="settings-columns"><section className="address-settings"><h2>Моя адреса</h2><p className="muted">Оберіть адресу, щоб побачити свій графік.</p>
    <label>Населений пункт<select value={draft.city?.id || ''} onChange={e => setDraft({ city: cities.find(c => String(c.id) === e.target.value), street: null, building: null })}><option value="">Оберіть місто</option>{cities.map(c => <option key={c.id} value={c.id}>{c.name}{c.otg?.name ? ` (${c.otg.name} ОТГ)` : ''}</option>)}</select></label>
    <label>Вулиця<select disabled={!draft.city || !streets.length} value={draft.street?.id || ''} onChange={e => setDraft({ ...draft, street: streets.find(s => String(s.id) === e.target.value), building: null })}><option value="">{draft.city ? (streets.length ? 'Оберіть вулицю' : 'Завантаження вулиць…') : 'Спочатку оберіть місто'}</option>{streets.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    <label>Будинок<select disabled={!draft.street || !buildings.length} value={draft.building?.buildingName || ''} onChange={e => setDraft({ ...draft, building: buildings.find(b => b.buildingName === e.target.value) })}><option value="">{draft.street ? (buildings.length ? 'Оберіть будинок' : 'Будинки недоступні або завантажуються…') : 'Спочатку оберіть вулицю'}</option>{buildings.map(b => <option key={b.id} value={b.buildingName}>{b.buildingName}</option>)}</select></label>
    {settingsError && <p role="alert" className="error">{settingsError}</p>}<button className="primary" disabled={!validAddress(draft)} onClick={() => { setAddress(draft); setRevision(x => x + 1); setExported(false); setOpen(false); }}>Зберегти й показати графік</button>
    </section><section className="notification-settings"><h2>Сповіщення</h2><p className="muted small">Для збереженої адреси: {address.city?.name || ''}, {address.street?.name || ''}, {address.building?.buildingName || ''}.</p><label className="toggle"><span>Ранковий графік</span><input type="checkbox" checked={notifications} onChange={e => { setNotifications(e.target.checked); setExported(false); }} /></label><label>Час за Києвом<input type="time" value={time} required onChange={e => { setTime(e.target.value); setExported(false); }} /></label><label>Куди надсилати<input value={notifyAction} onChange={e => { setNotifyAction(e.target.value); setExported(false); }} placeholder="notify.mobile_app_ваш_телефон" /></label><p className="muted small">Надсилає Home Assistant. Вкажіть дію телефону або залиште сповіщення в Home Assistant.</p><button disabled={!groups.length || loading || !time || !/^(notify\.[a-z0-9_]+|persistent_notification\.create)$/.test(notifyAction)} onClick={exportNotifications}>Завантажити налаштування HA</button><p className="muted small" role="status">{exported ? 'Файл завантажено. Підключіть пакет у Home Assistant, щоб застосувати зміни.' : 'Перемикач застосовується після встановлення завантаженого пакета в Home Assistant.'}</p></section></div>
    <a className="source" href="https://poweron.toe.com.ua/" target="_blank" rel="noreferrer">Дані Тернопільобленерго ↗</a>
  </aside><main><div className="topbar"><div><h1>Світло вдома</h1></div><button onClick={() => setOpen(!open)} aria-expanded={open}>Налаштування</button></div><p className="address">{address.city?.name || ''}, {address.street?.name || ''}, буд. {address.building?.buildingName || ''}</p><div className="toolbar"><div className="tabs">{['Сьогодні','Завтра'].map((label, i) => <button key={label} className={i === day ? 'active' : ''} onClick={() => setDay(i)} aria-pressed={i === day}>{label}</button>)}</div><button disabled={loading} onClick={() => setRevision(x => x + 1)}>{loading ? 'Оновлюємо…' : 'Оновити графік'}</button></div>
    {error && <p role="alert" className="error banner">{error}</p>}{groups.length ? groups.map(g => <DayCard key={g} record={selectedRecord} group={g} day={selectedDay} loading={loading} />) : <section className="schedule-card empty"><h2>{loading ? 'Визначаємо чергу…' : error ? 'Дані недоступні' : 'Для адреси немає черги ГПВ'}</h2><p>Перевірте точне написання будинку в налаштуваннях.</p></section>}
    <div className="legend">{[['on','Подача електроенергії'],['switching','Час перемикання — можливе відключення'],['off','Вимкнення електроенергії'],['unknown','Немає даних']].map(([cls,label]) => <div key={cls}><span className={`legend-swatch ${cls}`}>{['on','off'].includes(cls) && <img src={`./assets/light-${cls}.svg`} alt="" />}</span><span>{label}</span></div>)}</div><footer><p>Час за Києвом. Графік може змінюватися та не підтверджує фактичну наявність світла.</p><p>{updated ? `Отримано ${updated.toLocaleTimeString('uk-UA', {timeZone:'Europe/Kyiv'})} · ` : ''}Автоматичне оновлення кожні 5 хвилин.</p></footer>
  </main></div>;
}
