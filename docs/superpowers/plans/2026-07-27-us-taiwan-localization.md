# US/Taiwan Localization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate the app to Mandarin (Traditional, Taiwan) for Taiwan-region users, keep English everywhere else, driven by device locale - plus locale-aware date/time, distance, and fee-currency display - with full test coverage and zero regressions.

**Architecture:** A hand-rolled `src/lib/i18n.tsx` module (dictionary + `I18nProvider` + `useI18n()` hook) driven by `expo-localization`'s `useLocales()`, bucketed into exactly two locales (`'en-US'` default/fallback, `'zh-TW'`). Two non-component functions (`validateEventDraft`, `SKILL_BANDS`) switch from literal English strings to typed keys so screens can translate them. Three formatting functions become locale-parametrized.

**Tech Stack:** React Native / Expo SDK 57, expo-router, TypeScript, Jest (`jest-expo` preset), `expo-localization` (new dependency).

## Global Constraints

- Two locales only: `'en-US'` (fallback for anything not Taiwan) and `'zh-TW'` (Traditional Chinese, Taiwan).
- Locale is derived from `regionCode` only (`'TW'` -> `'zh-TW'`, else `'en-US'`) - never from the OS's `measurementSystem`/`currencyCode` fields, which are `null` on web per the SDK 57 docs.
- No new runtime dependency beyond `expo-localization` itself - no `react-i18next`/`react-intl`.
- Translation dictionary completeness is enforced by TypeScript (`const zhTW: Translations = {...}` - excess/missing keys are compile errors), backed by a runtime test.
- `formatDistance`: `'zh-TW'` unchanged (m/km). `'en-US'` converts to feet (<~0.1mi) / miles (1 decimal).
- `formatFee`: `'zh-TW'` unchanged (`NT$${fee}` / `免費`). `'en-US'` converts via fixed `NTD_TO_USD_RATE = 31.5` to `~$X.XX USD` / `Free`. This is a display-only approximation, not a real exchange rate - documented inline.
- `formatStartTime`: uses `Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' })` instead of no-arg `toLocaleDateString`/`toLocaleTimeString`.
- Raw Supabase/Postgres error messages surfaced verbatim (`venue-picker.tsx`'s `error.message`) stay untranslated English - explicitly out of scope.
- Every existing test in `tests/unit/*-test.tsx` must keep passing unchanged. Screens rendered via `renderRouter` use the default `'en-US'` bucket (the root `__mocks__/expo-localization.js`); calls into `formatDistance`/`formatFee` made *without* an explicit `locale` argument (any not-yet-migrated call site) instead reproduce that specific function's own prior hardcoded output exactly, which is not uniformly `'en-US'`-shaped - see each function's default/fallback in Task 2. New `zh-TW` coverage is added as new, separate test files, never by editing existing assertions to expect Mandarin.
  - **Narrow, deliberate exception:** once a screen task wires a real explicit `locale` into `formatFee`/`formatDistance` at a call site a pre-existing test exercises (this happens once, in Task 8's `event-card.tsx`), that pre-existing test's asserted *numbers* (not text) may legitimately change from the old NT$/metric shim output to real `'en-US'` USD/imperial output - that's the feature working correctly for the first time there, not a regression. Task 8 documents the exact two assertions this applies to. This exception does not extend to translated *text* (button labels, headers, etc.), which stays identical English under the `en-US` bucket in every task.
- Full plan is done when `npm test` passes with zero failures.

---

### Task 1: Core i18n module

**Files:**
- Create: `src/lib/i18n.tsx`
- Create: `__mocks__/expo-localization.js`
- Test: `tests/unit/i18n-test.ts`
- Modify: `package.json` (add `expo-localization` dependency)

**Interfaces:**
- Produces: `type LocaleTag = 'en-US' | 'zh-TW'`; `bucketLocale(regionCode: string | null | undefined): LocaleTag`; `pluralize(count: number, singular: string, plural: string, locale: LocaleTag): string`; `type Translations` (the full key map, exported); `I18nProvider({ children }): JSX.Element`; `useI18n(): { locale: LocaleTag; t: (key: keyof Translations, params?: Record<string, string | number>) => string }`.

- [ ] **Step 1: Install `expo-localization`**

Run: `npx expo install expo-localization`

This adds it to `package.json` `dependencies` at the SDK-57-compatible version (currently `~57.0.1`) and installs it into `node_modules`.

- [ ] **Step 2: Add the root-level Jest manual mock**

Jest auto-applies a manual mock placed at `<rootDir>/__mocks__/<package>.js` for any `require`/`import` of that node_modules package, in every test file, without per-test `jest.mock()` calls. This is the **default** used by every existing test (all of which expect `'en-US'` behavior); individual new zh-TW tests override it with their own `jest.mock('expo-localization', ...)` at the top of that specific test file.

```js
// __mocks__/expo-localization.js
function getLocales() {
  return [{ languageTag: 'en-US', languageCode: 'en', regionCode: 'US', textDirection: 'ltr' }];
}

module.exports = {
  getLocales,
  useLocales: getLocales,
};
```

- [ ] **Step 2b: Write the failing dictionary-parity test**

```ts
// tests/unit/i18n-test.ts
import { en, zhTW } from '@/lib/i18n';

describe('i18n dictionary parity', () => {
  it('has the exact same set of keys in every locale', () => {
    const enKeys = Object.keys(en).sort();
    const zhTWKeys = Object.keys(zhTW).sort();
    expect(zhTWKeys).toEqual(enKeys);
  });

  it('has no empty string values in any locale', () => {
    for (const [locale, dict] of Object.entries({ en, zhTW })) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value, `${locale}.${key} must not be empty`).not.toBe('');
      }
    }
  });
});
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: FAIL - `Cannot find module '@/lib/i18n'`

- [ ] **Step 4: Write `src/lib/i18n.tsx`**

This is the full dictionary for every user-facing string identified across the app (see the per-screen tasks below - they all consume keys defined here; no screen task adds new keys of its own).

```tsx
// src/lib/i18n.tsx
import { createContext, useContext, type ReactNode } from 'react';
import { useLocales } from 'expo-localization';

export type LocaleTag = 'en-US' | 'zh-TW';

export function bucketLocale(regionCode: string | null | undefined): LocaleTag {
  return regionCode === 'TW' ? 'zh-TW' : 'en-US';
}

// Mandarin has no plural form - a caller passes the single Mandarin word as
// `singular` and it's returned regardless of count.
export function pluralize(count: number, singular: string, plural: string, locale: LocaleTag): string {
  if (locale === 'zh-TW') return singular;
  return count === 1 ? singular : plural;
}

export const en = {
  'common.free': 'Free',
  'common.unrated': 'Unrated',

  'auth.signIn': 'Sign in',
  'auth.signInWithGoogle': 'Sign in with Google',
  'auth.signInFailed': 'Sign-in failed',

  'tabs.discover': 'Discover',
  'tabs.create': 'Create',
  'tabs.profile': 'Profile',

  'eventDetail.headerTitle': 'Event details',
  'eventDetail.notFound': 'Event not found.',
  'eventDetail.aboutThisGame': 'About this game',
  'eventDetail.organizedBy': '🧑 Organized by {name}',

  'create.mustBeSignedIn': 'You must be signed in to create an event.',
  'create.couldNotCreate': 'Could not create event.',
  'create.headerTitle': '🏸 Host a game',
  'create.subtitle': 'Fill in the details so players know what to expect',
  'create.eventTitleLabel': 'Event title',
  'create.eventTitlePlaceholder': 'Friendly doubles',
  'create.descriptionLabel': 'Description',
  'create.descriptionPlaceholder': 'Optional details for players',
  'create.venueLabel': '📍 Venue',
  'create.playersLabel': '👥 Number of players',
  'create.feeLabel': '💰 Fee (NT$, 0 for free)',
  'create.dateLabel': 'Date',
  'create.startTimeLabel': '🕒 Start time (24-hour, e.g. 18:30)',
  'create.startTimePlaceholder': '18:30',
  'create.durationLabel': '⏱️ Duration (minutes)',
  'create.skillFromLabel': '🏆 Skill range: from',
  'create.skillToLabel': '🏆 Skill range: to',
  'create.creating': 'Creating...',
  'create.submit': 'Create event',

  'errors.titleRequired': 'Title is required.',
  'errors.venueRequired': 'Please select or add a venue.',
  'errors.headcountInvalid': 'Number of people must be a positive whole number.',
  'errors.feeInvalid': 'Fee must be zero or a positive whole number.',
  'errors.durationInvalid': 'Duration must be a positive number of minutes.',
  'errors.skillRangeInvalid': 'Skill range "from" must not be above "to".',
  'errors.startTimeFormatInvalid': 'Start time must be in 24-hour HH:MM format, e.g. 18:30.',
  'errors.startTimeMustBeFuture': 'Start time must be in the future.',
  'errors.startTimeOutOfRange': 'Start time must be within this year or next year.',

  'discover.headerTitle': '🏸 Discover',
  'discover.subtitle': 'Find a pickup game near you',
  'discover.searchPlaceholder': 'Search by title or venue',
  'discover.connectionError': 'Connection error: {error}',
  'discover.couldNotLoadEvents': 'Could not load events.',
  'discover.couldNotLoadMoreEvents': 'Could not load more events.',
  'discover.couldNotJoin': 'Could not join event.',
  'discover.couldNotCancel': 'Could not cancel request.',
  'discover.noMatchesTitle': 'No matches',
  'discover.noGamesTitle': 'No games yet',
  'discover.noMatchesSubtext': 'Try a different title or venue.',
  'discover.noGamesSubtext': 'Be the first to host a pickup game today.',
  'discover.yourEvent': 'Your event',
  'discover.leaveEvent': 'Leave event',
  'discover.cancelRequest': 'Cancel request',
  'discover.declined': 'Declined',
  'discover.join': 'Join',
  'discover.spotsFilledNotice': '🔔 {count} {spot} filled since you applied',

  'eventCard.past': 'Past',
  'eventCard.venueTbd': 'Venue TBD',
  'eventCard.skillGaugeAccessibilityLabel': 'Skill range {min} to {max} out of {scaleMax}',
  'eventCard.skillLabel': '{band} · Lv {min}-{max}',
  'eventCard.playersCountFraction': '{count}/{max} players',
  'eventCard.playersUpTo': 'Up to {max} players',

  'skillBands.novice': 'Novice',
  'skillBands.beginner': 'Beginner',
  'skillBands.early_intermediate': 'Early Intermediate',
  'skillBands.intermediate': 'Intermediate',
  'skillBands.intermediate_advanced': 'Intermediate-Advanced',
  'skillBands.advanced': 'Advanced',
  'skillBands.professional': 'Professional',

  'profile.pageTitle': '🏸 Profile',
  'profile.playerFallback': 'Player',
  'profile.signOut': 'Sign out',
  'profile.signOutFailed': 'Sign-out failed',
  'profile.sectionMyProfile': 'My profile',
  'profile.creditLabel': '🌟 Credit',
  'profile.displayNameLabel': '😀 Display name',
  'profile.displayNamePlaceholder': 'How other players see you',
  'profile.skillLevelLabel': '🏆 Skill level',
  'profile.aboutMeLabel': '📝 About me',
  'profile.aboutMePlaceholder': 'Tell other players a bit about yourself',
  'profile.contactInfoLabel': '💬 Contact info',
  'profile.contactInfoPlaceholder': 'e.g. LINE ID, phone number',
  'profile.saving': 'Saving...',
  'profile.saveProfile': 'Save profile',
  'profile.profileSaved': 'Profile saved.',
  'profile.displayNameRequired': 'Display name is required.',
  'profile.couldNotSaveProfile': 'Could not save profile.',
  'profile.sectionGamesPlaying': "Games I'm playing",
  'profile.noGamesJoinedTitle': 'No games joined yet',
  'profile.noGamesJoinedSubtext': 'Head to Discover to find a pickup game.',
  'profile.couldNotLeaveEvent': 'Could not leave event.',
  'profile.leaveEvent': 'Leave event',
  'profile.organizedBy': '🧑 Organized by {name}',
  'profile.rateTheHost': 'Rate the host',
  'profile.couldNotSaveRating': 'Could not save rating.',
  'profile.sectionMyEvents': 'My events',
  'profile.noGamesOrganizedTitle': 'No games organized yet',
  'profile.noGamesOrganizedSubtext': 'Head to Create to host your first pickup game.',
  'profile.couldNotRemoveEvent': 'Could not remove event.',
  'profile.removeOutdatedEvent': 'Remove outdated event',
  'profile.upcoming': 'Upcoming',
  'profile.alsoPlaying': '🏸 Also playing ({count})',
  'profile.playersCount': '👥 Players ({count})',
  'profile.unknownPlayer': 'Unknown player',
  'profile.accept': 'Accept',
  'profile.decline': 'Decline',
  'profile.couldNotUpdateRequest': 'Could not update request.',
  'profile.statusAccepted': 'Accepted',
  'profile.statusDeclined': 'Declined',
  'profile.statusPending': 'Pending',

  'venuePicker.locationPermissionRequired': 'Location permission is required to add a venue.',
  'venuePicker.couldNotGetLocation': 'Could not get current location.',
  'venuePicker.couldNotSaveVenue': 'Could not save venue.',
  'venuePicker.couldNotLoadVenues': 'Could not load venues: {error}',
  'venuePicker.addNewVenue': '+ Add new venue',
  'venuePicker.venueNamePlaceholder': 'Venue name',
  'venuePicker.addressPlaceholder': 'Address',
  'venuePicker.gettingLocation': 'Getting location...',
  'venuePicker.locationCaptured': 'Location captured',
  'venuePicker.useCurrentLocation': 'Use current location',
  'venuePicker.retry': 'Retry',
  'venuePicker.saving': 'Saving...',
  'venuePicker.saveVenue': 'Save venue',

  'searchBar.defaultPlaceholder': 'Search events or venues',
  'searchBar.accessibilityLabel': 'Search events',

  'starRating.accessibilityLabel': 'Rating: {value} of 5 stars',
  'starRating.rateStars': 'Rate {star} {unit}',

  'splash.title': 'Badminton',
  'splash.subtitle': 'Finding your next game...',
};

export type Translations = typeof en;

export const zhTW: Translations = {
  'common.free': '免費',
  'common.unrated': '未評分',

  'auth.signIn': '登入',
  'auth.signInWithGoogle': '使用 Google 登入',
  'auth.signInFailed': '登入失敗',

  'tabs.discover': '探索',
  'tabs.create': '建立',
  'tabs.profile': '個人資料',

  'eventDetail.headerTitle': '活動詳情',
  'eventDetail.notFound': '找不到此活動。',
  'eventDetail.aboutThisGame': '關於這場活動',
  'eventDetail.organizedBy': '🧑 主辦人：{name}',

  'create.mustBeSignedIn': '您必須登入才能建立活動。',
  'create.couldNotCreate': '無法建立活動。',
  'create.headerTitle': '🏸 主辦比賽',
  'create.subtitle': '填寫詳細資訊，讓球友了解活動內容',
  'create.eventTitleLabel': '活動標題',
  'create.eventTitlePlaceholder': '友誼雙打',
  'create.descriptionLabel': '說明',
  'create.descriptionPlaceholder': '給球友的補充說明（選填）',
  'create.venueLabel': '📍 場地',
  'create.playersLabel': '👥 參與人數',
  'create.feeLabel': '💰 費用（新台幣，0 為免費）',
  'create.dateLabel': '日期',
  'create.startTimeLabel': '🕒 開始時間（24 小時制，例如 18:30）',
  'create.startTimePlaceholder': '18:30',
  'create.durationLabel': '⏱️ 時長（分鐘）',
  'create.skillFromLabel': '🏆 程度範圍：從',
  'create.skillToLabel': '🏆 程度範圍：到',
  'create.creating': '建立中...',
  'create.submit': '建立活動',

  'errors.titleRequired': '請輸入標題。',
  'errors.venueRequired': '請選擇或新增場地。',
  'errors.headcountInvalid': '參與人數必須為正整數。',
  'errors.feeInvalid': '費用必須為零或正整數。',
  'errors.durationInvalid': '時長必須為正整數分鐘。',
  'errors.skillRangeInvalid': '程度範圍的「從」不可高於「到」。',
  'errors.startTimeFormatInvalid': '開始時間須為 24 小時制 HH:MM 格式，例如 18:30。',
  'errors.startTimeMustBeFuture': '開始時間必須為未來時間。',
  'errors.startTimeOutOfRange': '開始時間必須在今年或明年內。',

  'discover.headerTitle': '🏸 探索',
  'discover.subtitle': '尋找附近的臨時球局',
  'discover.searchPlaceholder': '搜尋標題或場地',
  'discover.connectionError': '連線錯誤：{error}',
  'discover.couldNotLoadEvents': '無法載入活動。',
  'discover.couldNotLoadMoreEvents': '無法載入更多活動。',
  'discover.couldNotJoin': '無法加入活動。',
  'discover.couldNotCancel': '無法取消申請。',
  'discover.noMatchesTitle': '沒有符合的結果',
  'discover.noGamesTitle': '尚無活動',
  'discover.noMatchesSubtext': '請嘗試其他標題或場地。',
  'discover.noGamesSubtext': '成為今天第一位主辦臨時球局的人吧。',
  'discover.yourEvent': '您的活動',
  'discover.leaveEvent': '退出活動',
  'discover.cancelRequest': '取消申請',
  'discover.declined': '已婉拒',
  'discover.join': '加入',
  'discover.spotsFilledNotice': '🔔 自您申請後已有 {count} 個空位被填滿',

  'eventCard.past': '已結束',
  'eventCard.venueTbd': '場地待定',
  'eventCard.skillGaugeAccessibilityLabel': '程度範圍 {min} 到 {max}（滿分 {scaleMax}）',
  'eventCard.skillLabel': '{band}．等級 {min}-{max}',
  'eventCard.playersCountFraction': '{count}/{max} 人',
  'eventCard.playersUpTo': '最多 {max} 人',

  'skillBands.novice': '新手',
  'skillBands.beginner': '初階',
  'skillBands.early_intermediate': '中初階',
  'skillBands.intermediate': '中階',
  'skillBands.intermediate_advanced': '中高階',
  'skillBands.advanced': '高階',
  'skillBands.professional': '職業級',

  'profile.pageTitle': '🏸 個人資料',
  'profile.playerFallback': '球友',
  'profile.signOut': '登出',
  'profile.signOutFailed': '登出失敗',
  'profile.sectionMyProfile': '我的資料',
  'profile.creditLabel': '🌟 信譽分數',
  'profile.displayNameLabel': '😀 顯示名稱',
  'profile.displayNamePlaceholder': '其他球友看到的名稱',
  'profile.skillLevelLabel': '🏆 程度等級',
  'profile.aboutMeLabel': '📝 自我介紹',
  'profile.aboutMePlaceholder': '向其他球友簡單介紹自己',
  'profile.contactInfoLabel': '💬 聯絡方式',
  'profile.contactInfoPlaceholder': '例如：LINE ID、電話號碼',
  'profile.saving': '儲存中...',
  'profile.saveProfile': '儲存資料',
  'profile.profileSaved': '資料已儲存。',
  'profile.displayNameRequired': '請輸入顯示名稱。',
  'profile.couldNotSaveProfile': '無法儲存資料。',
  'profile.sectionGamesPlaying': '我參加的活動',
  'profile.noGamesJoinedTitle': '尚未加入任何活動',
  'profile.noGamesJoinedSubtext': '前往探索頁尋找臨時球局。',
  'profile.couldNotLeaveEvent': '無法退出活動。',
  'profile.leaveEvent': '退出活動',
  'profile.organizedBy': '🧑 主辦人：{name}',
  'profile.rateTheHost': '為主辦人評分',
  'profile.couldNotSaveRating': '無法儲存評分。',
  'profile.sectionMyEvents': '我主辦的活動',
  'profile.noGamesOrganizedTitle': '尚未主辦任何活動',
  'profile.noGamesOrganizedSubtext': '前往建立頁主辦您的第一場球局。',
  'profile.couldNotRemoveEvent': '無法移除活動。',
  'profile.removeOutdatedEvent': '移除過期活動',
  'profile.upcoming': '即將舉行',
  'profile.alsoPlaying': '🏸 其他參與者（{count}）',
  'profile.playersCount': '👥 參與者（{count}）',
  'profile.unknownPlayer': '未知球友',
  'profile.accept': '接受',
  'profile.decline': '拒絕',
  'profile.couldNotUpdateRequest': '無法更新申請。',
  'profile.statusAccepted': '已接受',
  'profile.statusDeclined': '已婉拒',
  'profile.statusPending': '待審核',

  'venuePicker.locationPermissionRequired': '新增場地需要定位權限。',
  'venuePicker.couldNotGetLocation': '無法取得目前位置。',
  'venuePicker.couldNotSaveVenue': '無法儲存場地。',
  'venuePicker.couldNotLoadVenues': '無法載入場地：{error}',
  'venuePicker.addNewVenue': '+ 新增場地',
  'venuePicker.venueNamePlaceholder': '場地名稱',
  'venuePicker.addressPlaceholder': '地址',
  'venuePicker.gettingLocation': '取得位置中...',
  'venuePicker.locationCaptured': '已取得位置',
  'venuePicker.useCurrentLocation': '使用目前位置',
  'venuePicker.retry': '重試',
  'venuePicker.saving': '儲存中...',
  'venuePicker.saveVenue': '儲存場地',

  'searchBar.defaultPlaceholder': '搜尋活動或場地',
  'searchBar.accessibilityLabel': '搜尋活動',

  'starRating.accessibilityLabel': '評分：5 顆星中的 {value} 顆',
  'starRating.rateStars': '評 {star} 顆星',

  'splash.title': '羽球',
  'splash.subtitle': '正在尋找您的下一場球局...',
};

const DICTIONARIES: Record<LocaleTag, Translations> = { 'en-US': en, 'zh-TW': zhTW };

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => (key in params ? String(params[key]) : match));
}

