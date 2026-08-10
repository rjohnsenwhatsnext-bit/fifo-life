export type TravelBudget = Record<string, number>;

export type Period = 'week' | 'month';

// A leg of the trip: drive somewhere, stay a while, drive on.
//
// Distance can be looked up or typed, because somebody who has done the drive
// knows it better than a routing engine and should not have to argue with one.
export type Leg = {
  id: string;
  from: string;
  to: string;
  km: number;
  nights: number;
  nightly: number;      // what a night costs where you are stopping
  note?: string;
  // Filled in by the distance lookup, so the map can draw the actual road
  // rather than a straight line between two dots.
  fromAt?: [number, number];
  toAt?: [number, number];
  line?: [number, number][];
  // A national park camp is priced by a published rule rather than by whatever
  // the site charges, so it does not need a price typed against it.
  nationalPark?: boolean;

  // What diesel actually costs on this leg, taken from the servos reporting
  // within reach of the road, and how many of them there were.
  //
  // A single typed price for a whole lap is the biggest quiet error in this
  // tool. On Brisbane to Cairns the servos on the road run from $1.80 to $2.96
  // and sit at $2.50 in the middle, against a default of $2.30. Twenty cents a
  // litre over forty thousand kilometres of towing is about fourteen hundred
  // dollars, which is a month of sitting still.
  //
  // Filled in by the map, never typed. A leg with nothing here falls back to
  // the trip wide price, which is what happens off the reporting states.
  boardPrice?: number;
  boardCount?: number;
};

// Four weeks is not a month. 52 divided by 12 is 4.333, and using 4 understates
// a year of spending by a month of it. This is the only place that number
// lives.
export const WEEKS_PER_MONTH = 52 / 12;

export const toMonthly = (value: number, period: Period) =>
  period === 'week' ? value * WEEKS_PER_MONTH : value;

export const toWeekly = (value: number, period: Period) =>
  period === 'week' ? value : value / WEEKS_PER_MONTH;

// Moving between weekly and monthly entry must not change what somebody is
// actually planning to spend, so the numbers are converted with the switch.
export function convertBudget(budget: TravelBudget, from: Period, to: Period): TravelBudget {
  if (from === to) return budget;
  const factor = to === 'week' ? 1 / WEEKS_PER_MONTH : WEEKS_PER_MONTH;
  return Object.fromEntries(Object.entries(budget).map(([k, v]) => [k, Math.round(v * factor)]));
}

// One number to start with.
//
// This used to be built up from a house sale, a mortgage payout, two vehicle
// loans and a pile of setup costs. All of that was answering a different
// question. What a trip actually needs to know is how much money there is when
// you pull out of the driveway, and how long it lasts.
export type PlanInputs = {
  startingMoney: number;
  duration: number;
  budget: TravelBudget; budgetPeriod: Period;
  /** What the tank holds. */
  tankLitres: number;
  /** Fraction of the tank you refuse to arrive on. 0.1 is a tenth. */
  fuelReserve?: number;
  dieselPrice: number; towingConsumption: number;
  kmPerMonth: number; kmPerTravelDay: number; travelDays: number;
  legs: Leg[]; useRoute: boolean;
  // Everybody five and over. Under fives camp free in Queensland parks, so
  // counting them would overstate the bill.
  party: number; npPerPerson: number; npFamilyCap: number;
};

// Weekly, because that is the unit a trip is actually lived in.
//
// A starting point for a family of four towing a van, not a recommendation.
// Every line is editable and the ones that matter most, sites and food, are the
// ones people's real numbers differ on the most. "Flights home" is here because
// a FIFO family almost always has one leg of the year that has to be flown, and
// a plan that forgets it is short by a couple of thousand dollars.
// The headings, and none of the numbers.
//
// These used to arrive filled in with somebody else's figures — $277 a week on
// food, $81 on servicing. Every one of them was a guess about a household this
// tool has never met, and a wrong guess is worse than a blank: it looks like an
// answer, so people leave it, and the plan is then built on numbers nobody
// chose. Worse on a phone, where clearing a filled number field to type your
// own is three fiddly taps. So the list gives the headings, which is the part
// that is genuinely hard to remember, and you put in what yours cost.
//
// No Fuel line, on purpose. Fuel is worked out from the fuel model — price a
// litre, what it drinks towing, how far and how many driving days — and
// monthlyBudget adds that on top of this list. A second Fuel field to type into
// meant the same money could be counted twice, and the only way to notice was
// to wonder why the runway looked short.
export const DEFAULT_BUDGET: TravelBudget = {
  'Food & groceries': 0, 'Caravan parks & camping': 0, 'Vehicle servicing & tyres': 0,
  'Caravan maintenance': 0, Insurance: 0, Registration: 0, 'Starlink & phone': 0,
  'Entertainment & activities': 0, 'Medical & unexpected': 0, Storage: 0, 'Flights home': 0,
  'Child & family costs': 0, Miscellaneous: 0,
};

