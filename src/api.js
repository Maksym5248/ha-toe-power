export const BASE = './toe-api';
export function dayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
export const shiftDay = (day, offset) => new Date(Date.parse(`${day}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
export const addressKey = a => `${a.city.id}/${a.street.id}/${a.building.buildingName}`;
export function graphRequest(address, groups, today = dayKey()) {
  const key = addressKey(address);
  const params = new URLSearchParams({ after: `${shiftDay(today, -1)}T12:00:00+00:00`, before: `${shiftDay(today, 2)}T00:00:00+00:00`, time: key.replaceAll('/', '') });
  groups.forEach(group => params.append('group[]', group));
  const encoded = btoa(Array.from(new TextEncoder().encode(key), b => String.fromCharCode(b)).join(''));
  return { params, headers: { 'X-debug-key': encoded } };
}
export async function request(path, params = {}, signal, headers = {}) {
  const query = params instanceof URLSearchParams ? params : new URLSearchParams(params);
  const response = await fetch(`${BASE}/${path}?${query}`, { headers: { Accept: 'application/json', ...headers }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Сервер ТОЕ відповів HTTP ${response.status}`);
  return response.json();
}
export function collection(data) {
  if (Array.isArray(data)) return data;
  if (!Array.isArray(data?.['hydra:member'])) throw new Error('Невідомий формат відповіді ТОЕ');
  return data['hydra:member'];
}
export const statusInfo = code => ({ '0': ['on', 'Є світло'], '1': ['off', 'Немає світла'], '10': ['switching', 'Час перемикання'] }[String(code)] || ['unknown', 'Немає даних']);
export function slotsFor(record, group) {
  const times = record?.dataJson?.[group]?.times;
  if (!times || typeof times !== 'object' || Array.isArray(times)) return null;
  return Array.from({ length: 48 }, (_, i) => {
    const time = `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`;
    return { time, code: String(times[time] ?? '?'), end: `${String(Math.floor((i + 1) / 2)).padStart(2, '0')}:${(i + 1) % 2 ? '30' : '00'}` };
  });
}
export function outageRanges(slots) {
  const ranges = [];
  for (const slot of slots || []) {
    if (!['1', '10'].includes(slot.code)) continue;
    const last = ranges.at(-1);
    if (last?.end === slot.time && last.code === slot.code) last.end = slot.end;
    else ranges.push({ start: slot.time, end: slot.end, code: slot.code });
  }
  return ranges;
}
