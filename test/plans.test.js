import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MONTH_PRESETS, cheapest, classPresets, classesLabel, expiryFor, money, monthsLabel, offerLabel, planLabel } from '../src/lib/plans.js';

describe('plan labels', () => {
  it('shows classes a month, length and the total price', () => {
    assert.equal(planLabel({ classes_per_month: 12, months: 6, price: 280 }), '12 classes a month · 6 months · 280 KD');
  });
  it('puts the plan name first and says Unlimited for all classes', () => {
    assert.equal(planLabel({ label: 'Everyday', classes_per_month: null, months: 1, price: 80 }), 'Everyday · Unlimited a month · 1 month · 80 KD');
  });
  it('regression: a plan from before lengths existed reads as 1 month', () => {
    assert.equal(planLabel({ classes_per_month: 12, price: 55 }), '12 classes a month · 1 month · 55 KD');
  });
  it('leaves out a missing price, and says No plan for none', () => {
    assert.equal(planLabel({ classes_per_month: 8, months: 2, price: null }), '8 classes a month · 2 months');
    assert.equal(planLabel(null), 'No plan');
  });
  it('offerLabel leaves the length out (it was already picked)', () => {
    assert.equal(offerLabel({ classes_per_month: 12, months: 6, price: 280 }), '12 classes a month · 280 KD');
  });
  it('monthsLabel and classesLabel', () => {
    assert.equal(monthsLabel(1), '1 month');
    assert.equal(monthsLabel('10'), '10 months');
    assert.equal(classesLabel({ classes_per_month: 16 }), '16 classes');
    assert.equal(classesLabel({ classes_per_month: null }), 'Unlimited');
  });
  it('money keeps one decimal only when needed', () => {
    assert.equal(money(280), '280 KD');
    assert.equal(money(47.5), '47.5 KD');
  });
});

describe('expiryFor', () => {
  it('lasts the number of months, inclusive', () => {
    assert.equal(expiryFor('2026-10-07', 6), '2027-04-06');
    assert.equal(expiryFor('2026-11-01', '6'), '2027-04-30');
  });
  it('regression: defaults to one month, as subscriptions did before plan lengths', () => {
    assert.equal(expiryFor('2026-10-07'), '2026-11-06');
  });
  it('clamps to the end of a shorter month', () => {
    assert.equal(expiryFor('2026-01-31', 1), '2026-02-27');
  });
  it('treats a missing or bad length as one month', () => {
    assert.equal(expiryFor('2026-10-07', null), '2026-11-06');
    assert.equal(expiryFor('2026-10-07', 'x'), '2026-11-06');
  });
});

describe('presets and cheapest', () => {
  it('class presets include Unlimited as an empty value; month presets start at 1', () => {
    assert.deepEqual(classPresets().find(([v]) => v === ''), ['', 'Unlimited']);
    assert.equal(MONTH_PRESETS[0][0], '1');
  });
  it('regression: cheapest ignores plans without a price', () => {
    assert.equal(cheapest([{ price: null }, { price: 80 }, { price: 55 }]), 55);
    assert.equal(cheapest([]), null);
  });
});
