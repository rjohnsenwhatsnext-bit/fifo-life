// Unit-test specifications for the core formulas. Run with a TypeScript-aware
// test runner (for example: `npx tsx --test tests/planner.test.ts`).
import test from 'node:test';
import assert from 'node:assert/strict';
import { afterSetup, defaults, fuelCost, landMetrics, monthlyLoanPayment, monthlyBudget, systemsForMonth } from '../lib/planner';

test('default sale position retains the land target before travel', () => {
  assert.equal(afterSetup(defaults), 234000);
});

test('fuel cost uses price, consumption and distance', () => {
  assert.equal(fuelCost(defaults), 1035);
  assert.equal(monthlyBudget(defaults), 6635);
});

test('systems clients grow after allowing for churn', () => {
  const monthOne = systemsForMonth(defaults, 1);
  assert.equal(monthOne.clients, 2.94);
});

test('land loan payment amortises a principal', () => {
  const payment = monthlyLoanPayment(500000, 6.5, 30);
  assert.ok(payment > 3000 && payment < 3500);
  const land = landMetrics(defaults, 700000);
  assert.equal(land.loan, 500000);
  assert.ok(land.lvr > 70 && land.lvr < 72);
});
