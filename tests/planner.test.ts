// Unit-test specifications for the core formulas. Run with a TypeScript-aware
// test runner (for example: `npx tsx --test tests/planner.test.ts`).
//
// Rewritten when the planner lost the house sale, the land fund and the
// business income. What is left is the arithmetic that actually decides a trip,
// and the two mistakes people make doing it by hand are the ones worth pinning
// down: a month is not four weeks, and a national park night is capped.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  defaults, fuelCost, monthlyBudget, weeklyBudget, runwayMonths, buildProjection,
  convertBudget, nationalParkNight, routeTotals, WEEKS_PER_MONTH, type Leg,
} from '../lib/planner';

test('fuel follows driving days rather than a flat distance', () => {
  // 400 km on a driving day, one driving day a week, 18 L/100km at $2.30.
  // 400 * 0.18 * 2.30 = 165.60 a week, and a month is 4.333 of those.
  assert.equal(Math.round(fuelCost(defaults)), 718);
});

test('a month is 4.33 weeks, not four', () => {
  assert.equal(WEEKS_PER_MONTH, 52 / 12);
  const monthly = monthlyBudget(defaults);
  const weekly = weeklyBudget(defaults);
  assert.ok(Math.abs(monthly - weekly * WEEKS_PER_MONTH) < 0.01);
  // The mistake this exists to prevent: using 4 understates a year by a month.
  assert.ok(monthly > weekly * 4);
});

test('switching between weekly and monthly entry does not change the plan', () => {
  const asMonthly = convertBudget(defaults.budget, 'week', 'month');
  const backToWeekly = convertBudget(asMonthly, 'month', 'week');
  const before = Object.values(defaults.budget).reduce((a, b) => a + b, 0);
  const after = Object.values(backToWeekly).reduce((a, b) => a + b, 0);
  // Rounded to whole dollars each way, so it lands within a dollar per line.
  assert.ok(Math.abs(before - after) <= Object.keys(defaults.budget).length);
});

test('runway is the money divided by the burn, and the projection agrees', () => {
  const months = runwayMonths(defaults);
  assert.ok(Math.abs(months - defaults.startingMoney / monthlyBudget(defaults)) < 1e-9);

  const rows = buildProjection(defaults, 60);
  assert.equal(rows.length, 60);
  // Cash runs down, never up: there is no income side any more.
  assert.ok(rows[0].cash > rows[1].cash);
  // The month the money crosses zero is the runway, rounded up.
  const brokeAt = rows.find(r => r.cash < 0)?.month;
  assert.equal(brokeAt, Math.ceil(months));
});

test('a national park night is per person and then capped', () => {
  // Four at 7.75 is 31.00, exactly the cap.
  assert.equal(nationalParkNight(defaults), 31);
  // Five would be 38.75, and the cap holds it at 31. Getting this wrong
  // overstates a lap of Queensland by hundreds.
  assert.equal(nationalParkNight({ ...defaults, party: 5 }), 31);
  // Two is under the cap and pays per head.
  assert.equal(nationalParkNight({ ...defaults, party: 2 }), 15.5);
});

test('a route costs its nights and its fuel, and prices a park by the rule', () => {
  const legs: Leg[] = [
    { id: '1', from: 'Mackay', to: 'Airlie Beach', km: 150, nights: 3, nightly: 45 },
    { id: '2', from: 'Airlie Beach', to: 'Bowen', km: 70, nights: 2, nightly: 0, nationalPark: true },
  ];
  const r = routeTotals({ ...defaults, legs });
  assert.equal(r.km, 220);
  assert.equal(r.nights, 5);
  // 3 nights at 45, plus 2 at the capped park rate of 31.
  assert.equal(r.stay, 3 * 45 + 2 * 31);
  assert.equal(Math.round(r.fuel), Math.round(220 * 0.18 * 2.3));
  // Spread over the nights actually away, not over the whole plan.
  assert.ok(Math.abs(r.perNight - r.total / 5) < 1e-9);
});
