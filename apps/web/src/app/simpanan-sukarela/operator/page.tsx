import type { Metadata } from 'next';
import OperatorWorkbench from '@/components/public-savings/OperatorWorkbench';
import '@/components/public-savings/public-savings.css';

export const metadata: Metadata = {title:'Local Staging Operator | KKISI',robots:{index:false,follow:false},referrer:'no-referrer'};
export default function PublicSavingsOperatorPage() {return <OperatorWorkbench />;}
