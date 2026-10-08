import { useState } from 'react';
import { Plus, Search, Trash2, X } from 'lucide-react';
import { clock, fmtShort, todayStr } from '../lib/dates.js';
import { packageStatus } from '../lib/schedule.js';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import ConfirmDialog from './ConfirmDialog.jsx';
import PageHeader from './PageHeader.jsx';
import { InlineInput } from './SlotsView.jsx';
import { useVocab } from './VocabContext.jsx';
import { classesLabel, expiryFor, plansOf, subStatus } from './Subscriptions.jsx';

const initials = (name) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

// Members (users) and the packages they're assigned to.
export default function MembersView({ state, mutate, onOpenPackage, onOpenOneOff }) {
  const v = useVocab();
  const today = todayStr();
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState({ name: '', email: '' });
  const [deleting, setDeleting] = useState(null);

  const planById = new Map(state.plans.map((p) => [p.id, p]));
  const pkgById = new Map(state.packages.map((p) => [p.id, p]));
  // A member's subscriptions, each with its package and plan.
  const subsOf = (memberId) =>
    state.packageMembers
      .filter((pm) => pm.member_id === memberId)
      .map((pm) => ({ ...pm, pkg: pkgById.get(pm.package_id), plan: planById.get(pm.plan_id) }))
      .filter((x) => x.pkg);
  // A member's upcoming one-time classes (today onwards), soonest first.
  const classById = new Map(state.classes.map((c) => [c.id, c]));
  const oneOffsOf = (memberId) => {
    const ids = new Set((state.oneOffMembers || []).filter((x) => x.member_id === memberId).map((x) => x.one_off_id));
    return (state.oneOffs || []).filter((o) => ids.has(o.id) && o.date >= today);
  };
  // Quick add from this page: the package's first plan, starting today, for one month.
  const subscribe = (pkgId, memberId) =>
    mutate((api) =>
      api.assignMember(pkgId, memberId, {
        plan_id: plansOf(state, pkgId)[0]?.id ?? null,
        start_date: today,
        end_date: expiryFor(today, plansOf(state, pkgId)[0]?.months),
      }),
    );
  const q = query.trim().toLowerCase();
  const members = state.members.filter((m) => !q || m.name.toLowerCase().includes(q) || (m.email ?? '').toLowerCase().includes(q));

  const add = async () => {
    if (!draft.name.trim()) return;
    await mutate((api) => api.create('members', draft));
    setDraft({ name: '', email: '' });
  };

  return (
    <>
      <PageHeader title={v.Members}>
        <span className="text-sm text-muted-foreground">{state.members.length} people · assign them to {v.packages}</span>
        <div className="relative ml-auto w-64">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="h-8 pl-8" placeholder={`Search ${v.members}`} value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-64">Name</TableHead>
                <TableHead className="w-64">Email</TableHead>
                <TableHead>{v.Packages}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => {
                const subs = subsOf(m.id);
                const pkgs = subs.map((x) => x.pkg);
                const available = state.packages.filter((p) => !pkgs.some((x) => x.id === p.id) && packageStatus(p, today) !== 'ended');
                return (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-[11px] font-medium">{initials(m.name)}</span>
                        <InlineInput value={m.name} onCommit={(name) => name.trim() && mutate((api) => api.update('members', m.id, { name }))} />
                      </div>
                    </TableCell>
                    <TableCell>
                      <InlineInput value={m.email ?? ''} onCommit={(email) => mutate((api) => api.update('members', m.id, { email }))} />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {subs.map(({ pkg: p, plan, ...sub }) => {
                          const st = subStatus(sub, today);
                          return (
                          <span
                            key={p.id}
                            className={cn(
                              'flex items-center gap-1 rounded-full border py-0.5 pr-1 pl-2.5 text-xs',
                              (packageStatus(p, today) === 'ended' || st.tone === 'expired') && 'text-muted-foreground',
                            )}
                            title={`${p.name}${plan ? ` · ${classesLabel(plan, v)}` : ''} · ${st.text} — open the ${v.package} to change plan or dates`}
                          >
                            <button className="hover:underline" onClick={() => onOpenPackage(p.id)}>{p.name}</button>
                            {plan && <span className="text-muted-foreground">· {plan.classes_per_month ?? 'Unlimited'}</span>}
                            <span className={cn(st.tone === 'soon' || st.tone === 'expired' ? 'text-destructive' : 'text-muted-foreground', st.tone === 'expired' && 'line-through')}>· {st.text}</span>
                            <button
                              className="grid size-4 place-items-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                              aria-label={`Remove from ${p.name}`}
                              onClick={() => mutate((api) => api.unassignMember(p.id, m.id))}
                            >
                              <X className="size-3" />
                            </button>
                          </span>
                          );
                        })}
                        {oneOffsOf(m.id).map((o) => (
                          <button
                            key={`o${o.id}`}
                            onClick={() => onOpenOneOff(o)}
                            title={`${v.OneOff} — click to open`}
                            className="flex items-center gap-1 rounded-full border border-dashed py-0.5 pr-2.5 pl-1.5 text-xs hover:bg-accent"
                          >
                            <span className="rounded bg-foreground/15 px-1 text-[9.5px] font-semibold">1×</span>
                            {o.label || classById.get(o.class_id)?.activity}
                            <span className="text-muted-foreground">
                              · {fmtShort(o.date)} {clock(o.start_time)}
                            </span>
                          </button>
                        ))}
                        {available.length > 0 && (
                          <Select value="" onValueChange={(v) => subscribe(Number(v), m.id)}>
                            <SelectTrigger size="sm" className="h-6 w-auto gap-1 border-dashed px-2 text-xs text-muted-foreground">
                              <Plus className="size-3" />
                              <SelectValue placeholder="Add" />
                            </SelectTrigger>
                            <SelectContent>
                              {available.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={`Delete ${v.member}`} onClick={() => setDeleting(m)}>
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-6 text-center text-sm text-muted-foreground">{query ? `No ${v.members} match “${query}”.` : `No ${v.members} yet — add one below.`}</TableCell>
                </TableRow>
              )}
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell>
                  <Input className="h-8" placeholder="Full name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
                </TableCell>
                <TableCell>
                  <Input className="h-8" type="email" placeholder="Email (optional)" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add()} />
                </TableCell>
                <TableCell colSpan={2}>
                  <Button size="sm" disabled={!draft.name.trim()} onClick={add}><Plus /> Add {v.member}</Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={`Delete ${deleting?.name}?`}
        description={`They'll be removed from every ${v.package} they're assigned to.`}
        confirmLabel="Delete"
        destructive
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          await mutate((api) => api.remove('members', deleting.id));
          setDeleting(null);
        }}
      />
    </>
  );
}
