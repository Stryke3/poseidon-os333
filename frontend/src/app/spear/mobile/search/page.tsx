import { requireSpearPageAuth } from "@/lib/spear-auth";
import MobileSearch from "./MobileSearch";

export const dynamic = "force-dynamic";

export default async function MobileSearchPage() {
  await requireSpearPageAuth("/spear/mobile/search");
  return <MobileSearch/>;
}
