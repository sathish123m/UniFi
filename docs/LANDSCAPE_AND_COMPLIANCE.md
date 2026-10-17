# UniFi — Competitive Landscape & India Regulatory Compliance Analysis

**Date:** 2026-10-17
**Scope:** (1) Who else already does what UniFi does, and (2) exactly how UniFi's current code maps to India's P2P lending rules, with the code changes each path requires.

> ⚠️ This is an engineering + regulatory-research analysis, **not legal advice**. Before any public launch that moves real money, get Indian fintech counsel to confirm your position. Sources are listed in the appendix.

> ✅ **UPDATE 2026-10-17 — Path 2 (record-only trust ledger) has been implemented.**
> Following this analysis the codebase was refactored to remove money custody and
> interest entirely: the Razorpay/RazorpayX integration, escrow, payouts, platform
> fees and late fees are gone, and the loan lifecycle now uses **dual confirmation**
> (each peer attests the handover and the repayment). The "what it is today" table
> in §A.1 below describes the **pre-refactor** code and is kept for context. See
> `docs/PATH2_RECORD_ONLY_PLAN.md` for the change set. The NBFC-P2P analysis below
> remains the reason Path 2 was chosen rather than Path 1.

---

## 0. Verdict in one paragraph

There is **no single project that is 100% identical to UniFi**, but the concept is **not novel** and one half of it sits inside a **licensed, actively-enforced RBI category**. Everything UniFi does with money — peers funding peers, interest charged to the borrower, a share of that interest earned by the lender, escrow via a payment gateway, and payouts to lenders — is exactly what an **NBFC-P2P** (peer-to-peer lending platform) is, and in India a platform may only do that with an RBI **Certificate of Registration**. The "campus" wrapper (verified university emails, reputation score, student-to-student) is genuinely differentiated, but the campus wrapper is the *only* part that is unregulated. **The product as built is, functionally, a P2P lending platform serving a niche.**

---

## Part A — Competitive landscape

### A.1 What UniFi actually is (for comparison)

| Dimension | UniFi today |
|---|---|
| Participants | Students, verified by university email domain; one account can both borrow **and** fund (dual-role) |
| Money movement | Real money via Razorpay; provider pays in, borrower receives, borrower repays, provider is paid out |
| Pricing | `interest = principal × rate`; `platformFee = interest × fee%`; `providerEarning = interest − fee` (`backend/src/utils/loanCalc.js`) |
| Ticket size | ₹500–₹10,000 (`backend/src/services/loan.service.js`) |
| Tenure | 7 / 14 / 30 days (`Tenure` enum) |
| Trust | Platform credit score + tiers (`backend/src/services/credit.service.js`) |
| Compliance posture | No NBFC licence, no escrow account, no credit-bureau reporting |

### A.2 Closest projects

| # | Project | Category | Overlap | Gap vs UniFi |
|---|---|---|---|---|
| 1 | **Faircent, LenDenClub, i2iFunding, Lendbox, LiquiLoans, Finzy, RupeeCircle, IndiaP2P, Monexo** | India NBFC-P2P | The **mechanism is identical**: retail lenders → retail borrowers, real money, escrow, KYC, interest, repayments, lender payouts | Not campus-scoped; **RBI-licensed**; ~26 licensed, ~10–11 active, ~₹11,000 cr AUM (Jan 2025) |
| 2 | **Rupayya** | India social-credit lending | Social credit score + "College Batch Pod" community lending + P2P marketplace + KYC'd lenders | Site states app is **not live**; likely pre-launch |
| 3 | **Kontrak Social** | AU/NZ/PH/ZA/UK | Students lend/borrow money, digital contract, repayment tracking, "no drama" | Records debt; **no escrow money market, no interest capture** |
| 4 | **Floater, SoLo Funds, Lendwise, Lendapp** | US/UK P2P | Same motive — people/P2P funding people/students | Consumer or education loans; not campus-gated; some are prototypes |
| 5 | **PeerFund** (XRPL) | Hackathon build | Student P2P + credit reputation + lender payout architecture | Prototype; on-chain, not India-compliant |
| 6 | **StuCred, mPokket, Pocketly, PayCrunch, CASHe, KreditBee, BuddyLoan** | India student credit | College-student focus, no CIBIL needed, instant credit | **Lender→student**, not peer-to-peer; licensed NBFC/lending partner |
| 7 | **Udhar, TrustFirst** | Informal-lending tools | Borrower reputation score, repayment tracking, reminders | **No money custody, no interest, no escrow** — pure ledger |
| 8 | **RentPe, Pookpit, Nexlist, Borlo, Lendly, iWantIt, CampusTask, BorrowBox** | Campus marketplaces | Campus-email gating, trust score, escrow deposit, instant UPI payouts, admin panel — **UniFi's exact mechanics** | They move **items/tasks/rentals**, not money-as-loans |
| 9 | **"CampusLend"** (ICERECT 2025 paper) and a **July-2025 r/AppIdeas post** | Academic / idea stage | Peer/alumni micro-loans, trust score, co-guarantor, default ban — almost line-for-line UniFi | Research/idea, not a product |
| 10 | **Zopa, RateSetter, Funding Circle, LendingClub, Prosper** | Global P2P | Same model at scale | Largely wound down for retail investors post-2021; irrelevant to India |

