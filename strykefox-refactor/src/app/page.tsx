'use client';

import { useEffect, useState } from 'react';
import {
  Activity,
  Baby,
  ClipboardCheck,
  FileText,
  HeartPulse,
  Home,
  Menu,
  PackageCheck,
  ShieldCheck,
  Stethoscope,
  Truck,
  Users,
  X,
} from 'lucide-react';

const navItems = [
  ['Pathways', '#pathways'],
  ['Technology', '#technology'],
  ['Platform', '#platform'],
  ['Providers', '#providers'],
  ['Maternal', '#maternal'],
];

const workflowSteps = [
  {
    label: 'Clinical Trigger',
    desc: 'Surgery, injury, birth, discharge, or mobility event initiates the pathway.',
    icon: Activity,
  },
  {
    label: 'Eligibility Verification',
    desc: 'Payer, plan, benefit type, coverage, and prior authorization requirements confirmed.',
    icon: ShieldCheck,
  },
  {
    label: 'Documentation Control',
    desc: 'SWO, clinical notes, medical necessity, and packet generation governed by Trident.',
    icon: FileText,
  },
  {
    label: 'Product-Pathway Selection',
    desc: 'Medically necessary recovery products matched to verified benefit and documentation.',
    icon: ClipboardCheck,
  },
  {
    label: 'Fulfillment + POD Capture',
    desc: 'Coordinated delivery with signed proof-of-delivery and tracking confirmation.',
    icon: Truck,
  },
  {
    label: 'Billing-Ready Packet',
    desc: 'Complete packet submitted. Patient held in system. Next care node activated.',
    icon: PackageCheck,
  },
];

const platformChips = [
  ['SFM', 'StrykeFox Medical'],
  ['SPEAR', 'Operating Engine'],
  ['POS', 'Poseidon OS'],
  ['TRI', 'Trident AI'],
  ['S13', 'SoC13 Acquisition'],
  ['NSI', 'NorthStar Surgical'],
];

const pathways = [
  {
    name: 'Surgical',
    icon: HeartPulse,
    desc: 'Procedure-driven recovery coordination. The surgical team does not need to become a recovery product logistics operation.',
    items: ['Cold Therapy', 'Compression', 'Post-Op Bracing', 'Mobility Aids', 'Recovery Kits'],
  },
  {
    name: 'Orthopedic',
    icon: Stethoscope,
    desc: 'Orthopedic recovery products routed through verification, documentation, fulfillment, and packet control.',
    items: ['Bracing', 'Walkers', 'Compression', 'Cold Therapy', 'Home Equipment'],
  },
  {
    name: 'Maternal',
    icon: Baby,
    desc: 'Maternal and postpartum recovery coordination without positioning SFM as an OB care provider.',
    items: ['Breast Pumps', 'Compression', 'Recovery Kits', 'Support Products', 'Private Pay'],
  },
  {
    name: 'Mobility',
    icon: Activity,
    desc: 'Mobility is not a product category. It is a pathway back to function.',
    items: ['Walkers', 'Wheelchairs', 'Matia Mobility', 'Home Support', 'Risers'],
  },
  {
    name: 'Wound',
    icon: ClipboardCheck,
    desc: 'Wound recovery needs require tight documentation, product routing, and continuity.',
    items: ['Compression', 'Offloading', 'Biologics-Adjacent', 'Documentation Control'],
  },
  {
    name: 'Post-Acute',
    icon: Home,
    desc: 'The pathway does not end when the patient leaves the facility. The thread is held forward.',
    items: ['Discharge Support', 'Home Recovery', 'Mobility Products', 'Transition Kits'],
  },
];

const techCards = [
  {
    name: 'Poseidon OS',
    role: 'Workflow Orchestration Layer',
    desc: 'Poseidon is the operating control layer. It owns intake, patient record creation, pathway routing, task tracking, fulfillment status, POD management, and dashboard visibility across every CarePath lane.',
    functions: [
      'Intake and patient record creation',
      'Pathway routing and task tracking',
      'Fulfillment status and POD management',
      'Cross-pathway dashboard visibility',
      'Packet storage and audit trail',
    ],
  },
  {
    name: 'Trident',
    role: 'Documentation Intelligence + AI Layer',
    desc: 'Trident turns documentation from a bottleneck into an operating advantage. Every payer rule, denial pattern, and product-pathway outcome makes the system sharper.',
    functions: [
      'Product-pathway logic and matching',
      'Payer rule and coverage intelligence',
      'Documentation checklist and missing-item flags',
      'Billing packet generation and review',
      'Denial prediction and appeals support',
    ],
  },
];

const entities = [
  ['SFM', 'StrykeFox Medical', 'Operating Platform', 'Provider relationships, billing operations, vendor relationships, DME distribution, biologics, implants, and fulfillment economics.'],
  ['SPEAR', 'Spear LLC', 'Operating Engine', 'Poseidon OS workflow orchestration and Trident AI documentation intelligence: the spine that powers every CarePath lane.'],
  ['S13', 'SoC13', 'Acquisition Vehicle', 'The strategic roll-up vehicle for ASCs, orthopedic practices, home health, PT/OT, wound clinics, and express care nodes.'],
  ['NSI', 'NorthStar Surgical', 'Clinical Innovation', '3D-printed implants, surgical navigation, international medical devices, biologics, and physician training aligned to the platform.'],
];

