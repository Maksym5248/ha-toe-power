import React, { useEffect, useState } from 'react';
export async function appRequest(path, body) {
  const response = await fetch(`./app-api/${path}`,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  const data=await response.json();if(!response.ok) throw new Error(data.error || 'Home Assistant недоступний.');return data;
}
export default function NotificationSettings({context,address}) {
  const available=context.available;
  const [state,setState]=useState({paired:false,enabled:false,beforeOff:false,beforeOn:false,time:'09:00',devices:[]});
  const [target,setTarget]=useState(''),[pending,setPending]=useState(false),[code,setCode]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
  useEffect(()=> {
    if(!available) return;
    let active=true;setBusy(true);
    appRequest('notifications').then(data=>{if(active){setState(data);setTarget(data.device?.id || (data.devices.length===1?data.devices[0].id:''));}}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setBusy(false);});
    return ()=>{active=false;};
  },[available]);
  async function run(task) {setBusy(true);setError('');setMessage('');try{await task();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function save() {await run(async()=>{const data=await appRequest('notifications',{enabled:state.enabled,time:state.time,beforeOff:state.beforeOff,beforeOn:state.beforeOn});setState(s=>({...s,...data}));setMessage('Збережено. Ці налаштування діють тільки для підтвердженого телефона.');});}
  return <section className="notification-settings"><h2>Мої сповіщення</h2>
    {!context.available ? <p className="muted">Відкрийте застосунок усередині Home Assistant, щоб підключити сповіщення на свій телефон.</p> : <>
    <p className="muted small">Для користувача {context.name || 'Home Assistant'}. Ці опції діють тільки для вашого підтвердженого телефона.</p>
    {state.paired ? <><p className="paired-device">Підтверджений телефон: <strong>{state.device.name}</strong></p><label className="toggle"><span>Ранковий графік</span><input type="checkbox" checked={state.enabled} disabled={busy} onChange={e=>{setState({...state,enabled:e.target.checked});setMessage('');}} /></label><label>Час ранкового графіка за Києвом<input type="time" value={state.time} disabled={busy} onChange={e=>{setState({...state,time:e.target.value});setMessage('');}} /></label>{[['beforeOff','За 30 хв до відключення'],['beforeOn','За 30 хв до очікуваного відновлення']].map(([key,label])=><label className="toggle" key={key}><span>{label}</span><input type="checkbox" checked={!!state[key]} disabled={busy} onChange={e=>{setState({...state,[key]:e.target.checked});setMessage('');}} /></label>)}<p className="muted small">Спільна адреса дому: {address.city?.name || 'оберіть адресу'}{address.street?.name?`, ${address.street.name}`:''}{address.building?.buildingName?`, ${address.building.buildingName}`:''}. Відновлення — очікуване за графіком, не підтвердження появи світла.</p><button disabled={busy || !state.time || ((state.enabled||state.beforeOff||state.beforeOn)&&!address.building?.buildingName)} onClick={save}>Зберегти сповіщення</button><button className="secondary-notification" disabled={busy} onClick={()=>run(async()=>{await appRequest('notifications/test',{});setMessage('Тестове повідомлення надіслано на підтверджений телефон.');})}>Надіслати тест</button><details><summary>Підключити інший телефон</summary><p className="muted small">Новий телефон потрібно підтвердити кодом. Після підтвердження попередня підписка вашого облікового запису вимкнеться.</p><button disabled={busy} onClick={()=>{setState({...state,paired:false});setPending(false);}}>Змінити телефон</button></details></> : <>
    <p className="muted">Один раз підтвердьте свій телефон кодом. Після цього повідомлення працюватимуть навіть із закритим браузером.</p>
    <label>Мій телефон<select value={target} disabled={busy||pending} onChange={e=>setTarget(e.target.value)}><option value="">Оберіть свій телефон</option>{state.devices.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    {!state.devices.length&&!busy&&<p className="muted small">Телефонів не знайдено. Увійдіть у мобільний застосунок Home Assistant та дозвольте сповіщення.</p>}
    {!pending ? <button disabled={busy||!target} onClick={()=>run(async()=>{await appRequest('pair/start',{device:target});setPending(true);setMessage('Код надіслано на вибраний телефон. Діє 5 хвилин.');})}>Отримати код на телефон</button> : <><label>Код із повідомлення<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,''))} /></label><button disabled={busy||code.length!==6} onClick={()=>run(async()=>{const data=await appRequest('pair/confirm',{code});setState(s=>({...s,...data}));setPending(false);setCode('');setMessage('Телефон підтверджено. Увімкніть ранковий графік і збережіть налаштування.');})}>Підтвердити мій телефон</button><button className="secondary-notification" disabled={busy} onClick={()=>{setPending(false);setCode('');}}>Вибрати інший телефон або повторити код</button></>}
    </>}
    </>}
    {busy&&<p className="muted small" role="status">З’єднуємося з Home Assistant…</p>}{error&&<p className="error" role="alert">{error}</p>}{message&&<p className="muted small" role="status">{message}</p>}
  </section>;
}
