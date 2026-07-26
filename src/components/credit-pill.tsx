import { Pill } from '@/components/pill';
import { formatCredit, type Credit } from '@/lib/ratings';

type CreditPillProps = {
  // undefined = no profile_credit row - never rated, not a bad score.
  credit: Credit | undefined;
};

export function CreditPill({ credit }: CreditPillProps) {
  return <Pill label={formatCredit(credit)} tone={credit ? 'feather' : 'neutral'} />;
}
