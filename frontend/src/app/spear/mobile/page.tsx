import { requireSpearPageAuth } from "@/lib/spear-auth";
import MobileSearch from "./search/MobileSearch";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";
export const dynamic = "force-dynamic";
export default async function SpearMobilePage() { await requireSpearPageAuth("/spear/mobile"); return <><MobileSearch /><ServiceWorkerRegistration /></>; }
