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
  dieselPrice: number; towingConsumption: number;
  kmPerMonth: number; kmPerTravelDay: number; travelDays: number;
  legs: Leg[]; useRoute: boolean;
  // Everybody five and over. Under fives camp free in Queensland parks, so
  // counting them would overstate the bill.
  party: number; npPerPerson: number; npFamilyCap: number;
  tripWeeks: number; tripFuelAdjustment: number; tripGroceriesPerDay: number;
  tripAccommodationNight: number; tripAccommodationNights: number;
};

// Weekly, because that is the unit a trip is actually lived in.
//
// A starting point for a family of four towing a van, not a recommendation.
// Every line is editable and the ones that matter most, sites and food, are the
// ones people's real numbers differ on the most. "Flights home" is here because
// a FIFO family almost always has one leg of the year that has to be flown, and
// a plan that forgets it is short by a couple of thousand dollars.
export const DEFAULT_BUDGET: TravelBudget = {
  Fuel: 0, 'Food & groceries': 277, 'Caravan parks & camping': 254, 'Vehicle servicing & tyres': 81,
  'Caravan maintenance': 58, Insurance: 88, Registration: 30, 'Starlink & phone': 51,
  'Entertainment & activities': 92, 'Medical & unexpected': 81, Storage: 28, 'Flights home': 58,
  'Child & family costs': 115, Miscellaneous: 81,
};

export const defaults: PlanInputs = {
  startingMoney: 40000,
  duration: 12,
  budget: DEFAULT_BUDGET, budgetPeriod: 'week', dieselPrice: 2.3, towingConsumption: 18,
  kmPerMonth: 577, kmPerTravelDay: 400, travelDays: 1, legs: [], useRoute: false,
  // Queensland Parks and Wildlife, published rate from 1 July 2026. Editable
  // because fees move and every state sets its own, and a number baked into
  // the code is a number that is quietly wrong two years from now.
  party: 4, npPerPerson: 7.75, npFamilyCap: 31,
  tripWeeks: 3, tripFuelAdjustment: 0, tripGroceriesPerDay: 40, tripAccommodationNight: 45, tripAccommodationNights: 16,
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

export function routeTotals(p: PlanInputs) {
  const legs = p.legs ?? [];
  const km = legs.reduce((a, leg) => a + (Number(leg.km) || 0), 0);
  const nights = legs.reduce((a, leg) => a + (Number(leg.nights) || 0), 0);
  const stay = legs.reduce((a, leg) => a + (Number(leg.nights) || 0) * nightlyFor(leg, p), 0);
  const fuel = p.dieselPrice * (p.towingConsumption / 100) * km;
  // A trip that is 40 nights long is 40 nights long, however many months the
  // plan runs for. Spreading it over the whole duration would understate what
  // the road actually costs while you are on it.
  const weeks = Math.max(nights / 7, 1 / 7);
  return {
    legs: legs.length, km, nights, stay, fuel,
    total: stay + fuel,
    perWeek: (stay + fuel) / weeks,
    perNight: nights ? (stay + fuel) / nights : 0,
  };
}

export function fuelCost(p: PlanInputs) {
  const perPeriod = p.dieselPrice * (p.towingConsumption / 100) * kmPerPeriod(p);
  return toMonthly(perPeriod, p.budgetPeriod ?? 'month');
}

export function weeklyFuelCost(p: PlanInputs) {
  return toWeekly(fuelCost(p), 'month');
}

// Everything downstream works in months. This is the one place the weekly
// numbers become monthly ones.
export function budgetTotal(p: PlanInputs) {
  return Object.values(p.budget).reduce((a, b) => a + b, 0);
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
