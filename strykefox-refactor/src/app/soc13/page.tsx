'use client';

import { useEffect } from 'react';

const thesisBlocks = [
  {
    title: 'Healthcare Lineage',
    body: 'StrykeFox organizes healthcare capabilities around the patient journey, connecting vertical service lines through shared operational infrastructure.',
  },
  {
    title: 'Acquisition Architecture',
    body: 'SoC13 evaluates, integrates, and scales healthcare assets that strengthen the platform\u2019s operating base.',
  },
  {
    title: 'Integration Discipline',
    body: 'The model prioritizes documentation, compliance readiness, workflow control, and cash-conversion visibility.',
  },
  {
    title: 'Operating Leverage',
    body: 'Shared infrastructure improves execution speed, reduces duplication, and creates scalable platform economics.',
  },
  {
    title: 'Platform Expansion',
    body: 'SoC13 supports disciplined growth across clinical, operational, device, pharmacy, post-acute, and recovery infrastructure.',
  },
];

export default function SoC13Page() {
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
            <div className="nav-sub">SoC13</div>
          </a>
          <ul className="nav-links">
            <li><a href="/carepath">CarePath</a></li>
            <li><a href="/northstar-surgical-innovations">Northstar Surgical Innovations</a></li>
            <li><a href="/login" aria-label="Open SPEAR login">SPEAR</a></li>
            <li><a href="/soc13">SoC13</a></li>
          </ul>
        </div>
      </nav>

      <section className="hero soc13-hero">
        <div className="hero-bg soc13-hero-bg" />
        <div className="hero-grid" />
        <div className="hero-line" />
        <div className="hero-inner">
          <div className="hero-left reveal visible">
            <p className="hero-eyebrow">StrykeFox Medical | SoC13</p>
            <h1 className="hero-title soc13-title">
              SOC<span className="path">13</span>
            </h1>
            <p className="hero-tagline">Expansion by design.</p>
            <p className="hero-desc">
              SoC13 aligns verticals, integrates capabilities, and reduces friction across healthcare delivery
              through platform expansion, acquisition architecture, and healthcare lineage integration.
            </p>
            <div className="hero-cta-group">
              <a href="#thesis" className="btn-primary">Review Expansion Thesis</a>
            </div>
          </div>
          <div className="hero-workflow reveal reveal-delay-2 visible">
            <div className="workflow-card soc13-mark-card">
              <div className="soc13-roman">XIII</div>
              <p className="soc13-mark-label">Expansion Architecture</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="thesis">
        <div className="reveal">
          <p className="section-eyebrow">Expansion Thesis</p>
          <h2 className="section-title">Disciplined <em>Growth</em></h2>
          <p className="section-body">
            SoC13 is the strategic expansion vehicle for StrykeFox Medical.
            Each vertical acquired strengthens the platform operating base.
          </p>
        </div>
        <div className="thesis-grid">
          {thesisBlocks.map((block, index) => (
            <article className={`thesis-card reveal reveal-delay-${(index % 3) + 1}`} key={block.title}>
              <div className="thesis-num">{String(index + 1).padStart(2, '0')}</div>
              <h3 className="thesis-title">{block.title}</h3>
              <p className="thesis-body">{block.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="section founder-section" id="leadership">
        <div className="reveal">
          <p className="section-eyebrow">Leadership</p>
          <h2 className="section-title">Platform <em>Leadership</em></h2>
        </div>
        <div className="founder-grid">
          <article className="founder-card reveal reveal-delay-1">
            <div className="founder-avatar"><span>AS</span></div>
            <h3 className="founder-name">Adam Stryker</h3>
            <p className="founder-role">Founder / Platform Architect</p>
            <p className="founder-bio">
              Healthcare operator, investor, and systems architect focused on integrated medical infrastructure,
              regulated healthcare platforms, surgical innovation, and operating leverage.
            </p>
            <a href="https://www.adamwstryker.com" target="_blank" rel="noopener noreferrer" className="founder-link">Personal Website</a>
          </article>
          <article className="founder-card reveal reveal-delay-2">
            <div className="founder-avatar"><span>BF</span></div>
            <h3 className="founder-name">Ben Fox</h3>
            <p className="founder-role">Co-Founder / Market Development</p>
            <p className="founder-bio">
              Healthcare growth operator focused on provider relationships, market execution,
              and field-level expansion across the StrykeFox Medical platform.
            </p>
            <a href="/" className="founder-link">StrykeFox Medical</a>
          </article>
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