export const defaults: PlanInputs = {
  startingMoney: 0,
  duration: 12,
  budget: DEFAULT_BUDGET, budgetPeriod: 'week', dieselPrice: 2.3, towingConsumption: 18,
  // A 4WD with a long range tank.
  tankLitres: 140, fuelReserve: 0.1,
  kmPerMonth: 577, kmPerTravelDay: 400, travelDays: 1, legs: [], useRoute: false,
  // Queensland Parks and Wildlife, published rate from 1 July 2026. Editable
  // because fees move and every state sets its own, and a number baked into
  // the code is a number that is quietly wrong two years from now.
  party: 4, npPerPerson: 7.75, npFamilyCap: 31,
};

export const aud = (value: number, compact = false) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' }).format(Number.isFinite(value) ? value : 0);
export const num = (value: number) => new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);

// Fuel, from how a trip is actually driven.
//
// Nobody tows 400 kilometres a day, seven days a week. You move, then you sit
// somewhere for a few days. So the distance is what a driving day looks like,
// and the other number is how many driving days there are in the period. Those
// two are things somebody can answer; kilometres a month is a number they would
// have to work out, and working it out is where it goes wrong.
export function kmPerPeriod(p: PlanInputs) {
  if (p.kmPerTravelDay == null || p.travelDays == null) return p.kmPerMonth ?? 0;
  return p.kmPerTravelDay * p.travelDays;
}

// A national park night, by the published rule.
//
// Per person, with a family cap: five people at 7.75 is 38.75, and the cap
// makes it 31. Getting that wrong overstates a lap around Queensland by
// hundreds, which is the sort of error that quietly changes a decision.
export function nationalParkNight(p: PlanInputs) {
  const party = Math.max(1, Number(p.party) || 1);
  const perPerson = Number(p.npPerPerson) || 0;
  const cap = Number(p.npFamilyCap) || 0;
  const full = party * perPerson;
  return cap > 0 ? Math.min(full, cap) : full;
}

export function nightlyFor(leg: Leg, p: PlanInputs) {
  return leg.nationalPark ? nationalParkNight(p) : (Number(leg.nightly) || 0);
}

/**
 * What a litre costs on this leg.
 *
 * The board price where there is one, the trip wide figure where there is not.
 * Not an average of the two and not a blend: a leg through Western Queensland
 * costs what Western Queensland costs, and averaging it against the coast is
 * how you arrive somewhere with less money than the plan said.
 */
export function priceOn(leg: Leg, p: PlanInputs) {
  const board = Number(leg.boardPrice);
  return Number.isFinite(board) && board > 0 ? board : p.dieselPrice;
}

/** Diesel for one leg, at that leg's price. */
export function legFuel(leg: Leg, p: PlanInputs) {
  return priceOn(leg, p) * (p.towingConsumption / 100) * (Number(leg.km) || 0);
}

export function routeTotals(p: PlanInputs) {
  const legs = p.legs ?? [];
  const km = legs.reduce((a, leg) => a + (Number(leg.km) || 0), 0);
  const nights = legs.reduce((a, leg) => a + (Number(leg.nights) || 0), 0);
  const stay = legs.reduce((a, leg) => a + (Number(leg.nights) || 0) * nightlyFor(leg, p), 0);
  // Summed leg by leg at each leg's own price, rather than one price times the
  // whole distance. Same arithmetic when nothing has been looked up; a very
  // different number once it has.
  const fuel = legs.reduce((a, leg) => a + legFuel(leg, p), 0);
  // A trip that is 40 nights long is 40 nights long, however many months the
  // plan runs for. Spreading it over the whole duration would understate what
  // the road actually costs while you are on it.
  const weeks = Math.max(nights / 7, 1 / 7);
  // The price the road is actually costing, weighted by distance rather than by
  // leg count: a nine hundred kilometre leg through the dear country matters
  // more than a fifty kilometre one through the cheap.
  const pricedKm = legs
    .filter((leg) => Number(leg.boardPrice) > 0)
    .reduce((a, leg) => a + (Number(leg.km) || 0), 0);
  const roadPrice = roadPriceOf(p);

  return {
    legs: legs.length, km, nights, stay, fuel,
    roadPrice, pricedKm,
    total: stay + fuel,
    perWeek: (stay + fuel) / weeks,
    perNight: nights ? (stay + fuel) / nights : 0,
  };
}

/**
 * The price the ongoing budget is worked out at.
 *
 * The legs know what diesel costs on the roads they run down. The monthly
 * budget did not, and went on using the typed figure, so the number people
 * actually look at never moved when the legs were priced. That was half a
 * feature: the route summary told the truth and the budget quietly did not.
 *
 * Distance weighted, because a nine hundred kilometre leg through the dear
 * country should count for more than a fifty kilometre one through the cheap.
 */
export function roadPriceOf(p: PlanInputs): number | null {
  const legs = (p.legs ?? []).filter((leg) => Number(leg.boardPrice) > 0 && Number(leg.km) > 0);
  const km = legs.reduce((a, leg) => a + Number(leg.km), 0);
  if (!km) return null;
  return legs.reduce((a, leg) => a + Number(leg.boardPrice) * Number(leg.km), 0) / km;
}

/** What a litre costs for budgeting: the road if it is known, the typed figure otherwise. */
export function budgetPrice(p: PlanInputs) {
  return roadPriceOf(p) ?? p.dieselPrice;
}

