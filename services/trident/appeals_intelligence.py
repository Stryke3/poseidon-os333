from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path


class AppealsIntelligenceBuilder:
    def __init__(self, summary_path: Path, output_path: Path):
        self.summary_path = summary_path
        self.output_path = output_path

    def build(self) -> dict:
        summary = json.loads(self.summary_path.read_text())
        denial_counts = summary.get("denial_phrase_counts", {})
        process_counts = summary.get("appeal_process_counts", {})
        letter_counts = summary.get("letter_writing_counts", {})
        examples = summary.get("examples", {})

        artifact = {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "source_summary": str(self.summary_path),
            "payer_denial_clusters": self._payer_denial_clusters(denial_counts, process_counts),
            "appeal_templates_by_denial_type": self._appeal_templates(examples),
            "first_pass_submission_rules": self._first_pass_rules(denial_counts, process_counts, letter_counts),
        }
        self.output_path.parent.mkdir(parents=True, exist_ok=True)
        self.output_path.write_text(json.dumps(artifact, indent=2))
        return artifact

    def _payer_denial_clusters(self, denial_counts: dict, process_counts: dict) -> list[dict]:
        return [
            {
                "payer_family": "commercial_out_of_network",
                "dominant_denial_signals": ["out_of_network", "coverage", "authorization"],
                "evidence": {
                    "out_of_network": denial_counts.get("out_of_network", 0),
                    "coverage": denial_counts.get("coverage", 0),
                    "authorization": denial_counts.get("authorization", 0),
                },
                "operational_pattern": "Use provider dispute / appeal workflow with supporting policy and OON justification.",
            },
            {
                "payer_family": "authorization_sensitive",
                "dominant_denial_signals": ["authorization", "timely_filing"],
                "evidence": {
                    "authorization": denial_counts.get("authorization", 0),
                    "timely_filing": denial_counts.get("timely_filing", 0),
                    "deadline_mentions": process_counts.get("deadline", 0),
                },
                "operational_pattern": "Front-load prior auth, referral capture, and proof of submission timestamps before billing.",
            },
            {
                "payer_family": "medical_policy_restriction",
                "dominant_denial_signals": ["coverage", "medical_necessity", "coding"],
                "evidence": {
                    "coverage": denial_counts.get("coverage", 0),
                    "medical_necessity": denial_counts.get("medical_necessity", 0),
                    "coding": denial_counts.get("coding", 0),
                },
                "operational_pattern": "Tie clinical documentation to the payer's policy language and device-specific indications.",
            },
        ]

    def _appeal_templates(self, examples: dict) -> list[dict]:
        denial_examples = [item.get("text", "") for item in examples.get("denial_phrases", [])]
        letter_examples = [item.get("text", "") for item in examples.get("letter_phrases", [])]

        return [
            {
                "denial_type": "medical_necessity_or_experimental",
                "subject": "Request for Reconsideration and Medical Necessity Review",
                "body_outline": [
                    "State the denied claim, patient, DOS, and payer reference number.",
                    "Cite the payer medical policy and request the prior decision be reassessed and overturned.",
                    "Anchor the request to attached medical records and device-specific clinical rationale.",
                    "Close with a request for reprocessing and a contact line for follow-up.",
                ],
                "source_phrases": [text for text in letter_examples if "medically necessary" in text.lower()][:3],
            },
            {
                "denial_type": "authorization_or_referral_missing",
                "subject": "Authorization / Referral Reconsideration",
                "body_outline": [
                    "State that authorization or referral support existed or should be reconsidered.",
                    "Attach proof of authorization, referral, or submission activity.",
                    "Request reversal of the no-authorization denial and reprocessing of the claim.",
                ],
                "source_phrases": [text for text in denial_examples if "authorization" in text.lower()][:3],
            },
            {
                "denial_type": "timely_filing",
                "subject": "Timely Filing Denial Appeal",
                "body_outline": [
                    "State the payer filing deadline and the original submission date.",
                    "Attach proof of timely filing or original claim action request evidence.",
                    "Request reconsideration and reopening of the claim.",
                ],
                "source_phrases": [text for text in denial_examples if "timely filing" in text.lower()][:3],
            },
            {
                "denial_type": "out_of_network_or_coverage",
                "subject": "Provider Dispute / Coverage Reconsideration",
                "body_outline": [
                    "Frame the case as a provider dispute or coverage reconsideration.",
                    "Describe why the service, device, or provider arrangement should be covered.",
                    "Attach policy excerpts, records, and claim documentation.",
                    "Request reversal of the OON or coverage denial.",
                ],
                "source_phrases": [text for text in denial_examples if "out of network" in text.lower()][:3],
            },
        ]

    def _first_pass_rules(self, denial_counts: dict, process_counts: dict, letter_counts: dict) -> list[dict]:
        return [
            {
                "rule_id": "auth-before-submit",
                "priority": "critical",
                "trigger": "High authorization-related denial signal in corpus",
                "evidence_count": denial_counts.get("authorization", 0),
                "rule": "Do not submit until prior authorization, referral numbers, and supporting proof are stored on the order.",
            },
            {
                "rule_id": "coverage-policy-match",
                "priority": "critical",
                "trigger": "Coverage and medical-policy denials recur heavily",
                "evidence_count": denial_counts.get("coverage", 0),
                "rule": "Match HCPCS, diagnosis, and device documentation to payer coverage policy before claim submission.",
            },
            {
                "rule_id": "oon-escalation-path",
                "priority": "high",
                "trigger": "Out-of-network disputes are common in appeal corpus",
                "evidence_count": denial_counts.get("out_of_network", 0),
                "rule": "Flag OON claims for provider dispute workflow and pre-attach network exception rationale.",
            },
            {
                "rule_id": "filing-proof-required",
                "priority": "high",
                "trigger": "Timely filing denials appear in corpus and appeal templates",
                "evidence_count": denial_counts.get("timely_filing", 0),
                "rule": "Store original submission timestamp, clearinghouse receipt, and claim action proof before filing windows expire.",
            },
            {
                "rule_id": "appeal-packet-standard",
                "priority": "high",
                "trigger": "Appeal corpus repeatedly references supporting docs and contact channels",
                "evidence_count": process_counts.get("documentation_needed", 0),
                "rule": "Every appeal packet should include supporting documentation, records, policy references, payer identifiers, and explicit follow-up contact information.",
            },
            {
                "rule_id": "letter-closeout",
                "priority": "medium",
                "trigger": "Follow-up language dominates successful appeal-style documents",
                "evidence_count": letter_counts.get("follow_up", 0),
                "rule": "Close letters with reprocessing request, contact path, and explicit ask for written response.",
            },
        ]


