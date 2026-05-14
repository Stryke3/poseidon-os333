'use client';

import { useEffect } from 'react';
import { ExternalLink, FileText, ChevronRight } from 'lucide-react';

const onePagers: { title: string; type: string; desc: string; href: string }[] = [
  {
    title: 'Northstar Logo',
    type: 'SVG',
    desc: 'Northstar Surgical Innovations brand mark.',
    href: '/images/northstar-logo.svg',
  },
  {
    title: 'NSI Logo',
    type: 'PNG',
    desc: 'Northstar Surgical Innovations full logo.',
    href: '/images/nsi-logo.png',
  },
  {
    title: 'NSI Platform Overview',
    type: 'SVG',
    desc: 'Northstar platform architecture and capabilities overview.',
    href: '/images/nsi-platform.svg',
  },
];

export default function NorthstarPage() {
  useEffect(() => {
    const reveals = document.querySelectorAll('.sfm-reveal');
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
    <main className="public-page">
      <nav className="subpage-nav">
        <div className="nav-inner">
          <a href="/" className="nav-brand" aria-label="StrykeFox Medical home">
            <div className="nav-compass" aria-hidden="true">&#10022;</div>
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
          <div className="sfm-reveal visible">
            <p className="subpage-eyebrow">StrykeFox Medical | Northstar Surgical Innovations</p>
            <h1 className="subpage-title">Northstar Surgical Innovations</h1>
            <p className="subpage-tagline">Innovation built around the operating room.</p>
            <p className="subpage-desc">
              Northstar advances surgical tools, device commercialization, Ex-Im pathways,
              and emerging medical technologies designed for real-world clinical flow.
            </p>
            <div className="cta-group">
              <a href="#assets" className="sfm-btn-primary">View Platform Assets <ChevronRight size={14} /></a>
              <a
                href="https://www.sensars.com"
                target="_blank"
                rel="noopener noreferrer"
                className="sfm-btn-secondary"
              >
                Visit Sensars <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <div className="sfm-reveal sfm-reveal-delay-2 visible">
            <div className="nsi-mark-card">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/northstar-logo.svg"
                alt="Northstar Surgical Innovations"
                className="nsi-hero-logo"
              />
            </div>
          </div>
        </div>
      </section>

      <div className="sub-section-alt sensars-section">
        <div className="sub-section-inner">
          <div className="sfm-reveal">
            <p className="sub-section-eyebrow">Partner Technology</p>
            <h2 className="sub-section-title"><em>Sensars</em></h2>
            <p className="sub-section-body">
              Northstar supports Sensars commercialization strategy through healthcare operator insight,
              clinical-trial capital planning, and medtech platform positioning.
            </p>
            <div className="cta-group" style={{ marginTop: '2rem' }}>
              <a
                href="https://www.sensars.com"
                target="_blank"
                rel="noopener noreferrer"
                className="sfm-btn-primary"
              >
                Visit Sensars <ExternalLink size={12} />
              </a>
            </div>
          </div>
        </div>
      </div>

      <section className="sub-section" id="assets">
        <div className="sfm-reveal">
          <p className="sub-section-eyebrow">Reference Materials</p>
          <h2 className="sub-section-title">Platform <em>One-Pagers</em></h2>
          <p className="sub-section-body">
            Review Northstar platform materials, commercialization summaries,
            and device-development references already included in the StrykeFox repository.
          </p>
        </div>
        <div className="onepager-grid">
          {onePagers.map((doc, index) => (
            <article className={`onepager-card sfm-reveal sfm-reveal-delay-${(index % 3) + 1}`} key={doc.title}>
              <div className="onepager-icon"><FileText size={20} /></div>
              <p className="onepager-type">{doc.type}</p>
              <h3 className="onepager-title">{doc.title}</h3>
              <p className="onepager-desc">{doc.desc}</p>
              <a href={doc.href} target="_blank" rel="noopener noreferrer" className="onepager-btn">
                Open One-Pager <ExternalLink size={11} />
              </a>
            </article>
          ))}
        </div>
      </section>

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
