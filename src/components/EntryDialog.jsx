import { useMemo, useState } from 'react';
import { Check, CircleCheck, Info, Plus, TriangleAlert } from 'lucide-react';
import { cn } from '@/lib/utils';
import TimeInput from './TimeInput.jsx';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { DAYS, addDays, clockRange, fmtShort, fmtTime, maxDate, toMin, todayStr, weekStart } from '../lib/dates.js';
import { activityColors, cyclePosition, describeConflict, indexState, packageStatus, checkConflicts, summarizeConflicts } from '../lib/schedule.js';
import { useVocab } from './VocabContext.jsx';

const NEW = 'new';

// Create flow: click a day/time in an area → pick or create the slot → assign the class
// → choose the package and week position(s). Conflicts are previewed before saving.
export default function EntryDialog({ state, init, mutate, onClose }) {
  const v = useVocab();
  const idx = useMemo(() => indexState(state), [state]);
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const today = todayStr();
  const initSlot = init.slotId ? idx.slots.get(init.slotId) : null;

  const [areaId, setAreaId] = useState(initSlot?.area_id ?? init.areaId ?? state.areas[0]?.id);
  const [day, setDay] = useState(initSlot?.day ?? init.day ?? 0);
  const refDate = addDays(weekStart(init.date ?? today), day);

  const laneSlots = state.slots.filter((s) => s.area_id === areaId && s.day === day).sort((a, b) => a.start_time.localeCompare(b.start_time));

  const [slotChoice, setSlotChoice] = useState(() => {
    if (initSlot) return initSlot.id;
    // A dragged range picks the slot with exactly that time, else a new one; a click picks the slot under it.
    const hit =
      init.start != null &&
      (init.end != null
        ? laneSlots.find((s) => toMin(s.start_time) === init.start && toMin(s.end_time) === init.end)
        : laneSlots.find((s) => toMin(s.start_time) <= init.start && init.start < toMin(s.end_time)));
    return hit ? hit.id : NEW;
  });
  const startGuess = init.start ?? 7 * 60;
  const [newSlot, setNewSlot] = useState({
    start_time: fmtTime(startGuess),
    end_time: fmtTime(Math.min(init.end ?? startGuess + 60, 23 * 60 + 59)),
    label: '',
    buffer_minutes: 0,
  });

  const [classChoice, setClassChoice] = useState(init.classId ?? state.classes[0]?.id ?? NEW);
  const [newClass, setNewClass] = useState({ activity_id: '', coach_id: '' });

  const [pkgChoice, setPkgChoice] = useState(() => {
    if (init.packageId) return init.packageId;
    const live = state.packages.filter((p) => packageStatus(p, refDate) !== 'ended');
    const usingSlot = initSlot && live.find((p) => state.entries.some((e) => e.package_id === p.id && e.slot_id === initSlot.id));
    return (usingSlot || live[0])?.id ?? NEW;
  });
  const [newPkg, setNewPkg] = useState({ name: '', anchor_date: weekStart(refDate), cycle_length: 1 });
  const [positions, setPositions] = useState(init.positions ?? null); // null = "the week I clicked"

  const changeLane = (nextArea, nextDay) => {
    setAreaId(nextArea);
    setDay(nextDay);
    const first = state.slots.find((s) => s.area_id === nextArea && s.day === nextDay);
    setSlotChoice(first ? first.id : NEW);
  };

  // Draft objects (negative ids for things that don't exist yet).
  const slot =
    slotChoice === NEW
      ? { id: -1, area_id: areaId, day, ...newSlot, buffer_minutes: Number(newSlot.buffer_minutes) || 0, active: 1 }
      : idx.slots.get(slotChoice);
  const cls =
    classChoice === NEW
      ? // Picking a combo that already exists just reuses that class.
        (state.classes.find((c) => c.activity_id === Number(newClass.activity_id) && c.coach_ids?.length === 1 && c.coach_id === Number(newClass.coach_id)) ?? {
          id: -2,
          activity: state.activities.find((a) => a.id === Number(newClass.activity_id))?.name ?? `New ${v.class}`,
          coach: state.coaches.find((c) => c.id === Number(newClass.coach_id))?.name ?? `(no ${v.coach})`,
        })
      : idx.classes.get(classChoice);
  const pkg =
    pkgChoice === NEW
      ? {
          id: -3,
          name: newPkg.name || `New ${v.package}`,
          anchor_date: newPkg.anchor_date,
          end_date: null,
          cycle_length: Math.max(1, Number(newPkg.cycle_length) || 1),
        }
      : idx.packages.get(pkgChoice);

  const posAtRef = pkg && pkg.anchor_date ? cyclePosition(pkg, refDate) : null;
  const chosen = (positions ?? [posAtRef ?? 1]).filter((p) => pkg && p <= pkg.cycle_length);

  const existingByWeek = useMemo(() => {
    const m = new Map();
    if (!pkg || !slot) return m;
    for (const e of state.entries) if (e.package_id === pkg.id && e.slot_id === slot.id) m.set(e.week_position, e);
    return m;
  }, [state.entries, pkg, slot]);

  const errors = [];
  if (slotChoice === NEW && toMin(newSlot.end_time) <= toMin(newSlot.start_time)) errors.push('Slot end must be after start');
  if (classChoice === NEW && (!newClass.activity_id || !newClass.coach_id)) errors.push(`Pick ${v.a('activity')} and ${v.a('coach')}`);
  if (pkgChoice === NEW && (!newPkg.name.trim() || !newPkg.anchor_date)) errors.push(`New ${v.package} needs a name and an anchor date`);
  if (!chosen.length) errors.push('Pick at least one week');

  // State as it would be after saving with class `c` (new entries get negative ids).
  const makeDraft = (c) => ({
    ...state,
    slots: slot.id < 0 ? [...state.slots, slot] : state.slots,
    classes: c.id < 0 ? [...state.classes, c] : state.classes,
    packages: pkg.id < 0 ? [...state.packages, pkg] : state.packages,
    entries: [
      ...state.entries.filter((e) => !(e.package_id === pkg.id && e.slot_id === slot.id && chosen.includes(e.week_position))),
      ...chosen.map((p, i) => ({ id: -(10 + i), package_id: pkg.id, slot_id: slot.id, class_id: c.id, week_position: p })),
    ],
  });
  const ready = slot && pkg && pkg.anchor_date && chosen.length > 0 && !(slotChoice === NEW && toMin(newSlot.end_time) <= toMin(newSlot.start_time));
  const isDraft = (s) => s.entry.id < 0;

  // Which existing classes would clash here — they're disabled in the picker.
  const clashingClasses = useMemo(() => {
    const out = new Set();
    if (!ready) return out;
    for (const c of state.classes) if (checkConflicts(makeDraft(c), today, isDraft).length) out.add(c.id);
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready, slot, pkg, chosen.join(',')]);

  const { conflicts, nextDates } = useMemo(() => {
    if (!ready || !cls || errors.length) return { conflicts: [], nextDates: {} };
    const found = summarizeConflicts(checkConflicts(makeDraft(cls), today, isDraft));

    // Next few real dates each selected week lands on.
    const next = {};
    const ws = weekStart(maxDate(today, pkg.anchor_date));
    for (let w = 0; w < 104; w++) {
      const date = addDays(ws, w * 7 + slot.day);
      const p = cyclePosition(pkg, date);
      if (p && chosen.includes(p) && date >= today) (next[p] ??= []).length < 3 && next[p].push(date);
    }
    return { conflicts: found, nextDates: next };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready, slot, cls, pkg, chosen.join(','), errors.length]);

  const overlapsExisting =
    slotChoice === NEW && laneSlots.filter((s) => toMin(s.start_time) < toMin(newSlot.end_time) && toMin(newSlot.start_time) < toMin(s.end_time));

  const save = async () => {
    await mutate(async (api) => {
      let slotId = slot.id;
      let classId = cls.id;
      let packageId = pkg.id;
      if (slotId < 0) slotId = (await api.create('slots', { area_id: areaId, day, ...newSlot })).id;
      if (classId < 0) classId = (await api.create('classes', { activity_id: Number(newClass.activity_id), coach_id: Number(newClass.coach_id) })).id;
      if (packageId < 0) packageId = (await api.create('packages', { ...newPkg, cycle_length: pkg.cycle_length })).id;
      let last;
      for (const week_position of chosen) {
        last = await api.create('entries', { package_id: packageId, slot_id: slotId, class_id: classId, week_position });
      }
      return last;
    });
    onClose();
  };

  const toggleWeek = (p) => {
    const cur = new Set(chosen);
    cur.has(p) ? cur.delete(p) : cur.add(p);
    setPositions([...cur].sort((a, b) => a - b));
  };

  const weekNums = pkg ? Array.from({ length: pkg.cycle_length }, (_, i) => i + 1) : [];
  const blockedReason = errors[0] ?? (conflicts.length ? 'Resolve the conflict to save' : '');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Schedule {v.a('class')}</DialogTitle>
          <DialogDescription>Repeats every week: pick the time, the {v.class}, then the {v.package} it belongs to.</DialogDescription>
        </DialogHeader>

        <Step n={1} title="Slot" hint="when & where">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Area">
              <Select value={String(areaId)} onValueChange={(val) => changeLane(Number(val), day)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.areas.map((a) => (
                    <SelectItem key={a.id} value={String(a.id)}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Day">
              <Select value={String(day)} onValueChange={(val) => changeLane(areaId, Number(val))}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d, i) => (
                    <SelectItem key={i} value={String(i)}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            spacing={1}
            value={String(slotChoice)}
            onValueChange={(val) => val && setSlotChoice(val === NEW ? NEW : Number(val))}
            className="flex-wrap justify-start"
          >
            {laneSlots.map((s) => (
              <ToggleGroupItem key={s.id} value={String(s.id)} className={TOGGLE_ON}>
                <span className="tabular-nums">{clockRange(s.start_time, s.end_time)}</span>
                {s.label && <span className="text-muted-foreground">{s.label}</span>}
                {!s.active && <Badge variant="destructive">inactive</Badge>}
              </ToggleGroupItem>
            ))}
            <ToggleGroupItem value={NEW} className={TOGGLE_ON}>
              <Plus /> New time
            </ToggleGroupItem>
          </ToggleGroup>
          {slotChoice === NEW && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <Field label="Start">
                <TimeInput value={newSlot.start_time} onChange={(start_time) => setNewSlot({ ...newSlot, start_time })} />
              </Field>
              <Field label="End">
                <TimeInput value={newSlot.end_time} onChange={(end_time) => setNewSlot({ ...newSlot, end_time })} />
              </Field>
              <Field label="Label">
                <Input placeholder="Optional" value={newSlot.label} onChange={(e) => setNewSlot({ ...newSlot, label: e.target.value })} />
              </Field>
              <Field label="Buffer (min)">
                <Input
                  type="number"
                  min="0"
                  value={newSlot.buffer_minutes}
                  onChange={(e) => setNewSlot({ ...newSlot, buffer_minutes: e.target.value })}
                />
              </Field>
            </div>
          )}
          {overlapsExisting?.length > 0 && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <Info className="mt-px size-3.5 shrink-0" />
              Overlaps {overlapsExisting.map((s) => clockRange(s.start_time, s.end_time)).join(', ')}. That's fine for empty slots — conflicts are
              only checked once {v.a('package')} fills them.
            </p>
          )}
        </Step>

        <Step n={2} title={v.Class} hint="what & who">
          <Select value={String(classChoice)} onValueChange={(val) => setClassChoice(val === NEW ? NEW : Number(val))}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.classes.map((c) => (
                <SelectItem key={c.id} value={String(c.id)} disabled={clashingClasses.has(c.id) && c.id !== classChoice}>
                  <span className="size-2 rounded-full" style={{ background: colorOf(c.activity) }} />
                  {c.activity}
                  <span className="text-muted-foreground">{c.coach}</span>
                  {clashingClasses.has(c.id) && <span className="text-xs text-destructive">clashes</span>}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={NEW}>
                <Plus /> New {v.class}…
              </SelectItem>
            </SelectContent>
          </Select>
          {classChoice === NEW && (
            <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <Field label={v.Activity}>
                <Select value={String(newClass.activity_id)} onValueChange={(val) => setNewClass({ ...newClass, activity_id: val })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={`Choose ${v.a('activity')}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {state.activities.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        <span className="size-2 rounded-full" style={{ background: a.color || '#888' }} />
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={v.Coach}>
                <Select value={String(newClass.coach_id)} onValueChange={(val) => setNewClass({ ...newClass, coach_id: val })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={`Choose ${v.a('coach')}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {state.coaches.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <p className="col-span-2 text-xs text-muted-foreground">Manage the lists of {v.activities} and {v.coaches} in Config.</p>
            </div>
          )}
        </Step>

        <Step n={3} title={v.Package} hint="and week of the cycle">
          <Select
            value={String(pkgChoice)}
            onValueChange={(val) => {
              setPkgChoice(val === NEW ? NEW : Number(val));
              setPositions(null);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {state.packages.map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>
                  {p.name}
                  <span className="text-muted-foreground">
                    {p.cycle_length}-week cycle{packageStatus(p, today) !== 'active' ? ` · ${packageStatus(p, today)}` : ''}
                  </span>
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value={NEW}>
                <Plus /> New {v.package}…
              </SelectItem>
            </SelectContent>
          </Select>
          {pkgChoice === NEW && (
            <div className="grid grid-cols-3 gap-3 rounded-lg border bg-muted/30 p-3">
              <Field label="Name">
                <Input value={newPkg.name} onChange={(e) => setNewPkg({ ...newPkg, name: e.target.value })} />
              </Field>
              <Field label="Week 1 starts (Sunday)">
                <Input
                  type="date"
                  value={newPkg.anchor_date}
                  onChange={(e) => {
                    setNewPkg({ ...newPkg, anchor_date: e.target.value && weekStart(e.target.value) });
                    setPositions(null);
                  }}
                />
              </Field>
              <Field label="Cycle (weeks)">
                <Input
                  type="number"
                  min="1"
                  max="52"
                  value={newPkg.cycle_length}
                  onChange={(e) => {
                    setNewPkg({ ...newPkg, cycle_length: e.target.value });
                    setPositions(null);
                  }}
                />
              </Field>
            </div>
          )}
          {pkg && pkg.anchor_date && (
            <p className="text-xs text-muted-foreground">
              {posAtRef ? (
                <>
                  The week of {fmtShort(weekStart(refDate))} is{' '}
                  <span className="text-foreground">
                    week {posAtRef} of {pkg.cycle_length}
                  </span>
                  .
                </>
              ) : (
                <>
                  Not running on {fmtShort(refDate)} —{' '}
                  {packageStatus(pkg, refDate) === 'upcoming' ? `starts ${fmtShort(pkg.anchor_date)}` : `ended ${fmtShort(pkg.end_date)}`}.
                </>
              )}
            </p>
          )}
          {pkg && (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {weekNums.map((p) => {
                const existing = existingByWeek.get(p);
                const exCls = existing && idx.classes.get(existing.class_id);
                const on = chosen.includes(p);
                return (
                  <button
                    key={p}
                    type="button"
                    onClick={() => toggleWeek(p)}
                    className={cn(
                      'flex flex-col items-start gap-1 rounded-lg border p-2.5 text-left text-xs transition-colors hover:bg-muted/50',
                      on && 'border-primary/70 bg-primary/5',
                    )}
                  >
                    <span className="flex w-full items-center justify-between text-sm font-medium">
                      Week {p}
                      {on && <Check className="size-3.5 text-primary" />}
                    </span>
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      {exCls && <span className="size-1.5 rounded-full" style={{ background: colorOf(exCls.activity) }} />}
                      {exCls ? `${exCls.activity} · ${exCls.coach}` : 'Empty'}
                    </span>
                    {on && exCls && exCls.id !== cls?.id && <span className="text-destructive">Will be replaced</span>}
                    {nextDates[p] && <span className="text-muted-foreground/70">{nextDates[p].map(fmtShort).join(', ')}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {pkg && pkg.cycle_length > 1 && (
            <Button variant="link" size="sm" className="h-auto self-start p-0" onClick={() => setPositions(weekNums)}>
              Select all weeks
            </Button>
          )}
        </Step>

        {conflicts.length > 0 ? (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertTitle>
              {conflicts.length} conflict{conflicts.length > 1 ? 's' : ''} — pick another {v.class}, slot or week
            </AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-4">
                {conflicts.map((c, i) => (
                  <li key={i}>
                    {describeConflict(c, false, v)} — {c.dates.length}×, first {fmtShort(c.dates[0])}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : (
          errors.length === 0 && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <CircleCheck className="size-3.5" /> No area or {v.coach} conflicts in any future week.
            </p>
          )
        )}

        <DialogFooter className="items-center">
          {blockedReason && <span className="mr-auto text-xs text-muted-foreground">{blockedReason}</span>}
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={errors.length > 0 || conflicts.length > 0} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const TOGGLE_ON = 'data-[state=on]:border-primary/70 data-[state=on]:bg-primary/5 data-[state=on]:text-foreground';

function Step({ n, title, hint, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <span className="grid size-5 place-items-center rounded-full bg-muted text-[11px] text-muted-foreground">{n}</span>
        {title}
        <span className="font-normal text-muted-foreground">{hint}</span>
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
