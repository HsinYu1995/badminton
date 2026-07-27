import { Pill } from '@/components/pill';
import { formatCredit, type Credit } from '@/lib/ratings';
import { useI18n } from '@/lib/i18n';

type CreditPillProps = {
  // undefined = no profile_credit row - never rated, not a bad score.
  credit: Credit | undefined;
};

export function CreditPill({ credit }: CreditPillProps) {
  const { locale } = useI18n();
  return <Pill label={formatCredit(credit, locale)} tone={credit ? 'feather' : 'neutral'} />;
}
