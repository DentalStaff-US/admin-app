# DTSS Affiliate Program — Overview

*What it is, how the money works, and what you control.*

---

## The idea in one paragraph

Every active dental practice and dental professional on DTSS gets a personal referral link. So do approved outside partners — dental schools, supply companies, consultants, influencers. When someone signs up through that link and starts working shifts, the person who referred them earns a small commission on those shifts, paid out monthly to their bank account. Anyone can refer anyone: a hygienist can bring in a practice, a practice can bring in a hygienist.

The goal is to turn every satisfied user into a growth channel, at a cost that stays a small, predictable slice of what DTSS already earns on each shift.

---

## Who can be an affiliate

| | How they join | Their link works when… |
|---|---|---|
| **Dental practices** | Automatically — every active practice already has one | Their DTSS account is **Active** |
| **Dental professionals** | Automatically — every active professional already has one | Their DTSS account is **Active** |
| **Outside partners** (schools, suppliers, consultants, influencers) | Apply at the portal — the sign-in page links to the form, or go straight to `partners.dtstaffingsolutions.com/apply`; an admin approves them | An admin has **approved** them |

Accounts that are pending, inactive or denied never see the program at all — no tab, no link. If an active account is later deactivated, their affiliate access is paused automatically the same day. Anything they had already earned still gets paid.

---

## How the money works

**Commission is 2.5% of the regular hours on temp shifts** worked by people the affiliate referred. In plain terms: hours × hourly rate, for the first 40 hours of a week.

Deliberately **not** included:
- **Overtime.** Hours past 40 in a week are billed at 1.5×, but they don't count toward commission.
- **Administration and processing fees.** Commission is on the labor line only.
- **Permanent placements.** Only temp shifts for now. Placement commissions are planned once the fee structure is decided.

**Worked example.** A referred practice books 40 hours at $45/hr. The labor line is $1,800. The affiliate earns **$45.00**. If that same week ran to 48 hours, the affiliate still earns **$45.00** — the extra 8 hours are overtime and don't count.

**When it's earned.** Commission counts the moment the practice's invoice is **paid** — not when the shift is booked or worked. If an invoice is later voided or refunded, the commission is reversed.

**For how long.** For the life of the referred account. There is no time limit and no cap.

**Both sides can earn.** If a practice was referred by one affiliate and the professional working the shift was referred by a different affiliate, *both* earn on that shift — each on their own side.

### What it costs DTSS

Wages are a pass-through: DTSS bills the practice at the same rate it pays the professional. DTSS's revenue on a shift is the administration fee (currently 50% of regular hours) plus the 3% card fee. Against that, a 2.5% commission works out to about **5% of what DTSS earns on the shift** — roughly 9% in the rare case both sides were referred. Because commission and the admin fee are both calculated on regular hours only, that share stays flat no matter how much overtime a shift runs.

The 2.5% is a program-wide setting you can change at any time, and it can be overridden per affiliate for negotiated deals. Rate changes only affect future earnings — nothing already earned is ever recalculated.

---

## When and how affiliates get paid

**Monthly, on the 1st, with a one-month delay.**

Everything earned in a calendar month is grouped together and paid on the 1st of the month *after next*. All commission earned in March is paid on May 1; April's on June 1. The gap gives time for any refunds or disputes to settle first.

| | |
|---|---|
| **Minimum payout** | $25. Smaller balances roll into the next month rather than being lost. |
| **How** | Directly to the affiliate's bank account via Stripe, from the DTSS account. |
| **Setup** | Each affiliate connects a personal or business bank account through Stripe inside the portal. Stripe verifies their identity and **issues their 1099** at year end. Until they've done this, their balance accrues and waits. |
| **Heads-up** | On the 26th, anyone due a payout gets an email saying how much is coming and when. |

**Keep the Stripe balance funded before the 1st.** Payouts draw from it. If it's short, that month's transfers fail — you'll be emailed immediately, and the system retries automatically every night once it's topped up.

---

## Where things live

| Who | Where | What they see |
|---|---|---|
| **Practices** | Settings → **Affiliate** tab | Their link, a copy button, and a door into the portal |
| **Professionals** | Settings → **Affiliate Program** | Same |
| **Everyone, including outside partners** | **The Affiliate Portal** (its own site) | Dashboard, referrals, earnings, payouts, and payout setup |
| **Admins** | Admin Menu → **Affiliate Program** | Everything below |
| **Admins** | Admin Menu → **Exports** | CSV downloads for the bookkeeper |

The affiliate's link points to the portal, which asks "are you a practice or a professional?" and sends them to the right sign-up. The affiliate never has to know which kind of person they're referring.

---

## What admins control

From Admin Menu → Affiliate Program:

- **Program settings** — the commission rate, the payout minimum, and a master on/off switch. When the program is off, everything is hidden from users, but referral links are still being tracked quietly in the background — useful for a soft launch.
- **Per-affiliate rate** — a negotiated rate for a specific affiliate (say, 5% for a dental school). Forward-only.
- **Status** — put an affiliate **on hold** (stops new earnings; what they're already owed still pays out) or **deny** them (stops everything and freezes their balance for you to resolve). Both need a written reason and survive the nightly automatic checks.
- **Adjustments** — add or subtract an amount from an affiliate's balance, with a reason. Always recorded as its own line; nothing is ever silently edited.
- **Review queue** — signups the system thought looked suspicious (for example, an email that's just a variation of the affiliate's own). Nothing is auto-rejected on suspicion alone; a person decides.
- **Payout history** — every payout, including any that failed and why.
- **Search** — by name, email, organization, referral code, or affiliate number.

Each affiliate has a detail page with their full history — every referral, every commission line, every payout — next to the controls, so support decisions can be made with the evidence in view.

---

## Emails the system sends

| To | When |
|---|---|
| Affiliate | Someone signs up through their link |
| Affiliate | The 26th — "your payout of $X is coming on the 1st" |
| Affiliate | A payout has been sent |
| **Admins** | A payout run had failures (with the reason for each) |

Affiliates who've opted out of DTSS emails don't receive these.

---

## Safeguards

- **A referral is permanent.** Once someone is attributed to an affiliate, it never changes — not by a later click on someone else's link, not by anything short of an admin decision.
- **First click wins.** If a person clicks two different affiliates' links before signing up, the first affiliate gets credit. This rewards whoever actually started the relationship.
- **Self-referral is blocked.** An affiliate can't refer themselves, and an obvious variation of their own email is flagged for review rather than credited.
- **Nothing pays twice.** Three independent checks make it impossible for a single shift to be commissioned twice or a single month to be paid out twice.
- **Every number is traceable.** Each commission line records the rate, the hours, and the invoice it came from, frozen at the time — so a later rate change can never rewrite history, and the bookkeeper's export reconciles to the dollar.

---

## What's deliberately not in this version

- **Permanent placement commissions** — planned, pending a decision on the fee structure.
- **Multiple links per affiliate** (campaign tracking) — one link each for now, until we see how people use it.
- **Multi-level / downline commissions** — not planned.
- **Discount codes for the referred person** — not planned.