### A.3 Reliability caveats

Some search hits are **AI-generated SEO/template pages** (e.g. the Blink "BorrowBox" page is a builder template; `moneytar.com` is AI content-farm material with fabricated case studies). Treat #2, #6, #8, #9 as directional, and the licensed-list (#1) and regulatory items as authoritative.

### A.4 Where UniFi is genuinely distinctive

No project found combines **all** of:
1. Campus-gated, multi-university onboarding with the **DB as source of truth** (`admin/universities`, `ALLOWED_UNIVERSITY_DOMAINS` bootstrap).
2. **Institution-linked reputation scoring** instead of CIBIL, with tiered borrow limits and an automated 15-day default sweep + late-fee model.
3. **Dual-role** accounts (borrower can become funder) inside one closed campus network.
4. A **payout settlement ledger** (manual + RazorpayX) with audit trail.

That blend is defensible *as a product*, but "uniqueness" here is execution + compliance, **not concept IP**.

---

## Part B — The regulatory reality (India)

### B.1 Two regimes apply

**1. NBFC-P2P Master Directions, 2017** — last amended **16 Aug 2024**; T+1 escrow rule effective **15 Nov 2024**; consolidated FAQ updated **3 Sep 2025**. This is *the* regime for "facilitate person-to-person lending for retail lenders."

**2. RBI (Digital Lending) Directions, 2025** (notified 8 May 2025). These apply to **Regulated Entities** (banks, co-op banks, NBFCs incl. HFCs, AIFIs) and their **Lending Service Providers (LSPs)** and **Digital Lending Apps (DLAs)**. An unregulated startup can only participate **as an LSP/DLA of a Regulated Entity**, and the RE remains fully liable. There is a **CIMS-reported public directory of DLAs**.

### B.2 Key NBFC-P2P obligations (as relevant to UniFi)

| Ref | Requirement | Detail |
|---|---|---|
| Reg. | **Certificate of Registration** required to operate; fresh NBFC-P2P (an existing NBFC cannot convert) | §4 |
| Capital | **NOF ≥ ₹2 crore**, infused **before** CoR; promoters frozen in the interim | §4(3), FAQ 5 |
| Leverage | **Leverage ratio ≤ 2**; customer funds are not the platform's | §7(1), FAQ 3–4 |
| Lender cap | Aggregate lender exposure ≤ **₹50,00,000** across all P2Ps (consistent with net worth); if > ₹10,00,000, lender must file a **CA certificate** of ≥ ₹50,00,000 net worth | §7(2) |
| Borrower cap | Aggregate borrowing ≤ **₹10,00,000** across all P2Ps | §7(3) |
| Concentration | Single lender → same borrower ≤ **₹50,000** | §7(4) |
| Tenure | Loan maturity ≤ **36 months** | §7(5) |
| Self-cert | Obtain a **certificate from borrower/lender** that the caps are adhered to | §7(6) |
| Funds | **Two escrow accounts** operated by a **bank-promoted trustee** (Lenders' + Borrowers'); platform has **view-only** access; **no cash**; funds may not sit > **T+1 bank working day**; lender-escrow cannot repay loans, borrower-escrow cannot disburse | §9, Annex-I |
| Prohibited | No deposits; **no lending on own account**; **no credit guarantee / credit enhancement**; **no assumption of credit risk** (directly or indirectly); no secured lending on-platform; no holding funds on balance sheet; no cross-sell except loan-specific insurance (and *not* credit-enhancement insurance); no international fund flow; **no promotion as an "investment product"** (no assured/tenure-linked returns, no liquidity promises) | §5–§6 |
| Disclosures | Prominent **RBI caveat** ("registered with RBI… RBI does not accept responsibility… no assurance for repayment"); display **registered name + brand**; disclose **all fees upfront**, fixed amount/proportion, **not dependent on repayment**; disclose portfolio performance incl. **NPAs and losses borne by lenders** | Aug-2024 amendments |
| Lender declaration | Explicit **risk declaration** incl. likelihood of **loss of entire principal**; platform gives no assurance/guarantee | Aug-2024 amendments |
| Consent | Borrower's personal details shared with lender **only with borrower's consent** | Aug-2024 amendments |
| Credit info | Obtain consent and report lending to **Credit Information Companies** (CIBIL/Experian/CRIF/Equifax) | DL Directions; P2P due-diligence duties |

