import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Dumbbell, Layers, LayoutGrid, Settings2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { api } from './lib/api.js';
import { todayStr } from './lib/dates.js';
import { DEMOS } from './lib/demos.js';
import { vocabFor } from './lib/vocab.js';
import { VocabContext } from './components/VocabContext.jsx';

const APP_NAME = 'Koredyne Schedule';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Calendar from './components/Calendar.jsx';
import OneOffDialog from './components/OneOffDialog.jsx';
import EntryDialog from './components/EntryDialog.jsx';
import SessionDialog from './components/SessionDialog.jsx';
import DayClassDialog from './components/DayClassDialog.jsx';
import { toMin } from './lib/dates.js';
import PackagesView from './components/PackagesView.jsx';
import SlotsView from './components/SlotsView.jsx';
import ClassesView from './components/ClassesView.jsx';
import ConfirmDialog from './components/ConfirmDialog.jsx';
import ConfigView from './components/ConfigView.jsx';
import MembersView from './components/MembersView.jsx';

// Ordered by how often they're used. Names are plain words, not system terms.
// Labels follow the business's words (vocab), e.g. "Members" or "Patients".
const TABS = [
  ['calendar', () => 'Schedule', CalendarDays],
  ['members', (v) => v.Members, Users],
  ['packages', (v) => v.Packages, Layers],
  ['classes', (v) => v.Classes, Dumbbell],
  ['slots', () => 'Rooms & times', LayoutGrid],
  ['config', () => 'Settings', Settings2],
];

