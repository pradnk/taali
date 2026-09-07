import Link from 'next/link';

import { TaaliLogo } from '@/components/taali-mark';
import { Button } from '@/components/ui';
import { logout } from '@/app/login/actions';

export default function AdminLayout({ children }: LayoutProps<'/admin'>) {
  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b-2 border-line bg-paper-sunk print:hidden">
        <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <Link
            href="/admin"
            className="rounded text-lg text-teal-900 underline-offset-4 hover:underline"
          >
            <TaaliLogo />
          </Link>
          <form action={logout}>
            <Button variant="quiet" type="submit">
              Sign out
            </Button>
          </form>
        </div>
      </header>
      {children}
    </div>
  );
}
