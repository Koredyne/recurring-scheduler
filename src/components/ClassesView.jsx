import { useState } from 'react';
import { Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PageHeader from './PageHeader.jsx';
import { useVocab } from './VocabContext.jsx';

// A class is an activity + its coaches (one or more, running it together), picked from the lists managed in Config.
export default function ClassesView({ state, mutate }) {
  const v = useVocab();
  const [draft, setDraft] = useState({ activity_id: '', coach_ids: [] });

  const usage = (classId) => {
    const entries = state.entries.filter((e) => e.class_id === classId);
    const pkgs = new Set(entries.map((e) => e.package_id));
    return { entries: entries.length, packages: state.packages.filter((p) => pkgs.has(p.id)) };
  };
  const update = (id, patch) => mutate((api) => api.update('classes', id, patch));

  return (
    <>
      <PageHeader title={v.Classes}>
        <span className="text-sm text-muted-foreground">
          Each {v.class} is {v.a('activity')} with its {v.coaches}, e.g. {v.example.activity} with {v.example.coach}, or {v.example.coach} and an assistant. Add{' '}
          {v.coaches} and {v.activities} in Settings.
        </span>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-5">
        <div className="max-w-4xl rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-64">{v.Activity}</TableHead>
                <TableHead className="w-72">{v.Coaches}</TableHead>
                <TableHead>Used in</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.classes.map((c) => {
                const u = usage(c.id);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <ActivitySelect state={state} value={c.activity_id} onChange={(v) => update(c.id, { activity_id: v })} />
                    </TableCell>
                    <TableCell>
                      <CoachList state={state} value={c.coach_ids ?? [c.coach_id]} onChange={(ids) => update(c.id, { coach_ids: ids })} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.entries ? `${v.n(u.entries, 'class')} · ${u.packages.map((p) => p.name).join(', ')}` : 'Unused'}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={u.entries > 0}
                        title={u.entries ? `Used by ${v.packages}` : `Delete ${v.class}`}
                        onClick={() => mutate((api) => api.remove('classes', c.id))}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableCell>
                  <ActivitySelect state={state} value={draft.activity_id} onChange={(v) => setDraft({ ...draft, activity_id: v })} placeholder={v.Activity} />
                </TableCell>
                <TableCell>
                  <CoachList state={state} value={draft.coach_ids} onChange={(ids) => setDraft({ ...draft, coach_ids: ids })} />
                </TableCell>
                <TableCell colSpan={2}>
                  <Button
                    size="sm"
                    disabled={!draft.activity_id || !draft.coach_ids.length}
                    onClick={async () => {
                      await mutate((api) => api.create('classes', draft));
                      setDraft({ activity_id: '', coach_ids: [] });
                    }}
                  >
                    <Plus /> Add {v.class}
                  </Button>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}

function ActivitySelect({ state, value, onChange, placeholder }) {
  return (
    <Select value={value ? String(value) : ''} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger size="sm" className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {state.activities.map((a) => (
          <SelectItem key={a.id} value={String(a.id)}>
            <span className="size-2 rounded-full" style={{ background: a.color || '#888' }} />
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// The coaches of a class, one dropdown each: "Add coach" adds another, × removes one. The first is the main coach.
function CoachList({ state, value, onChange }) {
  const v = useVocab();
  const [adding, setAdding] = useState(false);
  const showAdd = adding || !value.length;
  return (
    <div className="flex flex-col gap-1">
      {value.map((id, i) => (
        <div key={id} className="flex items-center gap-1">
          <CoachSelect state={state} value={id} taken={value} onChange={(v) => onChange(value.map((x, j) => (j === i ? v : x)))} />
          {value.length > 1 ? (
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label={`Remove ${v.coach}`} title={`Remove ${v.coach}`} onClick={() => onChange(value.filter((_, j) => j !== i))}>
              <X />
            </Button>
          ) : (
            <Spacer />
          )}
        </div>
      ))}
      {showAdd && (
        <div className="flex items-center gap-1">
          <CoachSelect
            state={state}
            value=""
            taken={value}
            placeholder={value.length ? `Another ${v.coach}` : v.Coach}
            onChange={(v) => {
              onChange([...value, v]);
              setAdding(false);
            }}
          />
          {value.length > 0 ? (
            <Button variant="ghost" size="icon-sm" className="text-muted-foreground" aria-label="Cancel" title="Cancel" onClick={() => setAdding(false)}>
              <X />
            </Button>
          ) : (
            <Spacer />
          )}
        </div>
      )}
      {!showAdd && (
        <Button variant="ghost" size="xs" className="self-start text-muted-foreground" onClick={() => setAdding(true)}>
          <Plus /> Add {v.coach}
        </Button>
      )}
    </div>
  );
}

// Keeps the dropdowns lined up where a row has no × or + button.
const Spacer = () => <span className="size-7 shrink-0" />;

// One coach; coaches already on the class (`taken`) aren't offered again.
function CoachSelect({ state, value, taken = [], onChange, placeholder }) {
  return (
    <Select value={value ? String(value) : ''} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger size="sm" className="w-full min-w-0 flex-1"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>
        {state.coaches
          .filter((c) => c.id === value || !taken.includes(c.id))
          .map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
