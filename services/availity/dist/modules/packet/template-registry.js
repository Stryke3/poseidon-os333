"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTemplateSetForDeviceType = getTemplateSetForDeviceType;
const dme_generic_js_1 = require("./templates/dme-generic.js");
const registry = {
    DME_GENERIC: dme_generic_js_1.dmeGenericTemplateSet,
};
function getTemplateSetForDeviceType(deviceType) {
    const key = (deviceType ?? "DME_GENERIC").toUpperCase();
    return registry[key] ?? registry.DME_GENERIC;
}
//# sourceMappingURL=template-registry.js.map