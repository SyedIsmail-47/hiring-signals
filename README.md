# Hiring Signals + Verified Contacts

A product of **Rodexco** — hiring signals most tools stop short of, with a verified contact attached.

## What it does

Tracks companies' public job boards (Greenhouse, Lever, Ashby) for hiring
activity in the functions you care about, scores it by recency — new
postings weigh more than a stale, unchanged headcount — and, for
companies showing a real signal, finds and checks a working department
contact so you're not left with a company name and nothing to do with it.

## Why it's different

Most hiring-signal tools stop at the company name. This one checks an
actual contact email through real SMTP verification — the same engine
behind our standalone Bulk Email Verifier — so you get a starting point
for outreach, not just a lead to research further.

## A note on accuracy

Many larger companies run catch-all mail servers, which accept any
address at their domain. When that's the case, we report the contact as
`risky` rather than falsely claiming a confirmed `valid` mailbox — we'd
rather tell you the truth about what we actually know than oversell
certainty we don't have. In practice, for large actively hiring companies,
`risky` is often the typical outcome, not the exception. The value is still
real: we confirm the domain accepts mail at that address, and we flag when
we can't be certain it isn't accepting everything — which is more than a
guessed alias, and not the same as a guaranteed-live mailbox.

## Input

| Field | Description | Default |
|---|---|---|
| `companies` | List of `{ name, domain }` to check | Stripe / stripe.com |
| `trackedFunctions` | Job functions to track | sales, engineering, marketing |
| `signalThreshold` | Minimum weighted signal score to count as a signal | 2 |

## Output

One record per company: `totalRoles`, `matchedRoles`, `functionBreakdown`,
`newRoleIds`, `removedRoleIds`, `signalScore`, `meetsThreshold`,
`verifiedContact`, `contactStatus` (`valid` / `risky` / `not_found` /
`unknown` / `skipped`), `contactSource`.

## Pricing

One `company-checked` event per company that meets your signal
threshold and has a detected job board. Companies with no signal, or no
detected job board, are saved and never charged.

## Title categorization

Matching is whole-word only. Generic terms like bare `revenue`, `growth`,
and `developer` are not standalone triggers. Judgement calls (documented
in code): Technical Account Manager → sales; Presales / Pre-sales → not
sales; Support-before-engineer titles are not counted as engineering.

## How it works

1. **ATS detection** — tries Greenhouse, then Lever, then Ashby using board
   tokens derived from the company domain and name.
2. **Role categorization** — matches open job titles to your tracked functions.
3. **Day-over-day diff** — stores matched ATS job IDs in the Key-Value store
   and reports which IDs are new or removed (not just a count delta).
4. **Signal score** — continuing roles weigh `0.5`, brand-new IDs weigh `3`.
   Baseline uses the same formula so an unchanged board scores the same every run.
5. **Verified contact** — when the signal clears your threshold, checks
   `careers@`, `jobs@`, `recruiting@`, and `hr@` in order through real SMTP
   (same engine as Bulk Email Verifier), stopping at the first `valid` or
   falling back to the first `risky`.

## Run locally

```bash
npm install
npm test
```

Requires [Apify CLI](https://docs.apify.com/cli) logged in for platform runs:

```bash
apify push
apify call -f INPUT.json -m 512 -t 300
```

Default input checks Stripe's public Greenhouse board — safe for scheduled QA
because those boards are public-by-design.

## Project layout

```
src/           Actor logic (ATS, categorization, KV diff, contacts)
vendor/        Email verification engine (from bulk-email-verifier)
test/          Unit tests
.actor/        Apify input / dataset / output schemas
```
