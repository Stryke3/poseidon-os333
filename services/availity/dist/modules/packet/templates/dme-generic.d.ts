import type { DeviceTemplateSet } from "../../../types/packet.js";
/**
 * Neutral DME templates: procedural language only; all facts are placeholders into the snapshot.
 * LMN/SWO use flat placeholders (see `lmn-swo.ts`); other docs use nested paths under case/clinical/derived.
 * TODO: Add device-category-specific templates (e.g. orthotics vs respiratory) per product line.
 */
export declare const dmeGenericTemplateSet: DeviceTemplateSet;
//# sourceMappingURL=dme-generic.d.ts.map