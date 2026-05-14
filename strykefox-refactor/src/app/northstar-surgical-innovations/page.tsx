'use client';

import { useEffect } from 'react';
import { ExternalLink, FileText } from 'lucide-react';

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
          <a href="/" className="nav-brand" aria-label="StrykeFox Medical home">
            <div className="nav-logo-text">STRYKE<span>FOX</span></div>
            <div className="nav-sub">NSI</div>
          </a>
          <ul className="nav-links">
            <li><a href="/carepath">CarePath</a></li>
            <li><a href="/northstar-surgical-innovations">Northstar Surgical Innovations</a></li>
            <li><a href="/login" aria-label="Open SPEAR login">SPEAR</a></li>
            <li><a href="/soc13">SoC13</a></li>
          </ul>
        </div>
      </nav>

      <section className="hero nsi-hero">
        <div className="hero-bg nsi-hero-bg" />
        <div className="hero-grid" />
        <div className="hero-line" />
        <div className="hero-inner">
          <div className="hero-left reveal visible">
            <p className="hero-eyebrow">StrykeFox Medical | Northstar Surgical Innovations</p>
            <h1 className="hero-title nsi-title">
              NORTH<span className="path">STAR</span>
            </h1>
            <p className="hero-tagline">Innovation built around the operating room.</p>
            <p className="hero-desc">
              Northstar advances surgical tools, device commercialization, Ex-Im pathways,
              and emerging medical technologies designed for real-world clinical flow.
            </p>
            <div className="hero-cta-group">
              <a href="#assets" className="btn-primary">View Platform Assets</a>
              <a
                href="https://www.sensars.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                Visit Sensars <ExternalLink size={12} style={{ marginLeft: '0.5rem' }} />
              </a>
            </div>
          </div>
          <div className="hero-workflow reveal reveal-delay-2 visible">
            <div className="workflow-card nsi-mark-card">
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

      <section className="section-full sensars-section">
        <div className="section-inner">
          <div className="reveal">
            <p className="section-eyebrow">Partner Technology</p>
            <h2 className="section-title"><em>Sensars</em></h2>
            <p className="section-body">
              Northstar supports Sensars commercialization strategy through healthcare operator insight,
              clinical-trial capital planning, and medtech platform positioning.
            </p>
            <div className="hero-cta-group" style={{ marginTop: '2rem' }}>
              <a
                href="https://www.sensars.com"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-primary"
              >
                Visit Sensars <ExternalLink size={12} style={{ marginLeft: '0.5rem' }} />
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="assets">
        <div className="reveal">
          <p className="section-eyebrow">Reference Materials</p>
          <h2 className="section-title">Platform <em>One-Pagers</em></h2>
          <p className="section-body">
            Review Northstar platform materials, commercialization summaries,
            and device-development references already included in the StrykeFox repository.
          </p>
        </div>
        <div className="onepager-grid">
          {onePagers.map((doc, index) => (
            <article className={`onepager-card reveal reveal-delay-${(index % 3) + 1}`} key={doc.title}>
              <div className="onepager-icon"><FileText size={22} /></div>
              <p className="onepager-type">{doc.type}</p>
              <h3 className="onepager-title">{doc.title}</h3>
              <p className="onepager-desc">{doc.desc}</p>
              <a href={doc.href} target="_blank" rel="noopener noreferrer" className="onepager-btn">
                Open One-Pager <ExternalLink size={11} style={{ marginLeft: '0.4rem' }} />
              </a>
            </article>
          ))}
        </div>
      </section>

      <footer>
        <div className="footer-inner">
          <div>
            <div className="footer-brand-name">STRYKE<span>FOX</span> MEDICAL</div>
            <div className="footer-brand-tag">Healthcare Infrastructure Platform</div>
            <p className="footer-desc">Healthcare infrastructure, engineered for what comes next.</p>
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
          <p className="footer-legal">2026 StrykeFox Medical LLC - Las Vegas, NV | NPI: 1821959420</p>
          <p className="footer-compliance">Healthcare infrastructure, engineered for what comes next.</p>
        </div>
      </footer>
    </main>
  );
}