type I18nContextValue = {
  locale: LocaleTag;
  t: (key: keyof Translations, params?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const locales = useLocales();
  const locale = bucketLocale(locales[0]?.regionCode);
  const t = (key: keyof Translations, params?: Record<string, string | number>) =>
    interpolate(DICTIONARIES[locale][key], params);
  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/lib/i18n.tsx __mocks__/expo-localization.js tests/unit/i18n-test.ts
git commit -m "feat(i18n): add core i18n module with en-US/zh-TW dictionaries"
```

---

### Task 2: Locale-aware formatting

**Files:**
- Modify: `src/lib/events.ts` (`formatStartTime`, `formatFee`, `formatDistance`)
- Modify: `src/lib/ratings.ts` (`formatCredit`)
- Modify: `tests/unit/format-distance-test.ts`
- Test: `tests/unit/format-distance-test.ts`, plus new cases below

**Interfaces:**
- Consumes: `LocaleTag` from `src/lib/i18n.tsx` (Task 1).
- Produces: `formatStartTime(startTime: string, locale: LocaleTag = 'en-US'): string`; `formatFee(fee: number, locale?: LocaleTag): string`; `formatDistance(meters: number, locale: LocaleTag = 'zh-TW'): string`; `formatCredit(credit: Credit | undefined, locale: LocaleTag = 'en-US'): string`. Each default (or, for `formatFee`, the omitted-`locale` fallback) is chosen per-function to exactly reproduce that function's own prior hardcoded behavior - they are not uniformly `'en-US'` because the old code itself was not uniformly locale-shaped (see each function's inline comment below). This means any call site not yet migrated in a later task keeps compiling *and* keeps its exact prior runtime output.

- [ ] **Step 1: Read the current test file to match its style**

Read `tests/unit/format-distance-test.ts` in full before editing - match its existing `describe`/`it` structure and import style exactly.

- [ ] **Step 2: Add failing locale-aware test cases**

Add to `tests/unit/format-distance-test.ts` (keep every existing test in the file unchanged, just add these):

```ts
import { formatDistance } from '@/lib/events';

// ... existing describe blocks stay ...

describe('formatDistance locale handling', () => {
  it('renders km for zh-TW at a sub-kilometer distance', () => {
    expect(formatDistance(450, 'zh-TW')).toBe('450 m away');
  });

  it('renders km for zh-TW past one kilometer', () => {
    expect(formatDistance(2300, 'zh-TW')).toBe('2.3 km away');
  });

  it('renders feet for en-US under roughly 0.1 miles', () => {
    expect(formatDistance(100, 'en-US')).toBe('328 ft away');
  });

  it('renders miles to one decimal for en-US past roughly 0.1 miles', () => {
    expect(formatDistance(2300, 'en-US')).toBe('1.4 mi away');
  });
});
```

Also create `tests/unit/format-fee-test.ts`:

```ts
import { formatFee } from '@/lib/events';

describe('formatFee', () => {
  it('renders Free for a zero fee in zh-TW', () => {
    expect(formatFee(0, 'zh-TW')).toBe('免費');
  });

  it('renders NT$ for a nonzero fee in zh-TW', () => {
    expect(formatFee(200, 'zh-TW')).toBe('NT$200');
  });

  it('renders Free for a zero fee in en-US', () => {
    expect(formatFee(0, 'en-US')).toBe('Free');
  });

  it('renders an approximate USD conversion for a nonzero fee in en-US', () => {
    expect(formatFee(315, 'en-US')).toBe('~$10.00 USD');
  });
});
```

And `tests/unit/format-start-time-test.ts`:

```ts
import { formatStartTime } from '@/lib/events';

describe('formatStartTime', () => {
  it('formats using en-US date/time conventions', () => {
    expect(formatStartTime('2026-08-01T10:00:00.000Z', 'en-US')).toBe(
      new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-08-01T10:00:00.000Z'))
    );
  });

  it('formats using zh-TW date/time conventions', () => {
    expect(formatStartTime('2026-08-01T10:00:00.000Z', 'zh-TW')).toBe(
      new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date('2026-08-01T10:00:00.000Z'))
    );
  });
});
```

And add to `tests/unit/ratings-lib-test.ts` (read it first to match its existing style; keep existing tests unchanged):

```ts
describe('formatCredit locale handling', () => {
  it('translates Unrated for zh-TW', () => {
    expect(formatCredit(undefined, 'zh-TW')).toBe('未評分');
  });

  it('keeps the star format locale-agnostic', () => {
    expect(formatCredit({ credit: 4.5, ratingsCount: 12 }, 'zh-TW')).toBe('★ 4.5 (12)');
  });
});
```

- [ ] **Step 3: Run the new tests to confirm they fail**

Run: `npx jest tests/unit/format-distance-test.ts tests/unit/format-fee-test.ts tests/unit/format-start-time-test.ts tests/unit/ratings-lib-test.ts`
Expected: FAIL (`formatFee`/`formatDistance`/`formatStartTime`/`formatCredit` don't yet accept a locale, or module doesn't export `formatFee` with new signature - existing default behavior tests should still pass, only new ones fail)

- [ ] **Step 4: Update `src/lib/events.ts`**

Replace the three functions:

```ts
import type { LocaleTag } from '@/lib/i18n';

export function formatStartTime(startTime: string, locale: LocaleTag = 'en-US'): string {
  const date = new Date(startTime);
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

// No live FX source - a fixed, approximate, hardcoded rate for display
// purposes only, not a real currency conversion.
const NTD_TO_USD_RATE = 31.5;

// `locale` is optional (not defaulted) because the *old* hardcoded behavior
// this replaces was itself locale-inconsistent: zero fee was always the
// English word "Free," nonzero was always NT$ - two different implicit
// locales in one function, so no single LocaleTag default reproduces both.
// Omitting `locale` entirely (every not-yet-migrated caller, until its own
// task passes one explicitly) runs the exact old branching verbatim;
// passing an explicit locale uses the new, locale-consistent branching.
export function formatFee(fee: number, locale?: LocaleTag): string {
  if (locale === undefined) {
    return fee === 0 ? 'Free' : `NT$${fee}`;
  }
  if (fee === 0) return locale === 'zh-TW' ? '免費' : 'Free';
  if (locale === 'zh-TW') return `NT$${fee}`;
  return `~$${(fee / NTD_TO_USD_RATE).toFixed(2)} USD`;
}

// Sub-kilometer distances read as meters (whole numbers - "450 m away"),
// anything further as kilometers to one decimal place ("2.3 km away"),
// matching how Google Maps/most map apps switch units. en-US uses the
// imperial equivalent (feet under ~0.1mi, else miles to one decimal).
// Defaults to 'zh-TW' (not 'en-US') because the old hardcoded behavior
// this replaces was unconditionally metric - unlike formatFee, the old
// output is uniform across all magnitudes, so one default value reproduces
// it exactly for every not-yet-migrated caller.
export function formatDistance(meters: number, locale: LocaleTag = 'zh-TW'): string {
  if (locale === 'zh-TW') {
    if (meters < 1000) return `${Math.round(meters)} m away`;
    return `${(meters / 1000).toFixed(1)} km away`;
  }
  const miles = meters / 1609.34;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft away`;
  return `${miles.toFixed(1)} mi away`;
}
```

Note: the literal `'Free'`/`'免費'` strings inline here (rather than calling `t()`) are intentional - `formatFee` is a plain function with no React context, called from both components and, in Task 3, unit tests. It hard-codes the two locale strings directly rather than depending on `useI18n()`.

- [ ] **Step 5: Update `src/lib/ratings.ts`**

```ts
import type { LocaleTag } from '@/lib/i18n';

// Defaults to 'en-US': the old hardcoded 'Unrated' was already an English
// string, so this default reproduces it exactly for every not-yet-migrated
// caller (unlike formatFee, there's no cross-branch inconsistency here -
// the star format itself is locale-invariant).
export function formatCredit(credit: Credit | undefined, locale: LocaleTag = 'en-US'): string {
  if (!credit) return locale === 'zh-TW' ? '未評分' : 'Unrated';
  return `★ ${credit.credit.toFixed(1)} (${credit.ratingsCount})`;
}
```

- [ ] **Step 6: Run all four test files to verify they pass**

Run: `npx jest tests/unit/format-distance-test.ts tests/unit/format-fee-test.ts tests/unit/format-start-time-test.ts tests/unit/ratings-lib-test.ts`
Expected: PASS, all tests including the pre-existing ones in each file

- [ ] **Step 7: Run the full suite to check for regressions from the changed defaults**

Run: `npx jest`
Expected: PASS, all suites (call sites not yet migrated fall back to the `'en-US'` default parameter, so existing behavior is unchanged)

- [ ] **Step 8: Commit**

```bash
git add src/lib/events.ts src/lib/ratings.ts tests/unit/format-distance-test.ts tests/unit/format-fee-test.ts tests/unit/format-start-time-test.ts tests/unit/ratings-lib-test.ts
git commit -m "feat(i18n): locale-aware date, distance, and fee formatting"
```

---

### Task 3: `validateEventDraft` errorKey refactor

**Files:**
- Modify: `src/lib/event-draft.ts`
- Modify: `tests/unit/validate-event-draft-test.ts`
- Modify: `tests/unit/create-validation-test.tsx`

**Interfaces:**
- Produces: `type ValidationErrorKey = 'titleRequired' | 'venueRequired' | 'headcountInvalid' | 'feeInvalid' | 'durationInvalid' | 'skillRangeInvalid' | 'startTimeFormatInvalid' | 'startTimeMustBeFuture' | 'startTimeOutOfRange'`; `ValidateEventDraftResult = { ok: true; event: ValidatedEvent } | { ok: false; errorKey: ValidationErrorKey }`.
- Consumed by: Task 7 (`create.tsx`), which renders `t(\`errors.${errorKey}\`)`.

- [ ] **Step 1: Read both existing test files in full**

Read `tests/unit/validate-event-draft-test.ts` and `tests/unit/create-validation-test.tsx` completely before editing, to match their existing structure.

- [ ] **Step 2: Update `tests/unit/validate-event-draft-test.ts`**

Every assertion of the shape `expect(result.error).toBe('...')` (or `.toContain(...)`) becomes `expect(result.errorKey).toBe('...')` using the matching key from the list below. Example transform (apply the same substitution to every other failing-case assertion in the file, matching each existing English message to its key 1:1):

```ts
// Before:
expect(result.ok).toBe(false);
if (!result.ok) expect(result.error).toBe('Title is required.');

// After:
expect(result.ok).toBe(false);
if (!result.ok) expect(result.errorKey).toBe('titleRequired');
```

Full message -> key mapping to apply throughout the file:

| Old message | New `errorKey` |
|---|---|
| `Title is required.` | `titleRequired` |
| `Please select or add a venue.` | `venueRequired` |
| `Number of people must be a positive whole number.` | `headcountInvalid` |
| `Fee must be zero or a positive whole number.` | `feeInvalid` |
| `Duration must be a positive number of minutes.` | `durationInvalid` |
| `Skill range "from" must not be above "to".` | `skillRangeInvalid` |
| `Start time must be in 24-hour HH:MM format, e.g. 18:30.` | `startTimeFormatInvalid` |
| `Start time must be in the future.` | `startTimeMustBeFuture` |
| `Start time must be within this year or next year.` | `startTimeOutOfRange` |

- [ ] **Step 3: Update `tests/unit/create-validation-test.tsx`**

This file renders the Create screen and asserts the *displayed* (English) error text via `screen.getByText(...)`. After Task 7 wires up `t(\`errors.${errorKey}\`)`, the displayed text is still the same English string by default (`'en-US'` bucket), so **no assertion text changes here** - only re-run it after Task 7 to confirm. No edit needed in this file for this task; skip to Step 4.

- [ ] **Step 4: Run the validate-event-draft test to confirm it fails against old code**

Run: `npx jest tests/unit/validate-event-draft-test.ts`
Expected: FAIL - `result.errorKey` is `undefined` (still returns `.error`)

- [ ] **Step 5: Update `src/lib/event-draft.ts`**

```ts
export type ValidationErrorKey =
  | 'titleRequired'
  | 'venueRequired'
  | 'headcountInvalid'
  | 'feeInvalid'
  | 'durationInvalid'
  | 'skillRangeInvalid'
  | 'startTimeFormatInvalid'
  | 'startTimeMustBeFuture'
  | 'startTimeOutOfRange';

export type ValidateEventDraftResult = { ok: true; event: ValidatedEvent } | { ok: false; errorKey: ValidationErrorKey };
```

Then replace every `return { ok: false, error: '...' }` with the matching `return { ok: false, errorKey: '...' }` using the table from Step 2 (nine call sites total, one per row).

- [ ] **Step 6: Run both test files to verify they pass**

Run: `npx jest tests/unit/validate-event-draft-test.ts tests/unit/create-validation-test.tsx`
Expected: PASS - `create-validation-test.tsx` still passes unchanged because `create.tsx` hasn't been touched yet (still references the old `.error` field name, which will be a TypeScript error - see Step 7).

- [ ] **Step 7: Fix the resulting TypeScript error in `create.tsx`**

`src/lib/event-draft.ts`'s type change makes `result.error` (in `handleSubmit`, `src/app/(tabs)/create.tsx`) a compile error. Since Task 7 fully migrates this screen to `t()`, for *this* task only make the minimal fix to keep the app compiling and behavior identical:

```ts
// Before:
if (!result.ok) {
  setSubmitError(result.error);
  return;
}

// After (temporary - Task 7 replaces this with a t() call):
if (!result.ok) {
  setSubmitError(en[`errors.${result.errorKey}`]);
  return;
}
```

Add `import { en } from '@/lib/i18n';` to `create.tsx`'s imports for this interim step.

- [ ] **Step 8: Run the full suite**

Run: `npx jest`
Expected: PASS, all suites

- [ ] **Step 9: Commit**

```bash
git add src/lib/event-draft.ts src/app/\(tabs\)/create.tsx tests/unit/validate-event-draft-test.ts
git commit -m "refactor(event-draft): return typed errorKey instead of literal message"
```

---

### Task 4: `SKILL_BANDS` translation keys

**Files:**
- Modify: `src/lib/skill-bands.ts`
- Modify: `src/components/skill-band-selector.tsx`
- Test: `tests/unit/skill-band-selector-test.tsx` (new)

**Interfaces:**
- Consumes: `useI18n()` from Task 1.
- Produces: `SkillBand` type drops `label`; every consumer (Tasks 7, 8, 9, 10) reads `t(\`skillBands.${band.id}\`)` instead of `band.label`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/skill-band-selector-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

// Stable reference: see the comment in discover-test.tsx - a fresh `session`
// object literal per call breaks any screen that depends on it in a
// useCallback/useEffect dependency array.
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

// The Create screen renders VenuePicker, which fetches venues on mount -
// see create-validation-test.tsx for this same mock shape.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }),
  },
}));

