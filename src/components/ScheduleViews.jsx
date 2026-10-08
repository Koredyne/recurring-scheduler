import { useMemo } from 'react';
import { TriangleAlert, Users } from 'lucide-react';
import { DAY_SHORT, addDays, clock, monthStart, todayStr, weekStart } from '../lib/dates.js';
import { coachNames, findConflicts, oneOffMembers, resolveDate } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { useVocab } from './VocabContext.jsx';

// Schedule filters as a plain test. On the week/day grid coach and package only fade blocks;
// in the lists below they hide them, since there's nothing to fade.
export function passes(s, { rooms = [], activities = [], coach = '', focusPkg = null }) {
  if (rooms.length && !rooms.includes(s.slot.area_id)) return false;
  if (activities.length && !activities.includes(s.cls.activity)) return false;
  if (coach && !coachNames(s.cls).includes(coach)) return false;
  if (focusPkg && s.pkg?.id !== focusPkg) return false;
  return true;
}

// Packages booking the same class at the same time share one session: one row, listing every package.
function groupShared(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    const k = `${s.slot.id}:${s.cls.id}`;
    if (!groups.has(k)) groups.set(k, { s, pkgs: [] });
    if (s.pkg) groups.get(k).pkgs.push(s.pkg);
  }
  return [...groups.values()].sort((a, b) => a.s.start - b.s.start || a.s.slot.area_id - b.s.slot.area_id);
}

