// Calendar maths on plain 'YYYY-MM-DD' strings. Working in UTC keeps daylight
// saving changes from ever shifting a day number.
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, '0');

export const parse = (iso) => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const toISO = (ms) => new Date(ms).toISOString().slice(0, 10);

export function isValid(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISO(parse(iso)) === iso;
}

// ?heute=2027-10-24 previews the app on another day. It never changes stored data.
export function today(now = new Date(), search = globalThis.location?.search ?? '') {
  const override = new URLSearchParams(search).get('heute');
  if (isValid(override)) return override;
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export const addDays = (iso, n) => toISO(parse(iso) + n * DAY);
export const diffDays = (from, to) => Math.round((parse(to) - parse(from)) / DAY);

// Adds calendar months and clamps to the end of shorter months.
export function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return toISO(Date.UTC(y, m - 1 + n, Math.min(d, lastDay)));
}

export const firstBirthday = (birth) => addMonths(birth, 12);
export const yearLength = (birth) => diffDays(birth, firstBirthday(birth));
export const dayNumber = (birth, date) => diffDays(birth, date) + 1;
export const lastDayOfYear = (birth) => addDays(firstBirthday(birth), -1);

// Which month of the first year a date falls in, from 0 to 11.
export function monthOfLife(birth, date) {
  let month = 0;
  while (month < 11 && addMonths(birth, month + 1) <= date) month++;
  return month;
}

const unit = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const joinAge = (a, b) => (b ? `${a} und ${b} alt` : `${a} alt`);

export function ageLabel(birth, date) {
  const days = diffDays(birth, date);
  if (days < 0) return '';
  if (days === 0) return 'Der Tag der Geburt';
  if (days < 7) return `${unit(days, 'Tag', 'Tage')} alt`;
  if (days < 56) {
    const rest = days % 7;
    return joinAge(unit(Math.floor(days / 7), 'Woche', 'Wochen'), rest ? unit(rest, 'Tag', 'Tage') : '');
  }
  let months = 0;
  while (addMonths(birth, months + 1) <= date) months++;
  if (months < 12) {
    const rest = diffDays(addMonths(birth, months), date);
    return joinAge(unit(months, 'Monat', 'Monate'), rest ? unit(rest, 'Tag', 'Tage') : '');
  }
  const rest = months % 12;
  return joinAge(unit(Math.floor(months / 12), 'Jahr', 'Jahre'), rest ? unit(rest, 'Monat', 'Monate') : '');
}

const fmt = (options) => new Intl.DateTimeFormat('de-DE', { timeZone: 'UTC', ...options });
const longDate = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const plainDate = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
const month = fmt({ month: 'long', year: 'numeric' });
const monthShort = fmt({ month: 'short' });

export const formatLong = (iso) => longDate.format(parse(iso));
export const formatDate = (iso) => plainDate.format(parse(iso));
export const formatMonth = (iso) => month.format(parse(iso));
export const formatMonthShort = (iso) => monthShort.format(parse(iso)).replace('.', '');
