import type { ComponentProps, ReactNode } from 'react';

/**
 * Shared UI primitives.
 *
 * Deliberately built on native HTML elements -- <button>, <input>, <select>,
 * <table> -- rather than a headless component library. Native controls already
 * carry correct roles, keyboard behaviour and platform screen-reader support,
 * and for a product whose users navigate with VoiceOver, NVDA and TalkBack that
 * is worth more than styling flexibility.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

const BUTTON_BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 font-bold ' +
  'transition-colors disabled:cursor-not-allowed disabled:opacity-50';

const BUTTON_VARIANTS = {
  primary: 'bg-teal-800 text-white hover:bg-teal-900',
  secondary: 'border-2 border-teal-800 bg-paper text-teal-900 hover:bg-teal-50',
  danger: 'border-2 border-danger bg-paper text-danger hover:bg-danger-bg',
  quiet: 'text-teal-900 underline underline-offset-4 hover:bg-teal-50',
} as const;

export function Button({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

export function LinkButton({
  variant = 'primary',
  className,
  ...props
}: ComponentProps<'a'> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return <a className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

const CONTROL =
  'min-h-11 w-full rounded-lg border-2 border-line bg-paper px-3 text-ink ' +
  'placeholder:text-ink-soft/70 focus:border-teal-700';

/**
 * A labelled form control. The label is always rendered and always associated
 * with the input -- never a placeholder standing in for a label, which
 * disappears on focus and is skipped by some screen readers.
 */
export function Field({
  label,
  hint,
  error,
  invalid,
  id,
  children,
}: {
  label: string;
  hint?: string;
  /** Inline message shown beneath the control. */
  error?: string;
  /**
   * Marks the control invalid without printing a message here. Use when the
   * explanation is already carried by a role="alert" elsewhere on the page, so
   * a screen reader does not read the same sentence twice.
   */
  invalid?: boolean;
  id: string;
  children: (props: {
    id: string;
    className: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
  }) => ReactNode;
}) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-bold">
        {label}
      </label>
      {hint && (
        <p id={hintId} className="text-sm text-ink-soft">
          {hint}
        </p>
      )}
      {children({
        id,
        className: CONTROL,
        'aria-describedby': describedBy,
        'aria-invalid': error || invalid ? true : undefined,
      })}
      {error && (
        <p id={errorId} className="font-bold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input(props: ComponentProps<'input'>) {
  return <input {...props} className={cx(CONTROL, props.className)} />;
}

export function Select(props: ComponentProps<'select'>) {
  return <select {...props} className={cx(CONTROL, props.className)} />;
}

export function Textarea(props: ComponentProps<'textarea'>) {
  return <textarea {...props} className={cx(CONTROL, 'min-h-24 py-2', props.className)} />;
}

/**
 * An error message that screen readers announce as soon as it appears.
 * role="alert" is deliberate: a failed action should interrupt, not wait for
 * the user to wander onto it.
 */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-lg border-2 border-danger bg-danger-bg px-4 py-3 font-bold text-danger"
    >
      {children}
    </p>
  );
}

export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cx('card rounded-xl border-2 border-line bg-paper p-6', className)}
      {...props}
    />
  );
}
