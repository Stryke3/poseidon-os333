import type { Metadata } from 'next';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

const SITE_URL = 'https://www.strykefox.com';

export const metadata: Metadata = {
  title: 'Contact StrykeFox Medical | Healthcare Infrastructure Platform',
  description:
    'Contact StrykeFox Medical for healthcare infrastructure partnerships, CarePath coordination, NorthStar Surgical Innovations, SPEAR technology deployment, and SoC13 acquisition inquiries. Las Vegas, NV.',
  alternates: {
    canonical: `${SITE_URL}/contact`,
  },
  openGraph: {
    title: 'Contact StrykeFox Medical',
    description:
      'Reach out to StrykeFox Medical for healthcare infrastructure partnerships and platform inquiries.',
    url: `${SITE_URL}/contact`,
  },
};

const inquiryTypes = [
  {
    label: 'CarePath',
    desc: 'Recovery coordination, DMEPOS documentation, patient pathways',
    href: '/carepath',
  },
  {
    label: 'NorthStar Surgical Innovations',
    desc: 'Surgical device commercialization, Ex-Im pathways, TKA instruments',
    href: '/northstar-surgical-innovations',
  },
  {
    label: 'SPEAR',
    desc: 'Healthcare technology deployment, data orchestration, RCM intelligence',
    href: '/spear',
  },
  {
    label: 'SoC13',
    desc: 'Healthcare acquisition, vertical integration, platform expansion',
    href: '/soc13',
  },
];

export default function ContactPage() {
  return (
    <main className="public-page">
      <nav className="subpage-nav">
        <div className="nav-inner">
          <Link href="/" className="nav-brand" aria-label="StrykeFox Medical home">
            <div className="nav-compass" aria-hidden="true">&#10022;</div>
            <div className="nav-wordmark">
              <span className="nav-stryke">STRY</span>
              <span className="nav-k">K</span>
              <span className="nav-fox">EFOX</span>
              <span className="nav-medical">MEDICAL</span>
            </div>
          </Link>
          <ul className="nav-links">
            <li><Link href="/carepath">CarePath</Link></li>
            <li><Link href="/northstar-surgical-innovations">NorthStar Surgical</Link></li>
            <li><Link href="/spear">SPEAR</Link></li>
            <li><Link href="/soc13">SoC13</Link></li>
          </ul>
        </div>
      </nav>

      <section className="subpage-hero">
        <div className="subpage-hero-inner">
          <div>
            <p className="subpage-eyebrow">StrykeFox Medical</p>
            <h1 className="subpage-title">Contact</h1>
            <p className="subpage-tagline">
              Healthcare infrastructure partnerships and platform inquiries.
            </p>
            <p className="subpage-desc">
              StrykeFox Medical operates integrated healthcare infrastructure
              across recovery coordination, surgical commercialization,
              technology deployment, and acquisition-led platform expansion.
            </p>
          </div>
        </div>
      </section>

      <section className="contact-section">
        <div className="section-container">
          <h2 className="section-heading">Platform Verticals</h2>
          <div className="contact-grid">
            {inquiryTypes.map((item) => (
              <Link key={item.label} href={item.href} className="contact-card">
                <h3>{item.label}</h3>
                <p>{item.desc}</p>
                <span className="contact-card-cta">
                  Learn More <ChevronRight size={14} />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="contact-info-section">
        <div className="section-container">
          <h2 className="section-heading">Get in Touch</h2>
          <div className="contact-info-grid">
            <div className="contact-info-block">
              <h3>General Inquiries</h3>
              <p>patients@strykefox.com</p>
            </div>
            <div className="contact-info-block">
              <h3>Location</h3>
              <p>Las Vegas, NV</p>
              <p>NPI: 1821959420</p>
            </div>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="footer-inner footer-three-col">
          <div className="footer-brand-col">
            <p className="footer-carepath-label">CAREPATH by StrykeFox Medical</p>
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
    </main>
  );
}
