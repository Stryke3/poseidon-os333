"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const app_js_1 = __importDefault(require("./app.js"));
exports.app = app_js_1.default;
const prisma_js_1 = require("./lib/prisma.js");
const config_js_1 = require("./config.js");
const logger_js_1 = require("./lib/logger.js");
const audit_js_1 = require("./lib/audit.js");
(0, audit_js_1.setAuditPrisma)(prisma_js_1.prisma);
async function main() {
    await prisma_js_1.prisma.$connect();
    logger_js_1.logger.info("Connected to database");
    app_js_1.default.listen(config_js_1.config.port, () => {
        logger_js_1.logger.info({ port: config_js_1.config.port }, "Availity integration service started");
    });
}
main().catch((err) => {
    logger_js_1.logger.fatal({ err }, "Failed to start");
    process.exit(1);
});
//# sourceMappingURL=index.js.map