// Runs once before the server accepts requests. Local (APP_ENV unset/"local") keeps the existing behavior: nothing here.
// Production (APP_ENV=production) must prove its database targets before becoming ready, and otherwise exits instead of
// serving requests or silently falling back to another database.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const appEnv = process.env.APP_ENV;
  if (appEnv === undefined || appEnv === '' || appEnv === 'local') return;
  const { verifyProductionStartup, safeReason } = await import('./infrastructure/db/startup-check.ts');
  try {
    console.warn(await verifyProductionStartup(process.env));
  } catch (error) {
    console.error(`[startup] production startup refused: ${safeReason(error)}`);
    process.exit(1);
  }
}
