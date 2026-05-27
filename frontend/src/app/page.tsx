export default function Home() {
  const platforms = [
    { name: 'CarePath', desc: 'Healthcare lineage and patient pathway coordination' },
    { name: 'SPEAR', desc: 'Trident AI scoring, Poseidon storage, Aries deployment' },
    { name: 'StrykePac\nEx-Im SA', desc: 'International gateway to world-class surgical technology' },
    { name: 'NSI', desc: 'Surgical device commercialization and OR workflow' },
    { name: 'SoC13', desc: 'Compliance engine for documentation and billing' },
  ];

  const doctrine = [
    { label: 'ACCELERATE', name: 'CAREPATH', desc: 'Move patients through pre-op, surgery, recovery, and post-acute care with less friction.' },
    { label: 'PREDICT', name: 'SPEAR', desc: 'Score revenue risk, operational gaps, and deployment health from one connected loop.' },
    { label: 'IDENTIFY', name: 'NSI', desc: 'Surface device, pathway, and logistics opportunities around real operating room workflow.' },
    { label: 'VALIDATE', name: 'SOC13', desc: 'Keep documentation, claims, and audit trails aligned across regulated healthcare delivery.' },
  ];

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@300;400;500;600;700;800;900&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />

      <nav className="sfm-nav">
        <div className="sfm-nav-brand">
          <img src="/images/sfm-fox.jpeg" alt="SFM" className="sfm-logo" />
          <div className="sfm-brand-text">STRYKEFOX<span>MEDICAL</span></div>
        </div>
        <div className="sfm-nav-links">
          <a href="/providers">Providers</a>
          <a href="/life-sciences">Life Sciences</a>
          <a href="/platform">Platform</a>
          <a href="/compliance">Compliance</a>
          <a href="/strykepac">StrykePac Ex-Im SA</a>
        </div>
        <a href="/access" className="sfm-nav-cta">Request Access</a>
      </nav>

      <div className="sfm-hero">

        {/* LEFT PANEL */}
        <div className="sfm-left">
          <div className="sfm-left-top">
            <p className="sfm-eyebrow">StrykeFox Medical</p>
            <h1 className="sfm-h1">
              CarePath<br/>organizes<br/>the journey.<br/>Healthcare<br/>Lineage scales<br/>the platform.
            </h1>
          </div>

          <div className="sfm-left-mid">
            <div className="sfm-bg-img" style={{ backgroundImage: "url('/images/nurse-patient.jpg')" }} />
            <div className="sfm-doctrine">
              {doctrine.map(d => (
                <div className="sfm-doctrine-col" key={d.name}>
                  <div className="sfm-d-label">{d.label}</div>
                  <div className="sfm-d-name">{d.name}</div>
                  <div className="sfm-d-desc">{d.desc}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="sfm-stats">
            <div className="sfm-stat"><strong>4</strong><span>active verticals</span></div>
            <div className="sfm-stat"><strong>HIPAA</strong><span>compliant by design</span></div>
            <div className="sfm-stat"><strong>2026</strong><span>fully deployed</span></div>
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="sfm-right">
          <p className="sfm-discover">Discover Our Platform</p>
          <div className="sfm-platform-list">
            {platforms.map(p => (
              <div className="sfm-platform-row" key={p.name}>
                <span className="sfm-p-name" style={{ whiteSpace: 'pre-line' }}>{p.name}</span>
                <span className="sfm-p-desc">{p.desc}</span>
              </div>
            ))}
          </div>
          <div className="sfm-right-bottom">
            <div className="sfm-right-img" style={{ backgroundImage: "url('/images/doctor-phone.jpg')" }} />
            <a href="/platform" className="sfm-explore">Explore Our Technology →</a>
          </div>
        </div>

      </div>
    </>
  );
}

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; -webkit-font-smoothing: antialiased; overflow-x: hidden; }
  a { color: inherit; text-decoration: none; }

  .sfm-nav {
    position: fixed; top: 0; left: 0; right: 0; z-index: 100;
    display: flex; align-items: center; justify-content: space-between;
    padding: 0 48px; height: 60px;
    background: #fff; border-bottom: 1px solid rgba(0,0,0,0.07);
  }
  .sfm-nav-brand { display: flex; align-items: center; gap: 10px; }
  .sfm-logo { width: 30px; height: 30px; object-fit: contain; border-radius: 3px; }
  .sfm-brand-text {
    font-family: 'Inter Tight', sans-serif; font-weight: 700;
    font-size: 10.5px; letter-spacing: 0.1em; line-height: 1.3; color: #1d1d1f;
  }
  .sfm-brand-text span { display: block; font-weight: 400; }
  .sfm-nav-links { display: flex; }
  .sfm-nav-links a {
    font-size: 10.5px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
    color: #1d1d1f; padding: 0 14px; height: 60px;
    display: inline-flex; align-items: center; transition: color .2s;
  }
  .sfm-nav-links a:hover { color: #1A6BF5; }
  .sfm-nav-cta {
    font-size: 10.5px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase;
    padding: 9px 18px; border: 1.5px solid #1d1d1f; color: #1d1d1f; transition: all .2s;
  }
  .sfm-nav-cta:hover { background: #1d1d1f; color: #fff; }

  .sfm-hero {
    display: grid; grid-template-columns: 1fr 1fr;
    min-height: 100vh; padding-top: 60px;
  }

  /* LEFT */
  .sfm-left { display: flex; flex-direction: column; background: #fff; }
  .sfm-left-top { padding: 72px 64px 48px; flex-shrink: 0; }
  .sfm-eyebrow {
    font-size: 11px; font-weight: 600; letter-spacing: 0.14em;
    text-transform: uppercase; color: #1A6BF5; margin-bottom: 20px;
  }
  .sfm-h1 {
    font-family: 'Inter Tight', sans-serif; font-weight: 800;
    font-size: clamp(40px, 4.8vw, 70px); letter-spacing: -0.03em;
    line-height: 0.96; color: #1d1d1f;
  }

  .sfm-left-mid { position: relative; flex: 1; min-height: 280px; }
  .sfm-bg-img {
    position: absolute; inset: 0;
    background-size: cover; background-position: center;
    filter: brightness(0.45);
  }
  .sfm-doctrine {
    position: relative; z-index: 2;
    display: grid; grid-template-columns: repeat(4, 1fr);
    height: 100%;
  }
  .sfm-doctrine-col {
    padding: 28px 16px;
    border-right: 1px solid rgba(255,255,255,0.1);
  }
  .sfm-doctrine-col:last-child { border-right: none; }
  .sfm-d-label {
    font-size: 8px; font-weight: 700; letter-spacing: 0.2em;
    color: #1A6BF5; margin-bottom: 5px;
  }
  .sfm-d-name {
    font-family: 'Inter Tight', sans-serif; font-weight: 700;
    font-size: 11.5px; letter-spacing: 0.08em;
    color: #fff; margin-bottom: 10px;
  }
  .sfm-d-desc { font-size: 10.5px; line-height: 1.65; color: rgba(255,255,255,0.55); }

  .sfm-stats {
    display: grid; grid-template-columns: repeat(3, 1fr);
    border-top: 1px solid rgba(0,0,0,0.08); flex-shrink: 0;
  }
  .sfm-stat {
    display: flex; flex-direction: column; padding: 18px 22px;
    border-right: 1px solid rgba(0,0,0,0.08);
  }
  .sfm-stat:last-child { border-right: none; }
  .sfm-stat strong {
    font-family: 'Inter Tight', sans-serif; font-weight: 800;
    font-size: 26px; letter-spacing: -0.02em; color: #1d1d1f;
  }
  .sfm-stat span { font-size: 10.5px; color: rgba(29,29,31,0.45); margin-top: 2px; }

  /* RIGHT */
  .sfm-right {
    background: #090E1C; display: flex; flex-direction: column;
    padding: 72px 52px 0;
  }
  .sfm-discover {
    font-size: 9px; font-weight: 600; letter-spacing: 0.24em;
    text-transform: uppercase; color: rgba(255,255,255,0.32);
    margin-bottom: 28px;
  }
  .sfm-platform-list { flex: 1; }
  .sfm-platform-row {
    display: flex; justify-content: space-between; align-items: flex-start;
    gap: 20px; padding: 18px 0;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .sfm-platform-row:first-child { border-top: 1px solid rgba(255,255,255,0.07); }
  .sfm-p-name {
    font-family: 'Inter Tight', sans-serif; font-weight: 700;
    font-size: 16px; letter-spacing: -0.01em; color: #fff;
    flex-shrink: 0; min-width: 120px;
  }
  .sfm-p-desc {
    font-size: 11.5px; line-height: 1.5;
    color: rgba(255,255,255,0.38); text-align: right;
  }

  .sfm-right-bottom {
    position: relative; margin: 28px -52px 0; height: 200px; overflow: hidden;
  }
  .sfm-right-img {
    position: absolute; inset: 0;
    background-size: cover; background-position: top center;
    filter: brightness(0.55);
  }
  .sfm-explore {
    position: absolute; bottom: 22px; left: 52px;
    font-size: 10px; font-weight: 600; letter-spacing: 0.12em;
    text-transform: uppercase; color: #fff;
    border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 2px;
  }

  @media (max-width: 960px) {
    .sfm-hero { grid-template-columns: 1fr; }
    .sfm-nav { padding: 0 20px; }
    .sfm-nav-links a { display: none; }
    .sfm-nav-links a:last-child { display: inline-flex; }
    .sfm-left-top { padding: 48px 32px 32px; }
    .sfm-right { padding: 48px 32px 0; }
    .sfm-right-bottom { margin: 24px -32px 0; }
    .sfm-explore { left: 32px; }
  }
`;