describe('SkillBandSelector under zh-TW locale', () => {
  it('renders the Mandarin label for each skill band', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    // Create renders two SkillBandSelectors (skill range "from" and "to"),
    // each showing the full 7-band list, so every label appears twice.
    expect(screen.getAllByText('新手')).toHaveLength(2);
    expect(screen.getAllByText('職業級')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/skill-band-selector-test.tsx`
Expected: FAIL - text `'新手'` not found (still renders `'Novice'`)

- [ ] **Step 3: Update `src/lib/skill-bands.ts`**

Drop the `label` field from the type and every array entry:

```ts
export type SkillBand = {
  id: SkillBandId;
  min: number;
  max: number;
};

export const SKILL_BANDS: SkillBand[] = [
  { id: 'novice', min: 1, max: 3 },
  { id: 'beginner', min: 4, max: 5 },
  { id: 'early_intermediate', min: 6, max: 7 },
  { id: 'intermediate', min: 8, max: 9 },
  { id: 'intermediate_advanced', min: 10, max: 12 },
  { id: 'advanced', min: 13, max: 15 },
  { id: 'professional', min: 16, max: 18 },
];
```

This will produce TypeScript errors everywhere `.label` was read (`skill-band-selector.tsx`, `event-card.tsx`, `profile.tsx`, `event/[id].tsx`) - each is fixed in this task (selector) or its own task (the other three, Tasks 8/9/10).

- [ ] **Step 4: Update `src/components/skill-band-selector.tsx`**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { useI18n } from '@/lib/i18n';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';

type SkillBandSelectorProps = {
  selectedId: SkillBandId | null;
  onSelect: (id: SkillBandId) => void;
};

export function SkillBandSelector({ selectedId, onSelect }: SkillBandSelectorProps) {
  const { t } = useI18n();
  return (
    <View style={styles.row}>
      {SKILL_BANDS.map((band) => {
        const selected = band.id === selectedId;
        return (
          <Pressable
            key={band.id}
            onPress={() => onSelect(band.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{t(`skillBands.${band.id}`)}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// styles unchanged
```

Note: `` t(`skillBands.${band.id}`) `` - `band.id` is `SkillBandId`, so the template literal type resolves to one of the seven `'skillBands.*'` keys in `Translations`; this type-checks without a cast.

- [ ] **Step 5: `I18nProvider` must already be wired for this test to render at all**

This test needs `I18nProvider` wrapping the app (Task 5) already landed - `renderRouter` mounts the real root layout, and without `I18nProvider` in the tree, `useI18n()` throws. **Execute Task 5 before this task** (despite the numbering) if it hasn't landed yet.

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest tests/unit/skill-band-selector-test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full suite**

Run: `npx jest`
Expected: FAIL on `event-card.tsx`, `profile.tsx`, `event/[id].tsx` TypeScript errors (`.label` no longer exists) - this is expected; those are fixed in Tasks 8, 9, 10. Confirm the failures are exactly those three files' `.label` usages and nothing else.

- [ ] **Step 8: Commit**

```bash
git add src/lib/skill-bands.ts src/components/skill-band-selector.tsx tests/unit/skill-band-selector-test.tsx
git commit -m "feat(i18n): translate skill band labels, drop hardcoded label field"
```

---

### Task 5: Wire `I18nProvider` into the app + translate navigation titles

**Files:**
- Modify: `src/app/_layout.tsx`
- Modify: `src/app/(tabs)/_layout.tsx`
- Test: `tests/unit/tabs-titles-zh-test.tsx` (new)

**Interfaces:**
- Consumes: `I18nProvider`, `useI18n` from Task 1.
- Produces: every screen from here on can call `useI18n()` because the whole tree is wrapped.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/tabs-titles-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

// A stable module-level reference matters here: this test renders '/(tabs)',
// which is DiscoverScreen (the index tab) - its loadEvents useCallback
// depends on [session], which feeds a useFocusEffect. A mock that returns a
// fresh `session` object literal on every call gives that dependency a new
// identity every render, re-firing the focus effect forever and hanging the
// test until Jest's own per-test timeout kills it (see the same gotcha
// documented in tests/unit/discover-test.tsx).
const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

// DiscoverScreen's fetchDiscoverPage calls supabase.rpc('discover_events', ...),
// not supabase.from(...) - the mock must cover rpc or the render hangs
// waiting on an undefined call.
jest.mock('@/lib/supabase', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: [], error: null }),
    from: () => ({
      select: () => ({
        in: () => Promise.resolve({ data: [] }),
        eq: () => Promise.resolve({ data: [] }),
        order: () => Promise.resolve({ data: [] }),
      }),
    }),
  },
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
}));

