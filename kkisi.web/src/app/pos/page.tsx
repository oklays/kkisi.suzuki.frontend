import { PosScreen } from "@/components/pos/PosScreen";
import { demoCategories, demoMembers, demoProducts } from "@/components/pos/fixtures";

export default function PosPage() {
  return <PosScreen products={demoProducts} categories={demoCategories} members={demoMembers} />;
}
