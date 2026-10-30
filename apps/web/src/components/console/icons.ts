import {
  ArrowLeftRight, BookText, CalendarClock, ChartColumn, CircleHelp, ClipboardCheck, Eye, FileSpreadsheet, FileText, FileUser, HandCoins, HeartHandshake,
  Landmark, LayoutDashboard, LayoutGrid, Link2, MapPin, KeyRound, Monitor, Package, PackageCheck, PiggyBank, ReceiptText, Settings, ShieldCheck, ShoppingCart, Truck,
  Undo2, Users, Wallet, Warehouse, type LucideIcon,
} from 'lucide-react';
import type { ConsoleIcon } from '@/features/console/navigation';

/**
 * Registry icon keys -> lucide components, the only place icons are chosen. Shared by server (dashboard) and client (sidebar) components.
 * The Record type makes a registry entry without a drawable icon a compile error.
 */
export const CONSOLE_ICONS: Record<ConsoleIcon, LucideIcon> = {
  dashboard: LayoutDashboard, kosipa: Landmark, toko: ShoppingCart, warehouse: Warehouse, reports: ChartColumn, settings: Settings,
  overview: LayoutGrid, members: Users, savings: PiggyBank, voluntary: HeartHandshake, loans: HandCoins, installments: CalendarClock, payroll: Wallet,
  reportMembers: FileUser, reportSavings: BookText, reportLoans: FileText, reportPayroll: FileSpreadsheet, quality: ShieldCheck,
  pos: Monitor, history: ReceiptText, returns: Undo2, products: Package,
  stockOpname: ClipboardCheck, preview: Eye, distribution: Truck, mapping: ArrowLeftRight, receiving: PackageCheck, identity: Link2, masterData: MapPin, access: KeyRound,
  help: CircleHelp,
};
