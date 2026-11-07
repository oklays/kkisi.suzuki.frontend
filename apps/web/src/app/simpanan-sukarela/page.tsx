import {loadStagingConfig} from '@/infrastructure/public-savings/security';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicSavingsStagingEnabled } from '@/features/public-savings/flags';
import PublicSavings from '@/components/public-savings/PublicSavings';
import '@/components/public-savings/public-savings.css';

export const metadata: Metadata = { title: 'Simpanan Sukarela | KKISI', robots: {index:false,follow:false}, referrer:'no-referrer' };
export const dynamic = 'force-dynamic';
export default async function PublicSavingsPage() { if (!publicSavingsStagingEnabled()) notFound(); const config=await loadStagingConfig();return <PublicSavings mode={config.mode} />; }
