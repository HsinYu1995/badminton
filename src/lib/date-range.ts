// The Create screen's date field only lets a host pick within "this year or
// next year" - never a backdated event (min = today) or one planned more
// than about a year and a half out (max = December 31 of next year).
// `now` defaults to the real clock but is injectable so this is testable
// without faking global Date state.
export function getEventDateBounds(now: Date = new Date()): { min: Date; max: Date } {
  const min = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const max = new Date(now.getFullYear() + 1, 11, 31);
  return { min, max };
}
