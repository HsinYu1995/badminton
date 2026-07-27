import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';
import { getEventDateBounds } from '@/lib/date-range';

const START_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type EventDraft = {
  title: string;
  venueId: string | null;
  headcountText: string;
  feeText: string;
  durationMinutesText: string;
  fromBandId: SkillBandId;
  toBandId: SkillBandId;
  date: Date;
  startTimeText: string;
};

export type ValidatedEvent = {
  title: string;
  venueId: string;
  headcountMax: number;
  fee: number;
  startTime: Date;
  endTime: Date;
  skillMin: number;
  skillMax: number;
};

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

function combineDateAndTimeText(date: Date, timeText: string): Date | null {
  const match = timeText.trim().match(START_TIME_PATTERN);
  if (!match) return null;
  const combined = new Date(date);
  combined.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return combined;
}

// Every rule the Create form enforces before an Event can be inserted,
// pulled out of the screen so each rule is testable directly - stops at
// the first failing rule and returns its message, matching the form's
// existing one-error-at-a-time display. `now` defaults to the real clock
// but is injectable so the "must be in the future" rule is testable
// without faking global Date state.
export function validateEventDraft(draft: EventDraft, now: number = Date.now()): ValidateEventDraftResult {
  if (!draft.title.trim()) {
    return { ok: false, errorKey: 'titleRequired' };
  }
  if (!draft.venueId) {
    return { ok: false, errorKey: 'venueRequired' };
  }
  const headcountMax = parseInt(draft.headcountText, 10);
  if (!Number.isInteger(headcountMax) || headcountMax <= 0) {
    return { ok: false, errorKey: 'headcountInvalid' };
  }
  const fee = draft.feeText.trim() === '' ? 0 : Number(draft.feeText);
  if (!Number.isInteger(fee) || fee < 0) {
    return { ok: false, errorKey: 'feeInvalid' };
  }
  const durationMinutes = parseInt(draft.durationMinutesText, 10);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, errorKey: 'durationInvalid' };
  }
  const fromIndex = SKILL_BANDS.findIndex((band) => band.id === draft.fromBandId);
  const toIndex = SKILL_BANDS.findIndex((band) => band.id === draft.toBandId);
  if (fromIndex > toIndex) {
    return { ok: false, errorKey: 'skillRangeInvalid' };
  }
  const startTime = combineDateAndTimeText(draft.date, draft.startTimeText);
  if (!startTime) {
    return { ok: false, errorKey: 'startTimeFormatInvalid' };
  }
  if (startTime.getTime() <= now) {
    return { ok: false, errorKey: 'startTimeMustBeFuture' };
  }
  // Mirrors DatePickerField's min/max (src/lib/date-range.ts) - that only
  // constrains what the calendar widget shows, not what a manually-typed
  // <input type="date"> value can hold, so this is the actual enforcement.
  // `max` is midnight on Dec 31 of next year; end-of-day so an event
  // scheduled anywhere on that date still counts as "next year," not later.
  const { max: maxDate } = getEventDateBounds(new Date(now));
  const maxStartTime = new Date(maxDate.getFullYear(), maxDate.getMonth(), maxDate.getDate(), 23, 59, 59, 999);
  if (startTime.getTime() > maxStartTime.getTime()) {
    return { ok: false, errorKey: 'startTimeOutOfRange' };
  }
  const endTime = new Date(startTime.getTime() + durationMinutes * 60_000);

  return {
    ok: true,
    event: {
      title: draft.title.trim(),
      venueId: draft.venueId,
      headcountMax,
      fee,
      startTime,
      endTime,
      skillMin: SKILL_BANDS[fromIndex].min,
      skillMax: SKILL_BANDS[toIndex].max,
    },
  };
}