describe('Tab bar under zh-TW locale', () => {
  it('renders Mandarin tab titles', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });
    // Both the header title and the tab bar's own label render the same
    // string (TabsLayout doesn't set headerShown: false and doesn't
    // override tabBarLabel), so more than one element carries this text.
    expect(screen.getAllByText('探索').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/tabs-titles-zh-test.tsx`
Expected: FAIL - `useI18n must be used within an I18nProvider` thrown, or Mandarin text not found

- [ ] **Step 3: Update `src/app/_layout.tsx`**

Wrap `AuthProvider` with `I18nProvider` (outermost, since `I18nProvider` has no dependency on auth state):

```tsx
import { SplashScreen, Stack } from 'expo-router';
import { useFonts, LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold } from '@expo-google-fonts/league-spartan';
import { AuthProvider, useAuth } from '@/lib/auth-context';
import { I18nProvider, useI18n } from '@/lib/i18n';
import { AppSplashScreen } from '@/components/app-splash-screen';
import { computeSplashProgress } from '@/lib/splash-progress';

SplashScreen.preventAutoHideAsync();

function SplashScreenController({ fontsLoaded }: { fontsLoaded: boolean }) {
  if (fontsLoaded) {
    SplashScreen.hide();
  }
  return null;
}

function RootNavigator() {
  const { session } = useAuth();
  const { t } = useI18n();

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="event/[id]" options={{ headerShown: true, title: t('eventDetail.headerTitle') }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

function AppBody({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { isLoading } = useAuth();
  const ready = fontsLoaded && !isLoading;

  return ready ? <RootNavigator /> : <AppSplashScreen progress={computeSplashProgress(fontsLoaded, isLoading)} />;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ LeagueSpartan_700Bold, LeagueSpartan_800ExtraBold });

  return (
    <I18nProvider>
      <AuthProvider>
        <SplashScreenController fontsLoaded={fontsLoaded} />
        <AppBody fontsLoaded={fontsLoaded} />
      </AuthProvider>
    </I18nProvider>
  );
}
```

- [ ] **Step 4: Update `src/app/(tabs)/_layout.tsx`**

```tsx
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { Court, Font } from '@/constants/badminton-theme';
import { useI18n } from '@/lib/i18n';

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

export default function TabsLayout() {
  const { t } = useI18n();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Court.featherDark,
        tabBarInactiveTintColor: Court.inkSecondary,
        tabBarStyle: { backgroundColor: Court.shuttle, borderTopColor: Court.line },
        tabBarLabelStyle: { fontFamily: Font.display, fontSize: 12 },
        headerStyle: { backgroundColor: Court.greenDeep },
        headerTintColor: '#fff',
        headerTitleStyle: { fontFamily: Font.displayBlack, fontSize: 20 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.discover'), tabBarIcon: ({ focused }) => <TabIcon emoji="🔎" focused={focused} /> }}
      />
      <Tabs.Screen
        name="create"
        options={{ title: t('tabs.create'), tabBarIcon: ({ focused }) => <TabIcon emoji="🏸" focused={focused} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: t('tabs.profile'), tabBarIcon: ({ focused }) => <TabIcon emoji="👤" focused={focused} /> }}
      />
    </Tabs>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/unit/tabs-titles-zh-test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `npx jest`
Expected: Same three pre-existing TypeScript failures from Task 4 Step 7 (`event-card.tsx`, `profile.tsx`, `event/[id].tsx` `.label` usages) - everything else passes, including every existing `*-test.tsx` (they render with the default `en-US` mock and are unaffected by `I18nProvider` being added, since it doesn't change default rendering).

- [ ] **Step 7: Commit**

```bash
git add src/app/_layout.tsx src/app/\(tabs\)/_layout.tsx tests/unit/tabs-titles-zh-test.tsx
git commit -m "feat(i18n): wire I18nProvider into the app, translate nav titles"
```

---

### Task 6: `login.tsx`

**Files:**
- Modify: `src/app/(auth)/login.tsx`
- Test: `tests/unit/login-zh-test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/login-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: null, isLoading: false, signInWithGoogle: jest.fn() }),
}));

describe('Login screen under zh-TW locale', () => {
  it('renders Mandarin sign-in copy', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/' });
    expect(screen.getByText('登入')).toBeTruthy();
    expect(screen.getByText('使用 Google 登入')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/login-zh-test.tsx`
Expected: FAIL - Mandarin text not found

- [ ] **Step 3: Update `src/app/(auth)/login.tsx`**

```tsx
import { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useAuth } from '@/lib/auth-context';
import { useI18n } from '@/lib/i18n';

export default function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);

  async function handlePress() {
    setError(null);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.signInFailed'));
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.signIn')}</Text>
      <Pressable style={styles.button} onPress={handlePress}>
        <Text style={styles.buttonText}>{t('auth.signInWithGoogle')}</Text>
      </Pressable>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

// styles unchanged
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/login-zh-test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: same pre-existing three-file failure set as Task 5 Step 6, nothing new broken

- [ ] **Step 6: Commit**

```bash
git add src/app/\(auth\)/login.tsx tests/unit/login-zh-test.tsx
git commit -m "feat(i18n): translate login screen"
```

---

### Task 7: `create.tsx` + `venue-picker.tsx`

**Files:**
- Modify: `src/app/(tabs)/create.tsx`
- Modify: `src/components/venue-picker.tsx`
- Test: `tests/unit/create-zh-test.tsx` (new)

**Interfaces:**
- Consumes: `useI18n` (Task 1), `errors.*` keys (Task 3's `ValidationErrorKey` maps 1:1 to `errors.*` key suffixes).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/create-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: { user: { id: 'fake-user-id' } }, isLoading: false }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: () => Promise.resolve({ data: [] }) }),
      insert: () => Promise.resolve({ error: null }),
    }),
  },
}));

describe('Create screen under zh-TW locale', () => {
  it('renders Mandarin field labels', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/create' });
    expect(screen.getByText('🏸 主辦比賽')).toBeTruthy();
    expect(screen.getByText('活動標題')).toBeTruthy();
    expect(screen.getByText('建立活動')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/create-zh-test.tsx`
Expected: FAIL - Mandarin text not found

- [ ] **Step 3: Update `src/app/(tabs)/create.tsx`**

Add `import { useI18n } from '@/lib/i18n';` and `const { t } = useI18n();` at the top of `CreateEventScreen`. Remove the Task 3-Step-7 interim `import { en } from '@/lib/i18n';`. Apply this substitution table (every `<Text>literal</Text>` becomes `<Text>{t('key')}</Text>`, every `placeholder="literal"` becomes `placeholder={t('key')}`):

| Old code | New code |
|---|---|
| `setSubmitError('You must be signed in to create an event.')` | `setSubmitError(t('create.mustBeSignedIn'))` |
| `setSubmitError(result.error)` | `setSubmitError(t(\`errors.${result.errorKey}\`))` |
| `err instanceof Error ? err.message : 'Could not create event.'` | `err instanceof Error ? err.message : t('create.couldNotCreate')` |
| `<Text style={styles.title}>🏸 Host a game</Text>` | `<Text style={styles.title}>{t('create.headerTitle')}</Text>` |
| `<Text style={styles.subtitle}>Fill in the details so players know what to expect</Text>` | `<Text style={styles.subtitle}>{t('create.subtitle')}</Text>` |
| `<Text style={styles.label}>Event title</Text>` | `<Text style={styles.label}>{t('create.eventTitleLabel')}</Text>` |
| `placeholder="Friendly doubles"` | `placeholder={t('create.eventTitlePlaceholder')}` |
| `<Text style={styles.label}>Description</Text>` | `<Text style={styles.label}>{t('create.descriptionLabel')}</Text>` |
| `placeholder="Optional details for players"` | `placeholder={t('create.descriptionPlaceholder')}` |
| `<Text style={styles.label}>📍 Venue</Text>` | `<Text style={styles.label}>{t('create.venueLabel')}</Text>` |
| `<Text style={styles.label}>👥 Number of players</Text>` | `<Text style={styles.label}>{t('create.playersLabel')}</Text>` |
| `<Text style={styles.label}>💰 Fee (NT$, 0 for free)</Text>` | `<Text style={styles.label}>{t('create.feeLabel')}</Text>` |
| `<FieldCard icon="📅" label="Date">` | `<FieldCard icon="📅" label={t('create.dateLabel')}>` |
| `<Text style={styles.label}>🕒 Start time (24-hour, e.g. 18:30)</Text>` | `<Text style={styles.label}>{t('create.startTimeLabel')}</Text>` |
| `placeholder="18:30"` | `placeholder={t('create.startTimePlaceholder')}` |
| `<Text style={styles.label}>⏱️ Duration (minutes)</Text>` | `<Text style={styles.label}>{t('create.durationLabel')}</Text>` |
| `<Text style={styles.label}>🏆 Skill range: from</Text>` | `<Text style={styles.label}>{t('create.skillFromLabel')}</Text>` |
| `<Text style={styles.label}>🏆 Skill range: to</Text>` | `<Text style={styles.label}>{t('create.skillToLabel')}</Text>` |
| `label={submitting ? 'Creating...' : 'Create event'}` | `label={submitting ? t('create.creating') : t('create.submit')}` |

- [ ] **Step 4: Update `src/components/venue-picker.tsx`**

Add `import { useI18n } from '@/lib/i18n';` and `const { t } = useI18n();` inside `VenuePicker`. Apply:

| Old code | New code |
|---|---|
| `setLocationError('Location permission is required to add a venue.')` | `setLocationError(t('venuePicker.locationPermissionRequired'))` |
| `err instanceof Error ? err.message : 'Could not get current location.'` | `err instanceof Error ? err.message : t('venuePicker.couldNotGetLocation')` |
| `err instanceof Error ? err.message : 'Could not save venue.'` | `err instanceof Error ? err.message : t('venuePicker.couldNotSaveVenue')` |
| `<Text style={styles.error}>Could not load venues: {loadError}</Text>` | `<Text style={styles.error}>{t('venuePicker.couldNotLoadVenues', { error: loadError })}</Text>` |
| `<Text style={styles.addVenueText}>+ Add new venue</Text>` | `<Text style={styles.addVenueText}>{t('venuePicker.addNewVenue')}</Text>` |
| `placeholder="Venue name"` | `placeholder={t('venuePicker.venueNamePlaceholder')}` |
| `placeholder="Address"` | `placeholder={t('venuePicker.addressPlaceholder')}` |
| `{locatingInProgress ? 'Getting location...' : coords ? 'Location captured' : 'Use current location'}` | `{locatingInProgress ? t('venuePicker.gettingLocation') : coords ? t('venuePicker.locationCaptured') : t('venuePicker.useCurrentLocation')}` |
| `<Text style={styles.retryText}>Retry</Text>` | `<Text style={styles.retryText}>{t('venuePicker.retry')}</Text>` |
| `{savingVenue ? 'Saving...' : 'Save venue'}` | `{savingVenue ? t('venuePicker.saving') : t('venuePicker.saveVenue')}` |

Note: `error.message` (from the Supabase `venues` select, line 39) stays untranslated - documented out-of-scope exception.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/unit/create-zh-test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite (including create-validation-test.tsx, create-submit-test.tsx)**

Run: `npx jest`
Expected: PASS - `create-validation-test.tsx` and `create-submit-test.tsx` render under the default `en-US` mock, so `t('errors.titleRequired')` resolves to the exact same English string those tests already assert on. Same pre-existing three-file failure set as before (event-card/profile/event-detail `.label`) should now be **gone for create.tsx-related code** but event-card/profile/event-detail themselves are fixed in Tasks 8-10.

- [ ] **Step 7: Commit**

```bash
git add src/app/\(tabs\)/create.tsx src/components/venue-picker.tsx tests/unit/create-zh-test.tsx
git commit -m "feat(i18n): translate create-event screen and venue picker"
```

---

### Task 8: Discover screen (`index.tsx`) + `search-bar.tsx` + `event-card.tsx`

**Files:**
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/components/search-bar.tsx`
- Modify: `src/components/event-card.tsx`
- Test: `tests/unit/discover-zh-test.tsx` (new)

**Interfaces:**
- Consumes: `useI18n`, `pluralize` (Task 1); `t(\`skillBands.${id}\`)` (Task 4); `formatFee(fee, locale)`, `formatDistance(meters, locale)`, `formatStartTime(startTime, locale)` (Task 2).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/discover-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false }),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: () => Promise.resolve({ granted: false }),
}));

jest.mock('@/lib/discover-events', () => ({
  DISCOVER_PAGE_SIZE: 10,
  fetchDiscoverPage: () =>
    Promise.resolve({
      items: [
        {
          event: {
            id: 'event-1',
            organizer_id: 'someone-else',
            title: 'Fake Friendly Doubles',
            start_time: '2026-08-01T10:00:00.000Z',
            end_time: '2026-08-01T12:00:00.000Z',
            headcount_max: 8,
            skill_min: 1,
            skill_max: 18,
            fee: 0,
            venues: { name: 'Fake Court' },
          },
          distanceMeters: null,
        },
      ],
      hasMore: false,
    }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        in: () => ({ in: () => Promise.resolve({ data: [] }) }),
        eq: () => Promise.resolve({ data: [] }),
      }),
    }),
  },
}));

