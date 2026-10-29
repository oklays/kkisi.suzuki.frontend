import type { PosProduct } from "@/features/pos/types";
import { formatSen } from "../money/format.ts";
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

/** Display only: takes integer sen and uses the shared KKISI Rupiah standard (`Rp3.500`, `Rp4.000,10`). */
export function formatRupiah(sen: number): string {
  return formatSen(sen);
}
