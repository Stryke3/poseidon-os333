'use client';

import { useEffect } from 'react';
import { ChevronRight } from 'lucide-react';

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
              <span className="nav-stryke">STRY</span><span className="nav-k">K</span><span className="nav-fox">EFOX</span>
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
            <p className="subpage-eyebrow">StrykeFox Medical | SoC13</p>
            <h1 className="subpage-title">SoC13</h1>
            <p className="subpage-tagline">Expansion by design.</p>
            <p className="subpage-desc">
              SoC13 aligns verticals, integrates capabilities, and reduces friction across healthcare delivery
              through platform expansion, acquisition architecture, and healthcare lineage integration.
            </p>
            <div className="cta-group">
              <a href="#thesis" className="sfm-btn-primary">Review Expansion Thesis <ChevronRight size={14} /></a>
            </div>
          </div>
          <div className="sfm-reveal sfm-reveal-delay-2 visible">
            <div className="soc13-mark-card">
              <div className="soc13-roman">XIII</div>
              <p className="soc13-mark-label">Expansion Architecture</p>
            </div>
          </div>
        </div>
      </section>

      <section className="sub-section" id="thesis">
        <div className="sfm-reveal">
          <p className="sub-section-eyebrow">Expansion Thesis</p>
          <h2 className="sub-section-title">Disciplined <em>Growth</em></h2>
          <p className="sub-section-body">
            SoC13 is the strategic expansion vehicle for StrykeFox Medical.
            Each vertical acquired strengthens the platform operating base.
          </p>
        </div>
        <div className="thesis-grid">
          {thesisBlocks.map((block, index) => (
            <article className={`thesis-card sfm-reveal sfm-reveal-delay-${(index % 3) + 1}`} key={block.title}>
              <div className="thesis-num">{String(index + 1).padStart(2, '0')}</div>
              <h3 className="thesis-title">{block.title}</h3>
              <p className="thesis-body">{block.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="founder-section" id="leadership">
        <div className="section-container">
          <div className="sfm-reveal">
            <p className="section-label">Leadership</p>
            <h2 className="section-heading">Platform Leadership</h2>
          </div>
          <div className="founder-grid">
            <article className="founder-card sfm-reveal sfm-reveal-delay-1">
              <div className="founder-avatar"><span>AS</span></div>
              <h3 className="founder-name">Adam Stryker</h3>
              <p className="founder-role">Founder / Platform Architect</p>
              <p className="founder-bio">
                Healthcare operator, investor, and systems architect focused on integrated medical infrastructure,
                regulated healthcare platforms, surgical innovation, and operating leverage.
              </p>
              <a href="https://www.adamwstryker.com" target="_blank" rel="noopener noreferrer" className="founder-link">
                Personal Website <ChevronRight size={12} />
              </a>
            </article>
            <article className="founder-card sfm-reveal sfm-reveal-delay-2">
              <div className="founder-avatar"><span>BF</span></div>
              <h3 className="founder-name">Ben Fox</h3>
              <p className="founder-role">Co-Founder / Market Development</p>
              <p className="founder-bio">
                Healthcare growth operator focused on provider relationships, market execution,
                and field-level expansion across the StrykeFox Medical platform.
              </p>
              <a href="/" className="founder-link">
                StrykeFox Medical <ChevronRight size={12} />
              </a>
            </article>
          </div>
        </div>
      </section>

      <footer className="home-footer">
        <div className="footer-inner">
          <div className="footer-brand-col">
            <div className="footer-logo">
              <span className="nav-stryke">STRY</span><span className="nav-k">K</span><span className="nav-fox">EFOX</span>
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