### B.3 Digital Lending Directions 2025 — the parts that bite

- **Only REs may lend.** A non-RE is at most an **LSP** under contract; the RE carries the liability.
- **DLAs must be reported on RBI's CIMS** and appear in the **public DLA directory**.
- **Data localisation:** all data stored **only on servers in India**; anything processed abroad must be deleted and repatriated within 24h.
- **Data minimisation/consent:** need-based, explicit consent; **no access to contacts/files/media**; privacy policy disclosed on the app.
- **Fees to the LSP** must be **borne by the RE**, not collected from the borrower.
- **Nodal grievance-redressal officer** designated and displayed.
- **DLG (default loss guarantee)** only via an LSP incorporated as a company — relevant if UniFi ever wants to "protect" lenders.

---

## Part C — UniFi compliance gap analysis (code ↔ rules)

Legend: ✅ meets · ⚠️ partial/needs work · ❌ not met

| # | Rule | UniFi status | Evidence / file | Severity |
|---|---|---|---|---|
| C1 | Real money, interest, lender earnings = **P2P lending activity → needs NBFC-P2P CoR** | ❌ **Unlicensed** | `backend/src/utils/loanCalc.js`, `backend/src/services/payment.service.js` | **Blocker** |
| C2 | Funds held/flowed through a **bank-promoted trustee escrow**, two accounts | ❌ Money moves through the **platform's own Razorpay account**; no escrow trustee | `markFundingCaptured` / `markRepaymentCaptured` in `payment.service.js` | **Blocker** |
| C3 | **T+1** sweep out of escrow | ❌ No escrow, no T+1 enforcement | `payment.service.js` | **Blocker** |
| C4 | Platform must not **hold funds** | ❌ Provider money sits in the platform gateway account between steps; `PROVIDER_PAYOUT` ledger settles from it | `payout.service.js`, `payment.service.js` | **Blocker** |
| C5 | Single lender → same borrower ≤ **₹50,000** | ❌ No cap anywhere | `loan.service.js` (no aggregate checks) | High |
| C6 | Lender aggregate ≤ **₹50L** (+ CA cert > ₹10L) | ❌ Not enforced; no self-cert flow | `loan.service.js`, `admin.routes.js` | High |
| C7 | Borrower aggregate ≤ **₹10L** | ⚠️ De-facto tiny (borrowLimit default ₹5k, max config ₹10k) but **not enforced/certified** | `loan.service.js:221` | High |
| C8 | **$7(6) self-certificate** from borrower/lender | ❌ No certificate flow | — | High |
| C9 | Tenure ≤ **36 months** | ✅ 7/14/30 days only | `schema.prisma` `Tenure` | — |
| C10 | No **credit guarantee / risk assumption** | ✅ No guarantee feature; provider FAQ states "no guaranteed reimbursement" | `frontend/src/pages/ProviderPanel.jsx` | — |
| C11 | Not **promoted as an investment product** | ✅ Landing has no assured-returns/investment language | `frontend/public/unifi-landing.html` | — |
| C12 | No **cross-sell**, no secured lending, no cash, no international flow | ✅ None present | — | — |
| C13 | **RBI caveat + registered name** disclosure | ❌ Absent (unregistered) | `frontend/public/unifi-landing.html` has no caveat | High |
| C14 | **Fees** fixed & disclosed upfront, not repayment-dependent | ⚠️ Platform fee = % of *interest* (varies with rate), disclosed only in admin policy | `loanCalc.js`, `admin.routes.js` config | Medium |
| C15 | **Credit-bureau reporting + consent** | ❌ No CIBIL/Experian/CRIF integration at all | (no matches in `backend/src`) | High |
| C16 | **Lender risk declaration** (possible total principal loss) | ⚠️ FAQ text exists; no explicit signed declaration at funding | `ProviderPanel.jsx` | Medium |
| C17 | **NPA / lender-loss portfolio disclosure** | ❌ No public disclosure page | — | Medium |
| C18 | **Privacy policy, Terms, nodal grievance officer** | ❌ No such routes/pages exist | `frontend/src/App.jsx` route list | High |
| C19 | **Data stored in India only** | ❌ R2 (Cloudflare) + Render + Vercel are not India-only | `backend/src/services/storage.service.js`, deploy config | High (if RE/LSP) |
| C20 | **CIMS / DLA public directory** | ❌ N/A yet (only REs report) | — | High (via RE) |
| C21 | Aadhaar/PAN handling under **Aadhaar Act + DPDP** | ⚠️ Encrypted at rest + masked in admin UI, but no consent/purpose limiter | `backend/src/utils/encryption.js`, `AdminPanel.jsx` | Medium |

