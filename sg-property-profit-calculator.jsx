import React, { useState, useMemo } from "react";
import { ArrowLeft, Printer, Home, TrendingUp, TrendingDown, Info, ChevronDown, ChevronUp, Sparkles } from "lucide-react";

/* ---------------------------------------------------------------
   Reference data — Singapore stamp duty schedules
--------------------------------------------------------------- */
const BSD_BANDS = [
  [180000, 0.01],
  [180000, 0.02],
  [640000, 0.03],
  [500000, 0.04],
  [1500000, 0.05],
  [Infinity, 0.06],
];

const ABSD_PROFILES = [
  { key: "sc1", label: "Singapore Citizen — 1st property", rate: 0 },
  { key: "sc2", label: "Singapore Citizen — 2nd property", rate: 0.2 },
  { key: "sc3", label: "Singapore Citizen — 3rd+ property", rate: 0.3 },
  { key: "pr1", label: "PR — 1st property", rate: 0.05 },
  { key: "pr2", label: "PR — 2nd property", rate: 0.3 },
  { key: "pr3", label: "PR — 3rd+ property", rate: 0.35 },
  { key: "fr", label: "Foreigner — any property", rate: 0.6 },
  { key: "en", label: "Entity", rate: 0.65 },
  { key: "none", label: "Not applicable / exempt", rate: 0 },
];

const BUC_STAGES = [
  { label: "Booking Fee (on OTP)", pct: 5 },
  { label: "Exercise of Option to Purchase", pct: 15 },
  { label: "Foundation Work", pct: 10 },
  { label: "Reinforced Concrete Framework", pct: 10 },
  { label: "Partition Walls", pct: 5 },
  { label: "Roofing / Ceiling", pct: 5 },
  { label: "Doors, Windows, Electrical & Plumbing", pct: 5 },
  { label: "Car Park, Roads & Drains", pct: 5 },
  { label: "Temporary Occupation Permit (TOP)", pct: 25 },
  { label: "Certificate of Statutory Completion (CSC)", pct: 15 },
];

/* ---------------------------------------------------------------
   Calculation helpers
--------------------------------------------------------------- */
function calcBSD(price) {
  let remaining = Number(price) || 0;
  let duty = 0;
  for (const [amt, rate] of BSD_BANDS) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, amt);
    duty += taxable * rate;
    remaining -= taxable;
  }
  return Math.round(duty);
}

function yearsBetween(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(d1);
  const b = new Date(d2);
  if (isNaN(a) || isNaN(b)) return null;
  return (b - a) / (1000 * 60 * 60 * 24 * 365.25);
}

function calcSSD(price, purchaseDate, saleDate) {
  const yrs = yearsBetween(purchaseDate, saleDate);
  if (yrs === null || yrs < 0) return { rate: 0, amount: 0, note: "Enter both dates to estimate" };
  const newRegime = new Date(purchaseDate) >= new Date("2025-07-04");
  let rate = 0;
  if (newRegime) {
    if (yrs < 1) rate = 0.16;
    else if (yrs < 2) rate = 0.12;
    else if (yrs < 3) rate = 0.08;
    else if (yrs < 4) rate = 0.04;
    else rate = 0;
  } else {
    if (yrs < 1) rate = 0.12;
    else if (yrs < 2) rate = 0.08;
    else if (yrs < 3) rate = 0.04;
    else rate = 0;
  }
  return {
    rate,
    amount: Math.round((Number(price) || 0) * rate),
    note: `${newRegime ? "4-yr regime (purchased on/after 4 Jul 2025)" : "3-yr regime (purchased before 4 Jul 2025)"} · held ${yrs.toFixed(1)} yrs`,
  };
}

function monthsBetween(d1, d2) {
  if (!d1 || !d2) return null;
  const a = new Date(d1);
  const b = new Date(d2);
  if (isNaN(a) || isNaN(b)) return null;
  let months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  months += (b.getDate() - a.getDate()) / 30;
  return months;
}

/** Standard amortizing mortgage: given principal, annual rate %, tenure (years)
 *  and months already held, returns the monthly instalment, remaining balance
 *  at that point, and total interest paid so far. */
function amortize(principal, annualRatePct, tenureYears, monthsHeldRaw) {
  const P = Number(principal) || 0;
  const n = Math.round((Number(tenureYears) || 0) * 12);
  if (P <= 0 || n <= 0) return { installment: 0, balance: P, interestPaid: 0, monthsHeld: 0 };
  const monthsHeld = Math.max(0, Math.min(Math.round(monthsHeldRaw || 0), n));
  const r = (Number(annualRatePct) || 0) / 100 / 12;

  let installment, balance;
  if (r === 0) {
    installment = P / n;
    balance = Math.max(P - installment * monthsHeld, 0);
  } else {
    installment = (P * r) / (1 - Math.pow(1 + r, -n));
    balance = Math.max(P * Math.pow(1 + r, monthsHeld) - installment * ((Math.pow(1 + r, monthsHeld) - 1) / r), 0);
  }
  const principalPaid = P - balance;
  const totalPaid = installment * monthsHeld;
  const interestPaid = Math.max(totalPaid - principalPaid, 0);
  return { installment, balance, interestPaid, monthsHeld };
}


const num = (v) => {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : n;
};

