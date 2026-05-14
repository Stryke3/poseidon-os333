'use client';

import { useEffect } from 'react';
import {
  Activity,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Home,
  PackageCheck,
  ShieldCheck,
  Stethoscope,
  Truck,
  Baby,
  ChevronRight,
} from 'lucide-react';

const pathways = [
  { name: 'CarePath Surgical', icon: HeartPulse, desc: 'Procedure-driven recovery coordination for surgical teams.' },
  { name: 'CarePath Orthopedic', icon: Stethoscope, desc: 'Orthopedic recovery products routed through verification, documentation, and fulfillment.' },
  { name: 'CarePath Maternal', icon: Baby, desc: 'Dedicated maternal and postpartum recovery coordination.' },
  { name: 'CarePath Mobility', icon: Activity, desc: 'Mobility pathways back to function: walkers, wheelchairs, and home support.' },
  { name: 'CarePath Wound', icon: ClipboardCheck, desc: 'Wound recovery with tight documentation, product routing, and continuity.' },
  { name: 'CarePath Post-Acute', icon: Home, desc: 'The pathway does not end at discharge. The thread is held forward.' },
  { name: 'El Cuidado', icon: HeartPulse, desc: 'Bilingual care-pathway access for Spanish-speaking patients and families.' },
];

const operatingSequence = [
  { label: 'Clinical Trigger', icon: Activity, desc: 'Surgery, injury, birth, discharge, or mobility event initiates the pathway.' },
  { label: 'Intake', icon: ClipboardCheck, desc: 'Patient demographics, insurance, provider, and pathway details captured.' },
  { label: 'Eligibility Verification', icon: ShieldCheck, desc: 'Payer, plan, benefit type, coverage, and prior authorization confirmed.' },
  { label: 'Documentation Control', icon: FileText, desc: 'SWO, clinical notes, medical necessity, and packet generation governed by Trident.' },
  { label: 'Product-Pathway Selection', icon: ClipboardCheck, desc: 'Medically necessary recovery products matched to verified benefit and documentation.' },
  { label: 'Fulfillment Coordination', icon: Truck, desc: 'Coordinated delivery with tracking, vendor management, and scheduling.' },
  { label: 'Proof of Delivery', icon: PackageCheck, desc: 'Signed proof-of-delivery and tracking confirmation captured.' },
  { label: 'Billing-Ready Packet', icon: FileText, desc: 'Complete packet submitted with all documentation for clean billing.' },
  { label: 'Continuity Follow-Up', icon: Stethoscope, desc: 'Patient held in system. Next care node activated. Thread maintained.' },
];

