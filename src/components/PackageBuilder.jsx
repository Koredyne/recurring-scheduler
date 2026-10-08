import { useMemo, useState } from 'react';
import { Check, Minus, Pencil, Plus, Search, X } from 'lucide-react';
import { DAY_SHORT, addDays, clockRange, fmtShort, todayStr, weekStart } from '../lib/dates.js';
import { activityColors, cyclePosition, packageStatus } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import WeekPicker from './WeekPicker.jsx';
import { TimeRange } from './TimeInput.jsx';
import { MONTH_PRESETS, classPresets, monthsLabel, planLabel, plansOf } from './Subscriptions.jsx';
import NumberChoice from './NumberChoice.jsx';
import { useVocab } from './VocabContext.jsx';
import { DAY_ORDER, isAdults, isKids, keyOf, timetableGroups, weeksOf } from '../lib/packageClasses.js';

const SHELL = 'flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-3xl';

// Make a package in one go: name it, tick the classes it includes, say how it's sold, pick a start week.
export default function PackageBuilder({ state, onClose, onSave }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={SHELL}>
        <PackageForm state={state} onCancel={onClose} onSave={onSave} />
      </DialogContent>
    </Dialog>
  );
}

// An existing package, laid out like the builder but read-only; Edit turns it into the builder, filled in.
export function PackageDialog({ state, pkg, mutate, onClose }) {
  const [editing, setEditing] = useState(false);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={SHELL}>
        {editing ? (
          <PackageForm
            state={state}
            pkg={pkg}
            onCancel={() => setEditing(false)}
            onSave={async (bundle) => {
              await mutate((api) => api.updatePackage(pkg.id, bundle));
              setEditing(false);
            }}
          />
        ) : (
          <PackageSummary state={state} pkg={pkg} onClose={onClose} onEdit={() => setEditing(true)} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// The builder's form: blank for a new package, or filled in from `pkg` to edit it.
function PackageForm({ state, pkg, onCancel, onSave }) {
  const v = useVocab();
  const [name, setName] = useState(pkg?.name ?? '');
  const [weeks, setWeeks] = useState(() => (pkg ? weeksOf(state, pkg) : [new Set()]));
  const { groups, addClass, removeDraft } = useDrafts(state, setWeeks, pkg?.id);
  const [plans, setPlans] = useState(() =>
    pkg
      ? plansOf(state, pkg.id).map((p) => ({
          id: p.id,
          label: p.label,
          classes: p.classes_per_month == null ? '' : String(p.classes_per_month),
          months: String(p.months ?? 1),
          price: p.price == null ? '' : String(p.price),
        }))
      : [{ classes: '12', months: '1', price: '' }],
  );
  const [start, setStart] = useState(pkg?.anchor_date ?? weekStart(todayStr()));
  const [end, setEnd] = useState(pkg?.end_date ?? ''); // exclusive: the first Sunday it no longer runs
  const [saving, setSaving] = useState(false);
  const badEnd = end && end <= start;
  const unfinishedPlan = plans.some((p) => p.classes == null || p.months == null); // a custom number left empty

  const sessions = weeksToSessions(groups, weeks);
  const perWeek = Math.max(...weeks.map((w) => w.size));
  const pickedActivities = new Set(groups.filter((g) => g.items.some((it) => weeks.some((w) => w.has(keyOf(it))))).map((g) => g.cls.activity));

  // Suggest a name from what's ticked, until the user types their own.
  const [nameTouched, setNameTouched] = useState(!!pkg);
  const suggested = pickedActivities.size === 1 ? [...pickedActivities][0] : '';
  const shownName = (nameTouched ? name : name || suggested) || '';
  const subsOn = (planId) => state.packageMembers.filter((pm) => pm.plan_id === planId).length;

  const save = async () => {
    setSaving(true);
    try {
      await onSave({
        name: shownName.trim(),
        anchor_date: start,
        ...(pkg && { end_date: end || null }),
        cycle_length: weeks.length,
        sessions,
        plans: plans
          .filter((p) => p.classes !== undefined)
          .map((p) => ({
            id: p.id,
            label: p.label,
            classes_per_month: p.classes ? Number(p.classes) : null,
            months: Number(p.months) || 1,
            price: p.price === '' ? null : Number(p.price),
          })),
      });
    } catch {
      // the error is already shown as a toast; keep the form open so nothing is lost
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle>{pkg ? `Edit ${pkg.name}` : `New ${v.package}`}</DialogTitle>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* 1 — name */}
        <Step n={1} title="What's it called?">
          <Input
            autoFocus
            placeholder={`e.g. ${v.example.package}`}
            value={shownName}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
            className="max-w-sm"
          />
        </Step>

        {/* 2 — classes */}
        <Step
          n={2}
          title={`Which ${v.classes} can ${v.members} come to?`}
          hint={weeks.length === 1 ? `Tick ${v.a('class')} for every day it runs, or tap single days.` : `Tick which weeks each ${v.class} is in.`}
        >
          <WeekPlanner
            state={state}
            groups={groups}
            weeks={weeks}
            setWeeks={setWeeks}
            canChangeLength
            currentWeek={pkg && weeks.length > 1 ? (cyclePosition(pkg, todayStr()) ?? undefined) : undefined}
            addClass={addClass}
            removeDraft={removeDraft}
          />
        </Step>

        {/* 3 — plans */}
        <Step n={3} title="How is it sold?" hint="Add more than one if you sell it different ways.">
          <div className="space-y-2">
            {plans.map((p, i) => {
              const setPlan = (patch) => setPlans(plans.map((x, j) => (j === i ? { ...x, ...patch } : x)));
              const members = p.id ? subsOn(p.id) : 0;
              return (
                <div key={p.id ?? `new${i}`} className="flex flex-wrap items-center gap-2">
                  {p.label && <span className="text-sm font-medium">{p.label}</span>}
                  <NumberChoice
                    value={p.classes}
                    onChange={(classes) => setPlan({ classes })}
                    presets={classPresets(v)}
                    suffix={(n) => (n === '1' ? v.class : v.classes)}
                    placeholder="e.g. 16"
                  />
                  <span className="text-sm text-muted-foreground">a month, for</span>
                  <NumberChoice
                    value={p.months}
                    onChange={(months) => setPlan({ months })}
                    presets={MONTH_PRESETS}
                    suffix={(n) => (n === '1' ? 'month' : 'months')}
                    placeholder="e.g. 10"
                  />
                  <span className="text-sm text-muted-foreground">at</span>
                  <div className="relative">
                    <Input
                      className="h-8 w-24 pr-9"
                      inputMode="decimal"
                      placeholder="55"
                      aria-label={`Price for ${monthsLabel(p.months || 1)}`}
                      value={p.price}
                      onChange={(e) => setPlan({ price: e.target.value.replace(/[^\d.]/g, '') })}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground">{v.currency}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">in total</span>
                  {members > 0 && (
                    <span className="text-xs text-muted-foreground">
                      · {v.n(members, 'member')} on it
                    </span>
                  )}
                  {plans.length > 1 && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground"
                      aria-label="Remove plan"
                      title={members ? `${v.n(members, 'member')} will keep the ${v.package} but have no plan` : undefined}
                      onClick={() => setPlans(plans.filter((_, j) => j !== i))}
                    >
                      <X />
                    </Button>
                  )}
                </div>
              );
            })}
            <Button size="xs" variant="ghost" onClick={() => setPlans([...plans, { classes: '24', months: '1', price: '' }])}>
              <Plus /> Another way to sell it
            </Button>
            {unfinishedPlan && <p className="text-xs text-destructive">Type a number for each custom amount, or pick one from the list.</p>}
          </div>
        </Step>

        {/* 4 — start (and, for an existing package, an optional last week) */}
        <Step n={4} title={pkg ? 'When does it run?' : 'When does it start?'} hint={weeks.length > 1 ? 'The start week is week 1.' : undefined}>
          <div className="flex flex-wrap items-center gap-2">
            <WeekPicker value={start} onChange={(w) => w && setStart(w)} className="w-64" />
            {pkg && (
              <>
                <span className="text-sm text-muted-foreground">until</span>
                <WeekPicker
                  clearable
                  placeholder="Keeps running"
                  value={end ? addDays(end, -7) : ''}
                  onChange={(w) => setEnd(w ? addDays(w, 7) : '')}
                  className="w-64"
                />
              </>
            )}
          </div>
          {badEnd && <p className="mt-1.5 text-xs text-destructive">The last week can’t be before the start.</p>}
        </Step>
      </div>

      <DialogFooter className="items-center border-t px-6 py-4">
        <span className="mr-auto text-xs text-muted-foreground">
          {shownName.trim() ? `${shownName.trim()} · ` : ''}
          {weeks.length > 1 ? `${weeks.length}-week cycle · ` : ''}
          {classesAWeek(perWeek, weeks.length > 1, v)} · {plans.length} plan{plans.length === 1 ? '' : 's'}
        </span>
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button disabled={!shownName.trim() || badEnd || unfinishedPlan || saving} onClick={save}>
          {pkg ? 'Save changes' : `Create ${v.package}`}
        </Button>
      </DialogFooter>
    </>
  );
}

// Read-only view of a package, in the builder's four steps.
function PackageSummary({ state, pkg, onClose, onEdit }) {
  const v = useVocab();
  const today = todayStr();
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const weeks = useMemo(() => weeksOf(state, pkg), [state, pkg]);
  const n = weeks.length;
  const pickedIn = (w, g) => g.items.filter((it) => weeks[w].has(keyOf(it)));
  const rows = timetableGroups(state, pkg.id)
    .map((g) => ({ g, days: g.items.filter((it) => weeks.some((w) => w.has(keyOf(it)))) }))
    .filter((r) => r.days.length);
  const plans = plansOf(state, pkg.id);
  const subsOn = (planId) => state.packageMembers.filter((pm) => pm.plan_id === planId).length;
  const status = packageStatus(pkg, today);
  const pos = cyclePosition(pkg, today);
  const perWeek = Math.max(...weeks.map((w) => w.size));

  const classText = (g) => (
    <span className="min-w-0 flex-1 truncate text-sm">
      <span className="font-medium">{g.cls.activity}</span>
      {g.slot.label && <span className="text-muted-foreground"> · {g.slot.label}</span>}
      <span className="text-xs text-muted-foreground">
        {'  '}
        {clockRange(g.slot.start_time, g.slot.end_time)} · {g.cls.coach}
      </span>
      {g.gap && <span className="ml-1.5 text-xs text-destructive">{v.class} time switched off</span>}
    </span>
  );

  return (
    <>
      <DialogHeader className="border-b px-6 py-4">
        <DialogTitle className="flex items-center gap-2">
          {pkg.name}
          <Badge variant={status === 'active' ? 'secondary' : 'outline'} className="capitalize">
            {status}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <Step n={1} title="Name">
          <p className="text-sm">{pkg.name}</p>
        </Step>

        <Step
          n={2}
          title={`${v.Classes} ${v.members} can come to`}
          hint={n === 1 ? 'Same every week.' : `Different each week — starts again after ${n} weeks${pos ? `, week ${pos} now` : ''}.`}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No {v.classes} yet.</p>
          ) : n === 1 ? (
            <div className="max-h-[50vh] divide-y overflow-auto rounded-lg border">
              {rows.map(({ g, days }) => (
                <div key={g.key} className="flex items-center gap-2.5 px-3 py-1.5">
                  <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: colorOf(g.cls.activity) }} />
                  {classText(g)}
                  <div className="flex shrink-0 gap-1">
                    {days.map((it) => (
                      <span key={it.slot_id} className="w-9 rounded border border-primary/70 bg-primary/15 py-0.5 text-center text-[11px]">
                        {DAY_SHORT[it.day]}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-auto rounded-lg border">
              <table className="w-full border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-popover">
                  <tr className="border-b">
                    <th className="px-3 py-1.5 text-left text-xs font-normal text-muted-foreground">Numbers = {v.classes} that week</th>
                    {weeks.map((set, w) => (
                      <th key={w} className={cn('w-11 px-0.5 py-1 text-xs font-medium', pos === w + 1 && 'bg-accent')}>
                        W{w + 1}
                        <div className="text-[10px] font-normal text-muted-foreground tabular-nums">{set.size || '–'}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ g, days }) => (
                    <tr key={g.key} className="border-b last:border-0">
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: colorOf(g.cls.activity) }} />
                          {classText(g)}
                          <span className="shrink-0 text-xs text-muted-foreground">{daysText(days)}</span>
                        </div>
                      </td>
                      {weeks.map((_, w) => {
                        const c = pickedIn(w, g).length;
                        const all = c === g.items.length;
                        return (
                          <td
                            key={w}
                            className={cn('px-0.5 py-1 text-center', pos === w + 1 && 'bg-accent/50')}
                            title={c && !all ? pickedIn(w, g).map((it) => DAY_SHORT[it.day]).join(' ') : undefined}
                          >
                            <span
                              className={cn(
                                'mx-auto grid size-6 place-items-center rounded border',
                                all ? 'border-primary bg-primary text-primary-foreground' : c ? 'border-primary/70 bg-primary/15' : 'border-transparent',
                              )}
                            >
                              {all ? <Check className="size-3.5" /> : c ? <span className="h-0.5 w-2 rounded bg-primary" /> : null}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Step>

        <Step n={3} title="How it's sold">
          {plans.length ? (
            <div className="flex flex-wrap gap-1.5">
              {plans.map((p) => (
                <span key={p.id} className="rounded-md border bg-muted/30 px-2.5 py-1 text-xs">
                  {planLabel(p, v)}
                  <span className="text-muted-foreground">
                    {' '}
                    · {v.n(subsOn(p.id), 'member')}
                  </span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No plans yet.</p>
          )}
        </Step>

        <Step n={4} title="When it runs">
          <p className="text-sm">
            From the week of {fmtShort(pkg.anchor_date)}
            {pkg.end_date ? `, last week ${fmtShort(addDays(pkg.end_date, -7))} – ${fmtShort(addDays(pkg.end_date, -1))}` : ', keeps running'}
          </p>
        </Step>
      </div>

      <DialogFooter className="items-center border-t px-6 py-4">
        <span className="mr-auto text-xs text-muted-foreground">
          {n > 1 ? `${n}-week cycle · ` : ''}
          {classesAWeek(perWeek, n > 1, v)} · {plans.length} plan{plans.length === 1 ? '' : 's'}
        </span>
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
        <Button onClick={onEdit}>
          <Pencil /> Edit
        </Button>
      </DialogFooter>
    </>
  );
}

const classesAWeek = (n, rotates, v) => (n ? `${rotates ? 'up to ' : ''}${v.n(n, 'class')} a week` : `no ${v.classes} yet`);

// [Set, Set, …] (one per week) -> [{ slot_id, class_id, week }]
function weeksToSessions(groups, weeks) {
  const items = groups.flatMap((g) => g.items);
  return weeks.flatMap((picked, i) =>
    items
      .filter((it) => picked.has(keyOf(it)))
      .map((it) => (it.spec ? { new: { ...it.spec, day: it.day }, week: i + 1 } : { slot_id: it.slot_id, class_id: it.class_id, week: i + 1 })),
  );
}

// Classes made right inside the package form. They live only in the form until the package is saved;
// the server then creates them (activity, coach, class, time) in the same all-or-nothing save.
let draftSeq = 0;
function useDrafts(state, setWeeks, pkgId) {
  const [drafts, setDrafts] = useState([]);
  const groups = useMemo(() => [...timetableGroups(state, pkgId), ...drafts], [state, drafts, pkgId]);
  const addClass = (spec, days) => {
    const id = `new${++draftSeq}`;
    const ordered = DAY_ORDER.filter((d) => days.includes(d));
    const g = {
      key: id,
      isNew: true,
      cls: { id, activity: spec.activity, coach: spec.coach },
      slot: {
        start_time: spec.start_time,
        end_time: spec.end_time,
        label: spec.label,
      },
      items: ordered.map((day) => ({
        day,
        slot_id: `${id}-${day}`,
        class_id: id,
        spec: { ...spec, key: id },
      })),
    };
    setDrafts((ds) => [...ds, g]);
    // Tick it in every week straight away — untick weeks in the grid if it's not every week.
    setWeeks((ws) => ws.map((w) => new Set([...w, ...g.items.map(keyOf)])));
  };
  const removeDraft = (key) => {
    setDrafts((ds) => ds.filter((d) => d.key !== key));
    setWeeks((ws) => ws.map((w) => new Set([...w].filter((k) => !k.endsWith(`:${key}`)))));
  };
  return { groups, addClass, removeDraft };
}

// "Same every week" (a tick-list with day buttons) or "Different each week" (a classes × weeks grid).
// `weeks` is one Set of picked keys per week of the cycle.
function WeekPlanner({ state, groups, weeks, setWeeks, canChangeLength, currentWeek, addClass, removeDraft }) {
  const n = weeks.length;
  const resize = (len) => setWeeks((ws) => Array.from({ length: len }, (_, i) => ws[i] ?? new Set()));

  return (
    <div className="space-y-3">
      {canChangeLength && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border p-0.5">
            {[
              [false, 'Same every week'],
              [true, 'Different each week'],
            ].map(([multi, label]) => (
              <button
                key={label}
                onClick={() => resize(multi ? Math.max(n, 2) : 1)}
                className={cn(
                  'rounded-md px-3 py-1 text-sm transition-colors',
                  n > 1 === multi ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {n > 1 && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Starts again after
              <span className="flex items-center rounded-lg border">
                <Button size="icon-sm" variant="ghost" aria-label="Fewer weeks" disabled={n <= 2} onClick={() => resize(n - 1)}>
                  <Minus />
                </Button>
                <span className="w-7 text-center font-medium text-foreground tabular-nums">{n}</span>
                <Button size="icon-sm" variant="ghost" aria-label="More weeks" disabled={n >= 12} onClick={() => resize(n + 1)}>
                  <Plus />
                </Button>
              </span>
              weeks
            </div>
          )}
        </div>
      )}

      {n > 1 ? (
        <RotationGrid
          state={state}
          groups={groups}
          weeks={weeks}
          setWeeks={setWeeks}
          currentWeek={currentWeek}
          addClass={addClass}
          removeDraft={removeDraft}
        />
      ) : (
        <ClassPicker
          state={state}
          groups={groups}
          picked={weeks[0]}
          setPicked={(upd) => setWeeks((ws) => [typeof upd === 'function' ? upd(ws[0]) : upd])}
          addClass={addClass}
          removeDraft={removeDraft}
        />
      )}
    </div>
  );
}

// Free-text match on everything shown in a row: activity, who it's for, coach, time and days.
const matches = (g, q) =>
  !q ||
  [g.cls.activity, g.slot.label, g.cls.coach, clockRange(g.slot.start_time, g.slot.end_time), daysText(g.items)]
    .join(' ')
    .toLowerCase()
    .includes(q.trim().toLowerCase());

function SearchBox({ value, onChange }) {
  const v = useVocab();
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={`Search ${v.classes}, ${v.coaches}…`} className="h-7 w-48 pl-7 text-xs" />
      {value && (
        <button
          className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          aria-label="Clear search"
          onClick={() => onChange('')}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}

const daysText = (items) => (items.length >= 6 ? 'every day' : items.map((it) => DAY_SHORT[it.day]).join(' '));

// Classes down the side, weeks across the top. Tick a cell to put that class in that week;
// click a class name to fill/clear its row, or a week to fill/clear its column.
function RotationGrid({ state, groups, weeks, setWeeks, currentWeek, addClass, removeDraft }) {
  const v = useVocab();
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const activities = [...new Set(groups.map((g) => g.cls.activity))];
  const [only, setOnly] = useState('');
  const [q, setQ] = useState('');
  const [tickedOnly, setTickedOnly] = useState(false);

  const count = (w, g) => g.items.filter((it) => weeks[w].has(keyOf(it))).length;
  const full = (w, g) => count(w, g) === g.items.length;
  const inAny = (g) => weeks.some((_, w) => count(w, g) > 0);
  const visible = groups.filter((g) => (!only || g.cls.activity === only) && (!tickedOnly || inAny(g)) && matches(g, q));
  const pickedActivities = new Set(groups.filter(inAny).map((g) => g.cls.activity));

  // Turn a set of (week, class-row) cells on or off.
  const setCells = (cells, on) =>
    setWeeks((ws) =>
      ws.map((set, w) => {
        const mine = cells.filter((c) => c.w === w);
        if (!mine.length) return set;
        const next = new Set(set);
        for (const { g } of mine) for (const it of g.items) on ? next.add(keyOf(it)) : next.delete(keyOf(it));
        return next;
      }),
    );
  const toggleRow = (g) =>
    setCells(
      weeks.map((_, w) => ({ w, g })),
      !weeks.every((_, w) => full(w, g)),
    );
  const toggleCol = (w) =>
    setCells(
      visible.map((g) => ({ w, g })),
      !visible.every((g) => full(w, g)),
    );

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <SearchBox value={q} onChange={setQ} />
        <Chip on={!only} onClick={() => setOnly('')}>
          All
        </Chip>
        {activities.map((a) => (
          <Chip key={a} on={only === a} onClick={() => setOnly(only === a ? '' : a)} dot={colorOf(a)} marked={pickedActivities.has(a)}>
            {a}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        <Chip on={tickedOnly} onClick={() => setTickedOnly(!tickedOnly)}>
          Only ticked
        </Chip>
        {weeks.some((w) => w.size) && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setWeeks((ws) => ws.map(() => new Set()))}>
            Clear
          </Button>
        )}
      </div>

      <div className="mt-3 max-h-[60vh] overflow-auto rounded-lg border">
        <table key={weeks.length} className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-popover">
            <tr className="border-b">
              <th className="px-3 py-1.5 text-left text-xs font-normal text-muted-foreground">
                Click {v.a('class')} to tick every week <span className="text-muted-foreground/70">· numbers = {v.classes} that week</span>
              </th>
              {weeks.map((set, w) => (
                <th key={w} className="w-11 px-0.5 py-1">
                  <button
                    onClick={() => toggleCol(w)}
                    title={`Week ${w + 1}: ${v.n(set.size, 'class')}. Click to tick or clear this week for the ${v.classes} shown.`}
                    className={cn(
                      'w-full rounded-md px-1 py-1 text-xs font-medium hover:bg-accent',
                      currentWeek === w + 1 && 'bg-accent ring-1 ring-foreground/30',
                    )}
                  >
                    W{w + 1}
                    <div className="text-[10px] font-normal text-muted-foreground tabular-nums">{set.size || '–'}</div>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr key={g.key} className={cn('border-b last:border-0', inAny(g) && 'bg-accent/30')}>
                <td className="px-3 py-0.5">
                  <div className="flex items-center gap-1">
                    <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => toggleRow(g)}>
                      <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: colorOf(g.cls.activity) }} />
                      <span className="min-w-0 truncate">
                        <span className="font-medium">{g.cls.activity}</span>
                        {g.slot.label && <span className="text-muted-foreground"> · {g.slot.label}</span>}
                        <span className="text-xs text-muted-foreground">
                          {'  '}
                          {clockRange(g.slot.start_time, g.slot.end_time)} · {daysText(g.items)} · {g.cls.coach}
                        </span>
                      </span>
                      {g.isNew && <NewBadge />}
                    </button>
                    {g.isNew && <RemoveDraft onClick={() => removeDraft(g.key)} />}
                  </div>
                </td>
                {weeks.map((_, w) => {
                  const c = count(w, g);
                  const on = c === g.items.length;
                  return (
                    <td key={w} className={cn('px-0.5 py-0.5 text-center', currentWeek === w + 1 && 'bg-accent/50')}>
                      <button
                        onClick={() => setCells([{ w, g }], !on)}
                        aria-label={`Week ${w + 1}: ${g.cls.activity} ${clockRange(g.slot.start_time, g.slot.end_time)}`}
                        title={c && !on ? 'Some days only — click to tick every day' : undefined}
                        className={cn(
                          'mx-auto grid size-6 place-items-center rounded border transition-colors',
                          on
                            ? 'border-primary bg-primary text-primary-foreground'
                            : c
                              ? 'border-primary/70 bg-primary/15'
                              : 'border-input hover:border-foreground/40',
                        )}
                      >
                        {on ? <Check className="size-3.5" /> : c ? <span className="h-0.5 w-2 rounded bg-primary" /> : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={weeks.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  {q ? `Nothing matches “${q}”.` : tickedOnly ? 'Nothing ticked yet.' : `No ${v.classes} on the timetable yet.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {addClass && (
          <NewClassForm
            state={state}
            activity={only}
            onAdd={(spec, days) => {
              addClass(spec, days);
              if (only && only !== spec.activity) setOnly('');
            }}
          />
        )}
      </div>
    </>
  );
}

// Tick-list of every class on the timetable, grouped across days. Filter by activity, bulk-add kids/adults,
// tick a row for every day it runs or tap single days. `picked` holds `${slot_id}:${class_id}` keys.
export function ClassPicker({ state, groups, picked, setPicked, addClass, removeDraft }) {
  const v = useVocab();
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const activities = [...new Set(groups.map((g) => g.cls.activity))];
  const [only, setOnly] = useState(''); // activity shown in the list ('' = all)
  const [q, setQ] = useState('');
  const k = keyOf;
  const toggle = (items, on) =>
    setPicked((cur) => {
      const next = new Set(cur);
      for (const it of items) on ? next.add(k(it)) : next.delete(k(it));
      return next;
    });
  const pickWhere = (test) =>
    toggle(
      groups.filter(test).flatMap((g) => g.items),
      true,
    );
  const visible = groups.filter((g) => (!only || g.cls.activity === only) && matches(g, q));
  const count = picked.size;
  const pickedActivities = new Set(groups.filter((g) => g.items.some((it) => picked.has(k(it)))).map((g) => g.cls.activity));
  const hasKids = groups.some(isKids); // the kids/adults shortcuts only show when some times are labelled for kids

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <SearchBox value={q} onChange={setQ} />
        <Chip on={!only} onClick={() => setOnly('')}>
          All
        </Chip>
        {activities.map((a) => (
          <Chip key={a} on={only === a} onClick={() => setOnly(only === a ? '' : a)} dot={colorOf(a)} marked={pickedActivities.has(a)}>
            {a}
          </Chip>
        ))}
        <span className="mx-1 h-4 w-px bg-border" />
        {hasKids && (
          <>
            <Button size="xs" variant="ghost" onClick={() => pickWhere((g) => isKids(g) && (!only || g.cls.activity === only))}>
              {only ? `+ All kids ${only}` : `+ Every kids ${v.class}`}
            </Button>
            <Button size="xs" variant="ghost" onClick={() => pickWhere((g) => isAdults(g) && (!only || g.cls.activity === only))}>
              {only ? `+ All adult ${only}` : `+ Every adult ${v.class}`}
            </Button>
          </>
        )}
        {count > 0 && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setPicked(new Set())}>
            Clear
          </Button>
        )}
      </div>

      <div className="mt-3 max-h-[60vh] divide-y overflow-auto rounded-lg border">
        {visible.map((g) => {
          const on = g.items.filter((it) => picked.has(k(it))).length;
          const all = on === g.items.length;
          return (
            <div key={g.key} className={cn('flex items-center gap-2.5 px-3 py-1', on && 'bg-accent/40')}>
              <button
                onClick={() => toggle(g.items, !all)}
                className={cn(
                  'grid size-5 shrink-0 place-items-center rounded border transition-colors',
                  all ? 'border-primary bg-primary text-primary-foreground' : on ? 'border-primary/70' : 'border-input hover:border-foreground/40',
                )}
                aria-label={all ? 'Remove all days' : 'Add all days'}
              >
                {all ? <Check className="size-3.5" /> : on ? <span className="h-0.5 w-2 rounded bg-primary" /> : null}
              </button>
              <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: colorOf(g.cls.activity) }} />
              <button className="min-w-0 flex-1 truncate text-left text-sm" onClick={() => toggle(g.items, !all)}>
                <span className="font-medium">{g.cls.activity}</span>
                {g.slot.label && <span className="text-muted-foreground"> · {g.slot.label}</span>}
                <span className="text-xs text-muted-foreground">
                  {'  '}
                  {clockRange(g.slot.start_time, g.slot.end_time)} · {g.cls.coach}
                </span>
                {g.isNew && <NewBadge />}
              </button>
              <div className="flex shrink-0 gap-1">
                {g.items.map((it) => (
                  <button
                    key={it.slot_id}
                    onClick={() => toggle([it], !picked.has(k(it)))}
                    className={cn(
                      'w-9 rounded border py-0.5 text-[11px] transition-colors',
                      picked.has(k(it)) ? 'border-primary/70 bg-primary/15 text-foreground' : 'text-muted-foreground hover:border-foreground/30',
                    )}
                  >
                    {DAY_SHORT[it.day]}
                  </button>
                ))}
              </div>
              {g.isNew && <RemoveDraft onClick={() => removeDraft(g.key)} />}
            </div>
          );
        })}
        {visible.length === 0 && (q || !addClass) && (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{q ? `Nothing matches “${q}”.` : `No ${v.classes} on the timetable yet.`}</p>
        )}
        {addClass && (
          <NewClassForm
            state={state}
            activity={only}
            onAdd={(spec, days) => {
              addClass(spec, days);
              if (only && only !== spec.activity) setOnly('');
            }}
          />
        )}
      </div>
    </>
  );
}

const NewBadge = () => <span className="ml-1.5 rounded bg-primary/15 px-1.5 py-0.5 align-middle text-[10px] font-medium text-primary">New</span>;
const RemoveDraft = ({ onClick }) => {
  const v = useVocab();
  return (
    <Button size="icon-xs" variant="ghost" className="shrink-0 text-muted-foreground" aria-label={`Remove new ${v.class}`} onClick={onClick}>
      <X />
    </Button>
  );
};

// "+ Add a new class" at the bottom of the class list: what, who runs it, for whom, which days, what time, which room.
function NewClassForm({ state, activity: preset, onAdd }) {
  const v = useVocab();
  const [open, setOpen] = useState(false);
  const blank = () => ({
    activity: preset || '',
    coach: '',
    label: '',
    start_time: '17:00',
    end_time: '18:00',
    area_id: '',
  });
  const [f, setF] = useState(blank);
  const [days, setDays] = useState([]);
  const [perDay, setPerDay] = useState(null); // { [day]: { start_time, end_time } } when days have different times
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const timeOf = (d) => perDay?.[d] ?? { start_time: f.start_time, end_time: f.end_time };

  const activities = state.activities.map((a) => a.name);
  // Coaches who already teach this activity come first.
  const teaches = state.classes.filter((c) => c.activity.toLowerCase() === f.activity.trim().toLowerCase()).map((c) => c.coach);
  const coaches = [...new Set([...teaches, ...state.coaches.map((c) => c.name)])];
  const labels = [...new Set(state.slots.map((s) => s.label).filter(Boolean))].sort();
  const timesOk = days.every((d) => timeOf(d).start_time < timeOf(d).end_time);
  const ok = f.activity.trim() && f.coach.trim() && days.length && timesOk;

  if (!open) {
    return (
      <button
        onClick={() => {
          setF(blank());
          setDays([]);
          setPerDay(null);
          setOpen(true);
        }}
        className="flex w-full items-center gap-2 border-t border-dashed px-3 py-2.5 text-left text-sm text-muted-foreground hover:bg-accent/40 hover:text-foreground"
      >
        <Plus className="size-4" /> Add a new {v.class}
        <span className="text-xs">— not on the timetable yet</span>
      </button>
    );
  }

  return (
    <div className="space-y-3 border-t bg-accent/20 px-3 py-3">
      <div className="grid grid-cols-3 gap-2">
        <Labeled text="What">
          <Input
            autoFocus
            list="nc-activities"
            placeholder={`e.g. ${v.example.activity}`}
            value={f.activity}
            onChange={(e) => {
              const activity = e.target.value;
              const first = state.classes.find((c) => c.activity.toLowerCase() === activity.trim().toLowerCase());
              set({ activity, coach: f.coach || first?.coach || '' });
            }}
          />
          <datalist id="nc-activities">
            {activities.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </Labeled>
        <Labeled text={v.Coach}>
          <Input list="nc-coaches" placeholder="Who runs it" value={f.coach} onChange={(e) => set({ coach: e.target.value })} />
          <datalist id="nc-coaches">
            {coaches.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Labeled>
        <Labeled text="For">
          <Input list="nc-labels" placeholder={`e.g. ${v.example.label} (optional)`} value={f.label} onChange={(e) => set({ label: e.target.value })} />
          <datalist id="nc-labels">
            {labels.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </Labeled>
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Labeled text="Days">
          <div className="flex gap-1">
            {DAY_ORDER.map((d) => (
              <button
                key={d}
                onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}
                className={cn(
                  'h-8 w-10 rounded-md border text-xs transition-colors',
                  days.includes(d) ? 'border-primary/70 bg-primary/15 text-foreground' : 'text-muted-foreground hover:border-foreground/30',
                )}
              >
                {DAY_SHORT[d]}
              </button>
            ))}
          </div>
        </Labeled>
        {!perDay && (
          <Labeled text="Time">
            <div className="flex items-center gap-1.5">
              <TimeRange value={f} onChange={(t) => set(t)} />
            </div>
          </Labeled>
        )}
        <Labeled text="Room">
          <Select value={String(f.area_id || 'any')} onValueChange={(val) => set({ area_id: val === 'any' ? '' : Number(val) })}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any free room</SelectItem>
              {state.areas.map((a) => (
                <SelectItem key={a.id} value={String(a.id)}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Labeled>
      </div>

      {perDay ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            Time for each day
            <button className="underline underline-offset-2 hover:text-foreground" onClick={() => setPerDay(null)}>
              Same time every day
            </button>
          </div>
          {!days.length && <p className="text-xs text-muted-foreground">Pick the days first.</p>}
          {DAY_ORDER.filter((d) => days.includes(d)).map((d) => (
            <div key={d} className="flex items-center gap-2">
              <span className="w-10 text-sm">{DAY_SHORT[d]}</span>
              <TimeRange value={timeOf(d)} onChange={(t) => setPerDay((p) => ({ ...p, [d]: t }))} />
            </div>
          ))}
        </div>
      ) : (
        <button
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          onClick={() => setPerDay(Object.fromEntries(DAY_ORDER.map((d) => [d, { start_time: f.start_time, end_time: f.end_time }])))}
        >
          Different time on some days?
        </button>
      )}

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!ok}
          onClick={() => {
            // One class per distinct time: e.g. Sun/Tue 5 PM and Mon 7 PM become two rows.
            const byTime = new Map();
            for (const d of days) {
              const t = timeOf(d);
              const k = `${t.start_time}-${t.end_time}`;
              if (!byTime.has(k)) byTime.set(k, { ...t, days: [] });
              byTime.get(k).days.push(d);
            }
            for (const t of byTime.values()) {
              onAdd(
                {
                  ...f,
                  start_time: t.start_time,
                  end_time: t.end_time,
                  activity: f.activity.trim(),
                  coach: f.coach.trim(),
                  label: f.label.trim(),
                },
                t.days,
              );
            }
            setOpen(false);
          }}
        >
          <Plus /> Add {v.class}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <span className="text-xs text-muted-foreground">
          {!f.activity.trim()
            ? `Type or pick ${v.a('activity')}.`
            : !f.coach.trim()
              ? 'Who runs it?'
              : !days.length
                ? 'Pick the days.'
                : !timesOk
                  ? 'The end must be after the start.'
                  : `Saved with the ${v.package}.`}
        </span>
      </div>
    </div>
  );
}

function Labeled({ text, children }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted-foreground">{text}</span>
      {children}
    </label>
  );
}

function Step({ n, title, hint, children }) {
  return (
    <section>
      <div className="mb-2.5 flex items-baseline gap-2.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-semibold">{n}</span>
        <h3 className="font-heading text-sm font-semibold">{title}</h3>
        {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
      </div>
      <div className="pl-7.5">{children}</div>
    </section>
  );
}

function Chip({ on, onClick, dot, marked, children }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors',
        on ? 'border-foreground/40 bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {dot && <span className="size-2 rounded-full" style={{ background: dot }} />}
      {children}
      {marked && <Check className="size-3 text-primary" />}
    </button>
  );
}

// Add or remove classes from an existing package — every week of its cycle.
export function EditClassesDialog({ state, pkg, week = 1, onClose, mutate }) {
  const v = useVocab();
  const [weeks, setWeeks] = useState(() => weeksOf(state, pkg));
  const { groups, addClass, removeDraft } = useDrafts(state, setWeeks, pkg.id);
  const [saving, setSaving] = useState(false);
  const perWeek = Math.max(...weeks.map((w) => w.size));
  const save = async () => {
    setSaving(true);
    try {
      await mutate((api) => api.setPackageClasses(pkg.id, weeksToSessions(groups, weeks)));
      onClose();
    } catch {
      // shown as a toast
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>{v.Classes} in {pkg.name}</DialogTitle>
          {pkg.cycle_length > 1 && (
            <p className="text-sm text-muted-foreground">
              Starts again every {pkg.cycle_length} weeks — this is week {week} now (highlighted). Change the number of weeks on the {v.package} page.
            </p>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <WeekPlanner
            state={state}
            groups={groups}
            weeks={weeks}
            setWeeks={setWeeks}
            currentWeek={pkg.cycle_length > 1 ? week : undefined}
            addClass={addClass}
            removeDraft={removeDraft}
          />
        </div>
        <DialogFooter className="items-center border-t px-6 py-4">
          <span className="mr-auto text-xs text-muted-foreground">{classesAWeek(perWeek, pkg.cycle_length > 1, v)}</span>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={saving} onClick={save}>
            Save {v.classes}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
