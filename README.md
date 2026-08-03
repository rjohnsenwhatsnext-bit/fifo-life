# FIFO Life

## Family Freedom Planner

The interactive financial planning dashboard is at `/planner`. It compares a house sale, debt clearing, Australian travel budget, business income, and a protected future land fund.

Run it locally with `npm install` then `npm run dev`, and open `http://localhost:3000/planner`.

Key formulas are visible through live outputs: starting capital is sale proceeds plus asset sales; capital after setup deducts sale costs, payouts, moving, vehicle and caravan setup; fuel is price × towing litres/100km × monthly kilometres. Monthly cash flow is business profit less travel burn. FTG Systems client counts compound from new clients minus churn. Land repayments use a standard amortising loan formula. Investment estimates compound annually, apply tax to returns, then discount by inflation.

Saved scenarios use browser local storage. CSV export includes the month-by-month projection and Print / PDF uses the browser’s print dialogue. This is a planning tool, not personal financial advice.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
