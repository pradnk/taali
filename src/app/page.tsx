import Link from 'next/link';

import { TaaliLogo } from '@/components/taali-mark';

/**
 * The bare domain. Anyone arriving here is either a team member on their way to
 * sign in, or someone who was sent a certificate link and dropped the last part
 * of the address -- so both get an answer.
 */
export default function HomePage() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-5 py-16">
      <h1 className="text-5xl">
        <TaaliLogo markClassName="size-14" showTagline />
      </h1>
      <p className="mt-6 text-xl leading-relaxed">
        A certificate you can hear. Your name read aloud, your award announced, and the applause
        that came with it — so being recognised is something you experience, not something you are
        told about afterwards.
      </p>
      <p className="mt-6 text-lg leading-relaxed text-ink-soft">
        Built for awards given to people who are visually impaired, and for any organisation that
        would rather hand someone a moment than a piece of paper.
      </p>
      <p className="mt-6 text-lg text-ink-soft">
        If someone sent you a certificate, open the full link they gave you. It will read the
        certificate aloud, applause and all.
      </p>
      <p className="mt-8">
        <Link
          href="/admin"
          className="inline-flex min-h-14 items-center rounded-lg bg-teal-800 px-6 text-lg font-bold text-white hover:bg-teal-900"
        >
          Team sign in
        </Link>
      </p>
    </main>
  );
}
