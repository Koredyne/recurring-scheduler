import { useState } from 'react';
import { Pencil, Plus, Trash2, Users } from 'lucide-react';
import { daysBetween, fmtShort, todayStr } from '../lib/dates.js';
import { MONTH_PRESETS, classPresets, classesLabel, expiryFor, money, monthsLabel, offerLabel, plansOf } from '../lib/plans.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import NumberChoice from './NumberChoice.jsx';
import { useVocab } from './VocabContext.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

// ── Plans & subscriptions ────────────────────────────────────────────────────────────────
// The plan helpers live in lib/plans.js (plain JS, unit-tested); re-exported here for the components.
export { MONTH_PRESETS, cheapest, classPresets, classesLabel, expiryFor, money, monthsLabel, planLabel, plansOf } from '../lib/plans.js';
// A package says which sessions you can attend; a plan says how it's sold (classes a month, for how many
// months, and one price for all of them); a subscription is a member on a plan from a start date to an
// expiry date (inclusive).

// Subscription state relative to today: upcoming, active (with days left), expiring soon, expired.
export function subStatus(sub, today = todayStr()) {
  if (!sub.end_date) return { tone: 'muted', text: 'No dates' };
  if (sub.start_date && sub.start_date > today) return { tone: 'muted', text: `Starts ${fmtShort(sub.start_date)}` };
  const left = daysBetween(today, sub.end_date);
  if (left < 0) return { tone: 'expired', text: `Expired ${fmtShort(sub.end_date)}` };
  if (left === 0) return { tone: 'soon', text: 'Expires today' };
  if (left <= 7) return { tone: 'soon', text: `${left} day${left > 1 ? 's' : ''} left` };
  return { tone: 'ok', text: `Until ${fmtShort(sub.end_date)}` };
}
const TONE = { ok: 'text-muted-foreground', muted: 'text-muted-foreground/70', soon: 'text-primary', expired: 'text-primary/80 line-through' };

