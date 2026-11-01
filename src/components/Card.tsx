import type { ReactNode } from 'react';

interface CardProps {
  title: ReactNode;
  /** Optional element shown at the right of the title row. */
  aside?: ReactNode;
  className?: string;
  children: ReactNode;
  id?: string;
  testId?: string;
}

/** A sheet of paper: titled section with a soft offset shadow. */
export function Card({ title, aside, className, children, id, testId }: CardProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section className={`card ${className ?? ''}`} aria-labelledby={headingId} id={id} data-testid={testId}>
      <div className="card-head">
        <h2 className="card-title" id={headingId}>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
