"use client";

import { useState } from "react";

type IntervalId = "monthly" | "quarterly" | "six_month" | "annual";

const intervals = [
  { id: "monthly", label: "1 month plan", months: 1, saving: "Flexible monthly billing", totals: { basic: 10, standard: 15 } },
  { id: "quarterly", label: "Quarterly plan", months: 3, saving: "Save about 7%", totals: { basic: 28, standard: 42 } },
  { id: "six_month", label: "6 month plan", months: 6, saving: "Save 10%", totals: { basic: 54, standard: 81 } },
  { id: "annual", label: "1 year plan", months: 12, saving: "Save 20%", totals: { basic: 96, standard: 144 } },
] as const;

const plans = [
  {
    id: "free",
    name: "Free",
    description: "Try the core workflow and organise a small job search.",
    allowance: 2,
    features: [
      [true, "Track up to 3 applications"],
      [true, "Create up to 2 Master CVs"],
      [true, "CV extraction at no user credit"],
      [false, "Professional Word and PDF CV formats"],
      [false, "Reminders and calendar downloads"],
      [false, "Excel application-list export"],
    ],
  },
  {
    id: "basic",
    name: "Basic",
    description: "For a focused search across several active roles.",
    allowance: 10,
    features: [
      [true, "Track up to 10 applications"],
      [true, "Create up to 5 Master CVs"],
      [true, "CV extraction at no user credit"],
      [true, "Professional Word and PDF CV formats"],
      [true, "Reminders and calendar downloads"],
      [true, "Excel application-list export"],
    ],
  },
  {
    id: "standard",
    name: "Standard",
    description: "For an active, multi-role search without tracking limits.",
    allowance: 20,
    features: [
      [true, "Unlimited application tracking"],
      [true, "Unlimited Master CVs"],
      [true, "CV extraction at no user credit"],
      [true, "Professional Word and PDF CV formats"],
      [true, "Reminders and calendar downloads"],
      [true, "Excel application-list export"],
    ],
  },
] as const;

function cad(value: number) {
  return `CA$${value.toFixed(2)}`;
}

function renewalText(months: number, total: number) {
  if (months === 1) return `Renews at ${cad(total)}/month.`;
  if (months === 12) return `Renews at ${cad(total)} every year.`;
  return `Renews at ${cad(total)} every ${months} months.`;
}

export default function PublicPricing({ ctaHref, signedIn }: { ctaHref: string; signedIn: boolean }) {
  const [selectedInterval, setSelectedInterval] = useState<IntervalId>("monthly");
  const interval = intervals.find((item) => item.id === selectedInterval) ?? intervals[0];

  return <section id="pricing" className="landing-pricing">
    <div className="pricing-section-head">
      <div><p className="eyebrow">SIMPLE PRICING · CAD</p><h2>Choose a plan for your application pace.</h2><p>Compare every feature, then choose how often you want to pay. Included AI generations refresh monthly on every billing option.</p></div>
      <label className="billing-frequency-select"><span>Billing frequency</span><select value={selectedInterval} onChange={(event) => setSelectedInterval(event.target.value as IntervalId)} aria-label="Billing frequency">{intervals.map((option) => <option value={option.id} key={option.id}>{option.label}{option.id === "monthly" ? "" : ` · ${option.saving}`}</option>)}</select></label>
    </div>
    <div className="landing-pricing-grid pricing-comparison-grid">
      {plans.map((plan) => {
        const paid = plan.id !== "free";
        const total = paid ? interval.totals[plan.id] : 0;
        const monthly = paid ? total / interval.months : 0;
        return <article className={`pricing-plan ${plan.id === "standard" ? "featured" : ""}`} key={plan.id}>
          <div className="pricing-plan-title"><span>{plan.name}</span>{plan.id === "standard" && <em>{selectedInterval === "annual" ? "BEST VALUE" : "POPULAR"}</em>}</div>
          <p className="pricing-plan-description">{plan.description}</p>
          <strong className="pricing-plan-price">{paid ? cad(monthly) : "CA$0.00"}<small>{paid ? "/mo" : " forever"}</small></strong>
          <a className="pricing-plan-cta" href={ctaHref}>{signedIn ? plan.id === "free" ? "Manage current plan" : `Choose ${plan.name}` : plan.id === "free" ? "Start free" : `Choose ${plan.name}`}</a>
          <p className="pricing-plan-renewal">{paid ? renewalText(interval.months, total) : "No card required."}</p>
          <div className="pricing-plan-divider" />
          <h3>What’s included</h3>
          <ul><li className="included"><span>✓</span>{plan.allowance} AI generations each month</li>{plan.features.map(([included, feature]) => <li className={included ? "included" : "not-included"} key={feature}><span>{included ? "✓" : "—"}</span>{feature}</li>)}</ul>
        </article>;
      })}
    </div>
    <p className="landing-billing-note">Longer plans are paid upfront. Included AI generations refresh monthly and do not roll over.</p>
    <p className="landing-credit-note">Need more? Buy additional AI credits for $1.50 CAD each. Prices exclude applicable taxes. The current public checkout is a no-charge sandbox while billing is tested.</p>
  </section>;
}
