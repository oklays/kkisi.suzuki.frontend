type Env = Record<string, string | undefined>;
/**
 * SYNTHETIC Warehouse preview flag (checkpoint 10). Off unless exactly "true". It gates the preview screens only; it never connects anything
 * and the data is fictitious. Granting the capability additionally requires the existing `toko.inventory.warehouse` capability.
 */
export function warehousePreviewEnabled(env: Env = process.env): boolean { return env.WAREHOUSE_PREVIEW_ENABLED === 'true'; }
