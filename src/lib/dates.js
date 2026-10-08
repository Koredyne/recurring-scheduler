// All dates are 'YYYY-MM-DD' strings, computed in UTC so DST never shifts a day.
const DAY_MS = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const toUTC = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const fromUTC = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (s, n) => fromUTC(toUTC(s) + n * DAY_MS);
export const weekday = (s) => new Date(toUTC(s)).getUTCDay();
export const weekStart = (s) => addDays(s, -weekday(s));
export const daysBetween = (a, b) => Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
export const maxDate = (a, b) => (a > b ? a : b);
// Same day n months later, clamped to the month's last day (31 Jan + 1 month → 28/29 Feb).
export const addMonths = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return fromUTC(Date.UTC(y, m - 1 + n, Math.min(d, last)));
};

export const todayStr = () => {
  const d = new Date();
  return fromUTC(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
};

export const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
// 12-hour display: clock('07:30') → '7:30 AM', clock('18:00') → '6 PM'
export const clock = (t) => {
  const [h, m] = t.split(':').map(Number);
  const hh = h % 12 || 12;
  return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
};
export const clockRange = (a, b) => `${clock(a)} – ${clock(b)}`;

export const fmtTime = (m) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export const fmtDate = (s) => {
  const d = new Date(toUTC(s));
  return `${DAY_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
export const fmtShort = (s) => {
  const d = new Date(toUTC(s));
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
// 'YYYY-MM-DD' → 'October 2026'
export const fmtMonth = (s) => `${MONTH_NAMES[Number(s.slice(5, 7)) - 1]} ${s.slice(0, 4)}`;
export const monthStart = (s) => `${s.slice(0, 8)}01`;
