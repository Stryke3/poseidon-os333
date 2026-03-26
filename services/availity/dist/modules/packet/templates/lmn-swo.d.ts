/**
 * LMN / SWO bodies — placeholders must be supplied via user/case input only.
 * No diagnosis or history is invented here; empty/marker values mean "not supplied by user".
 * Fixed attestation wording is legal boilerplate only — it does not add patient-specific facts.
 */
export declare const LMN_TEMPLATE = "\nPatient: {{patientName}}\nDOB: {{dob}}\n\nDiagnosis (user-entered text only \u2014 never inferred by the system):\n{{diagnosis}}\n\nMedical Necessity:\nThe patient requires {{device}} due to the following clinical indications:\n{{clinicalJustification}}\n\nFunctional Limitations:\n{{limitations}}\n\nPrevious Treatments:\n{{failedTreatments}}\n\nPhysician Statement (fixed boilerplate \u2014 does not introduce facts beyond structured fields above):\nI certify that this device is medically necessary.\n\nPhysician:\n{{physicianName}}\nNPI: {{npi}}\n\n---\nNon-clinical workflow (ML / routing): {{mlRoutingNote}}\n";
export declare const SWO_TEMPLATE = "\nPatient: {{patientName}}\nDOB: {{dob}}\n\nDevice: {{device}}\nHCPCS Code: {{hcpcs}}\n\nOrder Date: {{orderDate}}\n\nPhysician:\n{{physicianName}}\nNPI: {{npi}}\n\nSignature Required\n\n---\nNon-clinical workflow (ML / routing): {{mlRoutingNote}}\n";
//# sourceMappingURL=lmn-swo.d.ts.map