// Day view's side list: every class that day with all its details, in time order.
export function DayAgenda({ state, day, colorOf, filters, onOpenSession }) {
  const v = useVocab();
  const rows = groupShared(day.sessions.filter((s) => passes(s, filters)));
  const memberCount = (pkgs) => new Set(state.packageMembers.filter((pm) => pkgs.some((p) => p.id === pm.package_id)).map((pm) => pm.member_id)).size;

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex items-baseline justify-between border-b px-4 py-2.5">
        <span className="font-heading text-sm font-semibold">{v.Classes}</span>
        <span className="text-xs text-muted-foreground">{rows.length} today</span>
      </div>
      <div className="min-h-0 flex-1 divide-y overflow-y-auto">
        {rows.map(({ s, pkgs }) => {
          const conf = day.conflicts.get(s.key);
          const members = s.oneOff ? oneOffMembers(state, s.oneOff.id) : null;
          return (
            <button
              key={s.key}
              onClick={() => onOpenSession(s, conf || [])}
              className={cn('flex w-full gap-3 px-4 py-2.5 text-left hover:bg-accent/50', s.cancelled && 'opacity-60')}
            >
              <div className="w-16 shrink-0 pt-0.5 text-xs text-muted-foreground tabular-nums">
                <div className="text-foreground">{clock(s.slot.start_time)}</div>
                <div>{clock(s.slot.end_time)}</div>
              </div>
              <span className="w-[3px] shrink-0 rounded-full" style={{ background: colorOf(s.cls.activity) }} />
              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  {conf && <TriangleAlert className="size-3.5 shrink-0 text-destructive" />}
                  <span className={cn('truncate', s.cancelled && 'line-through')}>{s.cls.activity}</span>
                  {s.slot.label && <span className="truncate font-normal text-muted-foreground">· {s.slot.label}</span>}
                  {s.oneOff && <span className="ml-auto shrink-0 rounded border border-dashed px-1 text-[10px] text-muted-foreground">One time</span>}
                  {s.cancelled && <span className="ml-auto shrink-0 rounded bg-destructive/15 px-1 text-[10px] text-destructive">Cancelled</span>}
                  {s.change && !s.cancelled && (
                    <span className="ml-auto shrink-0 rounded bg-amber-400/15 px-1 text-[10px] text-amber-300">Changed today</span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.cls.coach} · {s.area?.name}
                </div>
                <div className="truncate text-xs text-muted-foreground/80">
                  {s.oneOff ? (
                    <>
                      <Users className="mr-1 inline size-3 -translate-y-px" />
                      {members.length ? members.map((m) => m.name).join(', ') : `No ${v.members} yet`}
                    </>
                  ) : (
                    <>
                      {pkgs.map((p) => p.name).join(', ')}
                      <span className="text-muted-foreground/60"> · {v.n(memberCount(pkgs), 'member')}</span>
                    </>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        {rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-muted-foreground">No {v.classes} this day.</p>}
      </div>
    </div>
  );
}

// Month view: every day of the month with how many classes it has, their activity mix, any clashes,
// and one-time classes by name. Click a day to open it.
export function MonthView({ state, idx, month, colorOf, filters, onPickDay }) {
  const v = useVocab();
  const today = todayStr();
  const first = monthStart(month);
  const gridStart = weekStart(first);
  const ym = first.slice(0, 7);

  const cells = useMemo(() => {
    const out = [];
    for (let i = 0; i < 42; i++) {
      const date = addDays(gridStart, i);
      if (i % 7 === 0 && i > 0 && date.slice(0, 7) !== ym) break; // stop once a whole row is next month
      const sessions = resolveDate(state, date, idx);
      const clashes = findConflicts(sessions).length;
      const shown = groupShared(sessions.filter((s) => !s.cancelled && passes(s, filters))).map((g) => g.s);
      const mix = new Map();
      for (const s of shown) mix.set(s.cls.activity, (mix.get(s.cls.activity) || 0) + 1);
      out.push({ date, shown, mix: [...mix.entries()].sort((a, b) => b[1] - a[1]), clashes, oneOffs: shown.filter((s) => s.oneOff) });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, idx, gridStart, JSON.stringify(filters)]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="grid grid-cols-7 border-b">
        {DAY_SHORT.map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {d}
          </div>
        ))}
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-7" style={{ gridAutoRows: '1fr' }}>
        {cells.map((c) => {
          const inMonth = c.date.slice(0, 7) === ym;
          return (
            <button
              key={c.date}
              onClick={() => onPickDay(c.date)}
              className={cn(
                'flex min-h-0 flex-col gap-1 overflow-hidden border-r border-b p-2 text-left transition-colors hover:bg-accent/40 [&:nth-child(7n)]:border-r-0',
                !inMonth && 'bg-black/20 text-muted-foreground',
              )}
            >
              <div className="flex items-center justify-between">
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full font-heading text-sm font-semibold',
                    c.date === today && 'bg-primary text-primary-foreground',
                    !inMonth && 'font-normal',
                  )}
                >
                  {Number(c.date.slice(8))}
                </span>
                {c.clashes > 0 && (
                  <span className="flex items-center gap-0.5 text-[10.5px] text-destructive" title={`${c.clashes} clash${c.clashes > 1 ? 'es' : ''}`}>
                    <TriangleAlert className="size-3" /> {c.clashes}
                  </span>
                )}
              </div>
              {c.shown.length > 0 ? (
                <>
                  <div className="text-xs text-muted-foreground">
                    {v.n(c.shown.length, 'class')}
                  </div>
                  {/* Activity mix as one thin bar */}
                  <div className="flex h-1.5 w-full overflow-hidden rounded-full">
                    {c.mix.map(([a, n]) => (
                      <span key={a} title={`${a}: ${n}`} style={{ flexGrow: n, background: colorOf(a) }} />
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10.5px] text-muted-foreground">
                    {c.mix.slice(0, 3).map(([a, n]) => (
                      <span key={a} className="flex items-center gap-1">
                        <span className="size-1.5 rounded-full" style={{ background: colorOf(a) }} />
                        {a} {n}
                      </span>
                    ))}
                    {c.mix.length > 3 && <span>+{c.mix.length - 3} more</span>}
                  </div>
                  {c.oneOffs.slice(0, 2).map((s) => (
                    <div key={s.key} className="truncate rounded border border-dashed px-1 text-[10.5px]">
                      <span className="font-semibold">1×</span> {clock(s.slot.start_time)} {s.oneOff.label || s.cls.activity}
                    </div>
                  ))}
                  {c.oneOffs.length > 2 && <div className="text-[10.5px] text-muted-foreground">+{c.oneOffs.length - 2} one-time</div>}
                </>
              ) : (
                <div className="text-xs text-muted-foreground/50">No {v.classes}</div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
