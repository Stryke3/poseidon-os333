"use client"

import { useEffect } from "react"
import Image from "next/image"
import { DM_Sans, Lora } from "next/font/google"
import styles from "./page.module.css"
import CarePathIntakeForm from "@/components/public/CarePathIntakeForm"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600"],
  variable: "--font-dm-sans",
})

const lora = Lora({
  subsets: ["latin"],
  style: ["italic"],
  weight: ["400"],
  variable: "--font-lora",
})

const mommyCareUrl =
  process.env.NEXT_PUBLIC_MOMMY_CARE_URL ||
  process.env.NEXT_PUBLIC_MOMMY_CARE_SUBDOMAIN ||
  "https://mommy-care-five.vercel.app"

const physicianPortalUrl =
  process.env.NEXT_PUBLIC_PHYSICIAN_PORTAL_URL ||
  process.env.NEXT_PUBLIC_REP_PORTAL_URL ||
  "/login"

const spearLoginUrl = "/login"

const contactHandlerUrl = "#contact"

const cx = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ")

function HeartlineIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  )
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  )
}

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
      <polyline points="9,22 9,12 15,12 15,22" />
    </svg>
  )
}

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
    </svg>
  )
}

export default function HomePage() {
  useEffect(() => {
    document.title = "CarePath by StrykeFox"

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add(styles.in)
        })
      },
      { threshold: 0.1 },
    )

    const revealNodes = document.querySelectorAll(`.${styles.reveal}`)
    revealNodes.forEach((element) => observer.observe(element))

    const handleScroll = () => {
      const nav = document.getElementById("nav")
      if (nav) {
        nav.style.background =
          window.scrollY > 60 ? "rgba(2,5,8,.97)" : "rgba(4,9,15,.88)"
      }
    }

    window.addEventListener("scroll", handleScroll)
    handleScroll()

    return () => {
      revealNodes.forEach((element) => observer.unobserve(element))
      observer.disconnect()
      window.removeEventListener("scroll", handleScroll)
    }
  }, [])

  return (
    <main className={cx(styles.page, dmSans.variable, lora.variable)}>
      <nav id="nav" className={styles.nav}>
        <a href="/" className={styles.brand}>
          <div className={styles.brandLogo}>
            <Image
              src="/images/sfm-logo.jpeg"
              alt="StrykeFox Medical"
              width={28}
              height={28}
              priority
            />
          </div>
          <span className={styles.brandName}>
            STRYKE<span>FOX</span>
          </span>
          <div className={styles.brandSep} />
          <span className={styles.brandBy}>CarePath</span>
          <div className={styles.brandSep} />
          <span className={styles.nsiTag}>NSI</span>
        </a>
        <div className={styles.navR}>
          <a href="#pathways" className={styles.navA}>
            Pathways
          </a>
          <a href="#platform" className={styles.navA}>
            Platform
          </a>
          <a href="#founder" className={styles.navA}>
            Founders
          </a>
          <a href={spearLoginUrl} className={styles.navA}>
            SPEAR Login
          </a>
          <a href="#referral" className={styles.navCta}>
            Submit Referral
          </a>
        </div>
      </nav>

      <section className={styles.hero} id="pathways">
        <div className={styles.heroBg} />
        <div className={cx(styles.heroPhoto, styles.heroPhotoLeft)}>
          <Image
            src="/images/operating-room.svg"
            alt=""
            fill
            sizes="42vw"
            priority
          />
        </div>
        <div className={cx(styles.heroPhoto, styles.heroPhotoRight)}>
          <Image
            src="/images/surgical-equipment.svg"
            alt=""
            fill
            sizes="36vw"
            priority
          />
        </div>
        <div className={styles.heroLogoWatermark}>
          <Image
            src="/images/strykefox-medical-logo.png"
            alt=""
            fill
            sizes="44vw"
            priority
          />
        </div>
        <div className={styles.heroGrid} />
        <div className={styles.heroPulse} />
        <div className={cx(styles.heroPulse, styles.heroPulse2)} />
        <div className={styles.heroInner}>
          <div className={styles.heroLogo}>
            <Image
              src="/images/strykefox-medical-logo.png"
              alt="StrykeFox Medical"
              width={190}
              height={285}
              priority
            />
          </div>
          <p className={styles.heroBy}>by StrykeFox Medical</p>
          <h1 className={styles.heroTitle}>
            CARE<span>PATH</span>
          </h1>
          <p className={styles.heroTagline}>
            The recovery pathway for every patient, every moment.
          </p>
          <div className={styles.pathways}>
            <div className={styles.pathway}>
              <div className={styles.pathwayIcon}>
                <HeartlineIcon />
              </div>
              <p className={styles.pathwayBy}>CarePath</p>
              <p className={styles.pathwayName}>Surgical</p>
            </div>
            <div className={styles.pathway}>
              <div className={styles.pathwayIcon}>
                <ClockIcon />
              </div>
              <p className={styles.pathwayBy}>CarePath</p>
              <p className={styles.pathwayName}>Mobility</p>
            </div>
            <div className={styles.pathway}>
              <div className={styles.pathwayIcon}>
                <HomeIcon />
              </div>
              <p className={styles.pathwayBy}>CarePath</p>
              <p className={styles.pathwayName}>Recovery</p>
            </div>
            <div className={styles.pathway}>
              <div className={styles.pathwayIcon}>
                <HeartIcon />
              </div>
              <p className={styles.pathwayBy}>CarePath</p>
              <p className={styles.pathwayName}>Maternity</p>
            </div>
          </div>
          <div className={styles.heroCta}>
            <a href={contactHandlerUrl} className={styles.btnMain}>
              Partner With CarePath
            </a>
          </div>
        </div>
      </section>

      <section className={styles.maternity}>
        <div className={styles.maternityWatermark}>
          <Image
            src="/images/medical-tray.svg"
            alt=""
            fill
            sizes="48vw"
          />
        </div>
        <div className={styles.matLeft}>
          <p className={styles.matEye}>CarePath Maternity</p>
          <h2 className={styles.matTitle}>
            She gave everything.
            <br />
            <em>Now it&apos;s her turn.</em>
          </h2>
          <div className={styles.matCtas}>
            <a href={mommyCareUrl} className={styles.btnRose}>
              Start Your Recovery
            </a>
          </div>
        </div>
        <div className={styles.matRight}>
          <div className={styles.matLogoWrap}>
            <Image
              src="/images/mommy-care-kit-logo.png"
              alt="Mommy Care Kit"
              width={300}
              height={300}
            />
          </div>
          <p className={styles.matSubdomain}>{mommyCareUrl}</p>
        </div>
      </section>

      <section className={styles.platform} id="platform">
        <div className={cx(styles.platHead, styles.reveal)}>
          <p className={styles.secEye}>The Platform</p>
          <h2 className={styles.secH}>
            StrykeFox Medical. <em>Every layer.</em>
          </h2>
        </div>
        <div className={styles.platGrid}>
          <div className={cx(styles.platCard, styles.reveal, styles.d1)}>
            <div className={styles.platLogo}>
              <Image
                src="/images/platform-portfolio.svg"
                alt="Platform Portfolio"
                width={180}
                height={38}
              />
            </div>
            <p className={styles.platName}>Platform Portfolio</p>
            <p className={styles.platRole}>Strategic Assets</p>
            <p className={styles.platDesc}>
              Comprehensive portfolio of healthcare platforms, technologies, and strategic assets designed for national scale and operational excellence.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d2)}>
            <div className={styles.platLogo}>
              <Image
                src="/images/ctf-logo.svg"
                alt="Candor Through Fire"
                width={180}
                height={38}
              />
            </div>
            <p className={styles.platName}>Candor Through Fire</p>
            <p className={styles.platRole}>Transformation Framework</p>
            <p className={styles.platDesc}>
              Radical transparency and proven methodologies for healthcare transformation. Building trust through measurable outcomes and uncompromising integrity.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d3)}>
            <div className={styles.platLogo}>
              <Image
                src="/images/northstar-logo.svg"
                alt="NorthStar Framework"
                width={180}
                height={38}
              />
            </div>
            <p className={styles.platName}>NorthStar Framework</p>
            <p className={styles.platRole}>Execution Architecture</p>
            <p className={styles.platDesc}>
              Scalable operating systems, workflow orchestration, and performance frameworks that power modern healthcare delivery across all care settings.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d4)}>
            <div className={styles.platLogo}>
              <Image
                src="/images/soc13-logo-simple.svg"
                alt="SoC13 Acquisition Group"
                width={180}
                height={38}
              />
            </div>
            <p className={styles.platName}>SoC13 Acquisition Group</p>
            <p className={styles.platRole}>Strategic Acquisitions</p>
            <p className={styles.platDesc}>
              Specialized acquisition group focused on strategic healthcare assets, medical technology companies, and service platforms that complement and expand the StrykeFox ecosystem.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d5)}>
            <div className={styles.platLogo}>
              <Image
                src="/images/nsi-platform.svg"
                alt="NorthStar Surgical Innovations"
                width={180}
                height={38}
              />
            </div>
            <p className={styles.platName}>NorthStar Surgical</p>
            <p className={styles.platRole}>Medical Innovation</p>
            <p className={styles.platDesc}>
              Practical TKA solutions, workflow impact, and speed to market. Innovation built around how ASCs operate with blocking systems, saw development, and operator-validated gaps.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.founder} id="founder">
        <div className={styles.founderInner}>
          {/* Full-width quote */}
          <div className={cx(styles.fQuoteWrap, styles.reveal)}>
            <p className={styles.fQuote}>
              &quot;Vertical stacks create operational control. Horizontal
              expansion unlocks scale. The result is{" "}
              <strong>
                better outcomes for patients, better tools for physicians, and a
                system whose complexity is invisible to the people it serves.
              </strong>
              &quot;
            </p>
            <p className={styles.fAttr}>Adam W. Stryker — Co-Founder &amp; CEO</p>
          </div>

          {/* Two co-founder cards side by side */}
          <div className={styles.founderCards}>
            {/* Adam Stryker */}
            <div className={cx(styles.fCard, styles.reveal, styles.d1)}>
              <div className={styles.fCardTop}>
                <div className={styles.fAvatar}>AWS</div>
                <div>
                  <h3 className={styles.fName}>Adam W. Stryker</h3>
                  <p className={styles.fTitle}>Co-Founder &amp; CEO — StrykeFox Medical</p>
                </div>
              </div>
              <p className={styles.fBio}>
                Healthcare operator and platform builder. Architect of vertically
                integrated healthcare infrastructure built for national scale.
                Founder of NorthStar Surgical Institute (NSI) and developer of
                Poseidon OS — the CRM·EMR that powers CarePath.
              </p>
              <div className={styles.fCreds}>
                <span className={styles.fCred}>
                  Board Member — SENSARS Neuroprosthetics | FDA Breakthrough Device
                </span>
                <span className={styles.fCred}>
                  Inc. 5000 Class of 2019 — Top 300 Healthcare Executive
                </span>
                <span className={styles.fCred}>
                  SVP/CTO — Americans for Prosperity | $889M, 35 States
                </span>
                <span className={styles.fCred}>
                  Director, Government Relations — Las Vegas Sands
                </span>
                <span className={styles.fCred}>
                  MBA Candidate — Pepperdine Graziadio Business School
                </span>
              </div>
              <a
                href="https://www.adamwstryker.com"
                target="_blank"
                rel="noopener noreferrer"
                className={styles.fLink}
              >
                adamwstryker.com
              </a>
            </div>

            {/* Ben Fox */}
            <div className={cx(styles.fCard, styles.fCardGold, styles.reveal, styles.d2)}>
              <div className={styles.fCardTop}>
                <div className={cx(styles.fAvatar, styles.fAvatarGold)}>BF</div>
                <div>
                  <h3 className={styles.fName}>Ben Fox</h3>
                  <p className={styles.fTitle}>Co-Founder &amp; SVP — StrykeFox Medical</p>
                </div>
              </div>
              <p className={styles.fBio}>
                Operations and business development executive driving StrykeFox
                Medical&apos;s physician network expansion, territory strategy,
                and clinical partnerships across key national markets. The
                operator who closes the last mile.
              </p>
              <div className={styles.fCreds}>
                <span className={styles.fCred}>
                  Co-Founder — StrykeFox Medical | National Launch Architect
                </span>
                <span className={styles.fCred}>
                  SVP Business Development — Physician Network &amp; Territory Strategy
                </span>
                <span className={styles.fCred}>
                  Clinical Partnerships — ASC, Orthopedic &amp; Surgical Group Expansion
                </span>
                <span className={styles.fCred}>
                  CarePath Field Operations — DME, Biologics &amp; Surgical Supply
                </span>
                <span className={styles.fCred}>
                  NorthStar Surgical Institute (NSI) — Commercial Lead
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <div className={styles.contactInner}>
          <div className={cx(styles.contactHead, styles.reveal)}>
            <p className={cx(styles.secEye)}>
              Transform Healthcare Delivery
            </p>
            <h2 className={styles.cTitle}>
              Build the <em>future.</em>
            </h2>
            <p className={styles.cLora}>&quot;Healthcare delivery reimagined through operational excellence.&quot;</p>
            <p className={styles.cDesc}>
              StrykeFox Medical partners with healthcare providers to transform delivery 
              through vertically integrated platforms, operational excellence, and technology-driven 
              solutions. Join us in building the future of healthcare.
            </p>
            <div className={styles.cCtas}>
              <a href="/mommy-care" className={styles.btnGhost}>
                Mommy Care Kit →
              </a>
              <a href="/el-kit-de-cuidado" className={styles.btnGhost}>
                El Kit de Cuidado →
              </a>
              <a href={physicianPortalUrl} className={styles.btnMain}>
                Partner With Us
              </a>
            </div>
            <div className={styles.nsiPanel}>
              <Image
                src="/images/nsi-logo.png"
                alt="NorthStar Surgical Institute"
                width={40}
                height={40}
                className={styles.nsiPanelLogo}
              />
              <div>
                <p className={styles.nsiPanelName}>NorthStar Surgical Institute</p>
                <p className={styles.nsiPanelDesc}>
                  Practical TKA solutions · Blocking systems · Saw development ·
                  Operator-validated innovation.
                </p>
              </div>
            </div>
          </div>
          <div className={cx(styles.contactForm, styles.reveal, styles.d2)}>
            <CarePathIntakeForm />
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <span className={styles.ftBrand}>
          CARE<span>PATH</span> by StrykeFox Medical
        </span>
        <span className={styles.ftLegal}>
          © 2026 StrykeFox Medical LLC | Las Vegas, NV | NPI: 1821959420 |
          Compliance-First. Patient-First.
        </span>
        <span className={styles.ftTag}>Verify · Document · Deliver</span>
      </footer>
    </main>
  )
}
