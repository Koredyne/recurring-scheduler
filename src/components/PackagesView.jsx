import { useMemo, useState } from 'react';
import { ArrowRightLeft, CalendarDays, Eye, ListChecks, ChevronLeft, ChevronRight, Plus, Trash2, TriangleAlert, Users, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DAYS, addDays, daysBetween, fmtShort, maxDate, todayStr, weekStart } from '../lib/dates.js';
import {
  activityColors,
  checkConflicts,
  conflictsByKey,
  cyclePosition,
  describeConflict,
  findConflicts,
  indexState,
  newConflicts,
  packageStatus,
  resolveDate,
  summarizeConflicts,
} from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfirmDialog from './ConfirmDialog.jsx';
import WeekPicker from './WeekPicker.jsx';
import PackageBuilder, { EditClassesDialog, PackageDialog } from './PackageBuilder.jsx';
import { PackageMembers, PlansEditor, cheapest, money, plansOf } from './Subscriptions.jsx';
import { useVocab } from './VocabContext.jsx';
import PageHeader from './PageHeader.jsx';
import WeekGrid from './WeekGrid.jsx';

// Anchor/end/handover dates are always the Sunday that starts a week (WeekPicker guarantees it).

export function StatusBadge({ status }) {
  return (
    <Badge variant={status === 'active' ? 'secondary' : 'outline'} className={cn('capitalize', status === 'ended' && 'text-muted-foreground')}>
      {status}
    </Badge>
  );
}

export default function PackagesView({ state, mutate, selectedId, setSelectedId, goToDate, onCreate, onOpenSession }) {
  const v = useVocab();
  const today = todayStr();
  const [creating, setCreating] = useState(false);
  const selected = state.packages.find((p) => p.id === selectedId) ?? state.packages[0];
  const slotsById = useMemo(() => new Map(state.slots.map((s) => [s.id, s])), [state.slots]);

  return (
    <>
      <PageHeader title={v.Packages}>
        <span className="text-sm text-muted-foreground">What {v.members} buy: which {v.classes} they can come to, and the price.</span>
        <Button size="sm" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus /> New {v.package}
        </Button>
      </PageHeader>

      <div className="flex min-h-0 flex-1">
        <aside className="w-72 shrink-0 space-y-0.5 overflow-y-auto border-r p-2">
          {state.packages.map((p) => {
            const status = packageStatus(p, today);
            const pos = cyclePosition(p, today);
            const gaps = state.entries.filter((e) => e.package_id === p.id && !slotsById.get(e.slot_id)?.active).length;
            return (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-muted/50',
                  selected?.id === p.id && 'bg-accent hover:bg-accent',
                )}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  <span className="truncate">{p.name}</span>
                  <StatusBadge status={status} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {p.cycle_length > 1 ? `${p.cycle_length}-week cycle` : 'Weekly'} · {fmtShort(p.anchor_date)}
                  {p.end_date ? ` – ${fmtShort(addDays(p.end_date, -1))}` : ' onward'}
                  {pos && p.cycle_length > 1 && ` · week ${pos}`}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="size-3" /> {v.n(state.packageMembers.filter((pm) => pm.package_id === p.id).length, 'member')}
                  {cheapest(plansOf(state, p.id)) != null && <span>· from {money(cheapest(plansOf(state, p.id)), v)}</span>}
                </span>
                {gaps > 0 && <span className="text-xs text-destructive">{gaps} gap{gaps > 1 ? 's' : ''} from inactive slots</span>}
              </button>
            );
          })}
        </aside>

        <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {selected ? (
            <PackageDetail
              key={selected.id}
              pkg={selected}
              state={state}
              mutate={mutate}
              goToDate={goToDate}
              onCreate={onCreate}
              onOpenSession={onOpenSession}
              onDeleted={() => setSelectedId(null)}
            />
          ) : (
            <p className="p-6 text-sm text-muted-foreground">No {v.packages} yet.</p>
          )}
        </section>
      </div>

      {creating && (
        <PackageBuilder
          state={state}
          onClose={() => setCreating(false)}
          onSave={async (bundle) => {
            const r = await mutate((api) => api.createPackage(bundle));
            if (r?.id) {
              setSelectedId(r.id);
              setCreating(false);
            }
          }}
        />
      )}
    </>
  );
}

function Field({ label, className, children }) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}