describe('Discover screen under zh-TW locale', () => {
  it('renders Mandarin header and Join action', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });
    expect(await screen.findByText('🏸 探索')).toBeTruthy();
    expect(await screen.findByText('加入')).toBeTruthy();
  });
});
```

(If this fixture shape doesn't line up exactly with `fetchDiscoverPage`'s real return type, read `tests/unit/discover-test.tsx` first and match its existing mock shape exactly instead of the sketch above - that file is the authoritative reference for how this screen's dependencies are mocked.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/discover-zh-test.tsx`
Expected: FAIL - Mandarin text not found

- [ ] **Step 3: Update `src/components/search-bar.tsx`**

```tsx
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { Court, Radius, Space } from '@/constants/badminton-theme';
import { useI18n } from '@/lib/i18n';

type SearchBarProps = {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
};

export function SearchBar({ value, onChangeText, placeholder }: SearchBarProps) {
  const { t } = useI18n();
  return (
    <View style={styles.wrap}>
      <Text style={styles.icon}>🔍</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? t('searchBar.defaultPlaceholder')}
        placeholderTextColor={Court.inkSecondary}
        accessibilityLabel={t('searchBar.accessibilityLabel')}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
    </View>
  );
}

// styles unchanged
```

- [ ] **Step 4: Update `src/components/event-card.tsx`**