export default function CarePathPage() {
  useEffect(() => {
    const reveals = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <main>
      <nav className="subpage-nav">
        <div className="nav-inner">
          <a href="/" className="nav-brand" aria-label="StrykeFox Medical home">
            <div className="nav-compass" aria-hidden="true">✦</div>
            <div className="nav-wordmark">
              <span className="nav-stryke">STRYKE</span><span className="nav-k">K</span><span className="nav-fox">FOX</span>
              <span className="nav-medical">MEDICAL</span>
            </div>
          </a>
          <ul className="nav-links">
            <li><a href="/carepath">CarePath</a></li>
            <li><a href="/northstar-surgical-innovations">Northstar Surgical Innovations</a></li>
            <li><a href="/login" aria-label="Open SPEAR login">SPEAR</a></li>
            <li><a href="/soc13">SoC13</a></li>
          </ul>
        </div>
      </nav>

      <section className="subpage-hero">
        <div className="subpage-hero-inner">
          <div className="reveal visible">
            <p className="subpage-eyebrow">StrykeFox Medical | CarePath</p>
            <h1 className="subpage-title">CarePath</h1>
            <p className="subpage-tagline">Care that follows the patient.</p>
            <p className="subpage-desc">
              CarePath organizes recovery products, documentation, fulfillment coordination,
              proof-of-delivery capture, and billing-ready packets across the patient journey.
            </p>
            <div className="cta-group">
              <a href="#intake" className="btn-primary">Start CarePath Intake <ChevronRight size={14} /></a>
              <a href="#pathways" className="btn-secondary">View Pathways</a>
            </div>
          </div>
          <div className="reveal reveal-delay-2 visible">
            <div className="workflow-card">
              <p className="workflow-title">Core Operating Sequence</p>
              <div className="workflow-steps">
                {operatingSequence.map((step, index) => {
                  const Icon = step.icon;
                  return (
                    <div className="workflow-step" key={step.label}>
                      <div className="step-num">{String(index + 1).padStart(2, '0')}</div>
                      <div className="step-icon"><Icon size={17} /></div>
                      <div>
                        <p className="step-label">{step.label}</p>
                        <p className="step-desc">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sub-section" id="pathways">
        <div className="reveal">
          <p className="sub-section-eyebrow">Recovery Pathways</p>
          <h2 className="sub-section-title">The <em>Owned</em> Pathways</h2>
          <p className="sub-section-body">
            CarePath does not think in product categories. It thinks in pathways.
          </p>
        </div>
        <div className="pathway-grid">
          {pathways.map((pathway, index) => {
            const Icon = pathway.icon;
            return (
              <article className={`pathway-card reveal reveal-delay-${(index % 3) + 1}`} key={pathway.name}>
                <div className="pathway-icon"><Icon size={20} /></div>
                <p className="pathway-tag">CarePath</p>
                <h3 className="pathway-name">{pathway.name}</h3>
                <p className="pathway-desc">{pathway.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      <div className="sub-section-alt" id="intake">
        <div className="sub-section-inner">
          <div className="reveal">
            <p className="sub-section-eyebrow">Patient Intake</p>
            <h2 className="sub-section-title">Patient Pathway <em>Intake</em></h2>
            <p className="sub-section-body">
              Begin a CarePath intake by providing patient and provider details below.
            </p>
          </div>
          <div className="intake-form reveal reveal-delay-1">
            <div className="intake-grid">
              <div className="intake-field">
                <label className="intake-label">Provider / Facility</label>
                <div className="intake-input-placeholder">Referring facility or provider name</div>
              </div>
              <div className="intake-field">
                <label className="intake-label">Patient Status</label>
                <div className="intake-input-placeholder">New / Existing / Transfer</div>
              </div>
              <div className="intake-field intake-field-full">
                <label className="intake-label">Required Documentation</label>
                <div className="intake-input-placeholder">SWO, clinical notes, insurance verification, medical necessity</div>
              </div>
              <div className="intake-field intake-field-full">
                <label className="intake-label">Pathway Selection</label>
                <div className="intake-chips">
                  {pathways.map((p) => (
                    <span className="intake-chip" key={p.name}>{p.name}</span>
                  ))}
                </div>
              </div>
            </div>
            <button className="btn-primary intake-submit" disabled aria-label="Submit intake form (coming soon)">
              Submit Intake <ChevronRight size={14} />
            </button>
            <p className="intake-note">Full intake form coming soon. Contact your StrykeFox representative to begin a pathway.</p>
          </div>
        </div>
      </div>

      <footer className="home-footer">
        <div className="footer-inner">
          <div className="footer-brand-col">
            <div className="footer-logo">
              <span className="nav-stryke">STRYKE</span><span className="nav-k">K</span><span className="nav-fox">FOX</span>
              <span className="nav-medical">MEDICAL</span>
            </div>
            <p className="footer-tagline">Healthcare infrastructure, engineered for what comes next.</p>
          </div>
          <div>
            <p className="footer-col-title">Platform</p>
            <ul className="footer-links">
              <li><a href="/carepath">CarePath</a></li>
              <li><a href="/northstar-surgical-innovations">Northstar Surgical Innovations</a></li>
              <li><a href="/login" aria-label="Open SPEAR login">SPEAR</a></li>
              <li><a href="/soc13">SoC13</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">External</p>
            <ul className="footer-links">
              <li><a href="https://www.adamwstryker.com" target="_blank" rel="noopener noreferrer">Adam Stryker</a></li>
              <li><a href="https://www.sensars.com" target="_blank" rel="noopener noreferrer">Sensars</a></li>
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Connect</p>
            <ul className="footer-links">
              <li><a href="mailto:adam.stryker@strykefox.com">Partner With StrykeFox</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-legal">&copy; 2026 StrykeFox Medical LLC &middot; Las Vegas, NV &middot; NPI: 1821959420</p>
          <p className="footer-motto">Healthcare infrastructure, engineered for what comes next.</p>
        </div>
      </footer>
    </main>
  );
}
