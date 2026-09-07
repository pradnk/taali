'use client';

import { useActionState } from 'react';

import { Alert, Button, Field, Input } from '@/components/ui';
import { login, type LoginState } from './actions';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="next" value={next} />

      {state.error && <Alert>{state.error}</Alert>}

      <Field
        id="passcode"
        label="Team passcode"
        hint="Ask whoever set up this site for the passcode. It is the same for everyone on the team."
        invalid={Boolean(state.error)}
      >
        {(props) => (
          <Input
            {...props}
            name="passcode"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        )}
      </Field>

      <Button type="submit" disabled={pending} className="min-h-14 text-lg">
        {pending ? 'Checking…' : 'Sign in'}
      </Button>
    </form>
  );
}