```tsx
import type { ReactNode } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Court, Font, Radius, Shadow, Space, SkillBandAccents } from '@/constants/badminton-theme';
import { bandForLevel } from '@/lib/skill-bands';
import { formatDistance, formatFee, formatStartTime, isPastEvent, type EventListItem } from '@/lib/events';
import { useI18n } from '@/lib/i18n';
import { Pill } from '@/components/pill';

const SKILL_SCALE_MIN = 1;
const SKILL_SCALE_MAX = 18;

function SkillGauge({ skillMin, skillMax, color, label }: { skillMin: number; skillMax: number; color: string; label: string }) {
  const scaleSpan = SKILL_SCALE_MAX - SKILL_SCALE_MIN;
  const leftPct = ((skillMin - SKILL_SCALE_MIN) / scaleSpan) * 100;
  const widthPct = ((skillMax - skillMin) / scaleSpan) * 100;
  return (
    <View style={styles.gaugeTrack} accessibilityLabel={label}>
      <View style={[styles.gaugeFill, { left: `${leftPct}%`, width: `${Math.max(widthPct, 4)}%`, backgroundColor: color }]} />
    </View>
  );
}

type EventCardProps = {
  event: EventListItem;
  action?: ReactNode;
  participantCount?: number;
  distanceMeters?: number | null;
};

export function EventCard({ event, action, participantCount, distanceMeters }: EventCardProps) {
  const { t, locale } = useI18n();
  const band = bandForLevel(event.skill_min);
  const accent = SkillBandAccents[band.id] ?? Court.green;
  const past = isPastEvent(event);

  return (
    <View style={[styles.card, Shadow.card]}>
      <View style={[styles.accentStripe, { backgroundColor: accent }]} />
      <View style={styles.body}>
        <View style={styles.headerRow}>
          <Text style={styles.title} numberOfLines={2}>
            {event.title}
          </Text>
          {past && <Pill label={t('eventCard.past')} tone="danger" />}
        </View>

        <Text style={styles.meta}>📍 {event.venues?.name ?? t('eventCard.venueTbd')}</Text>
        <Text style={styles.meta}>🕒 {formatStartTime(event.start_time, locale)}</Text>

        <SkillGauge
          skillMin={event.skill_min}
          skillMax={event.skill_max}
          color={accent}
          label={t('eventCard.skillGaugeAccessibilityLabel', { min: event.skill_min, max: event.skill_max, scaleMax: SKILL_SCALE_MAX })}
        />

        <View style={styles.pillRow}>
          <Pill
            label={t('eventCard.skillLabel', { band: t(`skillBands.${band.id}`), min: event.skill_min, max: event.skill_max })}
            tone="green"
          />
          <Pill label={formatFee(event.fee, locale)} tone="feather" />
          <Pill
            label={
              participantCount != null
                ? t('eventCard.playersCountFraction', { count: participantCount, max: event.headcount_max })
                : t('eventCard.playersUpTo', { max: event.headcount_max })
            }
            tone="neutral"
          />
          {distanceMeters != null && <Pill label={formatDistance(distanceMeters, locale)} tone="neutral" />}
        </View>

        {action && <View style={styles.actionRow}>{action}</View>}
      </View>
    </View>
  );
}

// styles unchanged
```

- [ ] **Step 5: Update `src/app/(tabs)/index.tsx`**

Add `import { useI18n, pluralize } from '@/lib/i18n';` and `const { t, locale } = useI18n();` at the top of `DiscoverScreen`. Apply:

| Old code | New code |
|---|---|
| `setError(err instanceof Error ? err.message : 'Could not load events.')` | `setError(err instanceof Error ? err.message : t('discover.couldNotLoadEvents'))` |
| `setError(err instanceof Error ? err.message : 'Could not load more events.')` | `setError(err instanceof Error ? err.message : t('discover.couldNotLoadMoreEvents'))` |
| `setJoinError(err instanceof Error ? err.message : 'Could not join event.')` | `setJoinError(err instanceof Error ? err.message : t('discover.couldNotJoin'))` |
| `setCancelError(err instanceof Error ? err.message : 'Could not cancel request.')` | `setCancelError(err instanceof Error ? err.message : t('discover.couldNotCancel'))` |
| `<Text style={styles.title}>🏸 Discover</Text>` | `<Text style={styles.title}>{t('discover.headerTitle')}</Text>` |
| `<Text style={styles.subtitle}>Find a pickup game near you</Text>` | `<Text style={styles.subtitle}>{t('discover.subtitle')}</Text>` |
| `placeholder="Search by title or venue"` | `placeholder={t('discover.searchPlaceholder')}` |
| `<Text style={styles.error}>Connection error: {error}</Text>` | `<Text style={styles.error}>{t('discover.connectionError', { error })}</Text>` |
| `<Text style={styles.emptyTitle}>{query ? 'No matches' : 'No games yet'}</Text>` | `<Text style={styles.emptyTitle}>{query ? t('discover.noMatchesTitle') : t('discover.noGamesTitle')}</Text>` |
| `{query ? 'Try a different title or venue.' : 'Be the first to host a pickup game today.'}` | `{query ? t('discover.noMatchesSubtext') : t('discover.noGamesSubtext')}` |
| `<Text style={styles.ownEventLabel}>Your event</Text>` | `<Text style={styles.ownEventLabel}>{t('discover.yourEvent')}</Text>` |
| `label="Leave event"` (accepted-request branch) | `label={t('discover.leaveEvent')}` |
| `🔔 {filledSinceApplied[event.id]} {filledSinceApplied[event.id] === 1 ? 'spot' : 'spots'} filled since you applied` | `{t('discover.spotsFilledNotice', { count: filledSinceApplied[event.id], spot: pluralize(filledSinceApplied[event.id], 'spot', 'spots', locale) })}` |
| `label="Cancel request"` | `label={t('discover.cancelRequest')}` |
| `<ActionButton label="Declined" ...>` | `<ActionButton label={t('discover.declined')} ...>` |
| `label="Join"` | `label={t('discover.join')}` |

Note: `EventCard` no longer needs a `locale` prop passed from this screen - it calls `useI18n()` itself (Step 4 above).

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest tests/unit/discover-zh-test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full suite (including discover-test.tsx, discover-join-test.tsx, discover-pagination-test.tsx, discover-search-test.tsx, discover-events-test.ts, compute-player-counts-test.ts)**

