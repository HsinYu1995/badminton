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
