import { useTranslation } from 'react-i18next';

/** A recorded time in the reader's language; a value that is not a time is shown as recorded. */
export function useWhen(): (at: string) => string {
  const { i18n } = useTranslation();
  const format = new Intl.DateTimeFormat(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });
  return (at) => {
    const time = new Date(at);
    return Number.isNaN(time.getTime()) ? at : format.format(time);
  };
}
