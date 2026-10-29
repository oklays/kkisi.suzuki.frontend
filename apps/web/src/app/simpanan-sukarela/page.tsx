import type { Metadata } from 'next';
import PublicSavings from '@/components/public-savings/PublicSavings';
import '@/components/public-savings/public-savings.css';

export const metadata: Metadata = { title: 'Simpanan Sukarela | KKISI', robots: {index:false,follow:false}, referrer:'no-referrer' };
export default function PublicSavingsPage() { return <PublicSavings />; }
