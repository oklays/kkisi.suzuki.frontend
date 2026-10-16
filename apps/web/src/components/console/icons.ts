import {
  ArrowLeftRight, Boxes, CalendarClock, ClipboardList, HandCoins, LayoutDashboard, PackageCheck, PiggyBank, ShoppingBag, Undo2,
  Users, Wallet, Warehouse, Link2, type LucideIcon,
} from 'lucide-react';
import type { ConsoleIcon } from '@/features/console/navigation';

/** Registry icon keys -> lucide components. Shared by server (dashboard) and client (sidebar) components. */
export const CONSOLE_ICONS: Record<ConsoleIcon, LucideIcon> = {
  dashboard: LayoutDashboard, pos: ShoppingBag, history: ClipboardList, returns: Undo2, products: Boxes, warehouse: Warehouse,
  members: Users, savings: PiggyBank, loans: HandCoins, installments: CalendarClock, payroll: Wallet, distribution: ArrowLeftRight,
  receiving: PackageCheck, identity: Link2,
};