Run: `npx jest`

**Expected, narrow exception to "zero edits to pre-existing tests":** most of these pre-existing tests render under the default `en-US` mock, so `t('discover.join')` etc. resolve to the exact same English *text* they already assert on - no change needed there. But `formatFee`/`formatDistance` are different: their whole purpose (Task 2) is to make `'en-US'` produce genuinely different *numbers* (USD instead of NT$, miles instead of km) than the old un-migrated shim did. Once `EventCard` passes a real explicit locale (this task), any pre-existing test asserting the *old* NT$/metric numbers under the implicit `en-US` bucket is asserting stale, pre-feature behavior - not a regression to preserve, but the feature working correctly for the first time at this call site. Two assertions fall into this category and need updating to the new, correct `en-US` output:

- `tests/unit/discover-test.tsx:90` - `expect(screen.getByText(/NT\$150/)).toBeTruthy();` becomes `expect(screen.getByText(/\$4\.76/)).toBeTruthy();` (`formatFee(150, 'en-US')` = `150 / 31.5 = 4.7619...` → `'~$4.76 USD'`). Line 89's `expect(screen.getByText(/Free/)).toBeTruthy();` (the zero-fee case) needs NO change - `'Free'` is identical under both the old shim and the new explicit `'en-US'` branch.
- `tests/unit/discover-pagination-test.tsx:104` - `expect(screen.getAllByText('500 m away').length).toBe(DISCOVER_PAGE_SIZE);` becomes `expect(screen.getAllByText('0.3 mi away').length).toBe(DISCOVER_PAGE_SIZE);` (`formatDistance(500, 'en-US')`: `500 / 1609.34 = 0.3107mi`, not under the ~0.1mi feet threshold, so `.toFixed(1)` → `'0.3 mi away'`). Update the comment on the line above it too.

No other pre-existing test asserts on fee or distance display text (confirmed by search) - do not touch any other file's assertions. Expected result after these two edits: PASS, with the same pre-existing failure set from `profile.tsx`/`event/[id].tsx` `.label` usages (event-card.tsx's own `.label` fallout is fixed by this task).

- [ ] **Step 8: Commit**

```bash
git add src/app/\(tabs\)/index.tsx src/components/search-bar.tsx src/components/event-card.tsx tests/unit/discover-zh-test.tsx
git commit -m "feat(i18n): translate discover screen, search bar, event card"
```

---

### Task 9: `profile.tsx` + `credit-pill.tsx` + `star-rating.tsx`

**Files:**
- Modify: `src/app/(tabs)/profile.tsx`
- Modify: `src/components/credit-pill.tsx`
- Modify: `src/components/star-rating.tsx`
- Test: `tests/unit/profile-zh-test.tsx` (new)

**Interfaces:**
- Consumes: `useI18n`, `pluralize` (Task 1); `t(\`skillBands.${id}\`)` (Task 4); `formatCredit(credit, locale)` (Task 2).

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/profile-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const FAKE_SESSION = { user: { id: 'fake-user-id', email: 'fake@example.com' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: FAKE_SESSION, isLoading: false, signOut: jest.fn() }),
}));

jest.mock('@/lib/profile-data', () => ({
  loadProfileSummary: () =>
    Promise.resolve({
      profile: null,
      organizedEvents: [],
      attendingEvents: [],
      playerCounts: {},
      profileError: null,
      organizedEventsError: null,
      attendingEventsError: null,
      rostersByEventId: {},
      creditsByUserId: {},
      myRatingsByEventId: {},
    }),
}));

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('Profile screen under zh-TW locale', () => {
  it('renders Mandarin section titles', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)/profile' });
    expect(await screen.findByText('🏸 個人資料')).toBeTruthy();
    expect(await screen.findByText('我的資料')).toBeTruthy();
  });
});
```

(As with Task 8, read `tests/unit/profile-data-test.ts` and any existing `profile-*-test.tsx` first and match their exact `loadProfileSummary` mock shape rather than trusting the sketch above verbatim.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/profile-zh-test.tsx`
Expected: FAIL - Mandarin text not found

- [ ] **Step 3: Update `src/components/credit-pill.tsx`**

```tsx
import { Pill } from '@/components/pill';
import { formatCredit, type Credit } from '@/lib/ratings';
import { useI18n } from '@/lib/i18n';

type CreditPillProps = {
  credit: Credit | undefined;
};

export function CreditPill({ credit }: CreditPillProps) {
  const { locale } = useI18n();
  return <Pill label={formatCredit(credit, locale)} tone={credit ? 'feather' : 'neutral'} />;
}
```

- [ ] **Step 4: Update `src/components/star-rating.tsx`**

```tsx
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Court, Font, Space } from '@/constants/badminton-theme';
import { useI18n, pluralize } from '@/lib/i18n';

type StarRatingProps = {
  value: number;
  onChange: (score: number) => void;
  disabled?: boolean;
};

const STAR_VALUES = [1, 2, 3, 4, 5];

export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  const { t, locale } = useI18n();
  return (
    <View style={styles.row} accessibilityRole="adjustable" accessibilityLabel={t('starRating.accessibilityLabel', { value })}>
      {STAR_VALUES.map((star) => (
        <Pressable
          key={star}
          disabled={disabled}
          onPress={() => onChange(star)}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel={t('starRating.rateStars', { star, unit: pluralize(star, 'star', 'stars', locale) })}
        >
          <Text style={[styles.star, star <= value ? styles.starFilled : styles.starEmpty, disabled && styles.starDisabled]}>
            {star <= value ? '★' : '☆'}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

// styles unchanged
```

- [ ] **Step 5: Update `src/app/(tabs)/profile.tsx`**

Add `import { useI18n, pluralize } from '@/lib/i18n';` (unused `pluralize` import can be omitted here - this screen has no plural strings) - just `import { useI18n } from '@/lib/i18n';` - and `const { t, locale } = useI18n();` inside `ProfileScreen`, `PersonRow`, `RatingRow`, `FellowParticipants`, and `AttendeeRoster` (each is its own function component in this file and needs its own hook call). Apply:

| Old code | New code | Component |
|---|---|---|
| `err instanceof Error ? err.message : 'Sign-out failed'` | `err instanceof Error ? err.message : t('profile.signOutFailed')` | ProfileScreen |
| `setSaveError('Display name is required.')` | `setSaveError(t('profile.displayNameRequired'))` | ProfileScreen |
| `err instanceof Error ? err.message : 'Could not save profile.'` | `err instanceof Error ? err.message : t('profile.couldNotSaveProfile')` | ProfileScreen |
| `err instanceof Error ? err.message : 'Could not remove event.'` | `err instanceof Error ? err.message : t('profile.couldNotRemoveEvent')` | ProfileScreen |
| `err instanceof Error ? err.message : 'Could not leave event.'` | `err instanceof Error ? err.message : t('profile.couldNotLeaveEvent')` | ProfileScreen |
| `<Text style={styles.pageTitle}>🏸 Profile</Text>` | `<Text style={styles.pageTitle}>{t('profile.pageTitle')}</Text>` | ProfileScreen |
| `profile?.display_name ?? session?.user.email ?? 'Player'` | `profile?.display_name ?? session?.user.email ?? t('profile.playerFallback')` | ProfileScreen |
| `<Text style={styles.signOutLink}>Sign out</Text>` | `<Text style={styles.signOutLink}>{t('profile.signOut')}</Text>` | ProfileScreen |
| `<Text style={styles.sectionTitle}>My profile</Text>` | `<Text style={styles.sectionTitle}>{t('profile.sectionMyProfile')}</Text>` | ProfileScreen |
| `<Text style={styles.label}>🌟 Credit</Text>` | `<Text style={styles.label}>{t('profile.creditLabel')}</Text>` | ProfileScreen |
| `<Text style={styles.label}>😀 Display name</Text>` | `<Text style={styles.label}>{t('profile.displayNameLabel')}</Text>` | ProfileScreen |
| `placeholder="How other players see you"` | `placeholder={t('profile.displayNamePlaceholder')}` | ProfileScreen |
| `<Text style={styles.label}>🏆 Skill level</Text>` | `<Text style={styles.label}>{t('profile.skillLevelLabel')}</Text>` | ProfileScreen |
| `<Text style={styles.label}>📝 About me</Text>` | `<Text style={styles.label}>{t('profile.aboutMeLabel')}</Text>` | ProfileScreen |
| `placeholder="Tell other players a bit about yourself"` | `placeholder={t('profile.aboutMePlaceholder')}` | ProfileScreen |
| `<Text style={styles.label}>💬 Contact info</Text>` | `<Text style={styles.label}>{t('profile.contactInfoLabel')}</Text>` | ProfileScreen |
| `placeholder="e.g. LINE ID, phone number"` | `placeholder={t('profile.contactInfoPlaceholder')}` | ProfileScreen |
| `label={savingProfile ? 'Saving...' : 'Save profile'}` | `label={savingProfile ? t('profile.saving') : t('profile.saveProfile')}` | ProfileScreen |
| `<Text style={styles.success}>Profile saved.</Text>` | `<Text style={styles.success}>{t('profile.profileSaved')}</Text>` | ProfileScreen |
| `<Text style={styles.sectionTitle}>Games I'm playing</Text>` | `<Text style={styles.sectionTitle}>{t('profile.sectionGamesPlaying')}</Text>` | ProfileScreen |
| `<Text style={styles.emptyTitle}>No games joined yet</Text>` | `<Text style={styles.emptyTitle}>{t('profile.noGamesJoinedTitle')}</Text>` | ProfileScreen |
| `<Text style={styles.emptySubtext}>Head to Discover to find a pickup game.</Text>` | `<Text style={styles.emptySubtext}>{t('profile.noGamesJoinedSubtext')}</Text>` | ProfileScreen |
| `label="Leave event"` | `label={t('profile.leaveEvent')}` | ProfileScreen |
| `🧑 Organized by {event.organizer.display_name}` | `{t('profile.organizedBy', { name: event.organizer.display_name })}` | ProfileScreen |
| `bandForLevel(event.organizer.skill_level).label` | `` t(`skillBands.${bandForLevel(event.organizer.skill_level).id}`) `` | ProfileScreen |
| `<Text style={styles.sectionTitle}>My events</Text>` | `<Text style={styles.sectionTitle}>{t('profile.sectionMyEvents')}</Text>` | ProfileScreen |
| `<Text style={styles.emptyTitle}>No games organized yet</Text>` | `<Text style={styles.emptyTitle}>{t('profile.noGamesOrganizedTitle')}</Text>` | ProfileScreen |
| `<Text style={styles.emptySubtext}>Head to Create to host your first pickup game.</Text>` | `<Text style={styles.emptySubtext}>{t('profile.noGamesOrganizedSubtext')}</Text>` | ProfileScreen |
| `label="Remove outdated event"` | `label={t('profile.removeOutdatedEvent')}` | ProfileScreen |
| `<Text style={styles.upcomingLabel}>Upcoming</Text>` | `<Text style={styles.upcomingLabel}>{t('profile.upcoming')}</Text>` | ProfileScreen |
| `err instanceof Error ? err.message : 'Could not save rating.'` | `err instanceof Error ? err.message : t('profile.couldNotSaveRating')` | RatingRow, FellowParticipants, AttendeeRoster (all three) |
| `<Text style={styles.ratingLabel}>Rate the host</Text>` | `<Text style={styles.ratingLabel}>{t('profile.rateTheHost')}</Text>` | RatingRow |
| `name={attendee.profiles?.display_name ?? 'Unknown player'}` | `name={attendee.profiles?.display_name ?? t('profile.unknownPlayer')}` | FellowParticipants, AttendeeRoster (both) |
| `skillLevel != null && <Pill label={bandForLevel(skillLevel).label} ...>` (in `PersonRow`) | `` skillLevel != null && <Pill label={t(`skillBands.${bandForLevel(skillLevel).id}`)} ...> `` | PersonRow |
| `🏸 Also playing ({fellows.length})` | `{t('profile.alsoPlaying', { count: fellows.length })}` | FellowParticipants |
| `label="Accept"` | `label={t('profile.accept')}` | PersonRow (rendered via AttendeeRoster's `decision` prop) |
| `label="Decline"` | `label={t('profile.decline')}` | PersonRow |
| `err instanceof Error ? err.message : 'Could not update request.'` | `err instanceof Error ? err.message : t('profile.couldNotUpdateRequest')` | AttendeeRoster |
| `👥 Players ({attendees.length})` | `{t('profile.playersCount', { count: attendees.length })}` | AttendeeRoster |
| `attendee.status === 'accepted' ? 'Accepted' : attendee.status === 'declined' ? 'Declined' : 'Pending'` | `attendee.status === 'accepted' ? t('profile.statusAccepted') : attendee.status === 'declined' ? t('profile.statusDeclined') : t('profile.statusPending')` | AttendeeRoster |

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx jest tests/unit/profile-zh-test.tsx`
Expected: PASS

- [ ] **Step 7: Run the full suite (including every profile-*-test.tsx and ratings-lib-test.ts)**

Run: `npx jest`
Expected: PASS. Only `event/[id].tsx`'s `.label` usage (Task 10) should remain as a failure, if any.

- [ ] **Step 8: Commit**

```bash
git add src/app/\(tabs\)/profile.tsx src/components/credit-pill.tsx src/components/star-rating.tsx tests/unit/profile-zh-test.tsx
git commit -m "feat(i18n): translate profile screen, credit pill, star rating"
```

---

### Task 10: `event/[id].tsx`

**Files:**
- Modify: `src/app/event/[id].tsx`
- Test: `tests/unit/event-detail-zh-test.tsx` (new)

- [ ] **Step 1: Write the failing test**

```tsx
// tests/unit/event-detail-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({ session: { user: { id: 'fake-user-id' } }, isLoading: false }),
}));

