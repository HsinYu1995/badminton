# Badminton Match Grouping App

A cross-platform app for discovering and joining pickup badminton events, grouped by geographic area and matched by self-reported skill level.

## Language

**Skill level**:
An integer from 1 to 18, self-reported by the player at signup, following the Taiwan Badminton Promotion Association's (台灣羽球推廣協會) public grading chart. This is the stored, authoritative value used for all range comparisons (event skill_min/skill_max, auto-accept matching).
_Avoid_: Skill tier, skill rating, ELO, rank

**Skill band**:
One of 7 named groupings derived from **Skill level** for display purposes only (novice 1-3, beginner 4-5, early-intermediate 6-7, intermediate 8-9, intermediate-advanced 10-12, advanced 13-15, professional 16-18). Never stored independently of skill level — always computed from it.
_Avoid_: Skill tier (ambiguous with Skill level - use Skill level for the number, Skill band for the label)

**Player count**:
The number of people currently in an Event: the organizer (always exactly one - organizers have no `event_participants` row of their own) plus every participant with a pending or accepted request. Computed for display, never stored. Distinct from an Event's `headcount_max`, which is its capacity limit, not who's actually in it.
_Avoid_: Headcount, current headcount (ambiguous with `headcount_max` - use Player count for "who's in it now", headcount_max for "the cap")

**Credit**:
The average of a Profile's received `ratings.score` (1-5), computed on read via the `public.profile_credit` view - never stored, same pattern as Skill band. A Profile with zero ratings has no row in this view (absent, not zero) - render as "Unrated," never a fabricated "0.0 stars." Given only by another Profile who shared an Event with them (organizer <-> accepted participant, or accepted participant <-> accepted participant), and only optionally - not giving a score is simply never inserting a row, not a stored null/zero.
_Avoid_: Rating (ambiguous between the act and the aggregate - use Rating for one `ratings` row, Credit for the computed average), score (fine informally, but Credit is the stored/domain term)

## Relationships

- A **Profile** has at most one **Skill level** - it is nullable until the player self-reports it (a **Profile** created by signup, before onboarding, has no **Skill level** yet).
- An **Event** has a skill range, expressed as a min and max **Skill level** (skill_min <= skill_max).
- A **Skill band** is a pure function of a **Skill level** - never persisted.
- An **Event**'s **Player count** is a pure function of its organizer (implicit, always 1) and its pending/accepted **event_participants** rows - never persisted, and never exceeds `headcount_max` in a well-formed **Event** (not currently enforced at signup time).

## Example dialogue

> **Dev:** "When we show a player's skill on their profile, do we show the number or the band name?"
> **Domain expert:** "Show the band name, like '中階' - the 1-18 number is precise but not how players think of themselves day to day. But when an organizer sets an event's skill range, or when we check auto-accept eligibility, always compare on the number."

## Flagged ambiguities

- `PLAN.md`'s original "Self-reported skill tier (Beginner/Intermediate/Advanced/Pro)" language is superseded by this finer-grained system - resolved 2026-07-16 after cross-referencing the Taiwan Badminton Promotion Association's public 18-level chart, which is how the target community (Taiwan-based pickup badminton) actually self-describes skill. See `docs/adr/0001-skill-level-granularity.md`.