export function fuelCost(p: PlanInputs) {
  const perPeriod = budgetPrice(p) * (p.towingConsumption / 100) * kmPerPeriod(p);
  return toMonthly(perPeriod, p.budgetPeriod ?? 'month');
}

export function weeklyFuelCost(p: PlanInputs) {
  return toWeekly(fuelCost(p), 'month');
}

// Everything downstream works in months. This is the one place the weekly
// numbers become monthly ones.
export function budgetTotal(p: PlanInputs) {
  // Plans saved before fuel moved out still carry a Fuel line. Dropping it
  // here means an old plan reopens with the same total it had, rather than
  // quietly counting its fuel twice.
  return Object.entries(p.budget)
    .filter(([key]) => key.trim().toLowerCase() !== 'fuel')
    .reduce((sum, [, value]) => sum + value, 0);
}

export function monthlyBudget(p: PlanInputs) {
  return toMonthly(budgetTotal(p), p.budgetPeriod ?? 'month') + fuelCost(p);
}

export function weeklyBudget(p: PlanInputs) {
  return toWeekly(monthlyBudget(p), 'month');
}

// How long the money lasts, in months, with nothing coming in.
//
// No income side any more. If something is earned on the road it lengthens
// this, and guessing at how much was the least reliable part of the old plan.
export function runwayMonths(p: PlanInputs) {
  const burn = monthlyBudget(p);
  return burn > 0 ? p.startingMoney / burn : 0;
}

/**
 * What is left after a given number of months.
 *
 * Straight arithmetic rather than reading a row out of the projection, so it
 * answers for five weeks as readily as for two years. The projection is a
 * straight line anyway; indexing it only ever worked for whole months.
 */
export function moneyAfter(p: PlanInputs, months: number) {
  return p.startingMoney - monthlyBudget(p) * months;
}

export function buildProjection(p: PlanInputs, months = 60) {
  const burn = monthlyBudget(p);
  let cash = p.startingMoney;
  const rows = [] as { month: number; cash: number; spent: number }[];
  for (let m = 1; m <= months; m++) {
    cash -= burn;
    rows.push({ month: m, cash, spent: burn * m });
  }
  return rows;
}

// ── Where you have to stop for fuel ─────────────────────────────────────────
//
// The bit of a lap that catches people out is not the total spend, it is the
// three hundred kilometre stretch with nothing on it. A tank size and a
// consumption figure answer that exactly, and the planner already knows both.

export type FuelStop = {
  legId: string;
  /** The town you fill in: wherever you are when the tank will not reach. */
  at: string;
  atPoint?: [number, number];
  /** Kilometres done since the last fill by the time you get there. */
  sinceFill: number;
  /** What it takes to put back in. */
  litres: number;
  /** True when the leg is longer than a full tank, so a fill mid-leg is needed. */
  midLeg: boolean;
  /** Which leg it comes before. */
  legLabel: string;
};

/** How far a full tank goes towing. */
/** What the tank does on paper: every litre burnt, arriving on nothing. */
export function fullTankRange(p: PlanInputs) {
  return p.towingConsumption > 0 ? (p.tankLitres ?? 0) / (p.towingConsumption / 100) : 0;
}

/**
 * The range worth planning against.
 *
 * The tank's paper range minus the bit you have decided not to use. Everything
 * that decides where you have to fill runs off this rather than the full tank,
 * because the full tank is a number that assumes no headwind, no detour, no
 * hill, no closed servo and no queue, and the day all five of those are true is
 * the day it matters.
 */
export function tankRange(p: PlanInputs) {
  const keep = Number(p.fuelReserve);
  const reserve = Number.isFinite(keep) ? Math.min(Math.max(keep, 0), 0.5) : 0.1;
  return fullTankRange(p) * (1 - reserve);
}

export function fuelPlan(p: PlanInputs) {
  const range = tankRange(p);
  const stops: FuelStop[] = [];
  const legs = (p.legs ?? []).filter((l) => l.km > 0);
  let sinceFill = 0;

  for (const leg of legs) {
    const label = `${leg.from || 'here'} to ${leg.to || 'the next stop'}`;
    // Longer than a full tank on its own: no amount of topping up first fixes
    // it, so it is called out as a fill somewhere along the way.
    if (range > 0 && leg.km > range) {
      stops.push({
        legId: leg.id, at: leg.from || 'before you set off', atPoint: leg.fromAt,
        sinceFill, litres: Math.round(sinceFill * (p.towingConsumption / 100)),
        midLeg: true, legLabel: label,
      });
      sinceFill = leg.km % Math.max(range, 1);
      continue;
    }
    if (range > 0 && sinceFill + leg.km > range) {
      stops.push({
        legId: leg.id, at: leg.from || 'before you set off', atPoint: leg.fromAt,
        sinceFill, litres: Math.round(sinceFill * (p.towingConsumption / 100)),
        midLeg: false, legLabel: label,
      });
      sinceFill = 0;
    }
    sinceFill += leg.km;
  }

  return { range: Math.round(range), stops, sinceFill: Math.round(sinceFill) };
}