jest.mock('@/lib/profile-data', () => ({
  getEventDetail: () => Promise.resolve(null),
}));

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('Event detail screen under zh-TW locale', () => {
  it('renders the Mandarin not-found message', async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/event/missing-id' });
    expect(await screen.findByText('找不到此活動。')).toBeTruthy();
  });
});
```

(Read `tests/unit/event-detail-test.tsx` first and match its exact mock shape for `getEventDetail` and routing rather than trusting the sketch above verbatim.)

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx jest tests/unit/event-detail-zh-test.tsx`
Expected: FAIL - Mandarin text not found

- [ ] **Step 3: Update `src/app/event/[id].tsx`**

Add `import { useI18n } from '@/lib/i18n';` and `const { t } = useI18n();` inside `EventDetailScreen`. Apply:

| Old code | New code |
|---|---|
| `<Text style={styles.notFound}>Event not found.</Text>` | `<Text style={styles.notFound}>{t('eventDetail.notFound')}</Text>` |
| `<Text style={styles.sectionTitle}>About this game</Text>` | `<Text style={styles.sectionTitle}>{t('eventDetail.aboutThisGame')}</Text>` |
| `🧑 Organized by {event.organizer.display_name}` | `{t('eventDetail.organizedBy', { name: event.organizer.display_name })}` |
| `bandForLevel(event.organizer.skill_level).label` | `` t(`skillBands.${bandForLevel(event.organizer.skill_level).id}`) `` |

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx jest tests/unit/event-detail-zh-test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full suite**

Run: `npx jest`
Expected: PASS, zero failures - every `.label` usage from Task 4 is now fixed (skill-band-selector in Task 4, event-card in Task 8, profile in Task 9, event-detail here).

- [ ] **Step 6: Commit**

```bash
git add src/app/event/\[id\].tsx tests/unit/event-detail-zh-test.tsx
git commit -m "feat(i18n): translate event detail screen"
```

---

### Task 11: `app-splash-screen.tsx`

**Files:**
- Modify: `src/components/app-splash-screen.tsx`
- Test: `tests/unit/splash-screen-zh-test.tsx` (new)

- [ ] **Step 1: Confirm the existing test's rendering approach**

`tests/unit/splash-screen-test.tsx` renders the *whole app* via `renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' })` with `useAuth` mocked to `isLoading: true` forever, so `RootLayout` never gets past `AppSplashScreen`. Since Task 5 wraps `RootLayout`'s entire tree in `I18nProvider`, this test already runs `AppSplashScreen` inside a real `I18nProvider` with no changes needed - it just doesn't currently assert on any translatable text (only `testID`s and a `queryByText('🏸 Discover')` negative check, which stays valid unchanged since that string is still `en-US`'s tab title under the default mock).

- [ ] **Step 2: Write the failing test, mirroring the existing file's exact pattern**

```tsx
// tests/unit/splash-screen-zh-test.tsx
import { renderRouter, screen } from 'expo-router/testing-library';

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
  useLocales: () => [{ languageTag: 'zh-TW', languageCode: 'zh', regionCode: 'TW', textDirection: 'ltr' }],
}));

const FAKE_SESSION = { user: { id: 'fake-user-id' } };

jest.mock('@/lib/auth-context', () => ({
  AuthProvider: ({ children }: { children: unknown }) => children,
  useAuth: () => ({
    session: FAKE_SESSION,
    isLoading: true,
    signInWithGoogle: jest.fn(),
    signOut: jest.fn(),
  }),
}));

jest.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ select: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) },
}));

it(
  'shows Mandarin splash copy under the zh-TW locale',
  async () => {
    await renderRouter({ appDir: 'src/app', overrides: {} }, { initialUrl: '/(tabs)' });

    expect(await screen.findByTestId('app-splash-screen')).toBeTruthy();
    expect(await screen.findByText('羽球')).toBeTruthy();
    expect(await screen.findByText('正在尋找您的下一場球局...')).toBeTruthy();
  },
  15000
);
```

- [ ] **Step 3: Run it to confirm it fails**

Run: `npx jest tests/unit/splash-screen-zh-test.tsx`
Expected: FAIL - Mandarin text not found

- [ ] **Step 4: Update `src/components/app-splash-screen.tsx`**

```tsx
import { View, Text, StyleSheet } from 'react-native';
import { Court, Font, Radius, Space } from '@/constants/badminton-theme';
import { useI18n } from '@/lib/i18n';

type AppSplashScreenProps = {
  progress: number;
};

export function AppSplashScreen({ progress }: AppSplashScreenProps) {
  const { t } = useI18n();
  return (
    <View style={styles.screen} testID="app-splash-screen">
      <View style={styles.badge}>
        <Text style={styles.badgeEmoji}>🏸</Text>
      </View>
      <Text style={styles.title}>{t('splash.title')}</Text>
      <Text style={styles.subtitle}>{t('splash.subtitle')}</Text>
      <View style={styles.track} testID="app-splash-progress-track">
        <View style={[styles.fill, { width: `${progress}%` }]} testID="app-splash-progress-fill" />
      </View>
    </View>
  );
}

// styles unchanged
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx jest tests/unit/splash-screen-zh-test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full suite, including `splash-screen-test.tsx` and `splash-progress-test.ts`**

Run: `npx jest`
Expected: PASS, zero failures - `splash-screen-test.tsx` (the pre-existing one) needs no changes, per Step 1.

- [ ] **Step 7: Commit**

```bash
git add src/components/app-splash-screen.tsx tests/unit/splash-screen-zh-test.tsx
git commit -m "feat(i18n): translate splash screen"
```

---

### Task 12: Final full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the complete unit/component suite**

Run: `npx jest`
Expected: PASS, zero failures, all suites (the pre-existing ~21 files plus the ~10 new `*-zh-test.tsx` / `i18n-test.ts` / `format-fee-test.ts` / `format-start-time-test.ts` / `skill-band-selector-test.tsx` files from this plan)

- [ ] **Step 2: Run the TypeScript compiler standalone to catch anything Jest's transform didn't**

Run: `npx tsc --noEmit`
Expected: no errors

- [ ] **Step 3: Confirm the dictionary-parity test specifically still passes**

Run: `npx jest tests/unit/i18n-test.ts`
Expected: PASS

- [ ] **Step 4: List every test file that ran, for a final human-readable confirmation**

Run: `npx jest --listTests`
Expected: includes every file named in this plan; visually confirm none were accidentally skipped by a stray `.skip`/`.only`

- [ ] **Step 5: Note the explicitly out-of-scope integration/e2e scripts**

`tests/integration/*.test.mjs` are not run by this task (they hit a live Supabase instance and need `.env.local`, per this repo's existing `test:*` npm scripts) - this was already true before this plan and is unrelated to localization. No i18n-specific work is needed there since none of those scripts render UI text.

- [ ] **Step 6: Final commit (only if Step 1-4 required any fixups not already committed)**

```bash
git add -A
git commit -m "chore(i18n): final full-suite verification pass"
```

If nothing needed fixing, skip this step - there is nothing to commit.
