export type TravelBudget = Record<string, number>;

export type PlanInputs = {
  houseSale: number; mortgage: number; tritonLoan: number; caravanLoan: number; assetSales: number;
  sellingCosts: number; legalCosts: number; movingCosts: number; tritonSetup: number; replacementVan: number;
  caravanSetup: number; travelSetup: number; repairReserve: number; landTarget: number; duration: number;
  budget: TravelBudget; dieselPrice: number; towingConsumption: number; kmPerMonth: number;
  systemsNewClients: number; systemsChurn: number; systemsSetupFee: number; systemsSubscription: number;
  systemsSupportCost: number; systemsSoftwareCost: number; systemsLabourCost: number; systemsInitialClients: number;
  recruitmentPlacements: number; recruitmentFee: number; recruitmentSuccess: number; recruitmentRefundRisk: number; recruitmentExpenses: number;
  youtubeRevenue: number; sponsorship: number; affiliate: number; podcastSponsor: number; productionCost: number; contentGrowth: number;
  landPrice: number; landDeposit: number; buyingCosts: number; loanTerm: number; landInterest: number; landIncome: number; desiredEmergency: number; landType: 'Vacant rural land' | 'Land with existing house' | 'Land first, build later';
  investmentType: string; investmentReturn: number; investmentTax: number; inflation: number; investmentYears: number;
  houseValue: number; homeInterest: number; homeRepayment: number; rates: number; homeInsurance: number; maintenance: number; propertyGrowth: number;
};

export const DEFAULT_BUDGET: TravelBudget = {
  Fuel: 0, 'Food & groceries': 1200, 'Caravan parks & camping': 1100, 'Vehicle servicing & tyres': 350,
  'Caravan maintenance': 250, Insurance: 380, Registration: 130, 'Starlink & phone': 220,
  'Entertainment & activities': 400, 'Medical & unexpected': 350, Storage: 120, 'Travel back to Mackay': 250,
  'Child & family costs': 500, Miscellaneous: 350,
};

export const defaults: PlanInputs = {
  houseSale: 750000, mortgage: 380000, tritonLoan: 22000, caravanLoan: 15000, assetSales: 25000,
  sellingCosts: 22000, legalCosts: 3000, movingCosts: 6000, tritonSetup: 15000, replacementVan: 50000,
  caravanSetup: 5000, travelSetup: 8000, repairReserve: 15000, landTarget: 200000, duration: 12,
  budget: DEFAULT_BUDGET, dieselPrice: 2.3, towingConsumption: 18, kmPerMonth: 2500,
  systemsNewClients: 1, systemsChurn: 3, systemsSetupFee: 1000, systemsSubscription: 250, systemsSupportCost: 20, systemsSoftwareCost: 25, systemsLabourCost: 45, systemsInitialClients: 2,
  recruitmentPlacements: 0.15, recruitmentFee: 14000, recruitmentSuccess: 70, recruitmentRefundRisk: 10, recruitmentExpenses: 500,
  youtubeRevenue: 0, sponsorship: 0, affiliate: 0, podcastSponsor: 0, productionCost: 300, contentGrowth: 5,
  landPrice: 700000, landDeposit: 200000, buyingCosts: 25000, loanTerm: 30, landInterest: 6.5, landIncome: 120000, desiredEmergency: 30000, landType: 'Vacant rural land',
  investmentType: 'High-interest savings', investmentReturn: 4.5, investmentTax: 32, inflation: 3, investmentYears: 2,
  houseValue: 750000, homeInterest: 6.2, homeRepayment: 2500, rates: 2800, homeInsurance: 2200, maintenance: 4500, propertyGrowth: 5,
};

export const aud = (value: number, compact = false) => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0, notation: compact ? 'compact' : 'standard' }).format(Number.isFinite(value) ? value : 0);
export const num = (value: number) => new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);

