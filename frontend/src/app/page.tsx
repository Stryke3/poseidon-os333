import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { HomepageNav } from '@/components/homepage/HomepageNav';
import { RevealObserver } from '@/components/homepage/RevealObserver';

const SITE_URL = 'https://www.strykefox.com';

export const metadata: Metadata = {
  title:
    'StrykeFox Medical | Healthcare Infrastructure, CarePath & Medical Technology Platform',
  description:
    'StrykeFox Medical operates CarePath, NorthStar Surgical Innovations, SPEAR, SoC13, and StrykePac Ex-Im SA — integrated healthcare infrastructure for surgical commercialization, DMEPOS, recovery coordination, and device deployment across Las Vegas, Dallas, and Panama Pacífico.',
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title:
      'StrykeFox Medical | Healthcare Infrastructure, CarePath & Medical Technology Platform',
    description:
      'StrykeFox Medical builds the operating layer for recovery coordination, medical device workflows, reimbursement-ready documentation, healthcare technology deployment, and acquisition-led platform expansion.',
    url: SITE_URL,
    images: [
      {
        url: `${SITE_URL}/images/sfm-logo.jpeg`,
        width: 1200,
        height: 630,
        alt: 'StrykeFox Medical — Healthcare Infrastructure Platform',
      },
    ],
  },
};

const carepathTags = [
  'Pre-Op',
  'Surgical',
  'Orthopedic',
  'Mobility',
  'Recovery',
  'Maternity',
];

const carepathKeywords = [
  'eligibility verification',
  'documentation readiness',
  'provider workflow support',
  'fulfillment coordination',
  'proof-of-delivery capture',
  'billing-ready packets',
  'patient continuity',
  'medical device workflows',
  'recovery coordination',
  'healthcare infrastructure',
];

