import { useMemo, useState } from 'react';
import { CalendarClock, CircleCheck, Layers, MapPin, RotateCcw, TriangleAlert, Users } from 'lucide-react';
import { clockRange, fmtDate } from '../lib/dates.js';
import { activityColors, describeConflict, resolveDate, scanConflicts, summarizeConflicts } from '../lib/schedule.js';
import { originOf, saveDayChange } from '../lib/dayChange.js';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmDialog from './ConfirmDialog.jsx';
import { TimeRange } from './TimeInput.jsx';
import { useVocab } from './VocabContext.jsx';

// A weekly class on one date, opened from the Schedule. Everything here changes that date only —
// cancel it, move it, or have someone else teach it. The package stays as it is; changing the class
// every week is done from the package.
export default function DayClassDialog({ state, session: s, mutate, onClose, onOpenPackage }) {
  const v = useVocab();
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const o = originOf(s);
  const [f, setF] = useState({
    date: s.date,
    area_id: s.slot.area_id,
    start_time: s.slot.start_time,
    end_time: s.slot.end_time,
    coach: s.cls.coach,
    note: s.change?.note ?? '',
  });
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [saving, setSaving] = useState(false);

  // Every package booking this class at this time (they share it).
  const pkgs = useMemo(
    () =>
      resolveDate(state, o.date)
        .filter((x) => x.pkg && x.slot.id === o.slot.id && x.cls.id === o.cls.id)
        .map((x) => x.pkg),
    [state, o.date, o.slot.id, o.cls.id],
  );
  const members = new Set(state.packageMembers.filter((pm) => pkgs.some((p) => p.id === pm.package_id)).map((pm) => pm.member_id)).size;

  const coach = f.coach.trim();
  const teaches = state.classes.filter((c) => c.activity === s.cls.activity).map((c) => c.coach);
  const coaches = [...new Set([...teaches, ...state.coaches.map((c) => c.name)])];
  const newClass = state.classes.find((c) => c.activity === s.cls.activity && c.coach.toLowerCase() === coach.toLowerCase());

  const patch = {
    new_date: f.date,
    area_id: Number(f.area_id),
    start_time: f.start_time,
    end_time: f.end_time,
    note: f.note,
    ...(newClass ? { new_class_id: newClass.id } : { new_class_id: null, activity: s.cls.activity, coach }),
  };
  const edited =
    f.date !== s.date ||
    Number(f.area_id) !== s.slot.area_id ||
    f.start_time !== s.slot.start_time ||
    f.end_time !== s.slot.end_time ||
    coach.toLowerCase() !== s.cls.coach.toLowerCase() ||
    f.note !== (s.change?.note ?? '');
  const ready = f.date && coach && f.start_time < f.end_time;

  // Clash check for the new date/time/room/coach against everything else that day.
  const clashes = useMemo(() => {
    if (!edited || !ready || s.cancelled) return [];
    const cur = s.change || {};
    const draftClass = newClass ?? { id: -2, activity: s.cls.activity, coach };
    const draft = {
      ...state,
      classes: newClass ? state.classes : [...state.classes, draftClass],
      changes: [
        ...(state.changes || []).filter((c) => c.id !== cur.id),
        {
          ...cur,
          id: -1,
          date: o.date,
          slot_id: o.slot.id,
          class_id: o.cls.id,
          new_date: f.date,
          area_id: Number(f.area_id),
          start_time: f.start_time,
          end_time: f.end_time,
          new_class_id: draftClass.id,
        },
      ],
    };
    // Packages sharing a class each report the same clash: show it once.
    const seen = new Set();
    return summarizeConflicts(scanConflicts(draft, f.date, 1, (x) => x.change?.id === -1)).filter((c) => {
      const [what, pair] = describeConflict(c, false, v).replace(/,[^,)]*W\d+\)/g, ')').split(': ');
      const key = `${what}:${pair.split(' & ').sort().join(' & ')}`;
      return !seen.has(key) && seen.add(key);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, edited, ready, JSON.stringify(f), v]);

  const run = async (fn) => {
    setSaving(true);
    try {
      await fn();
      onClose();
    } catch {
      // shown as a toast
    } finally {
      setSaving(false);
    }
  };

  const original = `${fmtDate(o.date)} · ${clockRange(o.slot.start_time, o.slot.end_time)} · ${state.areas.find((a) => a.id === o.slot.area_id)?.name} · ${o.cls.coach}`;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: colorOf(s.cls.activity) }} />
            <span className={s.cancelled ? 'line-through decoration-2' : undefined}>{s.cls.activity}</span>
            {s.cancelled && <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-xs font-medium text-primary">Cancelled</span>}
            {!s.cancelled && s.change && (
              <span className="rounded-md bg-amber-400/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">Changed for this day</span>
            )}
          </DialogTitle>
          <DialogDescription>Changes here are for {fmtDate(s.date)} only. To change it every week, open the {v.package}.</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <Row icon={CalendarClock}>
            {fmtDate(s.date)} · {clockRange(s.slot.start_time, s.slot.end_time)}
          </Row>
          <Row icon={MapPin}>
            {s.area?.name}
            {s.slot.label && <span className="text-muted-foreground"> · {s.slot.label}</span>}
          </Row>
          <Row icon={Layers}>{pkgs.map((p) => p.name).join(', ') || '—'}</Row>
          <Row icon={Users}>
            {v.n(members, 'member')}
          </Row>
          {s.change && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <RotateCcw className="size-3.5" /> Normally: {original}
            </p>
          )}
        </div>

        {!s.cancelled && (
          <div className="space-y-3 rounded-lg border p-3">
            <div className="text-xs font-medium text-muted-foreground">Change it for this day</div>
            <div className="grid grid-cols-2 gap-3">
              <Labeled text="Date">
                <Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
              </Labeled>
              <Labeled text="Room">
                <Select value={String(f.area_id)} onValueChange={(id) => set({ area_id: Number(id) })}>
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
              </Labeled>
            </div>
            <Labeled text="Time">
              <div className="flex flex-wrap items-center gap-1.5">
                <TimeRange value={f} onChange={(t) => set(t)} />
              </div>
            </Labeled>
            <div className="grid grid-cols-2 gap-3">
              <Labeled text={v.Coach}>
                <Input list="day-coaches" value={f.coach} onChange={(e) => set({ coach: e.target.value })} />
                <datalist id="day-coaches">
                  {coaches.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Labeled>
              <Labeled text="Note (optional)">
                <Input placeholder={`e.g. ${v.Coach} away`} value={f.note} onChange={(e) => set({ note: e.target.value })} />
              </Labeled>
            </div>
            {edited &&
              ready &&
              (clashes.length ? (
                <div className="space-y-1 rounded-lg border border-primary/40 bg-primary/5 p-2.5 text-xs text-primary">
                  {clashes.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <TriangleAlert className="mt-px size-3.5 shrink-0" />
                      {describeConflict(c, false, v).replace(/,[^,)]*W\d+\)/g, ')')}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CircleCheck className="size-3.5" /> The room and {v.coach} are free then.
                </p>
              ))}
          </div>
        )}

        <DialogFooter className="sm:flex-wrap sm:justify-between">
          <div className="flex gap-2">
            {s.cancelled ? (
              <Button variant="outline" disabled={saving} onClick={() => run(() => saveDayChange(mutate, s, { cancelled: false }))}>
                Bring it back
              </Button>
            ) : (
              <Button variant="destructive" disabled={saving} onClick={() => setConfirmCancel(true)}>
                Cancel this day
              </Button>
            )}
            {s.change && !s.cancelled && (
              <Button variant="ghost" disabled={saving} onClick={() => run(() => mutate((api) => api.remove('changes', s.change.id)))}>
                <RotateCcw /> Undo changes
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {pkgs[0] && (
              <Button variant="outline" onClick={() => onOpenPackage(pkgs[0].id)}>
                Open {v.package}
              </Button>
            )}
            {!s.cancelled && (
              <Button disabled={!edited || !ready || clashes.length > 0 || saving} onClick={() => run(() => saveDayChange(mutate, s, patch))}>
                Save for this day
              </Button>
            )}
          </div>
        </DialogFooter>

        <ConfirmDialog
          open={confirmCancel}
          title={`Cancel ${s.cls.activity} on ${fmtDate(s.date)}?`}
          description="Only this day is cancelled. It stays on the calendar crossed out, and you can bring it back. Other weeks aren't affected."
          confirmLabel="Yes, cancel this day"
          destructive
          onCancel={() => setConfirmCancel(false)}
          onConfirm={() => run(() => saveDayChange(mutate, s, { cancelled: true }))}
        />
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span>{children}</span>
    </div>
  );
}

function Labeled({ text, children }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground">{text}</span>
      {children}
    </div>
  );
}