def build_artifact(summary_path: Path, output_path: Path) -> dict:
    return AppealsIntelligenceBuilder(summary_path, output_path).build()


class AppealsIntelligenceRuntime:
    def __init__(self, artifact_path: Path):
        self.artifact_path = artifact_path

    def artifact(self) -> dict:
        if not self.artifact_path.exists():
            return {
                "payer_denial_clusters": [],
                "appeal_templates_by_denial_type": [],
                "first_pass_submission_rules": [],
            }
        return json.loads(self.artifact_path.read_text())

    def guidance(self, payer_id: str, denial_type: str | None = None, risk_tier: str | None = None) -> dict:
        artifact = self.artifact()
        cluster = self._cluster_for_payer(payer_id, artifact.get("payer_denial_clusters", []))
        selected_denial_type = denial_type or self._default_denial_type_for_cluster(cluster)
        template = self._template_for_denial_type(selected_denial_type, artifact.get("appeal_templates_by_denial_type", []))
        rules = self._rules_for_cluster(cluster, artifact.get("first_pass_submission_rules", []), risk_tier)

        return {
            "payer_id": payer_id,
            "payer_cluster": cluster,
            "denial_type": selected_denial_type,
            "appeal_template": template,
            "first_pass_rules": rules,
        }

    def _cluster_for_payer(self, payer_id: str, clusters: list[dict]) -> dict | None:
        payer = payer_id.upper()
        cluster_name = "medical_policy_restriction"
        if payer in {"UHC", "CIGNA", "AETNA", "BCBS", "ANTHEM", "OSCAR", "KAISER"}:
            cluster_name = "commercial_out_of_network"
        elif payer in {"MEDICAID", "MOLINA", "CENTENE", "WELLCARE", "CARESOURCE", "AMBETTER"}:
            cluster_name = "authorization_sensitive"

        for cluster in clusters:
            if cluster.get("payer_family") == cluster_name:
                return cluster
        return clusters[0] if clusters else None

    def _default_denial_type_for_cluster(self, cluster: dict | None) -> str:
        family = (cluster or {}).get("payer_family")
        mapping = {
            "commercial_out_of_network": "out_of_network_or_coverage",
            "authorization_sensitive": "authorization_or_referral_missing",
            "medical_policy_restriction": "medical_necessity_or_experimental",
        }
        return mapping.get(family, "medical_necessity_or_experimental")

    def _template_for_denial_type(self, denial_type: str, templates: list[dict]) -> dict | None:
        for template in templates:
            if template.get("denial_type") == denial_type:
                return template
        return templates[0] if templates else None

    def _rules_for_cluster(self, cluster: dict | None, rules: list[dict], risk_tier: str | None) -> list[dict]:
        family = (cluster or {}).get("payer_family")
        selected: list[dict] = []
        for rule in rules:
            rule_id = rule.get("rule_id", "")
            if family == "commercial_out_of_network" and rule_id in {"coverage-policy-match", "oon-escalation-path", "appeal-packet-standard"}:
                selected.append(rule)
            elif family == "authorization_sensitive" and rule_id in {"auth-before-submit", "filing-proof-required", "appeal-packet-standard"}:
                selected.append(rule)
            elif family == "medical_policy_restriction" and rule_id in {"coverage-policy-match", "letter-closeout", "appeal-packet-standard"}:
                selected.append(rule)

        if risk_tier in {"CRITICAL", "HIGH"}:
            extra = [rule for rule in rules if rule.get("rule_id") in {"appeal-packet-standard", "letter-closeout"}]
            for rule in extra:
                if rule not in selected:
                    selected.append(rule)
        return selected
