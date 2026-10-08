import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CalendarClock, Layers, MapPin, TriangleAlert, Users } from 'lucide-react';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { DAY_SHORT, clock, clockRange, fmtDate, fmtTime, toMin, todayStr } from '../lib/dates.js';
import { coachNames, oneOffMembers } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { useVocab } from './VocabContext.jsx';

const HOUR_LINE = 'linear-gradient(to bottom, oklch(1 0 0 / 7%) 1px, transparent 1px)';

// Time grid: one column per day, split into one lane per area. It fills its parent's height,
// scaling the time axis so the whole day is visible without scrolling.
// `days[i].sessions` are resolved sessions for that date; `days[i].conflicts` maps session key → clashes.
export default function WeekGrid({
  state,
  days,
  colorOf,
  coach = '',
  activities = [],
  rooms = [],
  focusPkg = null,
  showEmpty = true,
  isGhost,
  onCreate,
  onOpenSession,
  onMove,
}) {
  const v = useVocab();
  const today = todayStr();
  // Days with nothing on (no sessions, and no empty slots when those are shown) shrink to a thin strip.
  // Click one to open it up, e.g. to add a class on a normally closed day.
  const [opened, setOpened] = useState(() => new Set());
  const slotsOn = (d) => (showEmpty ? state.slots.filter((s) => s.day === d.i && s.active) : []);
  const isClosed = (d) => days.length > 1 && !opened.has(d.date) && d.sessions.length === 0 && slotsOn(d).length === 0;

  // Only the hours that matter: from an hour before the first class shown to an hour after the last.
  const [startMin, endMin] = useMemo(() => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const d of days) {
      for (const s of d.sessions) {
        lo = Math.min(lo, s.start);
        hi = Math.max(hi, s.end);
      }
      for (const s of slotsOn(d)) {
        lo = Math.min(lo, toMin(s.start_time));
        hi = Math.max(hi, toMin(s.end_time));
      }
    }
    if (lo === Infinity) return [9 * 60, 21 * 60];
    return [Math.max(0, Math.floor(lo / 60) * 60 - 60), Math.min(24 * 60, Math.ceil(hi / 60) * 60 + 60)];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, state.slots, showEmpty]);

  const bodyRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(600);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([entry]) => setBodyHeight(entry.contentRect.height));
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, []);
  const PX = Math.max(0.45, bodyHeight / (endMin - startMin)); // pixels per minute

  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes());
  useEffect(() => {
    const t = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60000);
    return () => clearInterval(t);
  }, []);

  // Drag a class to another time, room or day (Schedule only — `onMove` given). While dragging,
  // `moving` is where it would land; the lane under the pointer draws it there.
  const [moving, setMoving] = useState(null); // { s, date, areaId, start }
  const dragged = useRef(false); // swallow the click that ends a drag
  const startMove = (e, s) => {
    if (!onMove || e.button !== 0 || s.cancelled) return;
    e.stopPropagation();
    const x0 = e.clientX;
    const y0 = e.clientY;
    const grab = (e.clientY - e.currentTarget.getBoundingClientRect().top) / PX; // minutes between block top and pointer
    const length = s.end - s.start;
    let target = null;
    const move = (ev) => {
      if (!target && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 5) return;
      const lane = document.elementsFromPoint(ev.clientX, ev.clientY).find((el) => el.dataset?.lane);
      if (!lane) return;
      const top = lane.getBoundingClientRect().top;
      const start = Math.min(24 * 60 - length, Math.max(0, startMin + Math.round(((ev.clientY - top) / PX - grab) / 15) * 15));
      target = { date: lane.dataset.date, areaId: Number(lane.dataset.area), start };
      document.body.style.cursor = 'grabbing';
      setMoving({ s, ...target });
    };
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      document.body.style.cursor = '';
      setMoving(null);
      if (!target) return;
      dragged.current = true;
      setTimeout(() => (dragged.current = false), 0);
      if (target.date !== s.date || target.areaId !== s.slot.area_id || target.start !== s.start) onMove(s, target);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  // Room filter: only the chosen rooms get a column (empty = all rooms).
  const areas = rooms.length ? state.areas.filter((a) => rooms.includes(a.id)) : state.areas;

  const hours = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border bg-card">
      <div className="flex border-b">
        <div className="w-12 shrink-0" />
        {days.map((d) => {
          const isToday = d.date === today;
          if (isClosed(d)) {
            return (
              <div key={d.i} className="flex w-9 shrink-0 flex-col items-center border-l pt-2 text-muted-foreground">
                <span className="text-[10px] font-medium uppercase">{DAY_SHORT[d.i].slice(0, 2)}</span>
                <span className="font-heading text-sm">{Number(d.date.slice(8))}</span>
              </div>
            );
          }
          return (
            <div key={d.i} className="min-w-0 flex-1 border-l">
              <div className="flex items-center justify-center gap-1.5 pt-2 pb-1">
                <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">{DAY_SHORT[d.i]}</span>
                <span
                  className={cn(
                    'grid size-6 place-items-center rounded-full font-heading text-sm font-semibold',
                    isToday && 'bg-primary text-primary-foreground',
                  )}
                >
                  {Number(d.date.slice(8))}
                </span>
              </div>
              <div className="flex pb-1.5">
                {areas.map((a) => (
                  <div key={a.id} title={a.name} className="min-w-0 flex-1 truncate px-1 text-center text-[10px] text-muted-foreground">
                    {a.name.replace(/^Area \d+ · /, '')}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div ref={bodyRef} className="relative flex min-h-0 flex-1">
        <div className="relative w-12 shrink-0">
          {hours.map((m) => (
            <span key={m} className="absolute right-2 text-[10px] text-muted-foreground tabular-nums" style={{ top: (m - startMin) * PX + 2 }}>
              {clock(fmtTime(m))}
            </span>
          ))}
        </div>
        {days.map((d) =>
          isClosed(d) ? (
            <button
              key={d.i}
              onClick={() => setOpened((o) => new Set([...o, d.date]))}
              title={`No ${v.classes} this day — click to open it`}
              className="w-9 shrink-0 border-l bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(255_255_255/0.025)_6px_12px)] text-[11px] tracking-widest text-muted-foreground/60 uppercase [writing-mode:vertical-rl] hover:text-foreground"
            >
              No {v.classes}
            </button>
          ) : (
            <div key={d.i} className={cn('relative flex min-w-0 flex-1 border-l', d.date === today && 'bg-white/[0.015]')}>
              {d.date === today && nowMin >= startMin && nowMin <= endMin && (
                <div className="pointer-events-none absolute inset-x-0 z-20 border-t border-primary" style={{ top: (nowMin - startMin) * PX }}>
                  <span className="absolute -top-[3px] -left-[3px] size-1.5 rounded-full bg-primary" />
                </div>
              )}
              {areas.map((a) => (
                <Lane
                  key={a.id}
                  state={state}
                  day={d}
                  area={a}
                  slots={state.slots.filter((s) => s.day === d.i && s.area_id === a.id)}
                  sessions={d.sessions.filter((s) => s.slot.area_id === a.id)}
                  conflicts={d.conflicts}
                  startMin={startMin}
                  PX={PX}
                  colorOf={colorOf}
                  coach={coach}
                  activities={activities}
                  focusPkg={focusPkg}
                  showEmpty={showEmpty}
                  isGhost={isGhost}
                  wide={days.length === 1}
                  onCreate={onCreate}
                  onOpenSession={(x, c) => !dragged.current && onOpenSession(x, c)}
                  moving={moving}
                  startMove={onMove ? startMove : null}
                />
              ))}
            </div>
          ),
        )}
      </div>
    </div>
  );
}

function Lane({
  state,
  day,
  area,
  slots,
  sessions: unfiltered,
  conflicts,
  startMin,
  PX,
  colorOf,
  coach,
  activities = [],
  focusPkg = null,
  showEmpty,
  isGhost,
  wide,
  onCreate,
  onOpenSession,
  moving,
  startMove,
}) {
  const v = useVocab();
  const all = activities.length ? unfiltered.filter((s) => activities.includes(s.cls.activity)) : unfiltered;
  // Packages booking the same class in the same slot share one session: draw it once, listing every package.
  // The package being viewed (not a ghost) leads the group.
  const groups = new Map();
  for (const s of [...all].sort((a, b) => !!isGhost?.(a) - !!isGhost?.(b))) {
    const k = `${s.slot.id}:${s.cls.id}`;
    groups.set(k, [...(groups.get(k) || []), s]);
  }
  // Within a shared session, list the most specific package first (fewest sessions), so a discipline
  // package shows before an all-access one like All Access.
  const size = (id) => state.entries.reduce((n, e) => n + (e.package_id === id), 0);
  const sessions = [...groups.values()].map((g) => {
    // In a package's own calendar (isGhost given) that package stays first; elsewhere sort them all.
    const bySize = (a, b) => size(a.pkg?.id) - size(b.pkg?.id);
    const shared = isGhost ? [g[0], ...g.slice(1).sort(bySize)] : [...g].sort(bySize);
    return { ...shared[0], shared };
  });

  // Members on any of the packages sharing a session (counted once each).
  const memberCount = (shared) => {
    const ids = new Set(shared.map((x) => x.pkg?.id));
    return new Set(state.packageMembers.filter((pm) => ids.has(pm.package_id)).map((pm) => pm.member_id)).size;
  };

  const filled = new Set(unfiltered.map((s) => s.slot.id)); // hidden-by-filter sessions still fill their slot
  const items = [
    ...sessions.map((s) => ({ kind: 'session', s, start: s.start, end: s.end })),
    ...(showEmpty
      ? slots.filter((sl) => !filled.has(sl.id)).map((sl) => ({ kind: 'slot', sl, start: toMin(sl.start_time), end: toMin(sl.end_time) }))
      : []),
  ].sort((a, b) => a.start - b.start || a.end - b.end);

  // Side-by-side columns for anything that overlaps within the lane.
  const colEnds = [];
  for (const it of items) {
    let c = colEnds.findIndex((end) => end <= it.start);
    if (c === -1) c = colEnds.push(0) - 1;
    colEnds[c] = it.end;
    it.col = c;
  }
  const w = 100 / Math.max(1, colEnds.length);

  // The time under the pointer, snapped to the nearest quarter hour (:00, :15, :30, :45).
  // A guide line shows it while hovering empty space, and a click starts the new class exactly there.
  const [hoverMin, setHoverMin] = useState(null);
  const [drag, setDrag] = useState(null); // { from, to } while click-dragging out a time range
  const minAt = (clientY, el) => startMin + Math.max(0, Math.round((clientY - el.getBoundingClientRect().top) / PX / 15) * 15);
  // Press on empty space and drag to pick start → end; a plain click starts there with the default hour.
  const onLaneDown = (e) => {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    e.preventDefault();
    const el = e.currentTarget;
    const from = minAt(e.clientY, el);
    setDrag({ from, to: from });
    setHoverMin(null);
    const move = (ev) => setDrag((d) => d && { ...d, to: minAt(ev.clientY, el) });
    const up = (ev) => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      setDrag(null);
      const to = minAt(ev.clientY, el);
      const a = Math.min(from, to);
      const b = Math.max(from, to);
      onCreate({ day: day.i, date: day.date, areaId: area.id, start: a, ...(b - a >= 15 ? { end: b } : {}) });
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  return (
    <div
      className="relative min-w-0 flex-1 cursor-copy border-l border-dashed border-white/[0.04] first:border-l-0 hover:bg-white/[0.015]"
      style={{ backgroundImage: HOUR_LINE, backgroundSize: `100% ${60 * PX}px` }}
      data-lane
      data-date={day.date}
      data-area={area.id}
      onMouseDown={onLaneDown}
      // Only over empty space: blocks and empty-slot boxes are children, so hide the guide on them.
      onMouseMove={(e) => !drag && setHoverMin(e.target === e.currentTarget ? minAt(e.clientY, e.currentTarget) : null)}
      onMouseLeave={() => setHoverMin(null)}
    >
      {drag && drag.to !== drag.from && (
        <div
          className="pointer-events-none absolute inset-x-0.5 z-10 rounded-[5px] border border-foreground/60 bg-foreground/10"
          style={{ top: (Math.min(drag.from, drag.to) - startMin) * PX, height: Math.abs(drag.to - drag.from) * PX }}
        >
          <span className="absolute bottom-full left-0 mb-1.5 rounded-md border bg-popover px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap text-foreground shadow-md tabular-nums">
            {clockRange(fmtTime(Math.min(drag.from, drag.to)), fmtTime(Math.max(drag.from, drag.to)))} · {area.name}
          </span>
        </div>
      )}
      {moving && moving.date === day.date && moving.areaId === area.id && (
        <div
          className="pointer-events-none absolute inset-x-0.5 z-30 rounded-[5px] border-2 border-foreground/70 bg-[color-mix(in_oklab,var(--tint)_30%,#161616)] shadow-lg"
          style={{ top: (moving.start - startMin) * PX, height: (moving.s.end - moving.s.start) * PX, '--tint': colorOf(moving.s.cls.activity) }}
        >
          <span className="absolute bottom-full left-0 mb-1.5 rounded-md border bg-popover px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap text-foreground shadow-md tabular-nums">
            {moving.s.cls.activity} · {clockRange(fmtTime(moving.start), fmtTime(moving.start + moving.s.end - moving.s.start))} · {area.name}
          </span>
        </div>
      )}
      {hoverMin != null && !drag && !moving && (
        <div className="pointer-events-none absolute inset-x-0 z-10 border-t border-foreground/80" style={{ top: (hoverMin - startMin) * PX }}>
          <span className="absolute -top-px left-0 size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground" />
          <span className="absolute bottom-full left-0 mb-1.5 rounded-md border bg-popover px-1.5 py-0.5 text-[10px] leading-none font-medium whitespace-nowrap text-foreground shadow-md tabular-nums">
            {clock(fmtTime(hoverMin))}
            {' · '}
            {area.name}
          </span>
        </div>
      )}
      {items.map((it) => {
        const pos = {
          top: (it.start - startMin) * PX + 1,
          height: Math.max(14, (it.end - it.start) * PX - 2),
          left: `calc(${it.col * w}% + 1px)`,
          width: `calc(${w}% - 3px)`,
        };
        if (it.kind === 'slot') {
          return (
            <div
              key={`slot-${it.sl.id}`}
              className={cn(
                'absolute overflow-hidden rounded-[5px] border border-dashed border-white/15 px-1.5 py-1 text-[10.5px] leading-[1.25] text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground',
                !it.sl.active && 'opacity-40',
              )}
              style={pos}
              title={`${it.sl.label || 'Slot'} ${clockRange(it.sl.start_time, it.sl.end_time)}${it.sl.active ? '' : ' (inactive)'}`}
              onClick={(e) => {
                e.stopPropagation();
                onCreate({ day: day.i, date: day.date, areaId: area.id, slotId: it.sl.id });
              }}
            >
              <div className="truncate">{it.sl.active ? `+ ${it.sl.label || 'Empty slot'}` : 'Inactive slot'}</div>
              <div className="truncate">{clock(it.sl.start_time)}</div>
            </div>
          );
        }
        const s = it.s;
        const ghost = isGhost?.(s);
        const conf = conflicts.get(s.key);
        const dim = (coach && !coachNames(s.cls).includes(coach)) || (focusPkg && !s.shared.some((x) => x.pkg?.id === focusPkg));
        const color = colorOf(s.cls.activity);
        // Lines are added as the block gets taller: activity → coach and members → label.
        const fits = (lines) => pos.height >= 10 + lines * 13.5;
        // Which package(s) this is, without repeating the activity: "Boxing — Adults" → "Adults".
        // One-time classes show who's booked instead of a package.
        const booked = s.oneOff ? oneOffMembers(state, s.oneOff.id) : null;
        const pkgs = s.pkg
          ? packageShort(s.shared[0].pkg.name, s.cls.activity)
          : booked.map((m) => m.name.split(' ')[0]).join(', ') || `No ${v.members} yet`;
        const more = s.shared.length > 1 && !s.oneOff ? ` +${s.shared.length - 1}` : '';
        const members = s.oneOff ? booked.length : memberCount(s.shared);
        const week = s.pkg?.cycle_length > 1 ? `${s.pos}/${s.pkg.cycle_length}` : null;
        // Day changes from the Schedule: cancelled, or moved / another coach for that day only.
        const label = s.cancelled ? 'Cancelled' : s.change ? 'Changed today' : s.slot.label || (s.oneOff ? 'One time' : '');
        const block = (
          <div
            className={cn(
              // @container: the text inside adapts to the block's own width (initials when narrow).
              '@container absolute flex flex-col gap-px overflow-hidden rounded-[5px] py-1 pr-1 pl-2.5 text-[11px] leading-[1.25] transition-[background-color,opacity] [&>div]:shrink-0',
              ghost
                ? 'cursor-default border border-dashed border-white/10 text-muted-foreground'
                : cn(
                    'border border-white/[0.06] bg-[color-mix(in_oklab,var(--tint)_15%,#161616)] hover:bg-[color-mix(in_oklab,var(--tint)_26%,#161616)]',
                    startMove && !s.cancelled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
                  ),
              s.cancelled && 'opacity-45 [&>div:first-of-type]:line-through',
              s.change && !s.cancelled && 'border-amber-300/50',
              moving?.s.key === s.key && 'opacity-30',
              s.gap && 'border-dashed border-destructive/50',
              s.oneOff && !ghost && 'border-dashed border-foreground/35',
              conf && 'outline outline-1 outline-primary',
              dim && 'opacity-25',
            )}
            style={{ ...pos, '--tint': color }}
            onMouseDown={startMove && !ghost ? (e) => startMove(e, s) : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (!ghost) onOpenSession(s, conf || []);
            }}
          >
            {/* Accent pill runs the full height, inset inside the block */}
            {!ghost && <span className="absolute top-1 bottom-1 left-[3px] w-[3px] rounded-full" style={{ background: color }} />}
            <div className={cn('truncate font-medium', !ghost && 'text-foreground')}>
              {conf && <TriangleAlert className="mr-0.5 inline size-3 -translate-y-px text-destructive" />}
              {s.gap ? `Gap · ${s.cls.activity}` : s.cls.activity}
            </div>
            {wide ? (
              // A single day is wide: everything on one line.
              <div className="truncate text-muted-foreground">
                {[
                  s.cls.coach,
                  label,
                  label.toLowerCase().includes(pkgs.toLowerCase()) ? null : pkgs + more,
                  v.n(members, 'member'),
                  week && `W${week}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            ) : (
              <>
                {/* Coach (initials when narrow), with the member count on the right */}
                <div className="flex min-w-0 items-center gap-1 text-muted-foreground">
                  <span title={s.cls.coach} className="min-w-0 truncate @[6.5rem]:hidden">
                    {initials(s.cls.coach)}
                  </span>
                  <span className="hidden min-w-0 truncate @[6.5rem]:inline">{s.cls.coach}</span>
                  <span
                    className="ml-auto flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums opacity-80"
                    title={v.n(members, 'member')}
                  >
                    <Users className="size-2.5" />
                    {members}
                  </span>
                </div>
                {/* Who it's for, from the class time's label ("Adults", "Kids (5–7)") */}
                {fits(3) && (label || week) && (
                  <div
                    className={cn(
                      'flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground/80',
                      s.cancelled && 'text-destructive',
                      s.change && !s.cancelled && 'text-amber-300',
                    )}
                  >
                    <span className="min-w-0 truncate" title={label}>
                      {label}
                    </span>
                    {week && (
                      <span className="ml-auto shrink-0 tabular-nums" title={`Week ${s.pos} of ${s.pkg.cycle_length} in the rotation`}>
                        W{week}
                      </span>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        );
        if (ghost)
          return (
            <div key={s.key} className="contents" title={s.pkg ? `Booked by ${s.pkg.name}` : v.OneOff}>
              {block}
            </div>
          );
        return (
          <HoverCard key={s.key} openDelay={250} closeDelay={60}>
            <HoverCardTrigger asChild>{block}</HoverCardTrigger>
            <HoverCardContent side="right" align="start" className="w-72 p-0">
              <SessionPreview s={s} state={state} color={color} conf={conf} />
            </HoverCardContent>
          </HoverCard>
        );
      })}
    </div>
  );
}

// Hover details for a session: when/where/package, the slot's full rotation, members and clashes.
function SessionPreview({ s, state, color, conf }) {
  const v = useVocab();
  const minutes = s.end - s.start;
  if (s.oneOff) return <OneOffPreview s={s} state={state} color={color} conf={conf} minutes={minutes} />;
  const pkgIds = new Set(s.shared.map((x) => x.pkg?.id));
  const members = new Set(state.packageMembers.filter((pm) => pkgIds.has(pm.package_id)).map((pm) => pm.member_id)).size;
  const classById = new Map(state.classes.map((c) => [c.id, c]));
  const rotation = Array.from({ length: s.pkg.cycle_length }, (_, i) => {
    const e = state.entries.find((x) => x.package_id === s.pkg.id && x.slot_id === s.slot.id && x.week_position === i + 1);
    return { week: i + 1, cls: e && classById.get(e.class_id) };
  });

  return (
    <div className="text-sm">
      <div className="flex items-start gap-3 border-b p-3">
        <span className="mt-1 h-8 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <div className="font-heading font-semibold">{s.cls.activity}</div>
          <div className="text-muted-foreground">with {s.cls.coach}</div>
        </div>
      </div>

      <div className="space-y-2 p-3 text-xs">
        <Row icon={CalendarClock}>
          {fmtDate(s.date)} · {clockRange(s.slot.start_time, s.slot.end_time)} <span className="text-muted-foreground">({minutes} min)</span>
        </Row>
        <Row icon={MapPin}>
          {s.area?.name}
          {s.slot.label && <span className="text-muted-foreground"> · {s.slot.label}</span>}
        </Row>
        {s.shared.map((x) => (
          <Row key={x.pkg.id} icon={Layers}>
            {x.pkg.name}
            {x.pkg.cycle_length > 1 && (
              <span className="text-muted-foreground">
                {' '}
                · week {x.pos} of {x.pkg.cycle_length}
              </span>
            )}
          </Row>
        ))}
        <Row icon={Users}>
          {v.n(members, 'member')}
          {s.slot.capacity ? <span className="text-muted-foreground"> · {s.slot.capacity} spots</span> : null}
        </Row>
      </div>

      {rotation.length > 1 && (
        <div className="border-t p-3">
          <div className="mb-2 text-[11px] tracking-wide text-muted-foreground uppercase">Rotation</div>
          <div className="flex gap-1">
            {rotation.map((r) => (
              <div
                key={r.week}
                className={cn(
                  'min-w-0 flex-1 rounded-md border px-1.5 py-1 text-[10.5px]',
                  r.week === s.pos ? 'border-primary/60 bg-primary/10' : 'border-border',
                )}
              >
                <div className="text-muted-foreground">W{r.week}</div>
                <div className="truncate font-medium">{r.cls ? r.cls.activity : '—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(conf?.length > 0 || s.gap) && (
        <div className="space-y-1 border-t p-3 text-xs text-destructive">
          {s.gap && (
            <div className="flex items-center gap-1.5">
              <TriangleAlert className="size-3.5" /> Slot is inactive — gap in the rotation
            </div>
          )}
          {conf?.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <TriangleAlert className="size-3.5 shrink-0" />
              {c.type === 'area' ? 'Area' : v.Coach} clash with {c.other.cls.activity} ({c.other.cls.coach})
            </div>
          ))}
        </div>
      )}

      <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">Click to edit</div>
    </div>
  );
}

function OneOffPreview({ s, state, color, conf, minutes }) {
  const v = useVocab();
  const members = oneOffMembers(state, s.oneOff.id);
  return (
    <div className="text-sm">
      <div className="flex items-start gap-3 border-b p-3">
        <span className="mt-1 h-8 w-[3px] shrink-0 rounded-full" style={{ background: color }} />
        <div className="min-w-0">
          <div className="font-heading font-semibold">{s.cls.activity}</div>
          <div className="text-muted-foreground">with {s.cls.coach}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-md border border-dashed px-1.5 py-0.5 text-[10.5px] text-muted-foreground">One time</span>
      </div>
      <div className="space-y-2 p-3 text-xs">
        <Row icon={CalendarClock}>
          {fmtDate(s.date)} · {clockRange(s.slot.start_time, s.slot.end_time)} <span className="text-muted-foreground">({minutes} min)</span>
        </Row>
        <Row icon={MapPin}>
          {s.area?.name}
          {s.slot.label && <span className="text-muted-foreground"> · {s.slot.label}</span>}
        </Row>
        <Row icon={Users}>{members.length ? members.map((m) => m.name).join(', ') : `No ${v.members} yet`}</Row>
        {s.oneOff.note && <p className="text-muted-foreground">{s.oneOff.note}</p>}
      </div>
      {conf?.length > 0 && (
        <div className="space-y-1 border-t p-3 text-xs text-destructive">
          {conf.map((c, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <TriangleAlert className="size-3.5 shrink-0" />
              {c.type === 'area' ? 'Room' : v.Coach} clash with {c.other.cls.activity} ({c.other.cls.coach})
            </div>
          ))}
        </div>
      )}
      <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">Click to edit</div>
    </div>
  );
}

function Row({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate">{children}</span>
    </div>
  );
}

// "Boxing — Adults" → "Adults"; names that don't start with the activity are kept whole.
// "Marco Reyes" → "MR", "Sam Ortiz" → "SO", "Marco Reyes & Sam Ortiz" → "MR+SO"
function initials(name) {
  return name
    .split('&')
    .map((one) =>
      one
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => (/^\d+$/.test(w) ? w : w[0].toUpperCase()))
        .join(''),
    )
    .join('+');
}

function packageShort(name, activity) {
  const rest = name.startsWith(activity) ? name.slice(activity.length).replace(/^[\s—–\-:·]+/, '') : '';
  return rest || name;
}
