import { useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronLeft, ChevronRight, Plus, SlidersHorizontal, TriangleAlert, X } from 'lucide-react';
import { DAYS, addDays, addMonths, fmtMonth, fmtShort, fromUTC, monthStart, todayStr, weekStart, weekday } from '../lib/dates.js';
import {
  activityColors,
  conflictsByKey,
  cyclePosition,
  describeConflict,
  findConflicts,
  indexState,
  packageStatus,
  resolveDate,
} from '../lib/schedule.js';
import { moveSession } from '../lib/dayChange.js';
import PrintSchedule from './PrintSchedule.jsx';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Calendar as MonthPicker } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import PageHeader from './PageHeader.jsx';
import WeekGrid from './WeekGrid.jsx';
import { DayAgenda, MonthView } from './ScheduleViews.jsx';
import PackageBuilder from './PackageBuilder.jsx';
import { useVocab } from './VocabContext.jsx';

// 'YYYY-MM-DD' <-> local Date for the month picker.
const toLocalDate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const fromLocalDate = (d) => fromUTC(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));

export default function Calendar({ state, mutate, viewDate, setViewDate, onCreate, onOpenSession }) {
  const v = useVocab();
  const [creating, setCreating] = useState(false);
  const [coach, setCoach] = useState('');
  const [focusPkg, setFocusPkg] = useState(null); // package highlighted on the grid
  const [shown, setShown] = useState([]); // activities to show; empty = all
  const [rooms, setRooms] = useState([]); // room (area) ids to show; empty = all
  const activeFilters = [focusPkg, coach, shown.length, rooms.length].filter(Boolean).length;
  const clearFilters = () => {
    setFocusPkg(null);
    setCoach('');
    setShown([]);
    setRooms([]);
  };
  const roomName = (id) => state.areas.find((a) => a.id === id)?.name;
  // A handful of rooms fit as pills in the header; a long list goes in the left rail instead.
  const roomsOnTop = state.areas.length <= 5;
  const toggleRoom = (id) => setRooms((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const toggleActivity = (a) => setShown((cur) => (cur.includes(a) ? cur.filter((x) => x !== a) : [...cur, a]));
  const [showEmpty, setShowEmpty] = useState(true);
  // Day / Week / Month, remembered between visits.
  const [view, setViewState] = useState(() => localStorage.getItem('scheduler.view') || 'week');
  const setView = (next) => {
    setViewState(next);
    localStorage.setItem('scheduler.view', next);
  };
  const ws = weekStart(viewDate);
  const end = addDays(ws, DAYS.length - 1);
  const today = todayStr();
  const filters = { rooms, activities: shown, coach, focusPkg };

  const idx = useMemo(() => indexState(state), [state]);
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const coaches = useMemo(() => [...new Set(state.classes.flatMap((c) => c.coaches ?? [c.coach]))].sort(), [state.classes]);
  const legend = useMemo(() => [...new Set(state.classes.map((c) => c.activity))], [state.classes]);
  const days = useMemo(
    () =>
      view === 'day'
        ? [{ i: weekday(viewDate), name: DAYS[weekday(viewDate)], date: viewDate }]
        : DAYS.map((name, i) => ({ i, name, date: addDays(ws, i) })),
    [view, viewDate, ws],
  );

  const perDay = useMemo(
    () =>
      days.map((d) => {
        const sessions = resolveDate(state, d.date, idx);
        const list = findConflicts(sessions);
        return { ...d, sessions, list, conflicts: conflictsByKey(list) };
      }),
    [state, idx, days],
  );

  const weekConflicts = perDay.flatMap((d) => d.list);
  const sessionCount = perDay.reduce((n, d) => n + d.sessions.length, 0);
  const packages = state.packages
    .map((p) => {
      const pos = days.map((d) => cyclePosition(p, d.date)).find(Boolean);
      return { p, pos, status: pos ? 'active' : packageStatus(p, ws) };
    })
    .filter((x) => x.status !== 'ended');

  const [month, setMonth] = useState(() => toLocalDate(viewDate));
  const go = (date) => {
    setViewDate(date);
    setMonth(toLocalDate(date));
  };
  const step = (n) => go(view === 'day' ? addDays(viewDate, n) : view === 'month' ? addMonths(monthStart(viewDate), n) : addDays(ws, 7 * n));
  const unit = view === 'day' ? 'day' : view === 'month' ? 'month' : 'week';
  const title =
    view === 'day'
      ? `${DAYS[weekday(viewDate)]}, ${fmtShort(viewDate)} ${viewDate.slice(0, 4)}`
      : view === 'month'
        ? fmtMonth(viewDate)
        : `${fmtShort(ws)} – ${fmtShort(end)}, ${end.slice(0, 4)}`;
  // Highlight on the small calendar: the day, the week or the month being shown.
  const shownRange =
    view === 'day'
      ? { from: toLocalDate(viewDate), to: toLocalDate(viewDate) }
      : view === 'month'
        ? { from: toLocalDate(monthStart(viewDate)), to: toLocalDate(addDays(addMonths(monthStart(viewDate), 1), -1)) }
        : { from: toLocalDate(ws), to: toLocalDate(end) };

  return (
    <>
      <PageHeader title="Schedule">
        <Button variant="outline" size="sm" className="ml-2" onClick={() => go(today)}>
          Today
        </Button>
        <div className="flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="View">
          {[
            ['day', 'Day'],
            ['week', 'Week'],
            ['month', 'Month'],
          ].map(([key, label]) => (
            <RoomPill key={key} on={view === key} onClick={() => setView(key)}>
              {label}
            </RoomPill>
          ))}
        </div>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => step(-1)} aria-label={`Previous ${unit}`}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => step(1)} aria-label={`Next ${unit}`}>
            <ChevronRight />
          </Button>
        </div>
        <span className="font-heading text-sm font-medium">{title}</span>
        {roomsOnTop && state.areas.length > 1 && (
          <div className="ml-4 flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Rooms">
            <RoomPill on={!rooms.length} onClick={() => setRooms([])}>
              All rooms
            </RoomPill>
            {state.areas.map((a) => (
              <RoomPill key={a.id} on={rooms.includes(a.id)} onClick={() => toggleRoom(a.id)}>
                {a.name}
              </RoomPill>
            ))}
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          {activeFilters > 0 && (
            <Button variant="ghost" size="sm" className="mr-2 text-muted-foreground" onClick={clearFilters}>
              <X /> Clear filters
            </Button>
          )}
          {view !== 'month' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <SlidersHorizontal /> Display
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <label className="flex items-center justify-between gap-2 text-sm">
                  Show empty {v.class} times
                  <Switch checked={showEmpty} onCheckedChange={setShowEmpty} />
                </label>
              </PopoverContent>
            </Popover>
          )}
          <PrintSchedule state={state} weekStart={ws} filters={filters} colorOf={colorOf} />
          <Button size="sm" className="ml-3" onClick={() => setCreating(true)}>
            <Plus /> New {v.package}
          </Button>
        </div>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <aside className="w-64 shrink-0 space-y-5 overflow-y-auto border-r p-4">
          <MonthPicker
            modifiers={{ inWeek: shownRange }}
            modifiersClassNames={{ inWeek: 'bg-accent rounded-none! first:rounded-l-lg! last:rounded-r-lg!' }}
            classNames={{ today: 'text-primary font-semibold' }}
            onDayClick={(d) => go(fromLocalDate(d))}
            month={month}
            onMonthChange={setMonth}
            weekStartsOn={0}
            className="w-full p-0 [--cell-size:--spacing(7.5)]"
          />

          {activeFilters > 0 && (
            <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-2.5 py-1.5 text-xs">
              <span>
                {activeFilters} filter{activeFilters > 1 ? 's' : ''} on
              </span>
              <button className="flex items-center gap-1 font-medium hover:text-primary" onClick={clearFilters}>
                <X className="size-3" /> Clear all
              </button>
            </div>
          )}

          <div className="-mx-1 divide-y border-t">
            <RailSection
              id="packages"
              title={v.Packages}
              summary={focusPkg ? state.packages.find((p) => p.id === focusPkg)?.name : v.n(sessionCount, 'class')}
              active={!!focusPkg}
              onClear={() => setFocusPkg(null)}
            >
              <div className="space-y-0.5">
                {packages.map(({ p, pos, status }) => {
                  const on = focusPkg === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setFocusPkg(on ? null : p.id)}
                      className={cn(
                        'relative w-full space-y-1.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/60',
                        on && 'bg-accent',
                        focusPkg && !on && 'opacity-50',
                      )}
                    >
                      {on && <span className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-primary" />}
                      <div className="flex justify-between gap-2 text-sm">
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {status !== 'active' ? `from ${fmtShort(p.anchor_date)}` : p.cycle_length > 1 ? `W${pos}/${p.cycle_length}` : 'Weekly'}
                        </span>
                      </div>
                      {/* Progress through the rotation — only meaningful for multi-week cycles */}
                      {p.cycle_length > 1 && (
                        <div className="flex gap-0.5">
                          {Array.from({ length: p.cycle_length }, (_, i) => (
                            <div
                              key={i}
                              className={cn('h-1 flex-1 rounded-full bg-muted', status === 'active' && i + 1 === pos && 'bg-foreground/60')}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </RailSection>

            {!roomsOnTop && (
              <RailSection
                id="rooms"
                title="Rooms"
                summary={!rooms.length ? 'All' : rooms.length === 1 ? roomName(rooms[0]) : `${rooms.length} selected`}
                active={rooms.length > 0}
                onClear={() => setRooms([])}
              >
                <ToggleGroup
                  type="multiple"
                  variant="outline"
                  size="sm"
                  value={rooms.map(String)}
                  onValueChange={(ids) => setRooms(ids.map(Number))}
                  className="flex-wrap justify-start px-1"
                  spacing={1}
                >
                  {state.areas.map((a) => (
                    <ToggleGroupItem key={a.id} value={String(a.id)} className="data-[state=on]:border-primary/60 data-[state=on]:text-foreground">
                      {a.name}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </RailSection>
            )}

            <RailSection id="coach" title={v.Coach} summary={coach || v.n(coaches.length, 'coach')} active={!!coach} onClear={() => setCoach('')}>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                value={coach}
                onValueChange={setCoach}
                className="flex-wrap justify-start px-1"
                spacing={1}
              >
                {coaches.map((c) => (
                  <ToggleGroupItem key={c} value={c} className="data-[state=on]:border-primary/60 data-[state=on]:text-foreground">
                    {c}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </RailSection>

            <RailSection
              id="activities"
              title={v.Activities}
              summary={!shown.length ? 'All' : shown.length === 1 ? shown[0] : `${shown.length} selected`}
              active={shown.length > 0}
              onClear={() => setShown([])}
            >
              <div className="space-y-0.5">
                {legend.map((a) => {
                  const on = !shown.length || shown.includes(a);
                  return (
                    <button
                      key={a}
                      onClick={() => toggleActivity(a)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-[opacity,background-color] hover:bg-accent/60',
                        !on && 'opacity-40',
                      )}
                    >
                      <span className="size-2 rounded-full" style={{ background: colorOf(a) }} />
                      <span className="flex-1">{a}</span>
                      {shown.includes(a) && <Check className="size-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            </RailSection>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3 p-4">
          {view !== 'month' && weekConflicts.length > 0 && (
            <Alert variant="destructive">
              <TriangleAlert />
              <AlertTitle>
                {weekConflicts.length} conflict{weekConflicts.length > 1 ? 's' : ''} this {unit}
              </AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-4">
                  {weekConflicts.map((c, i) => (
                    <li key={i}>{describeConflict(c, true, v)}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}
          <div className={cn('min-h-0 flex-1', view === 'day' && 'grid grid-cols-[minmax(0,1fr)_22rem] gap-3')}>
            {view === 'month' ? (
              <MonthView
                state={state}
                idx={idx}
                month={viewDate}
                colorOf={colorOf}
                filters={filters}
                onPickDay={(date) => {
                  go(date);
                  setView('day');
                }}
              />
            ) : (
              <>
                <WeekGrid
                  state={state}
                  days={perDay}
                  colorOf={colorOf}
                  coach={coach}
                  activities={shown}
                  rooms={rooms}
                  focusPkg={focusPkg}
                  showEmpty={showEmpty}
                  onCreate={onCreate}
                  onOpenSession={onOpenSession}
                  // Dragging a class moves it for that day only (a clash is blocked and shown as a toast).
                  onMove={(s, to) => moveSession(mutate, state, s, to).catch(() => {})}
                />
                {view === 'day' && <DayAgenda state={state} day={perDay[0]} colorOf={colorOf} filters={filters} onOpenSession={onOpenSession} />}
              </>
            )}
          </div>
        </div>
      </div>

      {creating && (
        <PackageBuilder
          state={state}
          onClose={() => setCreating(false)}
          onSave={async (bundle) => {
            const r = await mutate((api) => api.createPackage(bundle));
            if (r?.id) {
              setCreating(false);
              setFocusPkg(r.id); // show the new package highlighted on the grid
              if (bundle.anchor_date > end) go(bundle.anchor_date);
            }
          }}
        />
      )}
    </>
  );
}

function RoomPill({ on, onClick, children }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn(
        'rounded-md px-2.5 py-1 text-sm transition-colors',
        on ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

// Collapsible rail section. The header always shows what's selected; open/closed is remembered per section.
function RailSection({ id, title, summary, active, onClear, children }) {
  const key = `scheduler.rail.${id}`;
  const [open, setOpen] = useState(() => localStorage.getItem(key) === 'open');
  useEffect(() => localStorage.setItem(key, open ? 'open' : 'closed'), [key, open]);

  return (
    <section className="py-1">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen(!open)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-2 text-left hover:text-foreground"
        >
          <ChevronDown className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')} />
          <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{title}</span>
          <span className={cn('ml-auto truncate text-xs', active ? 'text-foreground' : 'text-muted-foreground')}>{summary}</span>
        </button>
        {active && (
          <button
            onClick={onClear}
            className="grid size-5 shrink-0 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            aria-label={`Clear ${title}`}
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      {open && <div className="pb-2">{children}</div>}
    </section>
  );
}