const providerValues = [
  ['Less Staff Drag', 'No more chasing documentation, calling vendors, or managing recovery product logistics internally.'],
  ['Cleaner Documentation', 'Trident supports every packet: SWO, clinical notes, medical necessity, POD, and review status.'],
  ['Patient Continuity', 'The patient thread does not break at discharge. CarePath holds it forward to the next care node.'],
  ['Zero Referral Economics', 'No physician commissions. No referral payments. Compliance-safe by architecture.'],
  ['Fulfillment Visibility', 'Real-time pathway status through Poseidon. See exactly where each recovery lane stands.'],
];

const maternalCards = [
  ['Live Patient Intake', 'Embedded intake captures demographics, insurance, provider details, and product pathway in real time.'],
  ['Online Ordering', 'Direct-to-patient product ordering with insurance verification and cash-pay options.'],
  ['Bilingual Access', 'English and Spanish patient-facing experience for maternal recovery coordination.'],
  ['Spear Integration', 'Every maternal intake flows into Spear. Poseidon routes. Trident documents.'],
];

function SectionHeader({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: React.ReactNode;
  body?: string;
}) {
  return (
    <div className="reveal">
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
      {body ? <p className="section-body">{body}</p> : null}
    </div>
  );
}

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

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
      <nav>
        <div className="nav-inner">
          <a href="#" className="nav-brand" aria-label="StrykeFox CarePath home">
            <div className="nav-logo-text">STRYKE<span>FOX</span></div>
            <div className="nav-sub">CarePath</div>
          </a>

          <ul className="nav-links">
            {navItems.map(([label, href]) => (
              <li key={label}><a href={href}>{label}</a></li>
            ))}
            <li><a href="#contact" className="nav-cta">Partner With Us</a></li>
          </ul>

          <button className="mobile-menu-button" onClick={() => setMenuOpen((open) => !open)} aria-label="Toggle navigation">
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {menuOpen ? (
          <div className="mobile-menu">
            {[...navItems, ['Partner With Us', '#contact']].map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)}>{label}</a>
            ))}
          </div>
        ) : null}
      </nav>

      <section className="hero">
        <div className="hero-bg" />
        <div className="hero-grid" />
        <div className="hero-line" />

        <div className="hero-inner">
          <div className="hero-left reveal visible">
            <p className="hero-eyebrow">StrykeFox Medical | Care-Pathway Infrastructure</p>
            <h1 className="hero-title">
              <span className="care">CARE</span><span className="path">PATH</span>
            </h1>
            <p className="hero-tagline">Verify<span>.</span>Document<span>.</span>Deliver</p>
            <p className="hero-desc">
              CarePath is the operating layer that sits between a clinical trigger and the patient recovery environment.
              Not a product company. Not a brace shop. Not a referral program.
              <br /><br />
              The pathway infrastructure for surgical, orthopedic, maternal, mobility, wound, and post-acute recovery:
              coordinated, documented, and delivered.
            </p>
            <div className="hero-cta-group">
              <a href="#providers" className="btn-primary">For Providers</a>
              <a href="#pathways" className="btn-secondary">View Pathways</a>
            </div>
          </div>

          <div className="hero-workflow reveal reveal-delay-2 visible">
            <div className="workflow-card">
              <p className="workflow-title">CarePath Operating Workflow</p>
              <div className="workflow-steps">
                {workflowSteps.map((step, index) => {
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

      <div className="platform-strip">
        <div className="platform-strip-inner">
          <span className="platform-label">Platform Entities</span>
          <div className="platform-entities">
            {platformChips.map(([code, name]) => (
              <div className="entity-chip" key={code}>
                <span className="entity-code">{code}</span>
                <span className="entity-name">{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="section" id="pathways">
        <SectionHeader
          eyebrow="Recovery Coordination"
          title={<>The <em>Owned</em> Pathways</>}
          body="CarePath does not think in product categories. It thinks in pathways. The product mix changes. The pathway logic does not."
        />

        <div className="pathways-grid">
          {pathways.map((pathway, index) => {
            const Icon = pathway.icon;
            return (
              <article className={`pathway-card reveal reveal-delay-${(index % 3) + 1}`} key={pathway.name}>
                <div className="pathway-icon"><Icon size={22} /></div>
                <p className="pathway-tag">CarePath</p>
                <h3 className="pathway-name">{pathway.name}</h3>
                <p className="pathway-desc">{pathway.desc}</p>
                <div className="pathway-items">
                  {pathway.items.map((item) => <span className="pathway-item" key={item}>{item}</span>)}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section-full" id="technology">
        <div className="section-inner">
          <SectionHeader
            eyebrow="Powered by Spear"
            title={<>The Intelligence <em>Engine</em></>}
            body="Spear is the operating engine behind CarePath. Poseidon orchestrates the workflow. Trident runs the documentation intelligence."
          />

          <div className="tech-grid">
            {techCards.map((tech, index) => (
              <article className={`tech-card reveal reveal-delay-${index + 1}`} key={tech.name}>
                <h3 className="tech-name">{tech.name}</h3>
                <p className="tech-role">{tech.role}</p>
                <p className="tech-desc">{tech.desc}</p>
                <div className="tech-functions">
                  {tech.functions.map((fn) => <span className="tech-fn" key={fn}>{fn}</span>)}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="platform">
        <SectionHeader
          eyebrow="The Full Platform"
          title={<>One Architecture.<br /><em>Every Layer.</em></>}
          body="CarePath is the commercial front door. SFM is the operating entity. Spear is the engine. SoC13 acquires the nodes. NSI advances the clinical edge."
        />

        <div className="entities-grid">
          {entities.map(([code, title, role, desc], index) => (
            <article className={`entity-card reveal reveal-delay-${(index % 3) + 1}`} key={code}>
              <div className="entity-code-large">{code}</div>
              <h3 className="entity-title">{title}</h3>
              <p className="entity-role-tag">{role}</p>
              <p className="entity-desc">{desc}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section-full provider-section" id="providers">
        <div className="section-inner provider-inner">
          <div className="reveal">
            <p className="section-eyebrow">For Providers</p>
            <h2 className="section-title">Your staff focuses<br />on <em>patients.</em><br />We own the pathway.</h2>
            <p className="provider-pitch">
              We take the recovery product workflow off your staff while preserving documentation, visibility, and patient continuity.
            </p>
            <a href="#contact" className="btn-primary">Partner With CarePath</a>
          </div>

          <div className="value-list reveal reveal-delay-2">
            {providerValues.map(([label, desc]) => (
              <div className="value-item" key={label}>
                <span className="value-label">{label}</span>
                <span className="value-desc">{desc}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="maternal-section" id="maternal">
        <div className="maternal-inner">
          <div className="reveal">
            <div className="maternal-badge"><span>CarePath Maternal - English + Espanol</span></div>
            <p className="section-eyebrow">Maternal Recovery</p>
            <h2 className="section-title">Recovery starts<br />before<br /><em>they leave.</em></h2>
            <p className="section-body maternal-copy">
              CarePath Maternal is a dedicated maternal and postpartum recovery coordination window: live patient intake,
              online ordering, direct fulfillment, and Spear integration.
            </p>
            <p className="section-body maternal-copy">
              This is not a product page. It is an intake and coordination engine for maternal recovery: verified,
              documented, and delivered.
            </p>
            <div className="hero-cta-group">
              <a href="#" className="btn-primary">English Portal</a>
              <a href="#" className="btn-secondary">Portal en Espanol</a>
            </div>
          </div>

          <div className="maternal-cards reveal reveal-delay-2">
            {maternalCards.map(([title, desc]) => (
              <article className="maternal-card" key={title}>
                <h4 className="maternal-card-title">{title}</h4>
                <p className="maternal-card-desc">{desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-section" id="contact">
        <div className="contact-inner reveal">
          <p className="section-eyebrow centered">Partner With StrykeFox</p>
          <h2 className="contact-title">Ready to own<br />the <em>pathway?</em></h2>
          <p className="contact-desc">
            CarePath partners with surgical groups, orthopedic practices, ASCs, OB groups, wound clinics, and discharge-heavy
            providers who need disciplined recovery coordination without turning their practice into a supply operation.
          </p>
          <div className="contact-options">
            <a href="mailto:adam.stryker@strykefox.com" className="btn-primary">Contact Our Team</a>
            <a href="/physicians" className="btn-secondary">Rep Portal</a>
          </div>
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <div>
            <div className="footer-brand-name">STRYKE<span>FOX</span> MEDICAL</div>
            <div className="footer-brand-tag">CarePath Infrastructure Platform</div>
            <p className="footer-desc">
              StrykeFox CarePath is the care-pathway infrastructure layer for surgical, orthopedic, maternal, mobility,
              wound, and post-acute recovery coordination. Powered by Spear: Poseidon OS and Trident.
            </p>
          </div>
          <div>
            <p className="footer-col-title">Pathways</p>
            <ul className="footer-links">
              {pathways.map((pathway) => <li key={pathway.name}><a href="#pathways">CarePath {pathway.name}</a></li>)}
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Platform</p>
            <ul className="footer-links">
              {['StrykeFox Medical', 'Poseidon OS', 'Trident', 'SoC13', 'NorthStar Surgical'].map((item) => (
                <li key={item}><a href="#platform">{item}</a></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="footer-col-title">Connect</p>
            <ul className="footer-links">
              {['For Providers', 'Rep Portal', 'Maternal Portal', 'Partner With Us', 'Compliance'].map((item) => (
                <li key={item}><a href="#contact">{item}</a></li>
              ))}
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <p className="footer-legal">2026 StrykeFox Medical LLC - Las Vegas, NV | NPI: 1821959420 | Compliance-First. Patient-First.</p>
          <p className="footer-compliance">Verify . Document . Deliver</p>
        </div>
      </footer>
    </main>
  );
}