export function fuelCost(p: PlanInputs) { return p.dieselPrice * (p.towingConsumption / 100) * p.kmPerMonth; }
export function monthlyBudget(p: PlanInputs) { return Object.values(p.budget).reduce((a, b) => a + b, 0) + fuelCost(p); }
export function startingCapital(p: PlanInputs) { return p.houseSale + p.assetSales; }
export function afterDebts(p: PlanInputs) { return startingCapital(p) - p.sellingCosts - p.legalCosts - p.mortgage - p.tritonLoan - p.caravanLoan - p.movingCosts; }
export function afterSetup(p: PlanInputs) { return afterDebts(p) - p.tritonSetup - p.replacementVan - p.caravanSetup - p.travelSetup - p.repairReserve; }
export function systemsForMonth(p: PlanInputs, month: number) {
  let clients = p.systemsInitialClients;
  for (let i = 0; i < month; i++) clients = Math.max(0, clients * (1 - p.systemsChurn / 100) + p.systemsNewClients);
  const setup = p.systemsNewClients * p.systemsSetupFee;
  const recurring = clients * p.systemsSubscription;
  const costs = clients * (p.systemsSupportCost + p.systemsSoftwareCost + p.systemsLabourCost);
  return { clients, setup, recurring, costs, profit: setup + recurring - costs };
}
export function recruitmentProfit(p: PlanInputs) { return p.recruitmentPlacements * p.recruitmentFee * (p.recruitmentSuccess / 100) * (1 - p.recruitmentRefundRisk / 100) - p.recruitmentExpenses; }
export function contentProfit(p: PlanInputs, month: number) { const gross = (p.youtubeRevenue + p.sponsorship + p.affiliate + p.podcastSponsor) * Math.pow(1 + p.contentGrowth / 100, month); return gross - p.productionCost; }
export function buildProjection(p: PlanInputs, months = 60) {
  const initial = afterSetup(p); const burn = monthlyBudget(p); let cash = initial; const rows = [] as { month: number; cash: number; income: number; flow: number; clients: number; landFund: number }[];
  for (let m = 1; m <= months; m++) { const sys = systemsForMonth(p, m); const income = sys.profit + recruitmentProfit(p) + contentProfit(p, m); const flow = income - burn; cash += flow; rows.push({ month: m, cash, income, flow, clients: sys.clients, landFund: Math.max(0, Math.min(p.landTarget, cash)) }); }
  return rows;
}
export function monthlyLoanPayment(principal: number, annualRate: number, years: number) { const r = annualRate / 100 / 12; const n = years * 12; return r === 0 ? principal / n : principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1); }
export function landMetrics(p: PlanInputs, price = p.landPrice) { const deposit = Math.min(p.landDeposit, price); const loan = Math.max(0, price - deposit); const payment = monthlyLoanPayment(loan, p.landInterest, p.loanTerm); return { deposit, loan, payment, interest: payment * p.loanTerm * 12 - loan, lvr: loan / price * 100, cashLeft: afterSetup(p) - deposit - p.buyingCosts }; }
export function investmentMetrics(p: PlanInputs) { const rate = p.investmentReturn / 100; const gross = p.landTarget * Math.pow(1 + rate, p.investmentYears); const earned = gross - p.landTarget; const afterTax = p.landTarget + earned * (1 - p.investmentTax / 100); return { gross, afterTax, real: afterTax / Math.pow(1 + p.inflation / 100, p.investmentYears), earned }; }
export function homeBalance(p: PlanInputs, months: number) { let bal = p.mortgage; const r = p.homeInterest / 100 / 12; for (let i = 0; i < months; i++) bal = Math.max(0, bal * (1 + r) - p.homeRepayment); return bal; }

export const scenarios = [
  { name: 'Worst case', description: 'Income stays near zero; costs +15%; softer sale and repairs.', adjust: (p: PlanInputs) => ({ ...p, houseSale: p.houseSale - 50000, repairReserve: p.repairReserve + 15000, budget: Object.fromEntries(Object.entries(p.budget).map(([k,v]) => [k,v * 1.15])), systemsNewClients: 0, recruitmentPlacements: 0, contentGrowth: 0 }) },
  { name: 'Conservative', description: 'Small systems growth, occasional recruitment, controlled costs.', adjust: (p: PlanInputs) => ({ ...p, systemsNewClients: 0.5, recruitmentPlacements: 0.12, contentGrowth: 0 }) },
  { name: 'Target', description: 'Steady client signing, periodic placements and modest content revenue.', adjust: (p: PlanInputs) => ({ ...p, systemsNewClients: 2, recruitmentPlacements: 0.25, sponsorship: 500, contentGrowth: 8 }) },
  { name: 'Strong growth', description: 'Recurring systems revenue meets travel costs and growth compounds.', adjust: (p: PlanInputs) => ({ ...p, systemsNewClients: 4, recruitmentPlacements: 0.5, sponsorship: 1000, youtubeRevenue: 400, affiliate: 300, contentGrowth: 12 }) },
];
