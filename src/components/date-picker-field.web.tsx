import { Court, Radius, Space } from '@/constants/badminton-theme';
import { getEventDateBounds } from '@/lib/date-range';

// @expo/ui's DateTimePicker has no web implementation at all -
// node_modules/@expo/ui/src/community/datetime-picker/DateTimePicker.web.tsx
// is a hard-coded `return null`, so Create's date field silently rendered
// nothing on web with no error. This is the web-only replacement Metro picks
// up automatically via the `.web.tsx` extension - a plain native `<input
// type="date">`, which every browser already ships a real picker UI for.
type DatePickerFieldProps = {
  value: Date;
  onChange: (date: Date) => void;
};

// Local calendar-date <-> the yyyy-mm-dd string <input type="date"> reads/
// writes - deliberately not UTC-based, since `value` is combined with a
// separate local time-of-day string elsewhere (see event-draft.ts's
// combineDateAndTimeText), so shifting to UTC here would drift the date by
// a day near midnight in timezones ahead of UTC.
function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function fromDateInputValue(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function DatePickerField({ value, onChange }: DatePickerFieldProps) {
  const { min, max } = getEventDateBounds();
  return (
    <input
      type="date"
      value={toDateInputValue(value)}
      min={toDateInputValue(min)}
      max={toDateInputValue(max)}
      onChange={(event) => {
        const parsed = fromDateInputValue(event.target.value);
        if (parsed) onChange(parsed);
      }}
      style={{
        width: '100%',
        boxSizing: 'border-box',
        padding: 10,
        borderRadius: Radius.md,
        border: `1px solid ${Court.line}`,
        backgroundColor: Court.shuttle,
        color: Court.ink,
        fontSize: 14,
        marginTop: Space.xs,
      }}
    />
  );
}
