import { addDays, addMonths } from './dates.js';
import { GYM } from './vocab.js';

// A plan says how a package is sold: classes a month, for how many months, and one price for all of them.
// Labels take the vocabulary `v` (lib/vocab.js) for the right words and currency; it defaults to a gym in KD.

export const money = (n, v = GYM) => v.money(n);
export const classesLabel = (p, v = GYM) => (p.classes_per_month ? v.n(p.classes_per_month, 'class') : 'Unlimited');
export const monthsLabel = (n) => `${n} month${Number(n) === 1 ? '' : 's'}`;
// "12 classes a month · 6 months · 280 KD"
export const planLabel = (p, v = GYM) =>
  p
    ? [p.label, `${classesLabel(p, v)} a month`, monthsLabel(p.months ?? 1), p.price != null && money(p.price, v)].filter(Boolean).join(' · ')
    : 'No plan';
// A plan once its length is already chosen: "Everyday · 12 classes a month · 280 KD".
export const offerLabel = (p, v = GYM) => [p.label, `${classesLabel(p, v)} a month`, p.price != null && money(p.price, v)].filter(Boolean).join(' · ');
// Presets for NumberChoice; anything else is typed in as a custom number.
export const classPresets = (v = GYM) => [['8', v.n(8, 'class')], ['12', v.n(12, 'class')], ['24', v.n(24, 'class')], ['', 'Unlimited']];
export const MONTH_PRESETS = [['1', '1 month'], ['2', '2 months'], ['3', '3 months'], ['6', '6 months'], ['12', '12 months']];
// Expiry (inclusive) for a subscription starting on `start` that lasts `months` months.
export const expiryFor = (start, months = 1) => addDays(addMonths(start, Number(months) || 1), -1);
export const plansOf = (state, pkgId) => state.plans.filter((p) => p.package_id === pkgId);
export const cheapest = (plans) => plans.reduce((min, p) => (p.price != null && (min == null || p.price < min) ? p.price : min), null);
