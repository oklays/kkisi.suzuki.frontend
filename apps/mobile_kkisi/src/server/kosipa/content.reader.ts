import { dec, query, txt, type Db } from './sql.ts';

// Non-financial content that smartkkisi already maintains in the shared database. Read-only.

export type Faq = { id: number; question: string; answer: string };
export async function readFaqs(db: Db): Promise<Faq[]> {
  const r = await query<{ id: string; pertanyaan: string; jawaban: string }>(db, 'SELECT id, pertanyaan, jawaban FROM faqs ORDER BY id LIMIT 50');
  return r.map((x) => ({ id: Number(x.id), question: x.pertanyaan, answer: x.jawaban }));
}

export type Notice = { id: number; title: string; description: string; type: string | null; createdAt: string | null };
/** smartkkisi broadcast notifications (status 1). They are not per member and carry no read state. */
export async function readNotices(db: Db): Promise<Notice[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT id, title, description, type, ${txt('created_at')} AS created_at FROM notifications WHERE status = 1 ORDER BY created_at DESC, id DESC LIMIT 20`);
  return r.map((x) => ({ id: Number(x.id), title: x.title ?? '', description: x.description ?? '', type: x.type, createdAt: x.created_at }));
}

export type Favorite = { id: number; productId: number; name: string; price: string; unit: string | null };
/** smartkkisi wishlists of THIS account (users.id from the session) joined to its products. */
export async function readFavorites(db: Db, userId: number): Promise<Favorite[]> {
  const r = await query<Record<string, string | null>>(db, `SELECT w.id, w.product_id, p.name, ${dec('p.unit_price')} AS price, p.unit
    FROM wishlists w JOIN products p ON p.id = w.product_id WHERE w.customer_id = ? ORDER BY w.id DESC LIMIT 60`, [userId]);
  return r.map((x) => ({ id: Number(x.id), productId: Number(x.product_id), name: x.name ?? '', price: x.price ?? '0.00', unit: x.unit }));
}
