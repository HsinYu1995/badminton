# Scoreboard/Court-Line Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Push the existing "court card" design system further with one
deliberate signature move (a condensed display typeface + a paired-line
court motif) and fix a concrete visual-cohesion bug (native `@expo/ui`
controls rendering in stock Android Material against the app's green/gold
identity), across all three tabs.

**Architecture:** New design tokens and a display typeface added to
`src/constants/badminton-theme.ts` / `src/app/_layout.tsx`; three new small
components (`SectionDivider`, `SkillBandSelector`, `FieldCard`) applied into
the three existing tab screens and the shared `Pill`/`ActionButton`
components, replacing native pickers where they clashed and framing the one
native control that can't be replaced.

**Tech Stack:** `@expo-google-fonts/league-spartan` + `expo-font` (already a
dependency) for the display typeface. No other new dependencies -
`react-native-reanimated` was tried and dropped (see spec's Motion section).

## Global Constraints

- No mass rename of existing `Court.*` token keys - only hex values change,
  plus two new keys (`greenDeep`, and the new `Font` token object).
- Body text (descriptions, meta rows, TextInput values) stays on the system
  font - the display face is reserved for titles, pills, buttons, and
  numbers, per the spec's "spend boldness in one place" principle.
- `npm test` (the full Jest suite) is run after every single change. Any
  regression is fixed before moving on.
- No em dashes in any generated docs, comments, or UI copy - use plain
  dashes.
- Full design rationale: `docs/superpowers/specs/2026-07-25-scoreboard-redesign-design.md`.

---

## File Structure

```
badminton/
  src/
    app/
      _layout.tsx                    # Modify: load League Spartan, gate splash on fonts
      (tabs)/
        _layout.tsx                  # Modify: header/tab-label font, Green Deep header
        index.tsx                    # Modify: display font, SectionDivider
        create.tsx                   # Modify: SkillBandSelector, FieldCard, display font
        profile.tsx                  # Modify: display font, SectionDivider
    components/
      pill.tsx                       # Modify: display font
      action-button.tsx              # Modify: display font, press-scale
      event-card.tsx                 # Modify: display font on title
      section-divider.tsx            # Create: paired-line court motif
      skill-band-selector.tsx        # Create: chip row replacing native Picker
      field-card.tsx                 # Create: themed frame for native DateTimePicker
    constants/
      badminton-theme.ts             # Modify: sharpened colors + Font tokens
```

---

### Task 1: Font loading + theme tokens

**Files:**
- Modify: `src/app/_layout.tsx`
- Modify: `src/constants/badminton-theme.ts`
- Modify: `package.json`, `package-lock.json` (via `npx expo install @expo-google-fonts/league-spartan`)

**Interfaces:**
- Produces: `Font.display` / `Font.displayBlack` (font family name strings) and the sharpened `Court.*` values, consumed by every later task.

- [x] **Step 1:** `npx expo install @expo-google-fonts/league-spartan`
- [x] **Step 2:** Gate `RootLayout`'s splash-hide on `useFonts({ LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold })` alongside the existing `isLoading` (auth) check; don't render `RootNavigator` until fonts are loaded.
- [x] **Step 3:** Add `Font` export to `badminton-theme.ts`; sharpen `Court.shuttle`/`ink`/`feather`/`danger` values; add `Court.greenDeep`.
- [x] **Step 4:** `npm test` - expect all 6 suites PASS (font loading adds ~5-10s to suite time; this is expected, not a regression).
- [x] **Step 5:** `npx tsc --noEmit` - expect clean.
- [x] **Step 6:** Commit.

---

### Task 2: SectionDivider + SkillBandSelector components

**Files:**
- Create: `src/components/section-divider.tsx`
- Create: `src/components/skill-band-selector.tsx`
- Modify: `src/app/(tabs)/create.tsx` (replace the two `@expo/ui` `Picker`s with `SkillBandSelector`, add `SectionDivider`, apply `Font.displayBlack` to the title)

**Interfaces:**
- `SectionDivider()`: no props, no return value consumed elsewhere - purely visual.
- `SkillBandSelector({ selectedId: SkillBandId, onSelect: (id: SkillBandId) => void })`: same value contract as the native `Picker` it replaces (`SkillBandId` from `src/lib/skill-bands.ts`).

- [x] **Step 1-6:** Write both components, wire into `create.tsx`, run `npm test` (expect 6/6 PASS - the `SKILL_BANDS` default state values are unchanged, so `create-submit-test.tsx`'s insert-payload assertion still holds), `npx tsc --noEmit` clean, commit.

---

### Task 3: Apply display font + dividers across all three tabs

**Files:**
- Modify: `src/components/pill.tsx`, `src/components/action-button.tsx`, `src/components/event-card.tsx`
- Modify: `src/app/(tabs)/_layout.tsx`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/profile.tsx`

- [x] **Step 1-N:** Apply `Font.display`/`Font.displayBlack` to Pill/ActionButton labels, event-card titles, screen titles, tab header/labels, profile name/section title; add `SectionDivider` under Discover's header and Profile's "My events" title; move the tab header surface to `Court.greenDeep`. Run `npm test` after - 6/6 PASS. `npx tsc --noEmit` clean. Commit.

---

### Task 4: Frame the native DateTimePicker

**Files:**
- Create: `src/components/field-card.tsx`
- Modify: `src/app/(tabs)/create.tsx`

**Interfaces:**
- `FieldCard({ icon: string, label: string, children: ReactNode })`: wraps any content in a bordered Chalk card with an icon badge + label header.

- [x] **Step 1-4:** Write `FieldCard`, wrap both `DateTimePicker` instances in `create.tsx` with it (replacing their plain `<Text style={styles.label}>` rows). Run `npm test` - 6/6 PASS. `npx tsc --noEmit` clean. Commit.

---

### Task 5: ActionButton press feedback

**Files:**
- Modify: `src/components/action-button.tsx`

- [x] **Step 1:** Try `react-native-reanimated` (`useSharedValue`/`useAnimatedStyle`/`withSpring` on an `Animated.createAnimatedComponent(Pressable)`). **Result: FAIL** - `Animated.createAnimatedComponent` isn't a function under the default Jest environment; adding `react-native-reanimated/mock` via `moduleNameMapper` gets past that but then every suite that renders an `ActionButton` (all six) hangs past its per-test timeout. Root-caused as a genuine incompatibility between this project's Reanimated 4/`react-native-worklets` version and its own Jest mock, not a test-authoring bug - reverted.
- [x] **Step 2:** Use `Pressable`'s built-in `pressed`-state function-style prop for a `{ transform: [{ scale: 0.96 }] }` style instead - no new dependency, no jest mock needed.
- [x] **Step 3:** `npm test` - 6/6 PASS. `npx tsc --noEmit` clean.
- [x] **Step 4:** Commit.

---

### Task 6: Visual QA on emulator

**Files:** none (verification only).

- [x] **Step 1:** Restart Metro (`npm run android:emulator`) - the process had silently crashed earlier in the session (an `npm install` mid-watch tripped its file watcher), so the emulator was showing a stale pre-redesign bundle. Took two more restart attempts and one `adb reboot` to recover from a crashed emulator `system_server` (`pm` service unreachable) - both infrastructure flakiness, unrelated to the app.
- [x] **Step 2:** Screenshot all three tabs (`adb shell screencap`).
- [x] **Step 3:** Self-critique against the spec - see ledger below.
- [x] **Step 4:** No code fixes needed - the one gap found (native wheel-picker internals) is a documented, accepted constraint, not a bug.

---

### Task 7: Final verification + docs

**Files:** none beyond this file's ledger.

- [x] **Step 1:** `npm test` - full suite green (6/6).
- [x] **Step 2:** `npx tsc --noEmit` - clean.
- [x] **Step 3:** `git status --short` - clean working tree.
- [x] **Step 4:** Final ledger entry summarizing the pass.

---

## Progress Ledger

- **2026-07-25, Task 1 (commit `3e24210` covers Tasks 1-2 together):** Font loading + theme tokens landed. `npm test` initially slower (~28-30s vs ~15-16s baseline) due to real font-file loading in the Jest environment - acceptable, not a functional regression. 6/6 passed, `tsc --noEmit` clean.
- **2026-07-25, Task 2 (commit `3e24210`):** SkillBandSelector replaces the two native Pickers; SectionDivider added to Create's header. 6/6 passed, clean typecheck.
- **2026-07-25, Task 3 (commit `c4130b2`):** Display font applied to Pill, ActionButton, EventCard title, all three screen titles, tab header/labels, profile name/section title; SectionDivider added to Discover and Profile. 6/6 passed, clean typecheck.
- **2026-07-25, Task 4 (commit `7aefe4a`):** FieldCard wraps both DateTimePicker instances. 6/6 passed, clean typecheck.
- **2026-07-25, Task 5 (commit `099ed61`):** Reanimated press-scale attempted and reverted (hung the Jest suite via its own mock, unrelated to app-code correctness); replaced with Pressable's built-in pressed-state scale transform. 6/6 passed, clean typecheck.
- **2026-07-25, mid-pass infrastructure note:** during Task 6's visual QA, discovered Metro had crashed silently much earlier (an `npx expo install` run mid-session tripped its file watcher) - the emulator had been showing a stale pre-redesign bundle the whole time. Also hit an unrelated emulator `system_server` crash (`pm` service unreachable) requiring an `adb reboot` to recover, both infrastructure issues unrelated to the app code itself, which was independently verified via `npm test` + `tsc --noEmit` after every task above.
- **2026-07-25, Task 6 (visual QA, on-device screenshots):** Discover - display font, paired-line divider, and the search icon all render as intended; tab bar picked up the new Chalk tone automatically via the `Court.shuttle` value change. Profile - name/section title in display font, Rally Red "Sign out" button, divider under "My events", all cohesive. Create - the `SkillBandSelector` chip row is a clear improvement over the old native `Picker` (green-outlined selection, gold/chalk unselected chips, fully visible/tappable); the `Create event` button reads as a confident gold pill. **One honest gap**: `FieldCard` successfully frames the `DateTimePicker` with a bordered Chalk card, icon badge, and label - it now reads as an intentionally embedded module rather than a stray dialog - but the wheel picker's own internals (selection bubble, digit readout) still render in native Material lavender/blue, since that's SwiftUI/Material-owned and can't be restyled from JS. Fully eliminating this would mean building a custom wheel-picker component from scratch, which is real scope creep beyond a design-polish pass (and cuts against this project's own prior decision, in the 2026-07-19 create-event plan, to use the native picker deliberately) - left as a documented, accepted limitation rather than over-building.
- **2026-07-25, Task 7 (final verification):** `npm test` -> 6/6 suites, 6/6 tests passing. `npx tsc --noEmit` -> clean. `git status --short` -> clean working tree after this commit. Spec's signature bet (League Spartan display type + paired-line court motif) and its concrete finding (native-Picker clash) are both fully addressed; the one remaining native-picker-internals limitation is documented above, not silently dropped.
