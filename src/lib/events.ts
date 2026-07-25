export type EventListItem = {
  id: string;
  organizer_id: string;
  title: string;
  start_time: string;
  end_time: string;
  headcount_max: number;
  skill_min: number;
  skill_max: number;
  fee: number;
  venues: { name: string } | null;
};

export function formatStartTime(startTime: string): string {
  const date = new Date(startTime);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatFee(fee: number): string {
  return fee === 0 ? 'Free' : `NT$${fee}`;
}

export function isPastEvent(event: Pick<EventListItem, 'end_time'>, now: number = Date.now()): boolean {
  return new Date(event.end_time).getTime() < now;
}
