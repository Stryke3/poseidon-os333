import type { DeviceTemplateSet } from "../../types/packet.js";
import { dmeGenericTemplateSet } from "./templates/dme-generic.js";

const registry: Record<string, DeviceTemplateSet> = {
  DME_GENERIC: dmeGenericTemplateSet,
};

export function getTemplateSetForDeviceType(deviceType: string | null | undefined): DeviceTemplateSet {
  const key = (deviceType ?? "DME_GENERIC").toUpperCase();
  return registry[key] ?? registry.DME_GENERIC!;
}