export default function App() {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('calendar');
  const [viewDate, setViewDate] = useState(todayStr());
  const [dialog, setDialog] = useState(null);
  const [selectedPackage, setSelectedPackage] = useState(null);
  const [confirmData, setConfirmData] = useState(null); // 'reset' | 'clear'
  const [demo, setDemo] = useState('gym'); // which data set "Restore demo" loads

  // Run an API call, take the fresh state it returns, and surface errors as a toast.
  const mutate = useCallback(async (fn) => {
    try {
      const result = await fn(api);
      if (result?.state) setState(result.state);
      return result;
    } catch (e) {
      toast.error(e.message);
      api.state().then((r) => setState(r.state));
      throw e;
    }
  }, []);

  useEffect(() => {
    api.state().then((r) => setState(r.state));
  }, []);

  const v = useMemo(() => vocabFor(state?.settings), [state?.settings]);
  useEffect(() => {
    document.title = v.name ? `${v.name} · ${APP_NAME}` : APP_NAME;
  }, [v.name]);

  if (!state) return <div className="p-10 text-sm text-muted-foreground">Loading…</div>;

  const openPackage = (id) => {
    setSelectedPackage(id);
    setTab('packages');
    setDialog(null);
  };
  const goToDate = (date) => {
    setViewDate(date);
    setTab('calendar');
  };
  // Packages page: clicks change the package's weekly classes.
  const onCreate = (init) => setDialog({ type: 'create', init });
  const onOpenSession = (session, conflicts) =>
    setDialog(session.oneOff ? { type: 'oneoff', init: { oneOff: session.oneOff } } : { type: 'session', session, conflicts });
  // Schedule: clicks only ever affect that day. Empty space adds a one-time class (an empty
  // slot fills in its times); a weekly class opens its day dialog (cancel / move / swap coach).
  const onCreateDay = (init) => {
    const slot = init.slotId && state.slots.find((sl) => sl.id === init.slotId);
    setDialog({ type: 'oneoff', init: slot ? { ...init, start: toMin(slot.start_time), end: toMin(slot.end_time) } : init });
  };
  const onOpenDay = (session) => setDialog(session.oneOff ? { type: 'oneoff', init: { oneOff: session.oneOff } } : { type: 'day', session });

  return (
    <VocabContext.Provider value={v}>
    <TooltipProvider delayDuration={150}>
      <div className="flex h-screen flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-6 border-b bg-sidebar px-5">
          <span className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            <img src="/koredyne-icon.svg" alt="" className="h-5 brightness-0 invert" />
            <span className="font-heading text-base font-semibold tracking-tight">{APP_NAME}</span>
            {v.name && <span className="hidden max-w-48 truncate text-sm text-muted-foreground xl:inline">{v.name}</span>}
          </span>
          <nav className="flex h-full items-center gap-1 whitespace-nowrap">
            {TABS.map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'relative flex h-full items-center gap-2 px-3 text-sm text-muted-foreground transition-colors hover:text-foreground',
                  tab === key && 'text-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary',
                )}
              >
                <Icon className={cn('size-4', tab === key && 'text-primary')} />
                {label(v)}
              </button>
            ))}
          </nav>
          {state.playground && (
            <span
              className="ml-auto shrink-0 rounded-full border px-2.5 py-0.5 text-xs text-muted-foreground"
              title="This is your own copy: change anything, nobody else sees it. It resets after an hour away. Try the clinic or meeting-rooms demo in Settings."
            >
              Playground
            </span>
          )}
        </header>

        <main className="flex min-h-0 flex-1 flex-col">
          {tab === 'calendar' && (
            <Calendar state={state} mutate={mutate} viewDate={viewDate} setViewDate={setViewDate} onCreate={onCreateDay} onOpenSession={onOpenDay} />
          )}
          {tab === 'packages' && (
            <PackagesView
              state={state}
              mutate={mutate}
              selectedId={selectedPackage}
              setSelectedId={setSelectedPackage}
              goToDate={goToDate}
              onCreate={onCreate}
              onOpenSession={onOpenSession}
            />
          )}
          {tab === 'slots' && <SlotsView state={state} mutate={mutate} />}
          {tab === 'classes' && <ClassesView state={state} mutate={mutate} />}
          {tab === 'members' && (
            <MembersView
              state={state}
              mutate={mutate}
              onOpenPackage={openPackage}
              onOpenOneOff={(oneOff) => setDialog({ type: 'oneoff', init: { oneOff } })}
            />
          )}
          {tab === 'config' && <ConfigView state={state} mutate={mutate} onData={setConfirmData} />}
        </main>

        <footer className="flex h-8 shrink-0 items-center justify-center border-t text-xs text-muted-foreground">
          <a href="https://www.koredyne.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-foreground">
            Powered by
            <img src="/koredyne-logo.svg" alt="Koredyne" className="h-3.5 opacity-70 brightness-0 invert" />
          </a>
        </footer>
      </div>

      {dialog?.type === 'create' && <EntryDialog state={state} init={dialog.init} mutate={mutate} onClose={() => setDialog(null)} />}
      {dialog?.type === 'oneoff' && <OneOffDialog state={state} init={dialog.init} mutate={mutate} onClose={() => setDialog(null)} />}
      {dialog?.type === 'day' && (
        <DayClassDialog state={state} session={dialog.session} mutate={mutate} onClose={() => setDialog(null)} onOpenPackage={openPackage} />
      )}
      {dialog?.type === 'session' && (
        <SessionDialog
          state={state}
          session={dialog.session}
          conflicts={dialog.conflicts}
          mutate={mutate}
          onClose={() => setDialog(null)}
          onOpenPackage={openPackage}
          onEdit={onCreate}
        />
      )}
      <ConfirmDialog
        open={!!confirmData}
        title={confirmData === 'clear' ? 'Clear all data?' : 'Restore a demo?'}
        description={
          confirmData === 'clear'
            ? `Everything is deleted (${v.packages}, class times, ${v.classes}, ${v.coaches}, ${v.activities}, rooms and ${v.members}) so you can start from scratch. Your business settings are kept.`
            : 'Your current data is replaced with the demo you pick.'
        }
        confirmLabel={confirmData === 'clear' ? 'Clear everything' : 'Restore'}
        destructive
        onCancel={() => setConfirmData(null)}
        onConfirm={async () => {
          const action = confirmData;
          setConfirmData(null);
          await mutate((a) => (action === 'clear' ? a.clear() : a.reset(demo)));
          toast.success(action === 'clear' ? 'All data cleared' : `${DEMOS.find((d) => d.key === demo).title} restored`);
        }}
      >
        {confirmData === 'reset' && (
          <div className="grid gap-2">
            {DEMOS.map((d) => (
              <button
                key={d.key}
                onClick={() => setDemo(d.key)}
                className={cn(
                  'rounded-lg border px-3 py-2.5 text-left transition-colors hover:bg-accent/50',
                  demo === d.key && 'border-primary/70 bg-accent/40',
                )}
              >
                <div className="text-sm font-medium">{d.title}</div>
                <div className="text-xs text-muted-foreground">{d.description}</div>
              </button>
            ))}
          </div>
        )}
      </ConfirmDialog>
      <Toaster position="bottom-right" />
    </TooltipProvider>
    </VocabContext.Provider>
  );
}
