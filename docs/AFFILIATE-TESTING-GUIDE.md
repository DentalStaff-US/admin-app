# DTSS Affiliate Program — Hands-On Testing Guide

*A walkthrough of the whole program on staging, start to finish, with what you should see at each step.*

Work through it in order — each part sets up the next. Budget about **45 minutes** for parts 1–5. Part 6 (seeing real money move) depends on the monthly cycle and is explained separately.

Wherever you're asked to sign up a new user, use an email you can receive at. A `+` alias works well (`you+test1@gmail.com`), **but** don't use an alias of the affiliate's own email in Part 3 — the system will flag it as a possible self-referral (which is a good thing to see, and Part 4 covers it).

**Staging addresses** — fill these in before you start:

| | URL |
|---|---|
| Practice app | `https://__________` |
| Professional app | `https://__________` |
| Affiliate portal | `https://__________` |

Stripe is in **test mode** on staging. No real money moves. Test values are given where you need them.

---

## Part 1 — Find the program as a practice (5 min)

You'll need an **active** practice account. A pending one won't show anything — that's by design.

1. Sign in to the practice app as an active practice.
2. Go to **Settings**. In the left sidebar, below Billing, you should see a new tab: **Affiliate**.

   > ☐ The Affiliate tab is present.
   > ☐ Sign in as a *pending* practice: the tab is **absent**. (Approve them later and it appears.)

