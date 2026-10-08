import { cn } from '@/lib/utils';

// 12-hour time picker: hour · minutes · AM/PM. The value is stored as 24-hour 'HH:MM' like everywhere else.
// (The browser's own <input type="time"> follows the computer's 24-hour setting, so it can't promise AM/PM.)
const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
const pad = (n) => String(n).padStart(2, '0');
const box = 'h-8 rounded-lg border border-input bg-transparent text-sm outline-none focus-visible:border-ring dark:bg-input/30';

export default function TimeInput({ value, onChange, className, 'aria-label': label }) {
  const [h24, m] = (value || '00:00').split(':').map(Number);
  const pm = h24 >= 12;
  const h12 = h24 % 12 || 12;
  const emit = (h, min, isPm) => onChange(`${pad((h % 12) + (isPm ? 12 : 0))}:${pad(min)}`);
  const minutes = MINUTES.includes(m) ? MINUTES : [...MINUTES, m].sort((a, b) => a - b);

  return (
    <div className={cn('flex items-center gap-1', className)} role="group" aria-label={label}>
      <select aria-label="Hour" className={cn(box, 'w-14 px-1.5')} value={h12} onChange={(e) => emit(Number(e.target.value), m, pm)}>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-muted-foreground">:</span>
      <select aria-label="Minutes" className={cn(box, 'w-14 px-1.5')} value={m} onChange={(e) => emit(h12, Number(e.target.value), pm)}>
        {minutes.map((x) => (
          <option key={x} value={x}>
            {pad(x)}
          </option>
        ))}
      </select>
      <div className="ml-0.5 flex rounded-lg border p-0.5">
        {['AM', 'PM'].map((x) => {
          const on = (x === 'PM') === pm;
          return (
            <button
              key={x}
              type="button"
              aria-pressed={on}
              onClick={() => emit(h12, m, x === 'PM')}
              className={cn('rounded-md px-1.5 py-0.5 text-xs transition-colors', on ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              {x}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const toMin = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};
const toTime = (min) => {
  const m = Math.min(Math.max(min, 0), 23 * 60 + 59);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

// Start–end pair. Moving the start keeps the class the same length.
export function TimeRange({ value, onChange }) {
  return (
    <>
      <TimeInput
        aria-label="Start"
        value={value.start_time}
        onChange={(start_time) => {
          const length = value.start_time && value.end_time > value.start_time ? toMin(value.end_time) - toMin(value.start_time) : 60;
          onChange({ start_time, end_time: toTime(toMin(start_time) + length) });
        }}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <TimeInput aria-label="End" value={value.end_time} onChange={(end_time) => onChange({ ...value, end_time })} />
    </>
  );
}