**Net:** the *mechanically compliant* boxes (no guarantee, no investment framing, tenure, no cross-sell) are already clean. The **money-custody, licensing, caps, disclosures, bureau reporting, and localisation** are not.

---

## Part D — The two viable paths

### Path 1 — **Licensed / partnered P2P** (keep real money, interest, payouts)

Two sub-options:

- **1a. Obtain NBFC-P2P CoR.** ~₹2 crore net-owned funds, a fresh company, RBI application, compliance org. Slow and capital-heavy; realistically not a v1 move.
- **1b. Ride an existing NBFC-P2P as an LSP/DLA** *(recommended if you want real money)*. You supply the campus UX/acquisition/tech; a licensed P2P provides the regulated rails. The RE is on the hook and must report your DLA to CIMS; **fees the RE pays you cannot be charged to the borrower**.

**Code changes required (both sub-options):**

1. **Escrow integration** — replace "provider → platform Razorpay account" with **two bank-trustee escrow accounts**; platform gets **view-only**; enforce **T+1** sweeps. This replaces the core of `payment.service.js` fund flow and `payout.service.js`.
2. **Exposure engine** — enforce ₹50k per lender-borrower pair, ₹10L borrower aggregate, ₹50L lender aggregate (+ CA cert trigger) with self-certificate capture. New checks in `loan.service.js` + `admin.routes.js`.
3. **Disclosures** — add the RBI caveat + registered entity name, fees-upfront page, NPA/lender-loss disclosure, privacy policy, Terms, **nodal grievance officer**.
4. **Lender risk declaration** at funding time (possible total loss of principal).
5. **Credit-bureau reporting** (consent + reporting to a CIC) — new integration.
6. **Fixed fee schedule** (not interest-dependent) disclosed before funding — adjust `loanCalc.js` + config.
7. **India-only data storage** — move DB/object storage to India regions.
8. **NPA reporting** into the admin panel and the public disclosure page.

**Effort:** escrow + exposure + disclosures + bureau ≈ a multi-sprint build plus a partner/legal track.

### Path 2 — **Unregulated campus trust/ledger product** (drop the money market)

Turn UniFi into the Kontrak-Social/Udhar/CampusTask shape: the platform **records and enforces social accountability** but never **custodies money or charges interest**.

**Drop/remove:**
- Interest and `providerEarning` (zero-interest only).
- Razorpay escrow/in, disbursement, repayment-to-platform, provider payouts. Payments, if any, happen **directly between peers (UPI)**, off-platform.
- The `PROVIDER_PAYOUT` ledger and `payout.service.js` settlement concept becomes a record, not a transfer.
- Platform never holds funds → no escrow, no T+1, no NBFC-P2P trigger.