3. Open the Affiliate tab. You should see:
   - A card explaining the program
   - Your **referral link** with a **Copy** button
   - A status badge reading **Setup incomplete** (payouts aren't connected yet)
   - A button: **Finish setup in the portal**

   > ☐ Copy the link. It should look like `https://<portal>/r/XXXXXXXX` — eight letters and numbers.

4. Click **Finish setup in the portal**.

   > ☐ You land in the Affiliate Portal **already signed in** — no second login screen. The header shows "Affiliate #N".

---

## Part 2 — The portal and payout setup (10 min)

You're now in the portal as that practice.

1. **Dashboard.** You should see your referral link again, tiles for Clicks / Signups / Pending / Approved / Paid out, your commission rate (2.5%), and an amber box: **Set up payouts**.

   > ☐ The counts are all 0 (or reflect earlier testing). The rate reads 2.5%.

2. Click **Set up payouts**. You'll be sent to a Stripe-hosted form. Use Stripe's test data:

   | Field | Enter |
   |---|---|
   | Phone | any |
   | SSN / last 4 | `0000` / `000-00-0000` |
   | Date of birth | any adult date |
   | Address | any US address |
   | Routing number | `110000000` |
   | Account number | `000123456789` |

   Complete every step. Stripe returns you to the portal's **Payouts** page.

   > ☐ A blue banner: "Thanks — Stripe is reviewing your details…"
   > ☐ Refresh the page within a minute. The banner is gone and **Payout method** reads **Ready**. The button now says **Manage payout details**.

3. Click **Manage payout details**.

   > ☐ It opens Stripe's Express dashboard for that account — where an affiliate would change bank details or download their 1099. Close it.

4. Check the other tabs: **Referrals** and **Earnings**.

   > ☐ Both show a friendly empty state, not an error.

5. Go back to the practice app's Settings → Affiliate tab.

   > ☐ The badge now reads **Active** and the button says **Open Affiliate Portal**.

---

## Part 3 — Refer someone (10 min)

This is the core loop. You'll play both sides.

1. Open a **private/incognito window** (so you're not signed in anywhere).
2. Paste the referral link from Part 1.

   > ☐ A page titled **"You've been referred"** with two choices: *I run a dental practice* / *I'm a dental professional*. Your referral code is shown small at the bottom.

3. Choose **I run a dental practice**.

   > ☐ You arrive at the practice app's sign-up page. The address bar ends in `?ref=XXXXXXXX` — your code.

4. Sign up with a **fresh email** (not an alias of the affiliate's own — see the note at the top). Complete the sign-up.

5. Back in your normal window, open the portal → **Referrals**.

   > ☐ The new practice is listed. Type: *Practice*. Status: **Active**. Source: `COOKIE`.

6. Repeat steps 1–5 choosing **I'm a dental professional** instead, signing up in the professional app.

   > ☐ A second referral appears, type *Professional*.

7. Two behaviours worth checking explicitly:

   - **First click wins.** In a private window, open affiliate A's link, then affiliate B's link, then sign up. The referral goes to **A**.
     > ☐ Confirmed.
   - **Unapproved accounts don't count yet.** The two people you just referred are *pending* until an admin approves them. They can't be affiliates themselves yet, and their shifts won't generate commission until they're active — same rules as everyone.

---

## Part 4 — The admin side (10 min)

Sign in as a **superadmin** in the practice app. Go to **Admin Menu → Affiliate Program**.

1. **Overview tiles.** Affiliates, qualified referrals, pending / approved / paid commission, flagged, failed payouts.

   > ☐ Numbers match what you did in Parts 1–3.

2. **Program settings.** Commission rate (2.50), payout minimum (25.00), and the **Program enabled** switch.

   > ☐ Change the rate to 3.00, save, change it back. The flash message confirms each save.

3. **Search.** Type part of your affiliate's name, email, or the referral code.

   > ☐ The list filters. Try the Status and Type dropdowns too. The URL updates — refreshing keeps the filter.

4. Click **Manage →** on your affiliate. This is the **detail page**.

   > ☐ Header shows name, status pill, affiliate #, type, join date.
   > ☐ **Stripe Connect** reads *Ready* with the account id.
   > ☐ **Referrals** lists the two people from Part 3.

5. **Try each control card** (each needs a reason — that's deliberate):

   | Control | Do this | Expect |
   |---|---|---|
   | **Commission rate** | Enter `5`, reason "test override", Save | Card now reads "Currently 5% (override)". Clear the box and save → back to "program default 2.5%" |
   | **Status** | Choose `ON_HOLD`, reason "testing hold", Update | Pill turns amber. Go check the *practice's* Settings → Affiliate tab: it now says their account is paused. Set back to `ACTIVE` |
   | **Manual adjustment** | Enter `-5`, reason "test adjustment", Record | A new line appears in the **Ledger** below: −$5.00, source MANUAL_ADJUSTMENT. Enter `5` with a different reason to zero it out |

6. **The review queue.** To see it: in a private window, open the affiliate's link and sign up using a `+` alias of the *affiliate's own* email (e.g. the affiliate is `jane@x.com`; sign up as `jane+new@x.com`).

   > ☐ On the Affiliate Program page a **Flagged for review** section appears with reason `EMAIL_PLUS_ALIAS_MATCH`, and Approve / Reject buttons.
   > ☐ Click **Reject**. It disappears from the queue; the affiliate's Referrals list shows it as *Not eligible*.

   The point: the system *suspects* but never auto-rejects on suspicion. A person decides.

7. **Exports.** Admin Menu → **Exports**.

   > ☐ Two downloads under "Affiliate Program": Commission ledger and Payouts. Download both (leave dates blank). They open in Excel/Sheets with money as plain numbers and dates in a sortable format. The −$5 / +$5 adjustments from step 5 are in the ledger with your reasons.

---

## Part 5 — Earn a commission (15 min)

This uses the normal DTSS flow — the affiliate program just watches it.

1. As an admin, **approve** the practice you referred in Part 3 (set them Active) and the professional too.
2. As that practice (or as admin on their behalf), create a **temp** requisition — say 8 hours at $40/hr — and assign the referred professional to it.
3. Submit and **approve the timesheet** so an invoice is generated.
4. **Pay the invoice.** On staging in test mode, pay with test card `4242 4242 4242 4242`, any future expiry, any CVC. (For a paper-invoice practice, record a payment for the full amount in the admin invoice screen instead.)
5. Now check the affiliate's portal → **Earnings**.

   > ☐ One line: Shift value **$320.00** (8 × $40), Your commission **$8.00** (2.5%), status **Pending**, and a "Pays out" month two months after the payment date.
   > ☐ If the *professional* was also referred by a different affiliate, that affiliate has an $8.00 line too.

6. Now **void that invoice** (admin invoice screen).

   > ☐ The Earnings line changes to **Reversed**. The affiliate keeps nothing from a voided invoice.

7. Prove overtime is excluded: book a **48-hour** week at $40, approve, pay.

   > ☐ Shift value shows **$1,600** (40 × $40 — *not* $2,080). Commission **$40.00**. The 8 overtime hours didn't count.

---

## Part 6 — Getting paid (timing-dependent)

Payouts run automatically on the **1st of each month** and pay everything earned two months prior — so a commission earned today won't be *paid* for 5–9 weeks. That's the design, not a bug: the delay lets refunds settle first.

What you can check now:

> ☐ The Earnings line's "Pays out" month is the 1st of the month after next.
> ☐ On the **26th**, affiliates with a payout due get a heads-up email. (Ask the dev team to trigger this early if you'd like to see the email.)

What happens on the 1st, which the dev team has already verified end to end on staging with a real test transfer:

- Balances of $25 or more are transferred to the affiliate's bank via Stripe; they get a "payout sent" email.
- Balances under $25 roll to the next month.
- If the Stripe balance is short, every admin is emailed with the reason, and the system retries automatically each night once funds are added.

**If you want to see a payout land during testing**, the dev team can run the payout job on demand and temporarily lower the $25 minimum. Just ask.

---

## Part 7 — Outside partners (5 min)

1. In a private window, go to the **portal's sign-in page**. Below the form: *"Not a DTSS practice or professional? Apply to become a partner →"*. Click it. (The short address `https://<portal>/apply` goes to the same place.)
2. Fill in the form — name, email, password, organization, and a note about who you'd refer. Submit.

   > ☐ "Application received" message, with a link back to the portal to check status.

3. As admin, Admin Menu → Affiliate Program.

   > ☐ The new partner is in the list, type **External Partner**, status **PENDING**. Search for them by organization name.

4. **Manage →** → Status → `ACTIVE`, reason "approved", Update.
5. Sign in to the **portal** directly (there's no practice/professional app for a partner) as that email.

   > ☐ They get a dashboard, a referral link, and the same payout setup as everyone else.
   > ☐ Before you approved them, signing in showed "Your application is being reviewed" and no link.

---

## If something doesn't look right

Note **what you did, what you expected, and what you saw** — plus the affiliate number from the portal header or admin page if one's involved. Every action is logged with a timestamp, and the ledger and payout exports show exactly what the system recorded, so most questions can be answered from the data.

Things that are **correct** even though they might look odd at first:

- A negative "Owed back to DTSS" tile: a commission was paid out and then the invoice was refunded. The affiliate keeps the money already sent; the debt nets off their next earnings.
- A referral marked *Not eligible*: it was flagged and rejected on review, or the person was invited by their office manager rather than genuinely referred.
- A pending practice's shifts earn nothing: only active accounts generate commission.
- A commission that's *Pending* for weeks: it's inside the monthly cycle. It becomes *Approved* when its month closes and *Paid* on the 1st.
