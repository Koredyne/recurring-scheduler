import { useMemo, useState } from 'react';
import { CalendarClock, Layers, MapPin, Plus, Repeat, TriangleAlert, Users, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DAYS, DAY_SHORT, clock, clockRange, fmtDate } from '../lib/dates.js';
import { activityColors, indexState } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PackageMembers } from './Subscriptions.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import { useVocab } from './VocabContext.jsx';

export default function SessionDialog({ state, session, conflicts, mutate, onClose, onOpenPackage, onEdit }) {
  const v = useVocab();
  const idx = useMemo(() => indexState(state), [state]);
  const colorOf = useMemo(() => activityColors(state.classes), [state.classes]);
  const { slot, cls, pkg, pos, area, date, entry } = session;

  // The whole rotation for this slot in this package.
  const rotation = Array.from({ length: pkg.cycle_length }, (_, i) => {
    const e = state.entries.find((x) => x.package_id === pkg.id && x.slot_id === slot.id && x.week_position === i + 1);
    return { week: i + 1, cls: e && idx.classes.get(e.class_id) };
  });

  // These change the package itself, every week it runs — not just one date.
  const rotating = pkg.cycle_length > 1;
  const every = rotating ? `week ${pos} of every ${pkg.cycle_length}-week rotation` : `every ${DAYS[slot.day]}`;
  const [confirmRemove, setConfirmRemove] = useState(false);

  const remove = async () => {
    await mutate((api) => api.remove('entries', entry.id));
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="size-2.5 rounded-full" style={{ background: colorOf(cls.activity) }} />
            {cls.activity}
          </DialogTitle>
          <DialogDescription>with {cls.coach}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2.5 text-sm">
          <Row icon={CalendarClock}>
            {fmtDate(date)} · {clockRange(slot.start_time, slot.end_time)}
            {slot.buffer_minutes > 0 && <span className="text-muted-foreground"> · +{slot.buffer_minutes} min buffer</span>}
          </Row>
          <Row icon={MapPin}>
            {area?.name}
            {slot.label && <span className="text-muted-foreground"> · {slot.label}</span>}
          </Row>
          <Row icon={Layers}>
            {pkg.name}{' '}
            <span className="text-muted-foreground">
              · week {pos} of {pkg.cycle_length}
            </span>
          </Row>
        </div>

        {session.gap && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>This {v.class} time is inactive, so this week has a gap in the rotation.</AlertDescription>
          </Alert>
        )}
        {conflicts.length > 0 && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              {conflicts.map((c, i) => (
                <div key={i}>
                  {c.type === 'area' ? 'Area' : v.Coach} clash with {c.other.cls.activity} ({c.other.cls.coach}), {c.other.area?.name}{' '}
                  {clockRange(c.other.slot.start_time, c.other.slot.end_time)}
                </div>
              ))}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Repeat className="size-3.5" />
            Rotation · {DAY_SHORT[slot.day]} {clock(slot.start_time)} · loops after week {pkg.cycle_length}
          </div>
          <div className="divide-y rounded-lg border">
            {rotation.map((r) => (
              <div key={r.week} className={cn('flex items-center gap-3 px-3 py-2 text-sm', r.week === pos && 'bg-muted/50')}>
                <span className="w-7 text-xs text-muted-foreground tabular-nums">W{r.week}</span>
                {r.cls ? (
                  <span className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full" style={{ background: colorOf(r.cls.activity) }} />
                    {r.cls.activity}
                    <span className="text-muted-foreground">{r.cls.coach}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">Empty</span>
                )}
                {r.week === pos && (
                  <Badge variant="outline" className="ml-auto">
                    This week
                  </Badge>
                )}
              </div>
            ))}
          </div>
        </div>

        <PackageMembers state={state} pkg={pkg} mutate={mutate} compact />

        <p className="text-xs text-muted-foreground">
          Changes here apply to {pkg.name}, {every}. To change a single date, use the Schedule.
        </p>

        <DialogFooter className="sm:flex-wrap">
          <Button variant="destructive" className="sm:mr-auto" onClick={() => setConfirmRemove(true)}>
            {rotating ? `Remove from week ${pos}` : `Remove from ${v.package}`}
          </Button>
          <Button variant="outline" onClick={() => onOpenPackage(pkg.id)}>
            Open {v.package}
          </Button>
          <Button onClick={() => onEdit({ date, slotId: slot.id, packageId: pkg.id, classId: cls.id, positions: [pos] })}>
            {rotating ? `Edit week ${pos}` : `Edit ${v.class}`}
          </Button>
        </DialogFooter>

        <ConfirmDialog
          open={confirmRemove}
          title={`Remove ${cls.activity} from ${pkg.name}?`}
          description={`It comes off ${every} (${DAY_SHORT[slot.day]} ${clockRange(slot.start_time, slot.end_time)}, ${area?.name}), past and future.`}
          confirmLabel="Remove"
          destructive
          onCancel={() => setConfirmRemove(false)}
          onConfirm={remove}
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
