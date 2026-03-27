"use client"

import { useState } from "react"
import Link from "next/link"

import {
  HeroPanel,
  PageShell,
  SectionCard,
  SectionHeading,
} from "@/components/dashboard/DashboardPrimitives"

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

type Step = {
  title: string
  detail: string
  route?: string
  routeLabel?: string
}

type Section = {
  id: string
  eyebrow: string
  title: string
  summary: string
  steps: Step[]
}

const SECTIONS: Section[] = [
  /* 1 ── Patient Ingestion ----------------------------------------- */
  {
    id: "ingest",
    eyebrow: "Step 1",
    title: "Patient Ingestion",
    summary:
      "Patients enter the system through CSV bulk import or manual entry. Each patient record is linked to insurance, demographics, and initial order data.",
    steps: [
      {
        title: "Prepare a CSV file",
        detail:
          'Format columns: patient_first_name, patient_last_name, dob, gender, address, city, state, zip, phone, email, insurance_member_id, group_number, payer_name, hcpcs_codes (comma-separated), icd10_codes (comma-separated), date_of_service, place_of_service, total_billed. Name fields accept "Last, First" or "First Last" formats. DOB accepts MM/DD/YYYY, YYYY-MM-DD, or MM-DD-YYYY.',
      },
      {
        title: "Upload via Live Ingest",
        detail:
          'Navigate to the Intake workspace and use the Live Ingest dropzone to upload your CSV or PDF. CSV files import row-by-row, while PDFs are parsed for patient, payer, HCPCS, and diagnosis details before the system creates patient records and seeds orders automatically.',
        route: "/intake",
        routeLabel: "Open Intake Workspace",
      },
      {
        title: "Verify on the Kanban board",
        detail:
          'After import, patients appear in the Intake column of the Kanban pipeline. Each card shows patient name, payer, HCPCS codes, and order status. Click a card to open the full patient detail page.',
        route: "/intake",
        routeLabel: "View Pipeline",
      },
      {
        title: "Review patient detail",
        detail:
          'The patient detail page shows demographics, insurance, all orders with line items, diagnosis codes, documents, and predictive denial risk scores. Verify all data is correct before proceeding.',
      },
    ],
  },

  /* 2 ── Product Ordering ------------------------------------------ */
  {
    id: "orders",
    eyebrow: "Step 2",
    title: "Product Ordering",
    summary:
      "Orders represent the products and services being billed. Each order contains HCPCS procedure codes, diagnosis pointers, and billing amounts.",
    steps: [
      {
        title: "Orders auto-created on import",
        detail:
          "When a patient CSV is ingested, orders are automatically created with the HCPCS codes and ICD-10 diagnoses from the import file. Each HCPCS code becomes a line item with quantity, billed amount, and modifier fields.",
      },
      {
        title: "Review order line items",
        detail:
          'Open the patient detail page and scroll to the Orders section. Each order shows its HCPCS codes with descriptions (auto-resolved from the HCPCS lookup table), billed amounts, date of service, and place of service. Verify codes and amounts are correct.',
      },
      {
        title: "Attach supporting documents",
        detail:
          'Use the Document Manager on the patient detail page to upload required documents: Signed Written Order (SWO), CMS-1500 forms, Proof of Delivery (POD), or chart notes. Documents are stored in MinIO and linked to the specific order.',
      },
      {
        title: "Track order status",
        detail:
          'Orders progress through the pipeline: intake → documents_pending → ready_to_submit → pending_payment → paid. The Kanban board provides a visual overview of all orders across statuses.',
        route: "/intake",
        routeLabel: "View Kanban Pipeline",
      },
      {
        title: "Assign orders to reps",
        detail:
          'Admins and managers can assign patients and orders to specific representatives. Use the Assign action on the patient card or detail page to route work to the appropriate team member.',
      },
    ],
  },

  /* 3 ── Eligibility Verification ---------------------------------- */
  {
    id: "verification",
    eyebrow: "Step 3",
    title: "Eligibility Verification",
    summary:
      "Before submitting a claim, verify the patient's insurance eligibility through Availity. This confirms active coverage, member ID validity, and service type coverage.",
    steps: [
      {
        title: "Understand the eligibility check",
        detail:
          'The system sends an X12 270 (Eligibility Inquiry) transaction to Availity with the patient\'s DOB, insurance member ID, and payer information. Availity returns an X12 271 (Eligibility Response) with coverage status, benefit details, and any errors.',
      },
      {
        title: "Run eligibility check",
        detail:
          "From the Availity integration page, enter the patient's insurance details or select an existing order. The system contacts Availity via OAuth-authenticated API, submits the 270 transaction, and parses the 271 response.",
        route: "/admin/integrations/availity",
        routeLabel: "Open Availity Integration",
      },
      {
        title: "Review the response",
        detail:
          'The eligibility response shows: coverage level (individual/family), service types covered, effective dates, and any AAA rejection segments with reason codes. "Eligible" means active coverage was confirmed. "Not Eligible" may require re-checking member ID or contacting the payer.',
      },
      {
        title: "Resolve issues before claiming",
        detail:
          "If eligibility fails, common fixes include: verifying the member ID matches the insurance card exactly, confirming the patient's date of birth, checking that the payer ID in the system matches Availity's payer directory, and verifying the policy is active for the date of service.",
      },
    ],
  },

  /* 4 ── Prior Authorization --------------------------------------- */
  {
    id: "authorization",
    eyebrow: "Step 4",
    title: "Prior Authorization",
    summary:
      "Some payers and procedure codes require prior authorization before services are rendered. The Payer Intelligence engine helps identify which orders need authorization and scores the likelihood of approval.",
    steps: [
      {
        title: "Check payer rules",
        detail:
          "The Payer Intelligence module maintains payer-specific rules including which HCPCS codes require prior auth, documentation requirements, and common denial reasons. Check the payer's rules before proceeding.",
        route: "/admin/intelligence/payer",
        routeLabel: "View Payer Intelligence",
      },
      {
        title: "Review authorization scoring",
        detail:
          "The system provides a predictive authorization score for each order based on payer history, HCPCS code patterns, and documentation completeness. Higher scores indicate greater likelihood of approval without additional steps.",
      },
      {
        title: "Use playbooks for guidance",
        detail:
          "Payer Playbooks contain step-by-step instructions learned from historical claims data. Each playbook includes required documentation, common denial reasons for that payer, and recommended actions to maximize approval rates.",
        route: "/admin/playbooks",
        routeLabel: "View Payer Playbooks",
      },
      {
        title: "Run pre-submission validation",
        detail:
          "Before submitting a claim, run the pre-submission validator to check the order against all known payer rules. This catches missing documentation, incorrect modifiers, and authorization requirements before the claim reaches the clearinghouse.",
        route: "/admin/validation/pre-submit",
        routeLabel: "Pre-Submit Validation",
      },
    ],
  },

  /* 5 ── Claim Creation -------------------------------------------- */
  {
    id: "claims",
    eyebrow: "Step 5",
    title: "Claim Creation",
    summary:
      "Claims are built from order data into the ANSI X12 837P (Professional) format. The EDI service assembles patient, insurance, provider, and service line data into a compliant claim transaction.",
    steps: [
      {
        title: "Understand claim structure",
        detail:
          "An 837P claim contains: Submitter info (organization name, ISA sender ID), Receiver (payer), Subscriber (patient name, DOB, member ID, group number, address), Billing Provider (NPI, Tax ID, taxonomy code), Claim info (patient control number, charge amount, diagnosis codes), and Service Lines (HCPCS codes, dates, amounts, diagnosis pointers, modifiers).",
      },
      {
        title: "Validate before building",
        detail:
          'The system validates all required fields before claim creation: patient name, DOB, address, insurance member ID, payer assignment, HCPCS codes, at least one ICD-10 diagnosis, organization NPI and Tax ID, billed amount, and date of service. Missing fields will block submission with specific error messages.',
      },
      {
        title: "Preview the claim",
        detail:
          "Use the Validate (dry run) endpoint on the EDI Command Surface to preview the claim payload without submitting. This shows the complete JSON 837P structure and generated X12 string so you can verify all data before sending to the clearinghouse.",
        route: "/edi",
        routeLabel: "Open EDI Command Surface",
      },
      {
        title: "Review the X12 output",
        detail:
          "The raw X12 output follows the 005010 837P standard: ISA/GS/ST envelope headers, 1000A (Submitter), 1000B (Receiver/Availity), 2000A (Billing Provider with NPI and Tax ID), 2010BA (Subscriber/Patient), 2010BB (Payer), 2300 (Claim with diagnoses and service lines), and SE/GE/IEA trailers.",
      },
    ],
  },

  /* 6 ── Claim Submission ------------------------------------------ */
  {
    id: "submission",
    eyebrow: "Step 6",
    title: "Claim Submission",
    summary:
      "Submit claims through either Availity SFTP or the Stedi Healthcare API. The system handles transmission, tracks acknowledgments, and manages resubmissions.",
    steps: [
      {
        title: "Choose submission method",
        detail:
          'The system supports two methods configured via the SUBMISSION_METHOD environment variable:\n\n• Availity SFTP (default): Generates raw X12 837P and uploads to Availity\'s SFTP server (files.availity.com). Availity validates and routes to the payer.\n\n• Stedi Healthcare API: Sends a JSON 837P payload to Stedi, which handles X12 serialization and clearinghouse routing. Returns a synchronous response with status and control numbers.',
      },
      {
        title: "Submit a single claim",
        detail:
          "From the EDI Command Surface, select an order and click Submit. The system fetches all claim data, builds the 837P, runs validation, and transmits to the configured clearinghouse. A claim_submissions record is created to track the transaction.",
        route: "/edi",
        routeLabel: "Open EDI Command Surface",
      },
      {
        title: "Submit a batch",
        detail:
          "For bulk submission, use the batch endpoint to submit multiple orders at once. Each order is processed independently and tagged with a shared batch_id for tracking. Failed orders in a batch do not block other orders from submitting.",
      },
      {
        title: "Track submission status",
        detail:
          'After submission, claims progress through statuses: validated → submitted → accepted/rejected → acknowledged. The EDI Command Surface shows the most recent submissions with status, control numbers, and timestamps. For Stedi submissions, the system automatically polls for 277CA acknowledgments.',
        route: "/edi",
        routeLabel: "View Submission Status",
      },
      {
        title: "Handle rejections and resubmissions",
        detail:
          "If a claim is rejected, the rejection reason codes are stored on the submission record. Review the rejection codes, correct the underlying data (patient info, codes, amounts), and use the Resubmit action to create a new submission linked to the original. The system tracks submission count and parent submission ID for audit trail.",
      },
    ],
  },

  /* 7 ── Post-Submission ------------------------------------------- */
  {
    id: "post-submission",
    eyebrow: "Step 7",
    title: "Post-Submission & Denials",
    summary:
      "After submission, monitor for denials, manage appeals, and track revenue through the pipeline to payment.",
    steps: [
      {
        title: "Monitor the denials queue",
        detail:
          "The Denials Queue surfaces claims that have been denied by payers. Each denial shows the denial reason, payer, patient, order details, and recommended appeal strategy based on the Payer Intelligence engine.",
        route: "/admin/denials/queue",
        routeLabel: "Open Denials Queue",
      },
      {
        title: "Work appeals",
        detail:
          "For denied claims, the system generates appeal recommendations based on the denial reason and payer playbook. Each appeal tracks supporting documentation, correspondence, and resolution status.",
      },
      {
        title: "Track revenue",
        detail:
          "The Revenue Command Surface provides a real-time view of revenue across all stages: billed, submitted, accepted, paid, and denied. Use this to monitor cash flow and identify bottlenecks in the revenue cycle.",
        route: "/revenue",
        routeLabel: "Open Revenue Command",
      },
      {
        title: "Review on the Executive dashboard",
        detail:
          "The Executive dashboard aggregates KPIs across the entire revenue cycle: total billed, collection rate, denial rate, average days to payment, and pipeline value. Use this for strategic oversight.",
        route: "/executive",
        routeLabel: "Open Executive Dashboard",
      },
    ],
  },
]

