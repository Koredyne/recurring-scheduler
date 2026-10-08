import { useState } from 'react';
import { Building2, Database, Download, MapPin, Palette, Plus, RotateCcw, Trash2, User, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { KINDS } from '../lib/vocab.js';
import { useVocab } from './VocabContext.jsx';
import PageHeader from './PageHeader.jsx';
import { InlineInput } from './SlotsView.jsx';

const PALETTE = ['#e5484d', '#6e8efb', '#4cc38a', '#f2994a', '#a78bfa', '#38bdb3', '#e879a6', '#d4b53c', '#5fa8e8', '#b8977a', '#93c25b', '#8f86e0'];

// The business, and the reusable lists everything else picks from. Renaming here updates every class and slot.
export default function ConfigView({ state, mutate, onData }) {
  const v = useVocab();
  const coachUse = (id) => state.classes.filter((c) => (c.coach_ids ?? [c.coach_id]).includes(id)).length;
  const activityUse = (id) => state.classes.filter((c) => c.activity_id === id).length;
  const areaUse = (id) => state.slots.filter((s) => s.area_id === id).length;
  const memberUse = (id) => state.packageMembers.filter((pm) => pm.member_id === id).length;

  return (
    <>
      <PageHeader title="Settings">
        <span className="text-sm text-muted-foreground">
          {v.Coaches}, {v.activities}, rooms and {v.members}: set them up once, then pick them everywhere.
        </span>
      </PageHeader>

      <div className="grid flex-1 grid-cols-2 content-start gap-4 overflow-y-auto p-5 2xl:grid-cols-4">
        <BusinessCard settings={state.settings} mutate={mutate} />
        <ListCard
          icon={User}
          title={v.Coaches}
          items={state.coaches}
          usage={coachUse}
          usageLabel={(n) => v.n(n, 'class')}
          placeholder={`New ${v.coach}`}
          onAdd={(name) => mutate((api) => api.create('coaches', { name }))}
          onRename={(id, name) => mutate((api) => api.update('coaches', id, { name }))}
          onDelete={(id) => mutate((api) => api.remove('coaches', id))}
        />
        <ListCard
          icon={Palette}
          title={v.Activities}
          items={state.activities}
          usage={activityUse}
          usageLabel={(n) => v.n(n, 'class')}
          placeholder={`New ${v.activity}`}
          onAdd={(name) => mutate((api) => api.create('activities', { name, color: PALETTE[state.activities.length % PALETTE.length] }))}
          onRename={(id, name) => mutate((api) => api.update('activities', id, { name }))}
          onDelete={(id) => mutate((api) => api.remove('activities', id))}
          leading={(a) => (
            <label className="relative size-4 shrink-0 cursor-pointer rounded-full ring-1 ring-white/10" style={{ background: a.color || '#888' }} title="Change colour">
              <input
                type="color"
                className="absolute inset-0 cursor-pointer opacity-0"
                value={a.color || '#888888'}
                onChange={(e) => mutate((api) => api.update('activities', a.id, { color: e.target.value }))}
              />
            </label>
          )}
        />
        <ListCard
          icon={MapPin}
          title="Rooms"
          items={state.areas}
          usage={areaUse}
          usageLabel={(n) => `${n} ${v.class} time${n === 1 ? '' : 's'}`}
          placeholder="New room"
          onAdd={(name) => mutate((api) => api.create('areas', { name, sort: state.areas.length }))}
          onRename={(id, name) => mutate((api) => api.update('areas', id, { name }))}
          onDelete={(id) => mutate((api) => api.remove('areas', id))}
        />
        <ListCard
          icon={Users}
          title={v.Members}
          items={state.members}
          usage={memberUse}
          usageLabel={(n) => v.n(n, 'package')}
          placeholder={`New ${v.member}`}
          // Members can be removed even when subscribed; their assignments go with them.
          deletableWhenUsed
          onAdd={(name) => mutate((api) => api.create('members', { name }))}
          onRename={(id, name) => mutate((api) => api.update('members', id, { name }))}
          onDelete={(id) => mutate((api) => api.remove('members', id))}
        />

        <section className="flex flex-col rounded-lg border bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Database className="size-4 text-muted-foreground" />
            <h2 className="text-sm font-medium">Data</h2>
          </div>
          <div className="space-y-3 p-4 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">Download all data</div>
                <div className="text-xs text-muted-foreground">{`Save all ${v.packages}, plans, ${v.members}, ${v.classes}, schedules and settings as JSON.`}</div>
              </div>
              <Button size="sm" variant="outline" asChild><a href="/api/export"><Download /> Download JSON</a></Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">Load a demo</div>
                <div className="text-xs text-muted-foreground">Replace everything with a gym, clinic or meeting-rooms demo. The words on screen switch to match.</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => onData('reset')}><RotateCcw /> Restore demo</Button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="font-medium">Start from scratch</div>
                <div className="text-xs text-muted-foreground">{`Delete all ${v.packages}, ${v.classes}, rooms and ${v.members}.`}</div>
              </div>
              <Button size="sm" variant="outline" className="text-primary hover:text-primary" onClick={() => onData('clear')}><Trash2 /> Clear all data</Button>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

// What kind of business this is (sets the words on screen), its name and currency.
function BusinessCard({ settings, mutate }) {
  const save = (values) => mutate((api) => api.saveSettings(values));
  return (
    <section className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Building2 className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">Business</h2>
      </div>
      <div className="grid gap-3 p-4 text-sm">
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Name</span>
          <InlineInput value={settings.name} placeholder="Your business" onCommit={(name) => save({ name })} className="border-input" />
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Kind</span>
          <Select value={settings.kind} onValueChange={(kind) => save({ kind })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(KINDS).map(([key, k]) => (
                <SelectItem key={key} value={key}>{k.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">
            {Object.values(KINDS[settings.kind]?.words ?? {}).map(([one]) => one).join(' · ')}
          </span>
        </label>
        <label className="grid gap-1">
          <span className="text-xs text-muted-foreground">Currency</span>
          <InlineInput value={settings.currency} onCommit={(currency) => currency.trim() && save({ currency })} className="w-24 border-input" />
        </label>
      </div>
    </section>
  );
}

function ListCard({ icon: Icon, title, items, usage, usageLabel, placeholder, onAdd, onRename, onDelete, leading, deletableWhenUsed }) {
  const [name, setName] = useState('');
  const add = async () => {
    if (!name.trim()) return;
    await onAdd(name.trim());
    setName('');
  };

  return (
    <section className="flex flex-col rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-medium">{title}</h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">{items.length}</span>
      </div>

      <div className="divide-y">
        {items.map((it) => {
          const n = usage(it.id);
          return (
            <div key={it.id} className="group flex items-center gap-2 px-3 py-1.5">
              {leading?.(it)}
              <InlineInput value={it.name} onCommit={(v) => v.trim() && onRename(it.id, v.trim())} className="flex-1" />
              <span className="shrink-0 text-xs text-muted-foreground">{n ? usageLabel(n) : 'Unused'}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-primary disabled:opacity-0"
                disabled={n > 0 && !deletableWhenUsed}
                title={n && !deletableWhenUsed ? 'In use — remove it where it is used first' : 'Delete'}
                onClick={() => onDelete(it.id)}
              >
                <Trash2 />
              </Button>
            </div>
          );
        })}
        {items.length === 0 && <p className="px-4 py-3 text-xs text-muted-foreground">Nothing yet.</p>}
      </div>

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <Input className="h-8" placeholder={placeholder} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" size="sm" variant="outline" disabled={!name.trim()}>
          <Plus /> Add
        </Button>
      </form>
    </section>
  );
}