function PackageDetail({ pkg, state, mutate, goToDate, onCreate, onOpenSession, onDeleted }) {
  const v = useVocab();
  const today = todayStr();
  const [form, setForm] = useState({
    name: pkg.name,
    anchor_date: pkg.anchor_date,
    end_date: pkg.end_date ?? '',
    cycle_length: pkg.cycle_length,
  });
  const [handover, setHandover] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingClasses, setEditingClasses] = useState(false);
  const [viewing, setViewing] = useState(false);

  const draftPkg = { ...pkg, ...form, end_date: form.end_date || null, cycle_length: Math.max(1, Number(form.cycle_length) || 1) };
  const dirty =
    form.name !== pkg.name ||
    form.anchor_date !== pkg.anchor_date ||
    (form.end_date || null) !== pkg.end_date ||
    Number(form.cycle_length) !== pkg.cycle_length;

  const entries = state.entries.filter((e) => e.package_id === pkg.id);
  const pruned = entries.filter((e) => e.week_position > draftPkg.cycle_length).length;
  const badEnd = draftPkg.end_date && draftPkg.end_date <= draftPkg.anchor_date;

  // Conflicts the unsaved edits would introduce (anything already there doesn't count).
  const { current, introduced } = useMemo(() => {
    const involves = (s) => s.pkg?.id === pkg.id;
    const current = checkConflicts(state, today, involves);
    if (!dirty || badEnd || !draftPkg.anchor_date) return { current, introduced: [] };
    const draft = {
      ...state,
      packages: state.packages.map((p) => (p.id === pkg.id ? draftPkg : p)),
      entries: state.entries.filter((e) => e.package_id !== pkg.id || e.week_position <= draftPkg.cycle_length),
    };
    return { current, introduced: newConflicts(current, checkConflicts(draft, today, involves)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, JSON.stringify(form)]);

  const shown = summarizeConflicts(introduced.length ? introduced : current);
  const save = () => mutate((api) => api.update('packages', pkg.id, { ...form, cycle_length: draftPkg.cycle_length }));
  const revert = () => setForm({ name: pkg.name, anchor_date: pkg.anchor_date, end_date: pkg.end_date ?? '', cycle_length: pkg.cycle_length });
  const status = packageStatus(pkg, today);
  const pos = cyclePosition(pkg, today);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold tracking-tight">{pkg.name}</h2>
        <StatusBadge status={status} />
        <span className="text-sm text-muted-foreground">
          {new Set(entries.filter((e) => e.week_position === (pos || 1)).map((e) => e.slot_id)).size} {v.classes} a week
          {pkg.cycle_length > 1 && pos && ` · week ${pos} of ${pkg.cycle_length} now`}
        </span>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setViewing(true)}>
            <Eye /> View
          </Button>
          <Button size="sm" onClick={() => setEditingClasses(true)}>
            <ListChecks /> Add or remove {v.classes}
          </Button>
          <Button
            variant="outline"
            size="sm"
            title={`End this ${v.package} on a date and start a new version of it from then (e.g. a new timetable next month)`}
            onClick={() => setHandover({ date: pkg.end_date ?? weekStart(addDays(maxDate(today, pkg.anchor_date), 28)), name: `${pkg.name} (next)`, copy: true })}
          >
            <ArrowRightLeft /> Replace from a date
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 /> Delete
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <Field label="Name" className="min-w-48 flex-1">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="Starts" className="w-64">
          <WeekPicker value={form.anchor_date} onChange={(w) => w && setForm({ ...form, anchor_date: w })} />
        </Field>
        <Field label="Ends (optional)" className="w-64">
          {/* end_date is stored exclusive (the first Sunday not running); here we pick the last week that runs. */}
          <WeekPicker
            clearable
            placeholder="Keeps running"
            value={form.end_date ? addDays(form.end_date, -7) : ''}
            onChange={(w) => setForm({ ...form, end_date: w ? addDays(w, 7) : '' })}
          />
        </Field>
        <Field label="Repeats" className="w-44">
          <Select value={String(form.cycle_length)} onValueChange={(val) => setForm({ ...form, cycle_length: Number(val) })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[...new Set([1, 2, 3, 4, 6, 8, Number(form.cycle_length)])].sort((a, b) => a - b).map((n) => (
                <SelectItem key={n} value={String(n)}>{n === 1 ? 'Same every week' : `Every ${n} weeks`}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <div className="flex gap-2">
          {dirty && <Button variant="ghost" onClick={revert}>Revert</Button>}
          <Button disabled={!dirty || introduced.length > 0 || badEnd} onClick={save}>Save</Button>
        </div>
        {(badEnd || pruned > 0) && (
          <p className="basis-full text-xs text-destructive">
            {badEnd ? 'The end can’t be before the start.' : `This removes ${v.n(pruned, 'class')} planned for weeks after week ${draftPkg.cycle_length}.`}
          </p>
        )}
      </div>

      <PlansEditor state={state} pkg={pkg} mutate={mutate} />
      <PackageMembers state={state} pkg={pkg} mutate={mutate} />

      {shown.length > 0 && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>
            {introduced.length
              ? `These changes would create ${shown.length} conflict${shown.length > 1 ? 's' : ''} — saving is blocked`
              : `${shown.length} existing conflict${shown.length > 1 ? 's' : ''}`}
          </AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {shown.map((c, i) => (
                <li key={i}>
                  {describeConflict(c, false, v)} — first{' '}
                  <button className="underline underline-offset-2" onClick={() => goToDate(c.dates[0])}>{fmtShort(c.dates[0])}</button>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <PackageCalendar state={state} pkg={pkg} onCreate={onCreate} onOpenSession={onOpenSession} goToDate={goToDate} />

      {viewing && <PackageDialog state={state} pkg={pkg} mutate={mutate} onClose={() => setViewing(false)} />}

      {editingClasses && (
        <EditClassesDialog state={state} pkg={pkg} week={pos || 1} mutate={mutate} onClose={() => setEditingClasses(false)} />
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${pkg.name}"?`}
        description={`This removes the ${v.package} and its ${v.n(entries.length, 'class')} on the timetable. ${v.Class} times, ${v.activities} and ${v.coaches} are kept.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await mutate((api) => api.remove('packages', pkg.id));
          onDeleted();
        }}
      />

      {handover && (
        <Dialog open onOpenChange={(o) => !o && setHandover(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Replace "{pkg.name}" from a date</DialogTitle>
              <DialogDescription>
                Use this when the timetable changes. "{pkg.name}" stops the week before, and a new version takes over from the week you pick. {v.Members} and history stay on the old one.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4">
              <Field label="New version starts">
                <WeekPicker value={handover.date} onChange={(w) => w && setHandover({ ...handover, date: w })} />
              </Field>
              <Field label="Name of the new version">
                <Input value={handover.name} onChange={(e) => setHandover({ ...handover, name: e.target.value })} />
              </Field>
              <div className="flex items-center gap-2">
                <Checkbox id="copy" checked={handover.copy} onCheckedChange={(on) => setHandover({ ...handover, copy: !!on })} />
                <Label htmlFor="copy">Start with the same {v.classes} (edit them afterwards)</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHandover(null)}>Cancel</Button>
              <Button
                onClick={async () => {
                  await mutate((api) => api.handover(pkg.id, handover));
                  setHandover(null);
                }}
              >
                Create new version
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// The package's cycle as a calendar: pick a week of the cycle, see it on the real dates it next runs,
// with other packages' sessions shown muted for context.
function PackageCalendar({ state, pkg, onCreate, onOpenSession, goToDate }) {
  const v = useVocab();
  const today = todayStr();
  const idx = useMemo(() => indexState(state), [state]);
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const L = pkg.cycle_length;
  const anchor = weekStart(pkg.anchor_date);
  const firstWeek = Math.max(0, Math.floor(daysBetween(anchor, weekStart(today)) / 7)); // weeks since anchor
  const [pos, setPos] = useState(cyclePosition(pkg, today) ?? 1);
  const [round, setRound] = useState(0);
  const [showOthers, setShowOthers] = useState(true);

  // Week index (from anchor) of position p in the selected cycle round, never before this week.
  const weekIndexOf = (p) => {
    const base = firstWeek - (firstWeek % L) + (p - 1);
    return (base < firstWeek ? base + L : base) + round * L;
  };
  const weekOf = (p) => addDays(anchor, weekIndexOf(p) * 7);
  const ws = weekOf(Math.min(pos, L));
  const ended = pkg.end_date && ws >= pkg.end_date;

  const days = useMemo(
    () =>
      DAYS.map((name, i) => {
        const date = addDays(ws, i);
        const all = resolveDate(state, date, idx);
        const sessions = showOthers ? all : all.filter((s) => s.pkg?.id === pkg.id);
        return { i, name, date, sessions, conflicts: conflictsByKey(findConflicts(all)) };
      }),
    [state, idx, ws, showOthers, pkg.id],
  );

  return (
    <div className="flex min-h-[420px] flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={String(pos)} onValueChange={(val) => setPos(Number(val))}>
          <TabsList>
            {Array.from({ length: L }, (_, i) => i + 1).map((p) => (
              <TabsTrigger key={p} value={String(p)} className="gap-1.5">
                Week {p}
                <span className="text-xs font-normal text-muted-foreground">{fmtShort(weekOf(p))}</span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {L > 1 && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Button variant="ghost" size="icon-sm" disabled={round === 0} onClick={() => setRound(round - 1)} aria-label="Previous cycle"><ChevronLeft /></Button>
            Cycle {round + 1}
            <Button variant="ghost" size="icon-sm" onClick={() => setRound(round + 1)} aria-label="Next cycle"><ChevronRight /></Button>
          </div>
        )}
        {ended && <span className="text-xs text-destructive">The {v.package} has ended by then.</span>}
        <div className="ml-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="others" checked={showOthers} onCheckedChange={setShowOthers} />
            <Label htmlFor="others" className="text-muted-foreground">Other {v.packages}</Label>
          </div>
          <Button variant="ghost" size="sm" onClick={() => goToDate(ws)}>
            <CalendarDays /> Open in schedule
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <WeekGrid
          state={state}
          days={days}
          colorOf={colorOf}
          isGhost={(s) => s.pkg?.id !== pkg.id}
          onCreate={(init) => onCreate({ ...init, packageId: pkg.id, positions: [pos] })}
          onOpenSession={onOpenSession}
        />
      </div>
    </div>
  );
}

