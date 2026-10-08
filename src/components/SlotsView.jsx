import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { DAYS, clock, clockRange, fmtTime, todayStr, toMin } from '../lib/dates.js';
import { packageStatus } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import ConfirmDialog from './ConfirmDialog.jsx';
import PageHeader from './PageHeader.jsx';
import TimeInput from './TimeInput.jsx';
import { useVocab } from './VocabContext.jsx';

const TYPES = ['group', 'private', 'trial'];
const NONE = 'none';
const areaShort = (name) => name.replace(/^Area \d+ · /, '');

export default function SlotsView({ state, mutate }) {
  const v = useVocab();
  const today = todayStr();
  const [areaId, setAreaId] = useState(state.areas[0]?.id);
  const [editing, setEditing] = useState(null); // slot draft (id null = new)
  const [areaDialog, setAreaDialog] = useState(null); // { id?, name }
  const [deleteArea, setDeleteArea] = useState(null);

  const area = state.areas.find((a) => a.id === areaId) ?? state.areas[0];

  // Packages (not yet ended) that put something in this slot.
  const usage = (slotId) => {
    const pkgIds = new Set(state.entries.filter((e) => e.slot_id === slotId).map((e) => e.package_id));
    return state.packages.filter((p) => pkgIds.has(p.id) && packageStatus(p, today) !== 'ended');
  };

  const slotsIn = (day) =>
    state.slots
      .filter((s) => s.area_id === area?.id && s.day === day)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  const areaSlotCount = (id) => state.slots.filter((s) => s.area_id === id).length;

  return (
    <>
      <PageHeader title="Rooms & times">
        <span className="text-sm text-muted-foreground">Each room's weekly {v.class} times. Click an empty spot to add a time, or drag to set how long it is.</span>
      </PageHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-4 p-5">
        <div className="flex items-center gap-2">
          <Tabs value={String(area?.id)} onValueChange={(v) => setAreaId(Number(v))}>
            <TabsList>
              {state.areas.map((a) => (
                <TabsTrigger key={a.id} value={String(a.id)} className="gap-2">
                  {areaShort(a.name)}
                  <span className="text-xs text-muted-foreground tabular-nums">{areaSlotCount(a.id)}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {area && (
            <Button variant="ghost" size="icon-sm" aria-label="Rename room" onClick={() => setAreaDialog({ id: area.id, name: area.name })}>
              <Pencil />
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setAreaDialog({ name: '' })}>
            <Plus /> Room
          </Button>
          <Button
            size="sm"
            className="ml-auto"
            disabled={!area}
            onClick={() => setEditing({ id: null, area_id: area.id, day: 0, start_time: '09:00', end_time: '10:00', label: '', type: 'group', capacity: 20, buffer_minutes: 0, active: 1 })}
          >
            <Plus /> New {v.class} time
          </Button>
        </div>

        {area ? (
          <SlotTimeGrid
            state={state}
            slots={state.slots.filter((x) => x.area_id === area.id)}
            usage={usage}
            onEdit={(slot) => setEditing({ ...slot })}
            onCreate={(day, startMin, endMin) =>
              setEditing({ id: null, area_id: area.id, day, start_time: fmtTime(startMin), end_time: fmtTime(endMin), label: '', type: 'group', capacity: 20, buffer_minutes: 0, active: 1 })
            }
          />
        ) : (
          <p className="text-sm text-muted-foreground">Add a room to start adding {v.class} times.</p>
        )}
      </div>

      {editing && (
        <SlotDialog
          state={state}
          draft={editing}
          usedBy={editing.id ? usage(editing.id) : []}
          usedAnywhere={editing.id ? state.entries.some((e) => e.slot_id === editing.id) : false}
          onClose={() => setEditing(null)}
          mutate={mutate}
        />
      )}

      {areaDialog && (
        <Dialog open onOpenChange={(o) => !o && setAreaDialog(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{areaDialog.id ? 'Rename room' : 'New room'}</DialogTitle>
            </DialogHeader>
            <Input autoFocus value={areaDialog.name} onChange={(e) => setAreaDialog({ ...areaDialog, name: e.target.value })} placeholder="e.g. Area 4 · Main room" />
            <DialogFooter>
              {areaDialog.id && (
                <Button
                  variant="destructive"
                  className="sm:mr-auto"
                  disabled={areaSlotCount(areaDialog.id) > 0}
                  title={areaSlotCount(areaDialog.id) ? `Move or delete its ${v.class} times first` : undefined}
                  onClick={() => {
                    setDeleteArea(areaDialog.id);
                    setAreaDialog(null);
                  }}
                >
                  Delete
                </Button>
              )}
              <Button variant="outline" onClick={() => setAreaDialog(null)}>Cancel</Button>
              <Button
                disabled={!areaDialog.name.trim()}
                onClick={async () => {
                  const r = areaDialog.id
                    ? await mutate((api) => api.update('areas', areaDialog.id, { name: areaDialog.name }))
                    : await mutate((api) => api.create('areas', { name: areaDialog.name, sort: state.areas.length }));
                  if (!areaDialog.id) setAreaId(r.id);
                  setAreaDialog(null);
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      <ConfirmDialog
        open={!!deleteArea}
        title="Delete room?"
        description={`The room has no ${v.class} times, so nothing else is affected.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleteArea(null)}
        onConfirm={async () => {
          await mutate((api) => api.remove('areas', deleteArea));
          setDeleteArea(null);
          setAreaId(state.areas.find((a) => a.id !== deleteArea)?.id);
        }}
      />
    </>
  );
}

const SNAP = 15; // minutes

// Week of slots on a time axis. Click empty space for a 1-hour slot, or drag to set its length.
function SlotTimeGrid({ state, slots, usage, onEdit, onCreate }) {
  const [startMin, endMin] = useMemo(() => {
    let lo = 6 * 60;
    let hi = 21 * 60;
    for (const sl of state.slots) {
      lo = Math.min(lo, toMin(sl.start_time));
      hi = Math.max(hi, toMin(sl.end_time));
    }
    return [Math.floor(lo / 60) * 60, Math.ceil(hi / 60) * 60];
  }, [state.slots]);

  const bodyRef = useRef(null);
  const [bodyHeight, setBodyHeight] = useState(600);
  useLayoutEffect(() => {
    const ro = new ResizeObserver(([entry]) => setBodyHeight(entry.contentRect.height));
    ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, []);
  const PX = Math.max(0.45, bodyHeight / (endMin - startMin));

  const [drag, setDrag] = useState(null); // { day, a, b } in minutes
  const minuteAt = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const m = startMin + Math.round((e.clientY - rect.top) / PX / SNAP) * SNAP;
    return Math.min(endMin, Math.max(startMin, m));
  };
  const finish = () => {
    if (!drag) return;
    let a = Math.min(drag.a, drag.b);
    let b = Math.max(drag.a, drag.b);
    if (b - a < SNAP) b = a + 60; // a plain click makes a 1-hour slot
    b = Math.min(b, 23 * 60 + 59);
    setDrag(null);
    onCreate(drag.day, a, b);
  };

  const hours = [];
  for (let m = startMin; m < endMin; m += 60) hours.push(m);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border bg-card select-none">
      <div className="flex border-b">
        <div className="w-14 shrink-0" />
        {DAYS.map((d, i) => (
          <div key={i} className="min-w-0 flex-1 border-l px-3 py-2 text-sm font-medium">
            {d}
            <span className="ml-2 text-xs font-normal text-muted-foreground">{slots.filter((x) => x.day === i).length || ''}</span>
          </div>
        ))}
      </div>
      <div ref={bodyRef} className="relative flex min-h-0 flex-1">
        <div className="relative w-14 shrink-0">
          {hours.map((m) => (
            <span key={m} className="absolute right-2 text-[10px] text-muted-foreground tabular-nums" style={{ top: (m - startMin) * PX + 2 }}>
              {clock(fmtTime(m))}
            </span>
          ))}
        </div>
        {DAYS.map((_, day) => {
          const daySlots = slots.filter((x) => x.day === day).sort((a, b) => a.start_time.localeCompare(b.start_time));
          // Side-by-side columns for overlapping slots.
          const colEnds = [];
          const placed = daySlots.map((sl) => {
            const a = toMin(sl.start_time);
            const b = toMin(sl.end_time);
            let c = colEnds.findIndex((e) => e <= a);
            if (c === -1) c = colEnds.push(0) - 1;
            colEnds[c] = b;
            return { sl, a, b, c };
          });
          const w = 100 / Math.max(1, colEnds.length);
          const preview = drag?.day === day && { a: Math.min(drag.a, drag.b), b: Math.max(drag.a, drag.b) };
          return (
            <div
              key={day}
              className="relative min-w-0 flex-1 cursor-crosshair border-l hover:bg-white/[0.015]"
              style={{ backgroundImage: 'linear-gradient(to bottom, oklch(1 0 0 / 7%) 1px, transparent 1px)', backgroundSize: `100% ${60 * PX}px` }}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                const m = minuteAt(e);
                setDrag({ day, a: m, b: m });
              }}
              onPointerMove={(e) => drag?.day === day && setDrag({ ...drag, b: minuteAt(e) })}
              onPointerUp={finish}
            >
              {placed.map(({ sl, a, b, c }) => {
                const used = usage(sl.id);
                const height = (b - a) * PX - 3; // block height after the 2px inset
                // Show only the lines that fit: 3 lines need ~64px, 2 need ~46px, otherwise one combined line.
                const lines = height >= 64 ? 3 : height >= 46 ? 2 : 1;
                const name = `${sl.label || 'Untitled slot'}${sl.active ? '' : ' · Off'}`;
                return (
                  <button
                    key={sl.id}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={() => onEdit(sl)}
                    title={`${clockRange(sl.start_time, sl.end_time)} · ${name}${used.length ? ` · ${used.map((p) => p.name).join(', ')}` : ''}`}
                    className={cn(
                      'absolute flex flex-col gap-0.5 overflow-hidden border px-3 text-left text-xs leading-4 transition-colors [&>span]:shrink-0',
                      lines === 1 ? 'justify-center py-0.5' : 'py-1.5',
                      used.length
                        ? 'border-white/12 bg-neutral-800/80 hover:border-white/25 hover:bg-neutral-700/80'
                        : 'border-dashed border-white/15 bg-neutral-900/60 hover:border-white/30',
                      !sl.active && 'opacity-45',
                    )}
                    style={{ top: (a - startMin) * PX + 2, height, left: `calc(${c * w}% + 2px)`, width: `calc(${w}% - 4px)` }}
                  >
                    {lines === 1 ? (
                      <span className="truncate">
                        <span className="font-medium tabular-nums">{clockRange(sl.start_time, sl.end_time)}</span>
                        <span className="text-muted-foreground"> · {name}</span>
                      </span>
                    ) : (
                      <>
                        <span className="truncate font-medium tabular-nums">{clockRange(sl.start_time, sl.end_time)}</span>
                        <span className="truncate text-muted-foreground">{name}</span>
                      </>
                    )}
                    {lines === 3 && (
                      <span className="mt-auto truncate text-[10.5px] text-muted-foreground/70">
                        {used.length ? used.map((p) => p.name).join(', ') : 'Unused'}
                      </span>
                    )}
                  </button>
                );
              })}
              {preview && (
                <div
                  className="pointer-events-none absolute inset-x-0.5 border border-primary/60 bg-primary/10 px-3 py-2.5 text-xs text-primary"
                  style={{ top: (preview.a - startMin) * PX, height: Math.max(SNAP, preview.b - preview.a || 60) * PX }}
                >
                  {clock(fmtTime(preview.a))} – {clock(fmtTime(Math.max(preview.b, preview.a + (preview.b - preview.a < SNAP ? 60 : 0))))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SlotDialog({ state, draft, usedBy, usedAnywhere, onClose, mutate }) {
  const [form, setForm] = useState({ ...draft, label: draft.label ?? '', type: draft.type || NONE, capacity: draft.capacity ?? '' });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = (patch) => setForm({ ...form, ...patch });
  const isNew = !draft.id;
  const badTime = toMin(form.end_time) <= toMin(form.start_time);
  const deactivating = !isNew && draft.active && !form.active && usedBy.length > 0;
  const v = useVocab();

  const save = async () => {
    const body = {
      area_id: form.area_id,
      day: form.day,
      start_time: form.start_time,
      end_time: form.end_time,
      label: form.label,
      type: form.type === NONE ? '' : form.type,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      buffer_minutes: Number(form.buffer_minutes) || 0,
      active: !!form.active,
    };
    await mutate((api) => (isNew ? api.create('slots', body) : api.update('slots', draft.id, body)));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? `New ${v.class} time` : `Edit ${v.class} time`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? `An empty container for a time and place. ${v.Packages} fill it with ${v.classes}.`
              : usedBy.length
                ? `Used by ${usedBy.map((p) => p.name).join(', ')}.`
                : `Not used by any ${v.package} yet.`}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Area">
            <Select value={String(form.area_id)} onValueChange={(v) => set({ area_id: Number(v) })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {state.areas.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Day">
            <Select value={String(form.day)} onValueChange={(v) => set({ day: Number(v) })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => <SelectItem key={i} value={String(i)}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Start"><TimeInput value={form.start_time} onChange={(start_time) => set({ start_time })} /></Field>
          <Field label="End"><TimeInput value={form.end_time} onChange={(end_time) => set({ end_time })} /></Field>
          <Field label="Label" className="col-span-2"><Input placeholder={`e.g. ${v.example.label} morning`} value={form.label} onChange={(e) => set({ label: e.target.value })} /></Field>
          <Field label="Type">
            <Select value={form.type} onValueChange={(v) => set({ type: v })}>
              <SelectTrigger className="w-full capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Capacity"><Input type="number" min="0" value={form.capacity} onChange={(e) => set({ capacity: e.target.value })} /></Field>
            <Field label="Buffer (min)"><Input type="number" min="0" value={form.buffer_minutes} onChange={(e) => set({ buffer_minutes: e.target.value })} /></Field>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
          <div>
            <div className="text-sm font-medium">Active</div>
            <div className="text-xs text-muted-foreground">Inactive slots leave gaps in any {v.package} that uses them.</div>
          </div>
          <Switch checked={!!form.active} onCheckedChange={(v) => set({ active: v ? 1 : 0 })} />
        </div>

        {deactivating && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              {usedBy.map((p) => p.name).join(', ')} will show a gap here until the {v.classes} move or the slot is reactivated.
            </AlertDescription>
          </Alert>
        )}
        {badTime && <p className="text-xs text-destructive">End time must be after the start.</p>}

        <DialogFooter>
          {!isNew && (
            <Button
              variant="ghost"
              className="text-muted-foreground hover:text-destructive sm:mr-auto"
              disabled={usedAnywhere}
              title={usedAnywhere ? `Used by ${v.packages} — remove it from them first` : undefined}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 /> Delete
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={badTime} onClick={save}>{isNew ? 'Create slot' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>

      <ConfirmDialog
        open={confirmDelete}
        title="Delete slot?"
        description={`${DAYS[draft.day]} ${clockRange(draft.start_time, draft.end_time)} will be removed.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await mutate((api) => api.remove('slots', draft.id));
          onClose();
        }}
      />
    </Dialog>
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

// Input that saves on blur / Enter, only if the value changed. (Used by the Classes table.)
export function InlineInput({ value, onCommit, type = 'text', placeholder, className }) {
  const [v, setV] = useState(String(value));
  const [prev, setPrev] = useState(value);
  if (value !== prev) {
    setPrev(value);
    setV(String(value));
  }
  const commit = () => v !== String(value) && onCommit(v);
  return (
    <Input
      type={type}
      value={v}
      placeholder={placeholder}
      className={cn('h-8 border-transparent bg-transparent! hover:border-input focus-visible:border-ring', className)}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
    />
  );
}
