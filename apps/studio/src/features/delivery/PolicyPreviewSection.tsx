import { useId } from 'react';
import { useTranslation } from 'react-i18next';

import type { PolicyPreview } from './delivery';

/**
 * The trusted policy an import proposes, in full. The studio never installs it: an operator copies the exact
 * reviewed file into the policy directory, as a new file next to the course's current policy.
 */
export function PolicyPreviewSection({ preview }: { preview: PolicyPreview }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{t('delivery.policy.heading')}</h2>
      <p>{t('delivery.policy.intro')}</p>
      <p>{t('delivery.policy.operator', { file: preview.file })}</p>
      <pre className="alm-code" data-testid="policy-preview">{preview.json}</pre>
    </section>
  );
}
