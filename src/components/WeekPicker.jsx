import { useState } from 'react';
import { CalendarDays, X } from 'lucide-react';
import { addDays, fmtShort, fromUTC, todayStr, weekStart } from '../lib/dates.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const toLocalDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fromLocalDate = (d) => fromUTC(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

// Picks a whole week (Sun–Sat); the value is always that week's Sunday.
export default function WeekPicker({ value, onChange, placeholder = 'Pick a week', clearable, className }) {
  const [open, setOpen] = useState(false);
  const thisWeek = weekStart(todayStr());
  const label = value
    ? `${value === thisWeek ? 'This week' : value === addDays(thisWeek, 7) ? 'Next week' : 'Week of'} · ${fmtShort(value)} – ${fmtShort(addDays(value, 6))}`
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className={cn('relative', className)}>
        <PopoverTrigger asChild>
          <Button variant="outline" className={cn('w-full justify-start gap-2 font-normal', !value && 'text-muted-foreground', clearable && value && 'pr-8')}>
            <CalendarDays className="text-muted-foreground" />
            <span className="truncate">{label}</span>
          </Button>
        </PopoverTrigger>
        {clearable && value && (
          <button
            className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label="Clear"
            onClick={() => onChange('')}
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <PopoverContent className="w-auto p-2" align="start">
        <Calendar
          weekStartsOn={0}
          defaultMonth={toLocalDate(value || thisWeek)}
          modifiers={value ? { inWeek: { from: toLocalDate(value), to: toLocalDate(addDays(value, 6)) } } : {}}
          modifiersClassNames={{ inWeek: 'bg-accent rounded-none! first:rounded-l-lg! last:rounded-r-lg!' }}
          classNames={{ today: 'text-primary font-semibold' }}
          onDayClick={(d) => {
            onChange(weekStart(fromLocalDate(d)));
            setOpen(false);
          }}
        />
        <div className="flex gap-1 border-t pt-2">
          <Button size="xs" variant="ghost" onClick={() => (onChange(thisWeek), setOpen(false))}>This week</Button>
          <Button size="xs" variant="ghost" onClick={() => (onChange(addDays(thisWeek, 7)), setOpen(false))}>Next week</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
