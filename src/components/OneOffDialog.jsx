import { useMemo, useState } from 'react';
import { CircleCheck, Plus, Search, Trash2, TriangleAlert, X } from 'lucide-react';
import { fmtDate, fmtTime, todayStr } from '../lib/dates.js';
import { checkConflicts, describeConflict, oneOffMembers, summarizeConflicts } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ConfirmDialog from './ConfirmDialog.jsx';
import { TimeRange } from './TimeInput.jsx';
import { useVocab } from './VocabContext.jsx';

// A class that happens once, on one date (a private lesson, a trial…), with the members booked into it.
// `init` is either { oneOff } to edit one, or { date, areaId, start } from a click on the calendar.
export default function OneOffDialog({ state, init, mutate, onClose }) {
  const v = useVocab();
  const editing = init.oneOff ?? null;
  const today = todayStr();
  const classOf = (id) => state.classes.find((c) => c.id === id);
  const startGuess = init.start ?? 17 * 60;

  const [f, setF] = useState(() =>
    editing
      ? {
          date: editing.date,
          area_id: editing.area_id,
          start_time: editing.start_time,
          end_time: editing.end_time,
          activity: classOf(editing.class_id)?.activity ?? '',
          coach: classOf(editing.class_id)?.coach ?? '',
          label: editing.label ?? '',
          note: editing.note ?? '',
        }
      : {
          date: init.date ?? today,
          area_id: init.areaId ?? state.areas[0]?.id,
          start_time: fmtTime(startGuess),
          end_time: fmtTime(Math.min(init.end ?? startGuess + 60, 23 * 60 + 59)),
          activity: '',
          coach: '',
          label: '',
          note: '',
        },
  );
  const set = (patch) => setF((cur) => ({ ...cur, ...patch }));
  const [memberIds, setMemberIds] = useState(() => (editing ? oneOffMembers(state, editing.id).map((m) => m.id) : []));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Suggestions: existing activities, and coaches who already teach the chosen activity first.
  const activity = f.activity.trim();
  const coach = f.coach.trim();
  const teaches = state.classes.filter((c) => c.activity.toLowerCase() === activity.toLowerCase()).map((c) => c.coach);
  const coaches = [...new Set([...teaches, ...state.coaches.map((c) => c.name)])];
  const existing = state.classes.find((c) => c.activity.toLowerCase() === activity.toLowerCase() && c.coach.toLowerCase() === coach.toLowerCase());

  // Clash check against everything on that date, the same rule as weekly classes.
  const ready = f.date && f.area_id && activity && coach && f.start_time < f.end_time;
  const clashes = useMemo(() => {
    if (!ready) return [];
    const draftClass = existing ?? { id: -2, activity, coach };
    const draft = {
      ...state,
      classes: existing ? state.classes : [...state.classes, draftClass],
      oneOffs: [
        ...(state.oneOffs || []).filter((o) => o.id !== editing?.id),
        { id: -1, date: f.date, area_id: Number(f.area_id), class_id: draftClass.id, start_time: f.start_time, end_time: f.end_time, label: f.label },
      ],
    };
    return summarizeConflicts(checkConflicts(draft, f.date, (s) => s.oneOff?.id === -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, ready, JSON.stringify(f)]);

  const save = async () => {
    setSaving(true);
    try {
      const body = { ...f, area_id: Number(f.area_id), activity, coach, member_ids: memberIds };
      await mutate((api) => (editing ? api.update('oneoffs', editing.id, body) : api.create('oneoffs', body)));
      onClose();
    } catch {
      // shown as a toast
    } finally {
      setSaving(false);
    }
  };

  const status = !f.date
    ? 'Pick a date.'
    : !activity
      ? `What is the ${v.class}?`
      : !coach
        ? 'Who runs it?'
        : f.start_time >= f.end_time
          ? 'The end must be after the start.'
          : clashes.length
            ? `Clashes with another ${v.class} — change the time or room.`
            : '';

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? v.OneOff : `Add a ${v.oneOff}`}</DialogTitle>
          <DialogDescription>Happens once, on this date only. Add the {v.members} who are coming.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Labeled text="Date">
              <Input type="date" value={f.date} onChange={(e) => set({ date: e.target.value })} />
              {f.date && <span className="text-xs text-muted-foreground">{fmtDate(f.date)}</span>}
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
            <Labeled text="What">
              <Input
                list="oo-activities"
                placeholder={`e.g. ${v.example.activity}`}
                value={f.activity}
                onChange={(e) => {
                  const a = e.target.value;
                  const first = state.classes.find((c) => c.activity.toLowerCase() === a.trim().toLowerCase());
                  set({ activity: a, coach: f.coach || first?.coach || '' });
                }}
              />
              <datalist id="oo-activities">
                {state.activities.map((a) => (
                  <option key={a.id} value={a.name} />
                ))}
              </datalist>
            </Labeled>
            <Labeled text={v.Coach}>
              <Input list="oo-coaches" placeholder="Who runs it" value={f.coach} onChange={(e) => set({ coach: e.target.value })} />
              <datalist id="oo-coaches">
                {coaches.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Labeled>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Labeled text="Name it (optional)">
              <Input placeholder={`e.g. ${v.example.oneOff}`} value={f.label} onChange={(e) => set({ label: e.target.value })} />
            </Labeled>
            <Labeled text="Note (optional)">
              <Input placeholder="Anything to remember" value={f.note} onChange={(e) => set({ note: e.target.value })} />
            </Labeled>
          </div>

          <MemberPicker state={state} ids={memberIds} setIds={setMemberIds} mutate={mutate} />

          {ready &&
            (clashes.length ? (
              <div className="space-y-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                {clashes.map((c, i) => (
                  <div key={i} className="flex items-start gap-1.5">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    {describeConflict(c, false, v)}
                  </div>
                ))}
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CircleCheck className="size-3.5" /> The room and {v.coach} are free then.
              </p>
            ))}
        </div>

        <DialogFooter className="items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {editing && (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 /> Cancel this {v.class}
              </Button>
            )}
            {status && <span className="text-xs text-muted-foreground">{status}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
            <Button disabled={!ready || clashes.length > 0 || saving} onClick={save}>
              {editing ? 'Save' : `Add ${v.class}`}
            </Button>
          </div>
        </DialogFooter>

        <ConfirmDialog
          open={confirmDelete}
          title={`Cancel this ${v.oneOff}?`}
          description={`It's removed from the calendar and from the ${v.members}' lists.`}
          confirmLabel="Yes, cancel it"
          destructive
          onCancel={() => setConfirmDelete(false)}
          onConfirm={async () => {
            await mutate((api) => api.remove('oneoffs', editing.id));
            onClose();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

// Search members and add them; type a new name to add someone who isn't a member yet.
function MemberPicker({ state, ids, setIds, mutate }) {
  const v = useVocab();
  const [q, setQ] = useState('');
  const chosen = ids.map((id) => state.members.find((m) => m.id === id)).filter(Boolean);
  const term = q.trim().toLowerCase();
  const results = term ? state.members.filter((m) => !ids.includes(m.id) && m.name.toLowerCase().includes(term)).slice(0, 6) : [];
  const exact = state.members.some((m) => m.name.toLowerCase() === term);
  const add = (id) => {
    setIds((cur) => [...new Set([...cur, id])]);
    setQ('');
  };
  const addNew = async () => {
    const r = await mutate((api) => api.create('members', { name: q.trim() }));
    if (r?.id) add(r.id);
  };

  return (
    <Labeled text={v.Members}>
      {chosen.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {chosen.map((m) => (
            <span key={m.id} className="flex items-center gap-1 rounded-full border bg-accent/50 py-0.5 pr-1 pl-2.5 text-xs">
              {m.name}
              <button
                className="rounded-full p-0.5 text-muted-foreground hover:text-foreground"
                aria-label={`Remove ${m.name}`}
                onClick={() => setIds(ids.filter((x) => x !== m.id))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder={`Search ${v.members} to add`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) add(results[0].id);
          }}
        />
      </div>
      {term && (
        <div className="mt-1 overflow-hidden rounded-lg border">
          {results.map((m) => (
            <button key={m.id} className="block w-full px-3 py-1.5 text-left text-sm hover:bg-accent" onClick={() => add(m.id)}>
              {m.name}
            </button>
          ))}
          {!exact && (
            <button
              className={cn(
                'flex w-full items-center gap-1.5 px-3 py-1.5 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground',
                results.length && 'border-t',
              )}
              onClick={addNew}
            >
              <Plus className="size-3.5" /> Add “{q.trim()}” as a new {v.member}
            </button>
          )}
        </div>
      )}
    </Labeled>
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
