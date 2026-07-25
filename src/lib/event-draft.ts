import { SKILL_BANDS, type SkillBandId } from '@/lib/skill-bands';

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

export type ValidateEventDraftResult = { ok: true; event: ValidatedEvent } | { ok: false; error: string };

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
    return { ok: false, error: 'Title is required.' };
  }
  if (!draft.venueId) {
    return { ok: false, error: 'Please select or add a venue.' };
  }
  const headcountMax = parseInt(draft.headcountText, 10);
  if (!Number.isInteger(headcountMax) || headcountMax <= 0) {
    return { ok: false, error: 'Number of people must be a positive whole number.' };
  }
  const fee = draft.feeText.trim() === '' ? 0 : Number(draft.feeText);
  if (!Number.isInteger(fee) || fee < 0) {
    return { ok: false, error: 'Fee must be zero or a positive whole number.' };
  }
  const durationMinutes = parseInt(draft.durationMinutesText, 10);
  if (!Number.isInteger(durationMinutes) || durationMinutes <= 0) {
    return { ok: false, error: 'Duration must be a positive number of minutes.' };
  }
  const fromIndex = SKILL_BANDS.findIndex((band) => band.id === draft.fromBandId);
  const toIndex = SKILL_BANDS.findIndex((band) => band.id === draft.toBandId);
  if (fromIndex > toIndex) {
    return { ok: false, error: 'Skill range "from" must not be above "to".' };
  }
  const startTime = combineDateAndTimeText(draft.date, draft.startTimeText);
  if (!startTime) {
    return { ok: false, error: 'Start time must be in 24-hour HH:MM format, e.g. 18:30.' };
  }
  if (startTime.getTime() <= now) {
    return { ok: false, error: 'Start time must be in the future.' };
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
