# Badminton Match Grouping App

A cross-platform app for discovering and joining pickup badminton events, grouped by geographic area and matched by self-reported skill level.

## Language

**Skill level**:
An integer from 1 to 18, self-reported by the player at signup, following the Taiwan Badminton Promotion Association's (台灣羽球推廣協會) public grading chart. This is the stored, authoritative value used for all range comparisons (event skill_min/skill_max, auto-accept matching).
_Avoid_: Skill tier, skill rating, ELO, rank

**Skill band**:
One of 7 named groupings derived from **Skill level** for display purposes only (novice 1-3, beginner 4-5, early-intermediate 6-7, intermediate 8-9, intermediate-advanced 10-12, advanced 13-15, professional 16-18). Never stored independently of skill level — always computed from it.
_Avoid_: Skill tier (ambiguous with Skill level - use Skill level for the number, Skill band for the label)

## Relationships

- A **Profile** has at most one **Skill level** - it is nullable until the player self-reports it (a **Profile** created by signup, before onboarding, has no **Skill level** yet).
- An **Event** has a skill range, expressed as a min and max **Skill level** (skill_min <= skill_max).
- A **Skill band** is a pure function of a **Skill level** - never persisted.

## Example dialogue

> **Dev:** "When we show a player's skill on their profile, do we show the number or the band name?"
> **Domain expert:** "Show the band name, like '中階' - the 1-18 number is precise but not how players think of themselves day to day. But when an organizer sets an event's skill range, or when we check auto-accept eligibility, always compare on the number."

## Flagged ambiguities

- `PLAN.md`'s original "Self-reported skill tier (Beginner/Intermediate/Advanced/Pro)" language is superseded by this finer-grained system - resolved 2026-07-16 after cross-referencing the Taiwan Badminton Promotion Association's public 18-level chart, which is how the target community (Taiwan-based pickup badminton) actually self-describes skill. See `docs/adr/0001-skill-level-granularity.md`.