**Keep/strengthen:**
- Campus-gated verified accounts (still UniFi's moat).
- Reputation/credit score as a **social trust** signal; tiered limits as *platform policy*, not credit.
- On-record IOU with terms, due dates, repayment **confirmation by both sides**, reminders, dispute flag, default → reputation hit/ban.
- Alumni "goodwill" lending (zero-interest) can exist as a **record-only** flow.
- Item rentals / campus marketplace is a natural adjacent (already the category RentPe/Borlo occupy).

**Code changes:** remove interest math from `loanCalc.js`; strip the payment-custody paths in `payment.service.js`; convert `payout.service.js` to record-only; add dual-confirmation repayment + reminders; keep the admin/universities/KYC stack as-is. **Much smaller change set — largely deletion + a few additions.**

**Trade-off:** no interest revenue for lenders, so far less "earning" appeal; revenue would come from a flat platform fee on recorded transactions, subscriptions, or campus partnerships. But it is **launchable now** without an RBI licence.

### Comparison

| | Path 1a (own CoR) | Path 1b (LSP partner) | Path 2 (trust/ledger) |
|---|---|---|---|
| Time / cost | Very high (₹2 cr + long) | Medium (partner + re-plumb money) | **Low** |
| Real money & interest | Yes | Yes | No |
| Regulatory burden | Full NBFC-P2P | Dependent on RE; you're the app | **None (non-custodial)** |
| Product differentiation | Campus focus preserved | Campus focus preserved | Campus focus, but weaker monetisation |
| Reuses current build | Partly (much rebuilt) | Partly | **Mostly** |

---

## Part E — Recommendation & sequencing

1. **Decide the path before adding features.** If you keep real money → plan for **Path 1b** (partner NBFC-P2P) and freeze the payout/escrow code as "pre-compliance". If you want to launch fast → **Path 2** and repurpose the money machinery as a record-only ledger.
2. **Do not publicly market interest or "earn returns"** on the landing page until licensed — that is itself a stated violation area.
3. **Regardless of path:** add Privacy Policy, Terms, and a **nodal grievance officer** contact (Path 2/any consumer product needs these anyway), and if you ever hold/report credit, add bureau consent.
4. **If Path 1:** the highest-risk engineering items are C2–C4 (escrow custody, T+1, no fund-holding) and C5–C8 (exposure caps + certificates). These are prerequisites, not polish.
5. **If Path 2:** the highest-value work is converting the ledger to dual-confirmation record-keeping and repositioning "earnings" as **reputation/impact**.

---

## Appendix — Sources

- RBI, *Master Direction – NBFC–P2P Lending Platform (Reserve Bank) Directions, 2017* (see §4 registration/NOF, §7 prudential norms, §9 fund transfer, Annex-I), incl. 16 Aug 2024 amendments and the 15 Nov 2024 T+1 effective date.
- RBI, *NBFC-P2P Frequently Asked Questions* (updated 3 Sep 2025).
- RBI, *Reserve Bank of India (Digital Lending) Directions, 2025* (notified 8 May 2025) and accompanying press release / CIMS DLA directory.
- Vaish Associates, "Legalaxy", Sep 2024 — summary of the Aug-2024 NBFC-P2P amendments.
- LiquiLoans commentary on the 16 Aug 2024 RBI circular (industry impact).
- Reuters / Business Standard / ETBFSI (Jan–Mar 2025) — RBI scrutiny; 26 licensed, ~10–11 active, ~₹11,000 cr AUM; penalties on Rang De, Faircent, Financepeer, Finzy.
- Blume Ventures, "The New Era of P2P Lending" (2024).
- Competitor sites/apps: Faircent, LenDenClub, i2iFunding, Lendbox, LiquiLoans, Finzy, RupeeCircle, IndiaP2P, Rupayya, StuCred, mPokket, Pocketly, PayCrunch, RentPe, Pookpit, Nexlist, Borlo, Kontrak Social, Floater, SoLo Funds.
- Academic/idea: ICERECT 2025 "CampusLend"; r/AppIdeas (Jul 2025); PeerFund (Devpost).
