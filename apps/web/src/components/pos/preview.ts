import type { PosProduct } from "@/features/pos/types";
export { changeQuantity, hasPrice, netPriceSen, previewSubtotal } from '@koperasi/domain/pos/preview';

const families: Record<string, string> = {
  minuman: "minuman", makanan: "makanan", sembako: "sembako",
  "rumah tangga": "rumah-tangga", lainnya: "lainnya",
};

export function illustrationFamily(categoryName: string): string {
  return families[categoryName.trim().toLowerCase()] ?? "lainnya";
}

export function productIllustration(product: PosProduct): string {
  let hash = 0;
  for (const character of product.id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `/illustrations/${illustrationFamily(product.categoryName)}-illustration-${product.illustrationIndex ?? hash % 6 + 1}.svg`;
}

export function productImage(product: PosProduct): string {
  return product.imageUrl || productIllustration(product);
}

const rupiah = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const rupiahFraction = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Display only: takes integer sen, shows whole rupiah unless there is a fraction (e.g. 4000.10). */
export function formatRupiah(sen: number): string {
  return sen % 100 === 0 ? rupiah.format(sen / 100) : rupiahFraction.format(sen / 100);
}