const fmt = (n) =>
  (Number(n) || 0).toLocaleString("en-SG", { style: "currency", currency: "SGD", maximumFractionDigits: 0 });

const fmtPct = (n, dp = 1) => `${(Number(n) || 0).toFixed(dp)}%`;

/* ---------------------------------------------------------------
   Small UI atoms
--------------------------------------------------------------- */
function Field({ label, value, onChange, prefix = "$", placeholder = "0", hint, type = "text" }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <div className="field-input-wrap">
        {prefix && <span className="field-prefix">{prefix}</span>}
        <input
          className="field-input"
          type={type}
          inputMode={type === "text" ? "decimal" : undefined}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

function Section({ title, eyebrow, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="section">
      <button className="section-head" onClick={() => setOpen((o) => !o)} type="button">
        <div>
          <div className="section-eyebrow">{eyebrow}</div>
          <div className="section-title">{title}</div>
        </div>
        {open ? <ChevronUp size={18} strokeWidth={1.75} /> : <ChevronDown size={18} strokeWidth={1.75} />}
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------
   Main component
--------------------------------------------------------------- */
export default function PropertyProfitCalculator() {
  const [view, setView] = useState("input"); // 'input' | 'present'

  const [deal, setDeal] = useState({
    propertyName: "",
    district: "",
    purchaseDate: "",
    saleDate: "",
    isBUC: false,
  });

  const [purchase, setPurchase] = useState({
    price: "",
    absdProfile: "none",
    bsdOverride: "",
    absdOverride: "",
    legalFeeBuy: "",
    renovation: "",
  });

  const [financing, setFinancing] = useState({
    loanDrawn: "",
    interestRate: "",
    tenureYears: "",
    outstandingOverride: "",
    interestPaidOverride: "",
    cpfPrincipal: "",
    cpfAccruedOverride: "",
  });

  const [holding, setHolding] = useState({
    rentCollected: "",
    propertyTax: "",
    maintenance: "",
    otherCosts: "",
  });

  const [sale, setSale] = useState({
    price: "",
    agentCommRate: "2",
    legalFeeSell: "",
    ssdOverride: "",
  });

  /* ------------------- derived numbers ------------------- */
  const bsdAuto = calcBSD(purchase.price);
  const bsd = purchase.bsdOverride !== "" ? num(purchase.bsdOverride) : bsdAuto;

  const absdProfile = ABSD_PROFILES.find((p) => p.key === purchase.absdProfile) || ABSD_PROFILES[8];
  const absdAuto = Math.round(num(purchase.price) * absdProfile.rate);
  const absd = purchase.absdOverride !== "" ? num(purchase.absdOverride) : absdAuto;

  const ssdCalc = calcSSD(sale.price, deal.purchaseDate, deal.saleDate);
  const ssd = sale.ssdOverride !== "" ? num(sale.ssdOverride) : ssdCalc.amount;

  const agentComm = Math.round((num(sale.agentCommRate) / 100) * num(sale.price));

  const holdingYears = useMemo(() => {
    const y = yearsBetween(deal.purchaseDate, deal.saleDate);
    return y && y > 0 ? y : null;
  }, [deal.purchaseDate, deal.saleDate]);

  const holdingMonths = useMemo(() => {
    const m = monthsBetween(deal.purchaseDate, deal.saleDate);
    return m && m > 0 ? m : 0;
  }, [deal.purchaseDate, deal.saleDate]);

  const amort = amortize(financing.loanDrawn, financing.interestRate, financing.tenureYears, holdingMonths);
  const outstandingLoanAuto = Math.round(amort.balance);
  const interestPaidAuto = Math.round(amort.interestPaid);

  const outstandingLoan = financing.outstandingOverride !== "" ? num(financing.outstandingOverride) : outstandingLoanAuto;
  const interestPaid = financing.interestPaidOverride !== "" ? num(financing.interestPaidOverride) : interestPaidAuto;

  const totalBuyingCosts = bsd + absd + num(purchase.legalFeeBuy);
  const totalPurchaseInvestment = num(purchase.price) + totalBuyingCosts + num(purchase.renovation);

  const cpfAccruedAuto =
    num(financing.cpfPrincipal) > 0 && holdingYears
      ? Math.round(num(financing.cpfPrincipal) * (Math.pow(1.025, holdingYears) - 1))
      : 0;
  const cpfAccrued = financing.cpfAccruedOverride !== "" ? num(financing.cpfAccruedOverride) : cpfAccruedAuto;
  const cpfRefundTotal = num(financing.cpfPrincipal) + cpfAccrued;

  const netHoldingCost =
    num(holding.propertyTax) +
    num(holding.maintenance) +
    interestPaid +
    cpfAccrued +
    num(holding.otherCosts) -
    num(holding.rentCollected);

  const totalCostOfOwnership = totalPurchaseInvestment + netHoldingCost;

  const totalSellingCosts = agentComm + num(sale.legalFeeSell) + ssd;
  const netSaleProceeds = num(sale.price) - totalSellingCosts;

  const actualProfit = netSaleProceeds - totalCostOfOwnership;

  const cashAtCompletion = num(sale.price) - totalSellingCosts - outstandingLoan - cpfRefundTotal;

  const cashInvested = totalCostOfOwnership - num(financing.loanDrawn);
  const hasLoanDrawn = num(financing.loanDrawn) > 0;

  const roiUnlevered = totalCostOfOwnership > 0 ? (actualProfit / totalCostOfOwnership) * 100 : 0;
  const roiLevered = hasLoanDrawn && cashInvested > 0 ? (actualProfit / cashInvested) * 100 : null;
  const roiForAnnualizing = roiLevered !== null ? roiLevered : roiUnlevered;
  const annualizedROI =
    holdingYears && holdingYears > 0
      ? (Math.pow(1 + actualProfit / (roiLevered !== null ? cashInvested : totalCostOfOwnership), 1 / holdingYears) - 1) * 100
      : null;

  const isProfit = actualProfit >= 0;

  /* ------------------- waterfall bars (presentation) ------------------- */
  const waterfallRows = [
    { label: "Selling Price", value: num(sale.price), type: "in" },
    { label: "Agent Commission", value: -agentComm, type: "out" },
    { label: "Legal Fee (Sale)", value: -num(sale.legalFeeSell), type: "out" },
    ssd > 0 ? { label: "Seller's Stamp Duty (SSD)", value: -ssd, type: "out" } : null,
    { label: "Purchase Price", value: -num(purchase.price), type: "out" },
    { label: "Buyer's Stamp Duty (BSD)", value: -bsd, type: "out" },
    absd > 0 ? { label: "Add'l Buyer's Stamp Duty (ABSD)", value: -absd, type: "out" } : null,
    num(purchase.legalFeeBuy) > 0 ? { label: "Legal Fee (Purchase)", value: -num(purchase.legalFeeBuy), type: "out" } : null,
    num(purchase.renovation) > 0 ? { label: "Renovation / Furniture & Fitting", value: -num(purchase.renovation), type: "out" } : null,
    num(holding.propertyTax) > 0 ? { label: "Property Tax Paid", value: -num(holding.propertyTax), type: "out" } : null,
    num(holding.maintenance) > 0 ? { label: "Maintenance Fees Paid", value: -num(holding.maintenance), type: "out" } : null,
    interestPaid > 0 ? { label: "Loan Interest Paid", value: -interestPaid, type: "out" } : null,
    cpfAccrued > 0 ? { label: "CPF Accrued Interest Payable", value: -cpfAccrued, type: "out" } : null,
    num(holding.otherCosts) > 0 ? { label: "Other Holding Costs", value: -num(holding.otherCosts), type: "out" } : null,
    num(holding.rentCollected) > 0 ? { label: "Rental Income Collected", value: num(holding.rentCollected), type: "in" } : null,
  ].filter(Boolean);

  const maxAbs = Math.max(...waterfallRows.map((r) => Math.abs(r.value)), Math.abs(actualProfit), 1);

  const canPresent = num(purchase.price) > 0 && num(sale.price) > 0;

  /* =================================================================
     PRESENTATION VIEW
  ================================================================= */
  if (view === "present") {
    return (
      <div className="deed-root">
        <style>{CSS}</style>
        <div className="no-print toolbar">
          <button className="btn ghost" onClick={() => setView("input")}>
            <ArrowLeft size={16} /> Back to worksheet
          </button>
          <button className="btn brass" onClick={() => window.print()}>
            <Printer size={16} /> Print / Save PDF
          </button>
        </div>

        <div className="deed">
          <header className="deed-header">
            <div className="deed-header-top">
              <span className="deed-kicker">Statement of Actual Profit</span>
              <span className="deed-kicker">Prepared for Client Review</span>
            </div>
            <h1 className="deed-title">{deal.propertyName || "Untitled Property"}</h1>
            <div className="deed-sub">
              {deal.district && <span>{deal.district}</span>}
              {deal.purchaseDate && (
                <span>
                  Purchased {new Date(deal.purchaseDate).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              {deal.saleDate && (
                <span>
                  Sold {new Date(deal.saleDate).toLocaleDateString("en-SG", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              )}
              {holdingYears && <span>Held {holdingYears.toFixed(1)} years</span>}
            </div>
            <div className="deed-rule" />
          </header>

          {/* HERO NUMBER */}
          <section className="hero">
            <div className="hero-label">{isProfit ? "Actual Profit" : "Actual Loss"}</div>
            <div className={`hero-number ${isProfit ? "pos" : "neg"}`}>
              {isProfit ? "+" : "–"}
              {fmt(Math.abs(actualProfit))}
            </div>
            <div className="hero-roi-row">
              <div className="hero-roi">
                <span className="hero-roi-num">{fmtPct(roiUnlevered)}</span>
                <span className="hero-roi-label">ROI on Total Investment</span>
              </div>
              {roiLevered !== null && (
                <div className="hero-roi">
                  <span className="hero-roi-num">{fmtPct(roiLevered)}</span>
                  <span className="hero-roi-label">ROI on Cash Invested</span>
                </div>
              )}
              {annualizedROI !== null && (
                <div className="hero-roi">
                  <span className="hero-roi-num">{fmtPct(annualizedROI)}</span>
                  <span className="hero-roi-label">Annualized (CAGR)</span>
                </div>
              )}
            </div>
          </section>

          {/* LEDGER TABLE */}
          <section className="ledger-grid">
            <div className="ledger-col">
              <div className="ledger-heading">Sale Proceeds</div>
              <Row label="Selling Price" value={num(sale.price)} />
              <Row label="Less: Agent Commission" value={-agentComm} />
              <Row label="Less: Legal / Conveyancing Fee" value={-num(sale.legalFeeSell)} />
              {ssd > 0 && <Row label="Less: Seller's Stamp Duty (SSD)" value={-ssd} sub={ssdCalc.note} />}
              <Row label="Net Sale Proceeds" value={netSaleProceeds} strong />
              <Row label="Less: Outstanding Loan Redeemed" value={-outstandingLoan} />
              {cpfRefundTotal > 0 && (
                <Row
                  label="Less: CPF Refund (Principal + Accrued Interest)"
                  value={-cpfRefundTotal}
                  sub={`Returned to CPF OA — not cash: principal ${fmt(num(financing.cpfPrincipal))} + accrued interest ${fmt(cpfAccrued)}`}
                />
              )}
              <Row label="Cash Received at Bank Account" value={cashAtCompletion} strong final />
            </div>

            <div className="ledger-col">
              <div className="ledger-heading">Total Cost of Ownership</div>
              <Row label="Purchase Price" value={num(purchase.price)} />
              <Row label="Buyer's Stamp Duty (BSD)" value={bsd} />
              {absd > 0 && <Row label="Add'l Buyer's Stamp Duty (ABSD)" value={absd} sub={absdProfile.label} />}
              <Row label="Legal / Conveyancing Fee" value={num(purchase.legalFeeBuy)} />
              <Row label="Renovation / Furniture & Fitting" value={num(purchase.renovation)} />
              <Row label="Property Tax (holding period)" value={num(holding.propertyTax)} />
              <Row label="Maintenance Fees (holding period)" value={num(holding.maintenance)} />
              <Row label="Loan Interest Paid" value={interestPaid} />
              {cpfAccrued > 0 && (
                <Row label="CPF Accrued Interest Payable" value={cpfAccrued} sub="Interest owed back to your own CPF OA, at 2.5% p.a." />
              )}
              {num(holding.otherCosts) > 0 && <Row label="Other Holding Costs" value={num(holding.otherCosts)} />}
              <Row label="Less: Rental Income Collected" value={-num(holding.rentCollected)} />
              <Row label="Total Cost of Ownership" value={totalCostOfOwnership} strong final />
            </div>
          </section>

          {/* WATERFALL */}
          <section className="waterfall">
            <div className="ledger-heading">How we got here</div>
            {waterfallRows.map((r, i) => (
              <div className="wf-row" key={i}>
                <div className="wf-label">{r.label}</div>
                <div className="wf-track">
                  <div
                    className={`wf-bar ${r.value >= 0 ? "in" : "out"}`}
                    style={{ width: `${(Math.abs(r.value) / maxAbs) * 100}%` }}
                  />
                </div>
                <div className={`wf-value ${r.value >= 0 ? "in" : "out"}`}>
                  {r.value >= 0 ? "+" : "–"}
                  {fmt(Math.abs(r.value))}
                </div>
              </div>
            ))}
            <div className="wf-row wf-total">
              <div className="wf-label">Actual {isProfit ? "Profit" : "Loss"}</div>
              <div className="wf-track">
                <div
                  className={`wf-bar ${isProfit ? "in" : "out"}`}
                  style={{ width: `${(Math.abs(actualProfit) / maxAbs) * 100}%` }}
                />
              </div>
              <div className={`wf-value ${isProfit ? "in" : "out"}`}>
                {isProfit ? "+" : "–"}
                {fmt(Math.abs(actualProfit))}
              </div>
            </div>
          </section>

          {deal.isBUC && (
            <section className="buc">
              <div className="ledger-heading">Progressive Payment Schedule (Building Under Construction)</div>
              <div className="buc-grid">
                {BUC_STAGES.map((s) => (
                  <div className="buc-item" key={s.label}>
                    <span className="buc-pct">{s.pct}%</span>
                    <span className="buc-label">{s.label}</span>
                    <span className="buc-amt">{fmt((s.pct / 100) * num(purchase.price))}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <footer className="deed-footer">
            <div className="deed-rule" />
            <p>
              This statement is an estimate prepared for discussion purposes based on figures provided and prevailing IRAS stamp
              duty schedules as at the date of preparation. Actual amounts payable (BSD, ABSD, SSD, legal, agent commission and
              bank redemption figures) should be confirmed with your conveyancing lawyer, bank and IRAS before completion.
            </p>
            <p className="deed-date">
              Prepared {new Date().toLocaleDateString("en-SG", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </footer>
        </div>
      </div>
    );
  }

  /* =================================================================
     INPUT / WORKSHEET VIEW
  ================================================================= */
  return (
    <div className="ledger-root">
      <style>{CSS}</style>

      <div className="topbar">
        <div className="brand">
          <Home size={18} strokeWidth={1.75} />
          <span>Actual Profit Worksheet</span>
        </div>
        <button className="btn brass" disabled={!canPresent} onClick={() => canPresent && setView("present")}>
          <Sparkles size={16} /> Present to Seller
        </button>
      </div>

      <div className="layout">
        <div className="form-col">
          <Section eyebrow="Deal" title="Property & Timeline">
            <div className="grid-2">
              <label className="field">
                <span className="field-label">Property Name</span>
                <input
                  className="field-input plain"
                  placeholder="e.g. Lucerne Grand #12-34"
                  value={deal.propertyName}
                  onChange={(e) => setDeal({ ...deal, propertyName: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">District</span>
                <input
                  className="field-input plain"
                  placeholder="e.g. District 22"
                  value={deal.district}
                  onChange={(e) => setDeal({ ...deal, district: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Purchase Date (OTP exercised)</span>
                <input
                  className="field-input plain"
                  type="date"
                  value={deal.purchaseDate}
                  onChange={(e) => setDeal({ ...deal, purchaseDate: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Sale Date</span>
                <input
                  className="field-input plain"
                  type="date"
                  value={deal.saleDate}
                  onChange={(e) => setDeal({ ...deal, saleDate: e.target.value })}
                />
              </label>
            </div>
            <label className="checkbox-row">
              <input type="checkbox" checked={deal.isBUC} onChange={(e) => setDeal({ ...deal, isBUC: e.target.checked })} />
              <span>Bought under Progressive Payment Scheme (Building Under Construction)</span>
            </label>
            {holdingYears && <div className="inline-note">Holding period: {holdingYears.toFixed(1)} years</div>}
          </Section>

          <Section eyebrow="Cost of Acquisition" title="Purchase Price & Buying Costs">
            <div className="grid-2">
              <Field label="Purchase Price" value={purchase.price} onChange={(v) => setPurchase({ ...purchase, price: v })} />
              <label className="field">
                <span className="field-label">Buyer Profile (for ABSD)</span>
                <select
                  className="field-input plain"
                  value={purchase.absdProfile}
                  onChange={(e) => setPurchase({ ...purchase, absdProfile: e.target.value, absdOverride: "" })}
                >
                  {ABSD_PROFILES.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>
              <Field
                label="Buyer's Stamp Duty (BSD)"
                value={purchase.bsdOverride}
                onChange={(v) => setPurchase({ ...purchase, bsdOverride: v })}
                placeholder={bsdAuto ? String(Math.round(bsdAuto)) : "0"}
                hint={`Auto-estimated: ${fmt(bsdAuto)}`}
              />
              <Field
                label="Add'l Buyer's Stamp Duty (ABSD)"
                value={purchase.absdOverride}
                onChange={(v) => setPurchase({ ...purchase, absdOverride: v })}
                placeholder={absdAuto ? String(Math.round(absdAuto)) : "0"}
                hint={`Auto-estimated: ${fmt(absdAuto)} (${fmtPct(absdProfile.rate * 100, 0)})`}
              />
              <Field
                label="Legal / Conveyancing Fee (Purchase)"
                value={purchase.legalFeeBuy}
                onChange={(v) => setPurchase({ ...purchase, legalFeeBuy: v })}
              />
              <Field
                label="Renovation / Furniture & Fitting"
                value={purchase.renovation}
                onChange={(v) => setPurchase({ ...purchase, renovation: v })}
              />
            </div>
            {deal.isBUC && purchase.price && (
              <div className="buc-preview">
                <div className="inline-note">Indicative progressive payment schedule</div>
                <div className="buc-grid compact">
                  {BUC_STAGES.map((s) => (
                    <div className="buc-item" key={s.label}>
                      <span className="buc-pct">{s.pct}%</span>
                      <span className="buc-label">{s.label}</span>
                      <span className="buc-amt">{fmt((s.pct / 100) * num(purchase.price))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Section>

          <Section eyebrow="Financing" title="Loan, Interest Rate & Tenure">
            <div className="grid-2">
              <Field
                label="Loan Amount Drawn at Purchase"
                value={financing.loanDrawn}
                onChange={(v) => setFinancing({ ...financing, loanDrawn: v })}
                hint="Principal borrowed — also enables ROI on cash invested"
              />
              <Field
                label="Interest Rate (% p.a.)"
                value={financing.interestRate}
                onChange={(v) => setFinancing({ ...financing, interestRate: v })}
                prefix="%"
              />
              <Field
                label="Loan Tenure (years)"
                value={financing.tenureYears}
                onChange={(v) => setFinancing({ ...financing, tenureYears: v })}
                prefix=""
              />
              <div className="field">
                <span className="field-label">Monthly Instalment (calculated)</span>
                <div className="calc-readout">{fmt(amort.installment)}</div>
              </div>
              <Field
                label="Outstanding Loan to Redeem at Sale"
                value={financing.outstandingOverride}
                onChange={(v) => setFinancing({ ...financing, outstandingOverride: v })}
                placeholder={outstandingLoanAuto ? String(outstandingLoanAuto) : "0"}
                hint={`Auto-calculated from rate & tenure over ${holdingMonths ? holdingMonths.toFixed(0) : 0} months held: ${fmt(outstandingLoanAuto)}`}
              />
              <Field
                label="Total Loan Interest Paid (holding period)"
                value={financing.interestPaidOverride}
                onChange={(v) => setFinancing({ ...financing, interestPaidOverride: v })}
                placeholder={interestPaidAuto ? String(interestPaidAuto) : "0"}
                hint={`Auto-calculated: ${fmt(interestPaidAuto)} — overwrite if you have the bank's exact figure`}
              />
              <Field
                label="CPF (OA) Principal Used on Property"
                value={financing.cpfPrincipal}
                onChange={(v) => setFinancing({ ...financing, cpfPrincipal: v })}
                hint="Downpayment + instalments paid via CPF"
              />
              <Field
                label="CPF Accrued Interest Payable"
                value={financing.cpfAccruedOverride}
                onChange={(v) => setFinancing({ ...financing, cpfAccruedOverride: v })}
                placeholder={cpfAccruedAuto ? String(cpfAccruedAuto) : "0"}
                hint={`Rough estimate at 2.5% p.a.: ${fmt(cpfAccruedAuto)} — use exact figure from your CPF statement if available`}
              />
            </div>
            {cpfRefundTotal > 0 && (
              <div className="inline-note">Total CPF refund due on sale: {fmt(cpfRefundTotal)} (returned to your CPF OA, not received as cash)</div>
            )}
            {financing.loanDrawn && (!financing.interestRate || !financing.tenureYears) && (
              <div className="inline-note warn">Enter interest rate and tenure to auto-calculate the loan breakdown, or fill in the outstanding loan and interest fields directly.</div>
            )}
          </Section>

          <Section eyebrow="Holding Period" title="Rental Income & Running Costs">
            <div className="grid-2">
              <Field
                label="Total Rental Income Collected"
                value={holding.rentCollected}
                onChange={(v) => setHolding({ ...holding, rentCollected: v })}
              />
              <Field
                label="Total Property Tax Paid"
                value={holding.propertyTax}
                onChange={(v) => setHolding({ ...holding, propertyTax: v })}
              />
              <Field
                label="Total Maintenance Fees Paid"
                value={holding.maintenance}
                onChange={(v) => setHolding({ ...holding, maintenance: v })}
              />
              <Field
                label="Other Holding Costs"
                value={holding.otherCosts}
                onChange={(v) => setHolding({ ...holding, otherCosts: v })}
                hint="Insurance, repairs, etc."
              />
            </div>
          </Section>

          <Section eyebrow="Disposal" title="Sale Price & Selling Costs">
            <div className="grid-2">
              <Field label="Selling Price" value={sale.price} onChange={(v) => setSale({ ...sale, price: v })} />
              <Field
                label="Agent Commission Rate"
                value={sale.agentCommRate}
                onChange={(v) => setSale({ ...sale, agentCommRate: v })}
                prefix="%"
                hint={`= ${fmt(agentComm)}`}
              />
              <Field
                label="Legal / Conveyancing Fee (Sale)"
                value={sale.legalFeeSell}
                onChange={(v) => setSale({ ...sale, legalFeeSell: v })}
              />
              <Field
                label="Seller's Stamp Duty (SSD)"
                value={sale.ssdOverride}
                onChange={(v) => setSale({ ...sale, ssdOverride: v })}
                placeholder={ssdCalc.amount ? String(ssdCalc.amount) : "0"}
                hint={`Auto-estimated: ${fmt(ssdCalc.amount)} — ${ssdCalc.note}`}
              />
            </div>
          </Section>
        </div>

        <div className="summary-col">
          <div className="summary-card">
            <div className="summary-label">
              <Info size={14} strokeWidth={1.75} /> Live Summary
            </div>
            <div className="summary-line">
              <span>Net Sale Proceeds</span>
              <b>{fmt(netSaleProceeds)}</b>
            </div>
            <div className="summary-line">
              <span>Total Cost of Ownership</span>
              <b>{fmt(totalCostOfOwnership)}</b>
            </div>
            <div className="summary-divider" />
            <div className="summary-hero">
              <span className="summary-hero-label">
                {isProfit ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                Actual {isProfit ? "Profit" : "Loss"}
              </span>
              <span className={`summary-hero-num ${isProfit ? "pos" : "neg"}`}>
                {isProfit ? "+" : "–"}
                {fmt(Math.abs(actualProfit))}
              </span>
            </div>
            <div className="summary-line">
              <span>ROI on Total Investment</span>
              <b>{fmtPct(roiUnlevered)}</b>
            </div>
            {roiLevered !== null && (
              <div className="summary-line">
                <span>ROI on Cash Invested</span>
                <b>{fmtPct(roiLevered)}</b>
              </div>
            )}
            {annualizedROI !== null && (
              <div className="summary-line">
                <span>Annualized (CAGR)</span>
                <b>{fmtPct(annualizedROI)}</b>
              </div>
            )}
            {cpfRefundTotal > 0 && (
              <div className="summary-line muted">
                <span>CPF Refund (to OA, not cash)</span>
                <b>{fmt(cpfRefundTotal)}</b>
              </div>
            )}
            <div className="summary-line muted">
              <span>Cash to Bank Account</span>
              <b>{fmt(cashAtCompletion)}</b>
            </div>
            <button className="btn brass full" disabled={!canPresent} onClick={() => canPresent && setView("present")}>
              <Sparkles size={16} /> Present to Seller
            </button>
            {!canPresent && <div className="summary-hint">Enter purchase price and selling price to continue</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub, strong, final }) {
  const neg = value < 0;
  return (
    <div className={`row ${strong ? "row-strong" : ""} ${final ? "row-final" : ""}`}>
      <div className="row-label">
        {label}
        {sub && <div className="row-sub">{sub}</div>}
      </div>
      <div className={`row-value ${neg ? "neg" : ""}`}>
        {neg ? "(" : ""}
        {fmt(Math.abs(value))}
        {neg ? ")" : ""}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------
   Styles
--------------------------------------------------------------- */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

* { box-sizing: border-box; }

.ledger-root {
  min-height: 100vh;
  background: #0F1720;
  background-image: radial-gradient(circle at 15% 0%, #16212E 0%, #0F1720 55%);
  color: #EDEAE0;
  font-family: 'Inter', sans-serif;
  padding-bottom: 60px;
}

.topbar {
  display: flex; align-items: center; justify-content: space-between;
  padding: 22px 28px; border-bottom: 1px solid #24313F;
  position: sticky; top: 0; background: rgba(15,23,32,0.92); backdrop-filter: blur(6px); z-index: 10;
}
.brand { display: flex; align-items: center; gap: 10px; font-family: 'Fraunces', serif; font-size: 19px; letter-spacing: 0.01em; color: #F3EFE3; }

.layout { display: grid; grid-template-columns: 1fr 340px; gap: 24px; max-width: 1180px; margin: 28px auto 0; padding: 0 28px; align-items: start; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }

.section { background: #161F2B; border: 1px solid #24313F; border-radius: 14px; margin-bottom: 16px; overflow: hidden; }
.section-head { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; background: none; border: none; color: #EDEAE0; cursor: pointer; text-align: left; }
.section-eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #C4993D; margin-bottom: 3px; }
.section-title { font-family: 'Fraunces', serif; font-size: 18px; color: #F3EFE3; }
.section-body { padding: 4px 20px 22px; }

.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 16px; }
@media (max-width: 560px) { .grid-2 { grid-template-columns: 1fr; } }

.field { display: flex; flex-direction: column; gap: 6px; }
.field-label { font-size: 12.5px; color: #8A97A8; font-weight: 500; }
.field-input-wrap { display: flex; align-items: center; background: #0F1720; border: 1px solid #2A3A4D; border-radius: 9px; padding: 0 12px; transition: border-color 0.15s; }
.field-input-wrap:focus-within { border-color: #C4993D; }
.field-prefix { color: #6B7A8C; font-family: 'IBM Plex Mono', monospace; font-size: 13px; margin-right: 4px; }
.field-input { flex: 1; background: none; border: none; outline: none; color: #EDEAE0; font-family: 'IBM Plex Mono', monospace; font-size: 14.5px; padding: 10px 0; min-width: 0; }
.field-input.plain { padding: 10px 12px; background: #0F1720; border: 1px solid #2A3A4D; border-radius: 9px; font-family: 'Inter', sans-serif; }
.field-input.plain:focus { outline: none; border-color: #C4993D; }
select.field-input.plain { appearance: none; cursor: pointer; }
.field-hint { font-size: 11px; color: #5C6A7A; }

.checkbox-row { display: flex; align-items: center; gap: 9px; margin-top: 14px; font-size: 13.5px; color: #C7CDD6; }
.checkbox-row input { accent-color: #C4993D; width: 15px; height: 15px; }

.inline-note { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; color: #C4993D; margin-top: 10px; letter-spacing: 0.02em; }
.inline-note.warn { color: #D9694F; }
.calc-readout { background: #0F1720; border: 1px solid #24313F; border-radius: 9px; padding: 10px 12px; font-family: 'IBM Plex Mono', monospace; font-size: 14.5px; color: #8A97A8; }

.buc-preview, .buc { margin-top: 16px; }
.buc-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px 16px; margin-top: 8px; }
.buc-grid.compact { grid-template-columns: 1fr; }
.buc-item { display: flex; align-items: baseline; gap: 10px; font-size: 12.5px; padding: 6px 0; border-bottom: 1px dashed #24313F; }
.buc-pct { font-family: 'IBM Plex Mono', monospace; color: #C4993D; width: 34px; flex-shrink: 0; }
.buc-label { flex: 1; color: #AEB8C4; }
.buc-amt { font-family: 'IBM Plex Mono', monospace; color: #EDEAE0; }

.btn { display: inline-flex; align-items: center; gap: 8px; padding: 11px 18px; border-radius: 9px; border: 1px solid #2A3A4D; background: #161F2B; color: #EDEAE0; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: all 0.15s; }
.btn:hover { border-color: #3A4C60; }
.btn.ghost { background: none; }
.btn.brass { background: linear-gradient(180deg, #D4AC5C, #B8863A); border-color: #B8863A; color: #241704; }
.btn.brass:hover { filter: brightness(1.06); }
.btn.brass:disabled { opacity: 0.4; cursor: not-allowed; filter: none; }
.btn.full { width: 100%; justify-content: center; margin-top: 18px; }

.summary-col { position: sticky; top: 90px; }
.summary-card { background: #161F2B; border: 1px solid #2A3A4D; border-radius: 16px; padding: 22px; }
.summary-label { display: flex; align-items: center; gap: 7px; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.13em; text-transform: uppercase; color: #6B7A8C; margin-bottom: 16px; }
.summary-line { display: flex; justify-content: space-between; align-items: baseline; padding: 7px 0; font-size: 13px; color: #AEB8C4; }
.summary-line b { font-family: 'IBM Plex Mono', monospace; color: #EDEAE0; font-weight: 500; font-size: 13.5px; }
.summary-line.muted { opacity: 0.65; }
.summary-divider { height: 1px; background: #24313F; margin: 10px 0; }
.summary-hero { display: flex; flex-direction: column; gap: 6px; padding: 14px 0 18px; }
.summary-hero-label { display: flex; align-items: center; gap: 7px; font-size: 12.5px; color: #8A97A8; }
.summary-hero-num { font-family: 'Fraunces', serif; font-size: 32px; font-weight: 600; }
.summary-hero-num.pos { color: #4CAF7D; }
.summary-hero-num.neg { color: #D9694F; }
.summary-hint { font-size: 11.5px; color: #6B7A8C; text-align: center; margin-top: 10px; }

/* ===================== PRESENTATION / DEED VIEW ===================== */
.deed-root { min-height: 100vh; background: #E9E3D2; padding: 0 0 60px; }
.toolbar { display: flex; justify-content: space-between; max-width: 860px; margin: 0 auto; padding: 20px 28px; }

.deed { max-width: 860px; margin: 0 auto; background: #F6F1E4; border: 1px solid #D9CFAF; box-shadow: 0 30px 60px -30px rgba(27,36,48,0.35); padding: 56px 60px 48px; color: #1B2430; font-family: 'Inter', sans-serif; }
@media (max-width: 640px) { .deed { padding: 36px 22px; } }

.deed-header-top { display: flex; justify-content: space-between; font-family: 'IBM Plex Mono', monospace; font-size: 10.5px; letter-spacing: 0.14em; text-transform: uppercase; color: #9C6B2E; }
.deed-title { font-family: 'Fraunces', serif; font-size: 40px; font-weight: 600; margin: 10px 0 8px; color: #1B2430; }
.deed-sub { display: flex; flex-wrap: wrap; gap: 4px 16px; font-size: 13px; color: #6B7360; }
.deed-rule { height: 1px; background: linear-gradient(90deg, #9C6B2E, transparent 70%); margin-top: 18px; }

.hero { text-align: center; padding: 40px 0 30px; }
.hero-label { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; color: #6B7360; }
.hero-number { font-family: 'Fraunces', serif; font-size: 64px; font-weight: 700; margin: 6px 0 22px; letter-spacing: -0.01em; }
.hero-number.pos { color: #2F6B4F; }
.hero-number.neg { color: #A8452F; }
.hero-roi-row { display: flex; justify-content: center; gap: 40px; flex-wrap: wrap; }
.hero-roi { display: flex; flex-direction: column; align-items: center; gap: 3px; }
.hero-roi-num { font-family: 'IBM Plex Mono', monospace; font-size: 22px; font-weight: 600; color: #1B2430; }
.hero-roi-label { font-size: 11px; color: #6B7360; }

.waterfall { margin: 20px 0 36px; }
.ledger-heading { font-family: 'IBM Plex Mono', monospace; font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: #9C6B2E; margin-bottom: 14px; border-bottom: 1px solid #D9CFAF; padding-bottom: 8px; }
.wf-row { display: grid; grid-template-columns: 210px 1fr 110px; align-items: center; gap: 12px; padding: 5px 0; }
.wf-label { font-size: 12.5px; color: #3E4A44; }
.wf-track { height: 8px; background: #E4DCC4; border-radius: 4px; overflow: hidden; }
.wf-bar { height: 100%; border-radius: 4px; }
.wf-bar.in { background: #2F6B4F; }
.wf-bar.out { background: #A8452F; }
.wf-value { font-family: 'IBM Plex Mono', monospace; font-size: 12.5px; text-align: right; }
.wf-value.in { color: #2F6B4F; }
.wf-value.out { color: #A8452F; }
.wf-total { margin-top: 10px; padding-top: 12px; border-top: 1px solid #D9CFAF; }
.wf-total .wf-label { font-weight: 700; }
.wf-total .wf-value { font-weight: 700; font-size: 14px; }

.ledger-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 40px; margin-bottom: 30px; }
@media (max-width: 640px) { .ledger-grid { grid-template-columns: 1fr; gap: 30px 0; } }

.row { display: flex; justify-content: space-between; gap: 14px; padding: 7px 0; border-bottom: 1px dashed #DED4B4; font-size: 13px; }
.row-label { color: #3E4A44; }
.row-sub { font-size: 10.5px; color: #8A8570; margin-top: 2px; }
.row-value { font-family: 'IBM Plex Mono', monospace; color: #1B2430; white-space: nowrap; }
.row-value.neg { color: #A8452F; }
.row-strong { border-bottom-style: solid; border-color: #9C6B2E; font-weight: 600; }
.row-strong .row-value { font-weight: 700; }
.row-final { border: none; margin-top: 4px; padding-top: 10px; }
.row-final .row-label, .row-final .row-value { font-family: 'Fraunces', serif; font-size: 17px; }

.buc { border-top: 1px solid #D9CFAF; padding-top: 24px; margin-top: 10px; }

.deed-footer { margin-top: 40px; }
.deed-footer p { font-size: 11px; color: #8A8570; line-height: 1.6; margin: 4px 0; }
.deed-date { font-family: 'IBM Plex Mono', monospace; margin-top: 10px !important; }

@media print {
  .no-print { display: none !important; }
  .deed-root { background: #fff; padding: 0; }
  .deed { box-shadow: none; border: none; max-width: 100%; }
}
`;
