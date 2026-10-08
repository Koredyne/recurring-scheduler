import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GYM, KINDS, vocabFor } from '../src/lib/vocab.js';
import { planLabel } from '../src/lib/plans.js';

describe('vocabulary', () => {
  it('defaults to a gym priced in KD', () => {
    assert.equal(GYM.Coach, 'Coach');
    assert.equal(GYM.classes, 'classes');
    assert.equal(GYM.money(45), '45 KD');
  });
  it('switches every word with the kind of business', () => {
    const v = vocabFor({ kind: 'clinic', currency: 'EUR' });
    assert.equal(v.Coaches, 'Practitioners');
    assert.equal(v.members, 'patients');
    assert.equal(v.oneOff, 'one-time session');
    assert.equal(v.n(1, 'class'), '1 session');
    assert.equal(v.n(3, 'package'), '3 programmes');
    assert.equal(v.money(47.5), '47.5 EUR');
  });
  it('picks a or an', () => {
    assert.equal(vocabFor({ kind: 'gym' }).a('activity'), 'an activity');
    assert.equal(vocabFor({ kind: 'clinic' }).a('activity'), 'a service');
  });
  it('falls back to the gym words for an unknown kind', () => {
    assert.equal(vocabFor({ kind: 'nope' }).coach, 'coach');
  });
  it('has the same keys for every kind', () => {
    const keys = Object.keys(KINDS.gym.words).sort();
    for (const k of Object.values(KINDS)) assert.deepEqual(Object.keys(k.words).sort(), keys);
  });
  it('labels plans in the business words and currency', () => {
    const v = vocabFor({ kind: 'office', currency: 'USD' });
    assert.equal(planLabel({ classes_per_month: 8, months: 1, price: 120 }, v), '8 meetings a month · 1 month · 120 USD');
  });
});
