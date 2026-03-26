"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rejectGovernanceRecommendation = exports.approveGovernanceRecommendation = exports.createDraftFromRecommendation = exports.governanceService = exports.GovernanceService = void 0;
const prisma_js_1 = require("../../lib/prisma.js");
const governance_decision_service_js_1 = require("../governance/governance.decision.service.js");
Object.defineProperty(exports, "approveGovernanceRecommendation", { enumerable: true, get: function () { return governance_decision_service_js_1.approveGovernanceRecommendation; } });
Object.defineProperty(exports, "rejectGovernanceRecommendation", { enumerable: true, get: function () { return governance_decision_service_js_1.rejectGovernanceRecommendation; } });
const governance_draft_service_js_1 = require("../governance/governance.draft.service.js");
Object.defineProperty(exports, "createDraftFromRecommendation", { enumerable: true, get: function () { return governance_draft_service_js_1.createDraftFromRecommendation; } });
class GovernanceService {
    db;
    constructor(db = prisma_js_1.prisma) {
        this.db = db;
    }
    async approveRecommendation(recommendationId, decidedBy, notes) {
        await (0, governance_decision_service_js_1.approveGovernanceRecommendation)(this.db, recommendationId, decidedBy, notes);
        return this.db.governanceRecommendation.findUnique({
            where: { id: recommendationId },
        });
    }
    async rejectRecommendation(recommendationId, decidedBy, notes) {
        await (0, governance_decision_service_js_1.rejectGovernanceRecommendation)(this.db, recommendationId, decidedBy, notes);
        return this.db.governanceRecommendation.findUnique({
            where: { id: recommendationId },
        });
    }
    async createDraftFromRecommendationForQueueItem(recommendationId, actor) {
        return (0, governance_draft_service_js_1.createDraftFromRecommendation)(this.db, recommendationId, actor);
    }
}
exports.GovernanceService = GovernanceService;
exports.governanceService = new GovernanceService();
//# sourceMappingURL=governance.service.js.map