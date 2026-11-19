import { useId } from 'react';
import type { ReactNode } from 'react';

/** A region of a page named by its heading. */
export function Section({ heading, intro, children }: { heading: string; intro?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{heading}</h2>
      {intro ? <p>{intro}</p> : null}
      {children}
    </section>
  );
}
