import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { publicSavingsStagingEnabled } from '@/features/public-savings/flags';
import OperatorWorkbench from '@/components/public-savings/OperatorWorkbench';
import '@/components/public-savings/public-savings.css';

export const metadata: Metadata = {title:'Local Staging Operator | KKISI',robots:{index:false,follow:false},referrer:'no-referrer'};
export const dynamic = 'force-dynamic';
export default function PublicSavingsOperatorPage() {if(!publicSavingsStagingEnabled()||process.env.PSS_OPERATOR_AUTH==='CONSOLE')notFound();return <OperatorWorkbench />;}
