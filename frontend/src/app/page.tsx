'use client';

import { useEffect, useState } from 'react';
import { ChevronRight, Menu, X } from 'lucide-react';
import Image from 'next/image';

const navItems: [string, string][] = [
  ['CarePath', '#carepath'],
  ['NorthStar Surgical', '#nsi'],
  ['SPEAR', '#spear'],
  ['SoC13', '#soc13'],
];

const carepathTags = [
  'Pre-Op', 'Surgical', 'Orthopedic', 'Mobility', 'Recovery', 'Maternity',
];

export default function HomePage() {
  const [menuOpen, setMenuOpen] = useState(false);

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
    <main className="home-main">
      {/* ———— NAV ———— */}
      <nav className="home-nav">
        <div className="nav-inner">
          <a href="/" className="nav-brand" aria-label="StrykeFox Medical home">
            <div className="nav-brand-logo">
              <Image src="/images/sfm-logo.jpeg" alt="StrykeFox" width={28} height={28} />
            </div>
            <div className="nav-wordmark">
              <span className="nav-stryke">STRY</span>
              <span className="nav-k">K</span>
              <span className="nav-fox">EFOX</span>
              <span className="nav-medical">MEDICAL</span>
            </div>
          </a>
          <ul className="nav-links">
            {navItems.map(([label, href]) => (
              <li key={label}>
                <a href={href}>{label}</a>
              </li>
            ))}
          </ul>
          <button
            className="mobile-menu-btn"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle navigation"
          >
            {menuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
        {menuOpen && (
          <div className="mobile-menu">
            {navItems.map(([label, href]) => (
              <a key={label} href={href} onClick={() => setMenuOpen(false)}>
                {label}
              </a>
            ))}
          </div>
        )}
      </nav>

      {/* ———— HERO ———— */}
      <section className="hero-section">
        <div className="hero-bg-image" />
        <div className="hero-gradient" />
        <div className="hero-content sfm-reveal visible">
          <div className="hero-logo-img">
            <Image
              src="/images/sfm-logo.jpeg"
              alt="StrykeFox Medical"
              width={200}
              height={200}
              priority
            />
          </div>
          <h1 className="hero-wordmark">
            <span className="hw-stryke">STRY</span>
            <span className="hw-k">K</span>
            <span className="hw-fox">EFOX</span>
            <span className="hw-medical">MEDICAL</span>
          </h1>
          <p className="hero-headline">
            Healthcare infrastructure,<br />engineered for what comes next.
          </p>
          <p className="hero-sub">CarePath. NSI. SPEAR. One operating platform.</p>
          <a href="#carepath" className="hero-cta">
            Enter Platform <ChevronRight size={16} />
          </a>
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
                <span className="chip" key={tag}>{tag}</span>
              ))}
            </div>
            <a href="/carepath" className="chapter-cta">
              Explore CarePath <ChevronRight size={14} />
            </a>
          </div>
          <div className="chapter-visual sfm-reveal sfm-reveal-delay-2">
            <div className="visual-panel visual-carepath">
              <div className="visual-glow" />
              <div className="visual-grid" />
              <div className="visual-icon-group">
                <div className="vi-ring vi-ring-1" />
                <div className="vi-ring vi-ring-2" />
                <div className="vi-dot" />
              </div>
              <p className="visual-label">Patient Continuity</p>
            </div>
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
              alt="Mommy Care"
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
              Innovation built around{'\n'}the operating room.
            </h2>
            <p className="chapter-body">
              NSI advances surgical tools, device commercialization, Ex-Im pathways,
              and emerging medical technologies designed for real-world clinical flow.
            </p>
            <div className="nsi-inline-logo">
              <Image src="/images/nsi-logo.png" alt="NSI" width={120} height={40} />
            </div>
            <a href="/northstar-surgical-innovations" className="chapter-cta">
              Explore NSI <ChevronRight size={14} />
            </a>
          </div>
          <div className="chapter-visual sfm-reveal sfm-reveal-delay-2">
            <div className="visual-panel visual-nsi">
              <div className="visual-glow" />
              <div className="visual-grid" />
              <div className="visual-icon-group">
                <div className="vi-cross" />
                <div className="vi-ring vi-ring-1" />
              </div>
              <p className="visual-label">Surgical Innovation</p>
            </div>
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
              Deployment intelligence{'\n'}behind the platform.
            </h2>
            <p className="chapter-body">
              SPEAR powers execution through integrated data capture, analysis,
              learning, and field deployment.
            </p>
            <p className="chapter-powered">
              <span className="powered-icon">&Psi;</span>
              Powered internally by Poseidon, Trident, and Aries.
            </p>
            <a href="/spear" className="chapter-cta">
              Explore SPEAR <ChevronRight size={14} />
            </a>
          </div>
          <div className="chapter-visual sfm-reveal sfm-reveal-delay-2">
            <div className="visual-panel visual-spear">
              <div className="visual-glow" />
              <div className="visual-grid" />
              <div className="visual-icon-group">
                <div className="vi-bars">
                  <span style={{ height: '40%' }} />
                  <span style={{ height: '70%' }} />
                  <span style={{ height: '55%' }} />
                  <span style={{ height: '90%' }} />
                  <span style={{ height: '65%' }} />
                </div>
              </div>
              <p className="visual-label">Deployment Intelligence</p>
            </div>
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
              SoC13 aligns verticals, integrates capabilities, and reduces friction
              across healthcare delivery.
            </p>
            <a href="/soc13" className="chapter-cta">
              Platform Expansion <ChevronRight size={14} />
            </a>
          </div>
          <div className="chapter-visual sfm-reveal sfm-reveal-delay-2">
            <div className="visual-panel visual-soc13">
              <div className="visual-glow" />
              <div className="visual-grid" />
              <div className="visual-icon-group">
                <div className="vi-shield" />
              </div>
              <p className="visual-label">Platform Expansion</p>
            </div>
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
            {/* Adam W. Stryker */}
            <article className="founder-card sfm-reveal sfm-reveal-delay-1">
              <div className="founder-avatar"><span>AS</span></div>
              <h3 className="founder-name">Adam W. Stryker</h3>
              <p className="founder-role">Founder &amp; CEO — StrykeFox Medical</p>
              <p className="founder-bio">
                Healthcare operator and platform builder. Architect of vertically
                integrated healthcare infrastructure built for national scale.
              </p>
              <div className="founder-credentials">
                <span>SENSARS Neuroprosthetics Board</span>
                <span>FDA Breakthrough Device / Inc. 5000 Class of 2019</span>
                <span>SVP-CTO Americans for Prosperity $889M 35 States</span>
                <span>Director Government Relations Las Vegas Sands</span>
                <span>MBA Candidate Pepperdine</span>
              </div>
              <a
                href="/founder"
                className="founder-link"
              >
                adamwstryker.com <ChevronRight size={12} />
              </a>
            </article>

            {/* Benjamin Fox */}
            <article className="founder-card sfm-reveal sfm-reveal-delay-2">
              <div className="founder-avatar"><span>BF</span></div>
              <h3 className="founder-name">Benjamin Fox</h3>
              <p className="founder-role">Co-Founder &amp; SVP — StrykeFox Medical</p>
              <p className="founder-bio">
                Before he was in the OR, he was on the mound. Drafted by the San Diego
                Padres out of high school, Ben brought elite athletic discipline into
                luxury sales — Cartier at Wynn, Tesla, TAG Heuer — then into
                healthcare. Ben owns the field.
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

      {/* ———— FOOTER ———— */}
      <footer className="home-footer">
        <div className="footer-inner footer-three-col">
          <div className="footer-brand-col">
            <p className="footer-carepath-label">CAREPATH by StrykeFox Medical</p>
          </div>
          <div className="footer-center-col">
            <p className="footer-legal">
              &copy; 2026 StrykeFox Medical LLC &middot; Las Vegas, NV &middot; NPI: 1821959420
            </p>
          </div>
          <div className="footer-right-col">
            <p className="footer-motto-right">Verify &middot; Document &middot; Deliver</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