// Form for a new or existing subscription. `member` is fixed when editing; otherwise pick from `available`.
function SubscriptionForm({ plans, available, initial, onSave, onRemove }) {
  const v = useVocab();
  const today = todayStr();
  const [memberId, setMemberId] = useState(initial?.member_id ? String(initial.member_id) : '');
  // Sell by length first: pick how many months, then a plan of that length. The expiry follows the
  // start and the length, and can still be changed by hand.
  const lengths = [...new Set(plans.map((p) => p.months ?? 1))].sort((a, b) => a - b);
  const current = plans.find((p) => p.id === initial?.plan_id);
  const [months, setMonths] = useState(current?.months ?? lengths[0] ?? 1);
  const offered = plans.filter((p) => (p.months ?? 1) === months);
  const [planId, setPlanId] = useState(String(current?.id ?? offered[0]?.id ?? ''));
  const [start, setStart] = useState(initial?.start_date ?? today);
  const [end, setEnd] = useState(initial?.end_date ?? expiryFor(today, months));
  const editing = !!initial?.member_id;

  const pickLength = (n) => {
    setMonths(n);
    setPlanId(String(plans.find((p) => (p.months ?? 1) === n)?.id ?? ''));
    if (start) setEnd(expiryFor(start, n));
  };

  return (
    <div className="grid gap-3">
      {!editing && (
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">{v.Member}</Label>
          <Select value={memberId} onValueChange={setMemberId}>
            <SelectTrigger size="sm" className="w-full"><SelectValue placeholder={`Choose ${v.a('member')}`} /></SelectTrigger>
            <SelectContent>
              {available.map((m) => <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {plans.length ? (
        <>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">How long</Label>
            <div className="flex flex-wrap gap-1">
              {lengths.map((n) => (
                <Button key={n} type="button" size="xs" variant={n === months ? 'default' : 'outline'} onClick={() => pickLength(n)}>
                  {monthsLabel(n)}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Plan</Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger size="sm" className="w-full min-w-0 [&_[data-slot=select-value]]:truncate"><SelectValue placeholder="Choose a plan" /></SelectTrigger>
              <SelectContent>
                {offered.map((p) => <SelectItem key={p.id} value={String(p.id)}>{offerLabel(p, v)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Add a plan to the {v.package} first.</p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Start</Label>
          <Input
            type="date"
            className="h-8"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (e.target.value) setEnd(expiryFor(e.target.value, months));
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs text-muted-foreground">Expires</Label>
          <Input type="date" className="h-8" value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>
      <div className="flex items-center gap-2 pt-1">
        {onRemove && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={onRemove}>
            <Trash2 /> Remove
          </Button>
        )}
        <Button
          size="sm"
          className="ml-auto"
          disabled={(!editing && !memberId) || !start || !end || end < start}
          onClick={() => onSave({ member_id: Number(memberId || initial.member_id), plan_id: planId ? Number(planId) : null, start_date: start, end_date: end })}
        >
          {editing ? 'Save' : 'Subscribe'}
        </Button>
      </div>
    </div>
  );
}

// One member's subscription chip; click it to change plan/dates or remove.
function SubscriptionChip({ m, sub, plan, plans, onSave, onRemove, compact }) {
  const v = useVocab();
  const [open, setOpen] = useState(false);
  const st = subStatus(sub);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            'flex items-center gap-1.5 rounded-full border py-0.5 pr-2.5 pl-1 text-left text-xs transition-colors hover:border-white/25 hover:bg-accent/60',
            st.tone === 'expired' && 'opacity-60',
          )}
        >
          <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[10px] font-medium">
            {m.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <span>{m.name}</span>
          {!compact && plan && <span className="text-muted-foreground">· {classesLabel(plan, v)}</span>}
          <span className={TONE[st.tone]}>· {st.text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80">
        <div className="mb-3 text-sm font-medium">{m.name}</div>
        <SubscriptionForm
          plans={plans}
          initial={sub}
          onSave={async (data) => {
            await onSave(data);
            setOpen(false);
          }}
          onRemove={onRemove}
        />
      </PopoverContent>
    </Popover>
  );
}

// Everyone subscribed to a package, with status, plus a "Subscribe" button for the rest.
export function PackageMembers({ state, pkg, mutate, compact = false }) {
  const v = useVocab();
  const [adding, setAdding] = useState(false);
  const plans = plansOf(state, pkg.id);
  const planById = new Map(state.plans.map((p) => [p.id, p]));
  const subs = state.packageMembers.filter((pm) => pm.package_id === pkg.id);
  const memberById = new Map(state.members.map((m) => [m.id, m]));
  const taken = new Set(subs.map((s) => s.member_id));
  const available = state.members.filter((m) => !taken.has(m.id));
  const save = (sub) => mutate((api) => api.assignMember(pkg.id, sub.member_id, sub));

  return (
    <div className={cn('space-y-2', !compact && 'rounded-lg border px-3 py-2.5')}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Users className="size-3.5" />
        {compact ? `${v.Members} of ${pkg.name}` : v.Members} · {subs.length}
        <Popover open={adding} onOpenChange={setAdding}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="xs" className="ml-auto" disabled={!available.length}>
              <Plus /> Subscribe {v.member}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80">
            <div className="mb-3 text-sm font-medium">Subscribe to {pkg.name}</div>
            <SubscriptionForm
              plans={plans}
              available={available}
              onSave={async (data) => {
                await save(data);
                setAdding(false);
              }}
            />
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {subs.map((sub) => {
          const m = memberById.get(sub.member_id);
          if (!m) return null;
          return (
            <SubscriptionChip
              key={sub.member_id}
              m={m}
              sub={sub}
              plan={planById.get(sub.plan_id)}
              plans={plans}
              compact={compact}
              onSave={save}
              onRemove={() => mutate((api) => api.unassignMember(pkg.id, m.id))}
            />
          );
        })}
        {subs.length === 0 && <span className="text-xs text-muted-foreground/70">No one subscribed yet.</span>}
      </div>
    </div>
  );
}

// The ways a package is sold. Add, edit and delete plans inline.
export function PlansEditor({ state, pkg, mutate }) {
  const v = useVocab();
  const plans = plansOf(state, pkg.id);
  const subsOn = (planId) => state.packageMembers.filter((pm) => pm.plan_id === planId).length;
  return (
    <div className="space-y-2 rounded-lg border px-3 py-2.5">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        Plans · {plans.length}
        <PlanPopover
          title="New plan"
          onSave={(plan) => mutate((api) => api.create('plans', { ...plan, package_id: pkg.id }))}
          trigger={
            <Button variant="outline" size="xs" className="ml-auto">
              <Plus /> Add plan
            </Button>
          }
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {plans.map((p) => (
          <PlanPopover
            key={p.id}
            title="Edit plan"
            plan={p}
            onSave={(plan) => mutate((api) => api.update('plans', p.id, plan))}
            onDelete={() => mutate((api) => api.remove('plans', p.id))}
            trigger={
              <button className="flex items-center gap-1.5 rounded-md border bg-muted/30 px-2.5 py-1 text-xs hover:border-white/25 hover:bg-accent/60">
                {p.label && <span className="font-medium">{p.label}</span>}
                <span>{classesLabel(p, v)} a month · {monthsLabel(p.months ?? 1)}</span>
                {p.price != null && <span className="font-medium tabular-nums">{money(p.price, v)}</span>}
                <span className="text-muted-foreground">· {v.n(subsOn(p.id), 'member')}</span>
                <Pencil className="size-3 text-muted-foreground" />
              </button>
            }
          />
        ))}
        {plans.length === 0 && <span className="text-xs text-muted-foreground/70">No plans yet — add how this {v.package} is sold (e.g. {v.n(12, 'class')} / month, {money(45, v)}).</span>}
      </div>
    </div>
  );
}

function PlanPopover({ title, plan, onSave, onDelete, trigger }) {
  const v = useVocab();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState(plan?.label ?? '');
  const [classes, setClasses] = useState(plan ? String(plan.classes_per_month ?? '') : '12');
  const [months, setMonths] = useState(String(plan?.months ?? 1));
  const [price, setPrice] = useState(plan?.price != null ? String(plan.price) : '');
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <div className="mb-3 text-sm font-medium">{title}</div>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{v.Classes} a month</Label>
            <NumberChoice value={classes} onChange={setClasses} presets={classPresets(v)} suffix={(n) => (n === '1' ? v.class : v.classes)} placeholder="e.g. 16" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">For how long</Label>
            <NumberChoice value={months} onChange={setMonths} presets={MONTH_PRESETS} suffix={(n) => (n === '1' ? 'month' : 'months')} placeholder="e.g. 10" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Price for {monthsLabel(months || 1)} ({v.currency})</Label>
              <Input className="h-8" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value.replace(/[^\d.]/g, ''))} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Name (optional)</Label>
              <Input className="h-8" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Everyday" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            {onDelete && (
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={onDelete}>
                <Trash2 /> Delete
              </Button>
            )}
            <Button
              size="sm"
              className="ml-auto"
              disabled={classes == null || months == null}
              onClick={async () => {
                await onSave({ label, classes_per_month: classes ? Number(classes) : null, months: Number(months), price: price === '' ? null : Number(price) });
                setOpen(false);
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
