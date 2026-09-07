import type { Metadata } from 'next';

import { TaaliLogo } from '@/components/taali-mark';
import { Card } from '@/components/ui';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const params = await searchParams;
  const nextParam = params.next;
  const next = typeof nextParam === 'string' ? nextParam : '/admin';

  return (
    <main id="main" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center p-6">
      <h1 className="mb-3 text-4xl">
        <TaaliLogo markClassName="size-11" showTagline />
      </h1>
      <p className="mb-8 text-ink-soft">
        Sign in to make certificates for your event.
      </p>
      <Card>
        <LoginForm next={next} />
      </Card>
    </main>
  );
}