const QUICK_LINKS = [
  { label: "Intake Workspace", href: "/intake", desc: "Patient import & pipeline" },
  { label: "EDI Command", href: "/edi", desc: "Claim build & submit" },
  { label: "Revenue Command", href: "/revenue", desc: "Revenue tracking" },
  { label: "Availity Integration", href: "/admin/integrations/availity", desc: "Eligibility & connectivity" },
  { label: "Payer Intelligence", href: "/admin/intelligence/payer", desc: "Payer rules & scoring" },
  { label: "Payer Playbooks", href: "/admin/playbooks", desc: "Payer-specific guidance" },
  { label: "Pre-Submit Validation", href: "/admin/validation/pre-submit", desc: "Claim validation rules" },
  { label: "Denials Queue", href: "/admin/denials/queue", desc: "Denial management" },
  { label: "Governance Hub", href: "/admin/governance", desc: "Learning & recommendations" },
  { label: "Executive Dashboard", href: "/executive", desc: "KPIs & oversight" },
  { label: "CEO Enterprise View", href: "/ceo", desc: "Enterprise-level metrics" },
  { label: "User Access Control", href: "/settings", desc: "Manage users & roles" },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function WikiPage() {
  const [activeSection, setActiveSection] = useState<string | null>(null)

  return (
    <PageShell>
      <HeroPanel
        eyebrow="Training Wiki"
        title="Operations Manual"
        description="End-to-end guide for patient ingestion, product ordering, eligibility verification, prior authorization, claim creation, and submission. Click any section to expand the step-by-step walkthrough."
        actions={
          <div className="flex flex-wrap gap-3">
            <a
              className="rounded-2xl border border-accent-blue bg-accent-blue px-4 py-3 text-sm text-white"
              href="#quick-links"
            >
              Quick Links
            </a>
            <a
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200"
              href="/settings"
            >
              Back to Settings
            </a>
          </div>
        }
      />

      {/* ── Workflow Overview ─────────────────────────────────── */}
      <section className="mt-6">
        <SectionCard>
          <SectionHeading
            eyebrow="Workflow"
            title="Revenue Cycle Pipeline"
            description="Each stage links to the next. Follow the numbered steps from patient ingestion through payment collection."
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {SECTIONS.map((section, i) => (
              <button
                key={section.id}
                onClick={() =>
                  setActiveSection(activeSection === section.id ? null : section.id)
                }
                className={`flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-semibold transition ${
                  activeSection === section.id
                    ? "border-accent-blue/40 bg-accent-blue/15 text-white shadow-lg shadow-accent-blue/10"
                    : "border-white/10 bg-white/5 text-slate-300 hover:border-white/20 hover:bg-white/10"
                }`}
                type="button"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-slate-200">
                  {i + 1}
                </span>
                {section.title}
              </button>
            ))}
          </div>
        </SectionCard>
      </section>

      {/* ── Expanded Sections ─────────────────────────────────── */}
      <section className="mt-6 grid gap-6">
        {SECTIONS.map((section) => {
          const isOpen = activeSection === section.id || activeSection === null
          if (activeSection !== null && !isOpen) return null

          return (
            <SectionCard key={section.id}>
              <SectionHeading
                eyebrow={section.eyebrow}
                title={section.title}
                description={section.summary}
                action={
                  activeSection === null ? (
                    <button
                      onClick={() => setActiveSection(section.id)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                      type="button"
                    >
                      Focus
                    </button>
                  ) : (
                    <button
                      onClick={() => setActiveSection(null)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                      type="button"
                    >
                      Show All
                    </button>
                  )
                }
              />
              <div className="grid gap-3">
                {section.steps.map((step, stepIdx) => (
                  <div
                    key={stepIdx}
                    className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan-400/30 bg-cyan-400/10 text-xs font-bold text-cyan-300">
                        {stepIdx + 1}
                      </span>
                      <div className="flex-1">
                        <h3 className="text-sm font-semibold text-white">
                          {step.title}
                        </h3>
                        <p className="mt-1.5 text-sm leading-6 text-slate-300/90 whitespace-pre-line">
                          {step.detail}
                        </p>
                        {step.route && (
                          <Link
                            href={step.route}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-accent-blue/30 bg-accent-blue/10 px-3 py-1.5 text-xs font-semibold text-accent-blue transition hover:bg-accent-blue/20"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={2}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
                              />
                            </svg>
                            {step.routeLabel}
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )
        })}
      </section>

      {/* ── Quick Links ───────────────────────────────────────── */}
      <section className="mt-6" id="quick-links">
        <SectionCard>
          <SectionHeading
            eyebrow="Navigation"
            title="Quick Links"
            description="Jump directly to any page in the system."
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {QUICK_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-[20px] border border-white/10 bg-white/[0.03] p-4 transition hover:border-accent-blue/30 hover:bg-accent-blue/5"
              >
                <p className="text-sm font-semibold text-white group-hover:text-accent-blue transition">
                  {link.label}
                </p>
                <p className="mt-1 text-xs text-slate-400">{link.desc}</p>
                <p className="mt-2 text-[10px] font-mono text-slate-500">
                  {link.href}
                </p>
              </Link>
            ))}
          </div>
        </SectionCard>
      </section>
    </PageShell>
  )
}
