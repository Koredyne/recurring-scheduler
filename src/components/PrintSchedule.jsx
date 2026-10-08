import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer } from 'lucide-react';
import { DAYS, addDays, clock, fmtShort } from '../lib/dates.js';
import { indexState, resolveDate } from '../lib/schedule.js';
import { passes } from './ScheduleViews.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { useVocab } from './VocabContext.jsx';

// Week as printed: Saturday first.
const ORDER = [6, 0, 1, 2, 3, 4, 5];

// "Print" on the Schedule: a type-only timetable for the week on screen (with the current room /
// activity filters), one coloured table per activity — rows by start time, a column per open day,
// and who it's for in each cell. Printed through the browser, so "Save as PDF" works too.
export default function PrintSchedule({ state, weekStart, filters, colorOf }) {
  const v = useVocab();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(null); // null = the default title for this kind of business
  const [subtitle, setSubtitle] = useState('');
  const [showCoaches, setShowCoaches] = useState(false);

  const range = `${fmtShort(weekStart)} – ${fmtShort(addDays(weekStart, 6))}`;
  const tables = useMemo(() => buildTables(state, weekStart, filters, v), [state, weekStart, filters, v]);

  // Shrink the sheet to fit one A4 page. Browsers print at different sizes and may add their own
  // header/footer (Safari), so measure it at the printed width and leave room for those.
  const sheet = useRef(null);
  const fit = () => {
    const el = sheet.current;
    if (!el) return;
    el.style.zoom = '1';
    const room = (250 / 25.4) * 96; // 250 mm of the 297 mm page, in CSS pixels
    el.style.zoom = String(Math.min(1, room / el.scrollHeight));
  };
  useEffect(() => {
    window.addEventListener('beforeprint', fit); // also when printing with Cmd/Ctrl+P
    return () => window.removeEventListener('beforeprint', fit);
  }, []);

  const print = () => {
    setOpen(false);
    setTimeout(() => {
      fit();
      window.print();
    }, 150); // let the popover close first
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="text-muted-foreground">
            <Printer /> Print
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 space-y-3">
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Title</span>
            <Input value={title ?? v.printTitle} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <span className="text-xs text-muted-foreground">Line under the title</span>
            <Input placeholder={`Week of ${range}`} value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </div>
          <label className="flex items-center justify-between gap-2 text-sm">
            Show {v.coaches}
            <Switch checked={showCoaches} onCheckedChange={setShowCoaches} />
          </label>
          <p className="text-[11px] text-muted-foreground">
            Prints the week on screen ({range}) with your room and {v.activity} filters. Pick “Save as PDF” in the print window for a file.
          </p>
          <Button className="w-full" onClick={print} disabled={!tables.activities.length}>
            <Printer /> Print or save PDF
          </Button>
        </PopoverContent>
      </Popover>

      {createPortal(
        <div ref={sheet} className="print-sheet">
          <header className="mb-[4mm] flex items-end justify-between border-b-[2.5px] border-black pb-[2mm]">
            <h1 className="font-heading text-[26pt] leading-none font-bold tracking-tight uppercase">{title || v.printTitle}</h1>
            <div className="text-right text-[9pt] font-semibold tracking-wide uppercase">{subtitle || `Week of ${range}`}</div>
          </header>
          {tables.activities.map((t) => (
            <table key={t.activity} className="print-table" style={{ '--c': colorOf(t.activity) }}>
              <thead>
                <tr>
                  <th>{t.activity}</th>
                  {tables.days.map((d) => (
                    <th key={d}>{DAYS[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.rows.map((r) => (
                  <tr key={r.time}>
                    <td className="tabular-nums">{clock(r.time)}</td>
                    {tables.days.map((d) => (
                      <td key={d}>
                        {r.cells[d]?.length
                          ? r.cells[d].map((c, i) => (
                              <div key={i}>
                                <span className="font-bold uppercase">{c.label}</span>
                                {showCoaches && <span className="block text-[6.5pt] font-medium text-neutral-600">{c.coach}</span>}
                              </div>
                            ))
                          : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

// { days: weekdays with any class (Saturday first), activities: [{ activity, rows: [{ time, cells: { weekday: [{label, coach}] } }] }] }
function buildTables(state, weekStart, filters, v) {
  const idx = indexState(state);
  const byActivity = new Map();
  const openDays = new Set();
  for (let i = 0; i < 7; i++) {
    const seen = new Set();
    for (const s of resolveDate(state, addDays(weekStart, i), idx)) {
      if (s.cancelled || s.gap || !passes(s, filters)) continue;
      const k = `${s.slot.id}:${s.cls.id}`; // packages sharing a class print it once
      if (seen.has(k)) continue;
      seen.add(k);
      openDays.add(i);
      const a = s.cls.activity;
      if (!byActivity.has(a)) byActivity.set(a, new Map());
      const rows = byActivity.get(a);
      if (!rows.has(s.slot.start_time)) rows.set(s.slot.start_time, {});
      const cells = rows.get(s.slot.start_time);
      const label = (s.slot.label || s.oneOff?.label || v.Class).trim();
      const list = (cells[i] ||= []);
      const same = list.find((c) => c.label.toLowerCase() === label.toLowerCase());
      if (same) {
        if (!same.coach.includes(s.cls.coach)) same.coach += `, ${s.cls.coach}`;
      } else list.push({ label, coach: s.cls.coach });
    }
  }
  // Activities in the order classes were set up (as on screen), times in order.
  const order = [...new Set([...state.classes].sort((a, b) => a.id - b.id).map((c) => c.activity))];
  return {
    days: ORDER.filter((d) => openDays.has(d)),
    activities: [...byActivity.entries()]
      .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
      .map(([activity, rows]) => ({
        activity,
        rows: [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([time, cells]) => ({ time, cells })),
      })),
  };
}