export default function HomePage() {
  return (
    <main className="home-main">
      <RevealObserver />

      {/* ———— NAV ———— */}
      <HomepageNav />

      {/* ———— HERO ———— */}
      <section className="hero-section">
        <div className="hero-bg-image" />
        <div className="hero-gradient" />
        <div className="hero-content sfm-reveal visible">
          <div className="hero-logo-img">
            <Image
              src="/images/sfm-logo.jpeg"
              alt="StrykeFox Medical logo — healthcare infrastructure platform"
              width={200}
              height={200}
              priority
            />
          </div>
          <h1 className="hero-wordmark">
            <span className="hw-stryke">STRYKE</span>
            <span className="hw-k">K</span>
            <span className="hw-fox">FOX</span>
            <span className="hw-medical">MEDICAL</span>
          </h1>
          <p className="hero-headline">
            Healthcare infrastructure,<br />engineered for what comes next.
          </p>
          <p className="hero-sub">
            StrykeFox Medical builds the operating layer for recovery
            coordination, medical device workflows, reimbursement-ready
            documentation, healthcare technology deployment, and
            acquisition-led platform expansion.
          </p>
          <div className="hero-cta-group">
            <a href="#carepath" className="hero-cta hero-cta-primary">
              Enter Platform <ChevronRight size={16} />
            </a>
            <Link href="/carepath" className="hero-cta hero-cta-secondary">
              Explore CarePath <ChevronRight size={16} />
            </Link>
            <Link href="/spear" className="hero-cta hero-cta-secondary">
              View Technology Layer <ChevronRight size={16} />
            </Link>
            <Link href="/contact" className="hero-cta hero-cta-secondary">
              Partner With StrykeFox <ChevronRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ———— 01 / CAREPATH ———— */}
      <section className="chapter-section" id="carepath">
        <div className="chapter-inner">
          <div className="chapter-text sfm-reveal">
            <p className="chapter-label">
              <span className="chapter-num">01</span>
              <span className="chapter-divider" />
              <span className="chapter-tag">CAREPATH</span>
              <span className="chapter-line" />
            </p>
            <h2 className="chapter-title">Care that follows the patient.</h2>
            <p className="chapter-body">
              From pre-op to recovery, CarePath organizes the healthcare lineage
              around documentation, coordination, and continuity.
            </p>
            <div className="chapter-chips">
              {carepathTags.map((tag) => (
                <span className="chip" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            <Link href="/carepath" className="chapter-cta">
              Explore CarePath <ChevronRight size={14} />
            </Link>
          </div>
          <div className="chapter-image sfm-reveal sfm-reveal-delay-2">
            <Image
              src="/images/clinical-care.svg"
              alt="Nurse with patient in clinical setting"
              width={640}
              height={480}
              className="chapter-photo"
            />
          </div>
        </div>
      </section>

      {/* ———— 01B / MATERNITY ———— */}
      <section className="maternity-section">
        <div className="maternity-inner sfm-reveal">
          <h2 className="maternity-headline">
            She gave everything.<br />Now it&rsquo;s her turn.
          </h2>
          <a
            href="https://mommycare.strykefox.com"
            className="maternity-cta"
          >
            Start Your Recovery <ChevronRight size={14} />
          </a>
          <div className="maternity-logo">
            <Image
              src="/images/mommy-care-en.png"
              alt="Mommy Care postpartum recovery kit by StrykeFox Medical"
              width={240}
              height={80}
            />
          </div>
        </div>
      </section>

      {/* ———— 02 / NORTHSTAR SURGICAL INNOVATIONS ———— */}
      <section className="chapter-section chapter-alt" id="nsi">
        <div className="chapter-inner">
          <div className="chapter-text sfm-reveal">
            <p className="chapter-label">
              <span className="chapter-num">02</span>
              <span className="chapter-divider" />
              <span className="chapter-tag">NORTHSTAR SURGICAL INNOVATIONS</span>
              <span className="chapter-line" />
            </p>
            <h2 className="chapter-title">
              Innovation built around the operating room.
            </h2>
            <p className="chapter-body">
              NSI advances surgical tools, device commercialization, Ex-Im
              pathways, and emerging medical technologies designed for
              real-world clinical flow.
            </p>
            <div className="nsi-inline-logo">
              <Image
                src="/images/nsi-logo.png"
                alt="NorthStar Surgical Innovations logo — surgical device commercialization"
                width={120}
                height={40}
              />
            </div>
            <Link href="/northstar-surgical-innovations" className="chapter-cta">
              Explore NSI <ChevronRight size={14} />
            </Link>
          </div>
          <div className="chapter-image sfm-reveal sfm-reveal-delay-2">
            <Image
              src="/images/surgical-equipment.svg"
              alt="Surgical instruments close-up"
              width={640}
              height={480}
              className="chapter-photo"
            />
          </div>
        </div>
      </section>

      {/* ———— 03 / SPEAR ———— */}
      <section className="chapter-section" id="spear">
        <div className="chapter-inner">
          <div className="chapter-text sfm-reveal">
            <p className="chapter-label">
              <span className="chapter-num">03</span>
              <span className="chapter-divider" />
              <span className="chapter-tag">SPEAR</span>
              <span className="chapter-line" />
            </p>
            <h2 className="chapter-title">
              Deployment intelligence behind the platform.
            </h2>
            <p className="chapter-body">
              SPEAR powers execution through integrated data capture, analysis,
              learning, and field deployment.
            </p>
            <p className="chapter-powered">
              <span className="powered-icon">&Psi;</span>
              Powered internally by Poseidon, Trident, and Aries.
            </p>
            <Link href="/spear" className="chapter-cta">
              Explore SPEAR <ChevronRight size={14} />
            </Link>
          </div>
          <div className="chapter-image sfm-reveal sfm-reveal-delay-2">
            <Image
              src="/images/spear-data-viz.svg"
              alt="SPEAR deployment analytics"
              width={640}
              height={480}
              className="chapter-photo"
            />
          </div>
        </div>
      </section>

      {/* ———— 04 / SOC13 ———— */}
      <section className="chapter-section chapter-alt" id="soc13">
        <div className="chapter-inner">
          <div className="chapter-text sfm-reveal">
            <p className="chapter-label">
              <span className="chapter-num">04</span>
              <span className="chapter-divider" />
              <span className="chapter-tag">SOC13</span>
              <span className="chapter-line" />
            </p>
            <h2 className="chapter-title">Expansion by design.</h2>
            <p className="chapter-body">
              SoC13 aligns verticals, integrates capabilities, and reduces
              friction across healthcare delivery.
            </p>
            <Link href="/soc13" className="chapter-cta">
              Platform Expansion <ChevronRight size={14} />
            </Link>
          </div>
          <div className="chapter-image sfm-reveal sfm-reveal-delay-2">
            <Image
              src="/images/soc13-logo.svg"
              alt="SoC13 seal"
              width={640}
              height={480}
              className="chapter-photo"
            />
          </div>
        </div>
      </section>

      {/* ———— LEADERSHIP ———— */}
      <section className="founder-section">
        <div className="section-container">
          <div className="sfm-reveal">
            <p className="section-label">Platform Leadership</p>
            <h2 className="section-heading">Leadership</h2>
          </div>
          <div className="founder-grid">
            <article className="founder-card sfm-reveal sfm-reveal-delay-1">
              <div className="founder-avatar">
                <span>AS</span>
              </div>
              <h3 className="founder-name">Adam W. Stryker</h3>
              <p className="founder-role">
                Founder &amp; CEO — StrykeFox Medical
              </p>
              <p className="founder-bio">
                Healthcare operator and platform builder. Architect of
                vertically integrated healthcare infrastructure built for
                national scale.
              </p>
              <div className="founder-credentials">
                <span>SENSARS Neuroprosthetics Board</span>
                <span>
                  FDA Breakthrough Device / Inc. 5000 Class of 2019
                </span>
                <span>
                  SVP-CTO Americans for Prosperity $889M 35 States
                </span>
                <span>Director Government Relations Las Vegas Sands</span>
                <span>MBA Candidate Pepperdine</span>
              </div>
              <Link href="/founder" className="founder-link">
                adamwstryker.com <ChevronRight size={12} />
              </Link>
            </article>

            <article className="founder-card sfm-reveal sfm-reveal-delay-2">
              <div className="founder-avatar">
                <span>BF</span>
              </div>
              <h3 className="founder-name">Benjamin Fox</h3>
              <p className="founder-role">
                Co-Founder &amp; SVP — StrykeFox Medical
              </p>
              <p className="founder-bio">
                Before he was in the OR, he was on the mound. Drafted by the
                San Diego Padres out of high school, Ben brought elite athletic
                discipline into luxury sales — Cartier at Wynn, Tesla, TAG
                Heuer — then into healthcare. Ben owns the field.
              </p>
              <div className="founder-credentials">
                <span>Co-Founder &amp; SVP StrykeFox Medical</span>
                <span>Drafted by San Diego Padres</span>
                <span>Cartier at Wynn Las Vegas 7 Years</span>
                <span>Tesla Owner Advisor</span>
                <span>TAG Heuer Boutique Director</span>
              </div>
              <a
                href="https://www.linkedin.com/in/benjaminfox"
                target="_blank"
                rel="noopener noreferrer"
                className="founder-link"
              >
                LinkedIn <ChevronRight size={12} />
              </a>
            </article>
          </div>
        </div>
      </section>

      {/* ———— PLATFORM NAVIGATION (SEO) ———— */}
      <section className="platform-nav-section">
        <div className="section-container">
          <h2 className="platform-nav-heading">StrykeFox Platform</h2>
          <nav aria-label="StrykeFox platform navigation" className="platform-nav-grid">
            <Link href="/carepath" className="platform-nav-link">
              CarePath by StrykeFox
            </Link>
            <Link href="/northstar-surgical-innovations" className="platform-nav-link">
              NorthStar Surgical Innovations
            </Link>
            <Link href="/spear" className="platform-nav-link">
              SPEAR Healthcare Technology
            </Link>
            <Link href="/soc13" className="platform-nav-link">
              SoC13 Acquisitions
            </Link>
            <Link href="/contact" className="platform-nav-link">
              Contact
            </Link>
          </nav>
          <p className="platform-description">
            StrykeFox Medical is a healthcare infrastructure and medical
            technology operating platform supporting care pathway coordination,
            recovery product workflows, surgical support, biologics logistics,
            reimbursement-ready documentation, healthcare technology deployment,
            and acquisition-led platform expansion.
          </p>
        </div>
      </section>

      {/* ———— FOOTER ———— */}
      <footer className="home-footer">
        <div className="footer-inner footer-three-col">
          <div className="footer-brand-col">
            <p className="footer-carepath-label">
              CAREPATH by StrykeFox Medical
            </p>
          </div>
          <div className="footer-center-col">
            <p className="footer-legal">
              &copy; 2026 StrykeFox Medical LLC &middot; Las Vegas, NV &middot;
              NPI: 1821959420
            </p>
          </div>
          <div className="footer-right-col">
            <p className="footer-motto-right">
              Verify &middot; Document &middot; Deliver
            </p>
          </div>
        </div>
      </footer>

      {/* Hidden keyword-rich content for crawlers */}
      <div className="sr-only" aria-hidden="true">
        {carepathKeywords.map((kw) => (
          <span key={kw}>{kw}</span>
        ))}
      </div>
    </main>
  );
}
