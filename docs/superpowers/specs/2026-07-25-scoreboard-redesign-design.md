# Scoreboard/Court-Line Redesign

## Overview

A deeper visual pass on top of the "court card" system shipped in the
2026-07-24 tabs-e2e-polish work, requested explicitly as "push further than
polish - a real redesign" of the Discover/Create/Profile tabs. Not a
ground-up reskin: it keeps the existing green/gold court palette and card
language, and instead fixes a concrete cohesion problem found by running the
app on-device, plus adds one deliberate signature typographic/structural
move.

**The finding that grounded this pass**: on the Create screen, the two
native `@expo/ui` controls (the `DateTimePicker` wheel and the skill-range
`Picker`s) render in stock Android Material - lavender surfaces, default
type - which clashes hard against the rest of the screen's green/gold/chalk
identity. Screenshotting the running app (not just reading the code) is what
surfaced this; it's the strongest, most concrete justification for spending
effort here rather than a purely cosmetic palette refresh.

## Color

Existing `Court.*` token names are unchanged (no mass rename across the
codebase) - only the underlying hex values are sharpened, plus two new
tokens:

| Token | Old | New | Rationale |
|---|---|---|---|
| `Court.shuttle` | `#FFFDF8` | `#F7F5EE` | "Chalk" - warmer than flat white, like a sideline or shuttle cork |
| `Court.ink` | `#173226` | `#22302B` | "Net charcoal" - deep charcoal-green, not flat black |
| `Court.feather` | `#F2A93C` | `#E8A33D` | "Shuttle gold" - cork-and-feather gold, less generic-orange |
| `Court.danger` | `#D64545` | `#D6455B` | "Rally red" - a line-judge call, not a stop sign |
| `Court.greenDeep` | (new) | `#083D2C` | Header/hero surface - real contrast against card surfaces |

## Type: the signature move

Everything was system-default before this pass, which is the single biggest
reason the app read as "a green app" rather than "a badminton app." Added
**League Spartan** (`@expo-google-fonts/league-spartan`, loaded via
`expo-font`'s `useFonts` in `src/app/_layout.tsx`, gated alongside auth
before hiding the splash screen) as a dedicated **display** face -
condensed, bold, reads like scoreboard/jersey numerals - applied to:
screen titles, the Create screen's event title, `Pill` labels, `ActionButton`
labels, the tab header, and the profile name/section title. Body text
(descriptions, meta rows, input values) stays on the system font, so the
boldness is spent in exactly one place. Two weights loaded:
`LeagueSpartan_700Bold` (`Font.display`) and `LeagueSpartan_800ExtraBold`
(`Font.displayBlack`, used only for the largest screen titles).

## Layout / signature structural device

- **`SectionDivider`**: a paired thick/thin line (badminton sidelines are
  drawn as a close parallel pair - singles line inside doubles line),
  replacing plain vertical gaps under each screen's header/section title.
- **`SkillBandSelector`**: replaces the two native skill-range `Picker`s on
  Create with a themed horizontal chip row (reusing the `Pill` visual
  language). Directly fixes the native-Material clash and is a better
  interaction too - all 7 bands are visible and tappable at once, instead of
  a tap-to-reveal dropdown.
- **`FieldCard`**: wraps the (still-native, can't-restyle-internally)
  `DateTimePicker` in a bordered Chalk card with an icon badge and label, so
  it reads as an intentionally embedded module rather than a stray system
  dialog.

## Motion

Kept deliberately restrained, per the brief's own "spend boldness in one
place" principle: `ActionButton` scales down slightly on press (a small,
racket-strike-like squeeze) using React Native `Pressable`'s built-in
`pressed`-state styling. `react-native-reanimated` was tried first for a
spring-back version of this, but its Jest mock hung every test suite that
renders an `ActionButton` (all six - Join/Create/Sign out/Remove all go
through it); the native `Pressable` approach gets a very similar feel with
zero added risk or dependency surface.

No ambient/looping animation, no list-entrance choreography, no background
texture (a net-mesh background pattern was considered and dropped - risk of
looking busy/AI-generic outweighed the payoff).

## Deferred / explicitly not done

- Net-mesh background texture (considered, dropped for restraint).
- List-entrance stagger animation (considered, dropped to keep scope to one
  signature bet).
- Any change to `src/app/(auth)/login.tsx` (out of scope - three tabs only).
- Live participant-count "X / Y" scoreboard readout on `EventCard` (would
  require a new aggregate query against `event_participants`; the data
  isn't fetched in the current events-list query, and fabricating a number
  without real data would be misleading - explicitly deferred, same as the
  2026-07-24 spec's "Live participant counts" deferral).
