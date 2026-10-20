import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { PrivateWorkspace } from '@/components/console/kosipa/PrivateWorkspace';
import { KosipaNotice } from '@/components/console/kosipa/KosipaNotice';
import { syntheticKosipaEnvironment } from '@/components/console/kosipa/presentation';
import { requireConsoleSession } from '@/infrastructure/auth/page-guard';
import { consoleEnabled } from '@/infrastructure/console/flags';
import './kosipa.css';

export default async function KosipaLayout({ children }: { children: ReactNode }) {
  if (!consoleEnabled()) notFound();
  const auth = await requireConsoleSession({ next: '/console/kosipa' });
  if (auth.kind !== 'ok') return <KosipaNotice state="unavailable" />;
  return <div className="kosipa-module" key={`${auth.ctx.userId}:${auth.ctx.companyId}`}>
    {syntheticKosipaEnvironment(process.env) && <p className="kosipa-environment" role="note"><span aria-hidden="true" />DATA SINTETIS — UNTUK PENGUJIAN <small>DEV Local</small></p>}
    <PrivateWorkspace>{children}</PrivateWorkspace>
  </div>;
}
