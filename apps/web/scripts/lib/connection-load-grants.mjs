// Gives the SYNTHETIC administrator role (role 1 in kkisi_e2e_legacy) the read slugs the measurement load needs, so API calls reach their data queries
// instead of stopping at 403. Synthetic schema only (assertE2eTarget); removed by the next scripts/e2e-cleanup.mjs (db_permissions role range 1..4).
import { PrismaClient } from '@prisma/client';
import { assertE2eTarget } from '../e2e-guards.mjs';
const db = new PrismaClient({ datasourceUrl: process.env.E2E_SEED_URL });
try {
  await assertE2eTarget(db);
  for (const slug of ['sales_view', 'items_view', 'sales_return_view', 'sales_payment_view', 'inventory_view']) {
    const have = await db.$queryRawUnsafe('SELECT COUNT(*) AS n FROM db_permissions WHERE role_id = 1 AND permissions = ?', slug);
    if (Number(have[0].n) === 0) await db.$executeRawUnsafe('INSERT INTO db_permissions (role_id, permissions) VALUES (1, ?)', slug);
  }
} finally { await db.$disconnect(); }
