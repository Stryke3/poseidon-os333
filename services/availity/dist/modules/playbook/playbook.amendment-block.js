"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatPlaybookAmendmentBlock = formatPlaybookAmendmentBlock;
/** Visible delimiter so merged payer rule text is obvious in rendered documents. */
function formatPlaybookAmendmentBlock(playbook, documentType, addition) {
    return `\n\n--- Payer playbook amendment (playbookId=${playbook.id}, version=${playbook.version}, documentType=${documentType}) ---\n${addition}`;
}
//# sourceMappingURL=playbook.amendment-block.js.map