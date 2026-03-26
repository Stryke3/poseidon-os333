import type { Playbook } from "./playbook.types.js";

/** Visible delimiter so merged payer rule text is obvious in rendered documents. */
export function formatPlaybookAmendmentBlock(
  playbook: Pick<Playbook, "id" | "version">,
  documentType: string,
  addition: string,
): string {
  return `\n\n--- Payer playbook amendment (playbookId=${playbook.id}, version=${playbook.version}, documentType=${documentType}) ---\n${addition}`;
}
