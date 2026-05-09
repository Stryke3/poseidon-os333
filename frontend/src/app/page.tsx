"use client"

import { useEffect } from "react"
import Image from "next/image"
import { DM_Sans, Lora } from "next/font/google"
import styles from "./page.module.css"

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

const contactHandlerUrl = "/founder#contact"

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
        </a>
        <div className={styles.navR}>
          <a href="#pathways" className={styles.navA}>
            Pathways
          </a>
          <a href="#platform" className={styles.navA}>
            Platform
          </a>
          <a href="#founder" className={styles.navA}>
            Founder
          </a>
          <a href={contactHandlerUrl} className={styles.navCta}>
            Partner With Us
          </a>
        </div>
      </nav>

      <section className={styles.hero} id="pathways">
        <div className={styles.heroBg} />
        <div className={styles.heroGrid} />
        <div className={styles.heroPulse} />
        <div className={cx(styles.heroPulse, styles.heroPulse2)} />
        <div className={styles.heroInner}>
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
              src="/images/mommy-care-en.png"
              alt="Mommy Care Kit"
              width={220}
              height={220}
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
                src="/images/sfm-logo.jpeg"
                alt="StrykeFox Medical"
                width={160}
                height={38}
              />
            </div>
            <p className={styles.platName}>StrykeFox Medical</p>
            <p className={styles.platRole}>Operating Platform</p>
            <p className={styles.platDesc}>
              Provider relationships, DME, biologics, implants, and billing. The
              healthcare operations engine behind CarePath.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d2)}>
            <div className={styles.platLogo}>
              <Image
                src="/images/nsi-logo.png"
                alt="NorthStar Surgical Innovations"
                width={180}
                height={38}
              />
            </div>
            <p className={styles.platName}>NorthStar Surgical</p>
            <p className={styles.platRole}>Clinical Innovation</p>
            <p className={styles.platDesc}>
              3D-printed implants, Bluetooth surgical navigation, FDA-cleared
              international devices, biologics, and physician training.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d3)}>
            <div className={styles.platCode}>S13</div>
            <p className={styles.platName}>SoC13</p>
            <p className={styles.platRole}>Acquisition Vehicle</p>
            <p className={styles.platDesc}>
              Strategic roll-up of ASCs, orthopedic practices, home health, PT/OT,
              and wound clinics — integrated onto a single spine.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d4)}>
            <div className={styles.platCode}>SPR</div>
            <p className={styles.platName}>Spear</p>
            <p className={styles.platRole}>Poseidon OS + Trident AI</p>
            <p className={styles.platDesc}>
              Workflow orchestration and documentation intelligence. The operating
              system that runs underneath every CarePath pathway.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d5)}>
            <div className={styles.platCode}>SNS</div>
            <p className={styles.platName}>SENSARS</p>
            <p className={styles.platRole}>FDA Breakthrough Device</p>
            <p className={styles.platDesc}>
              Neuroprosthetics advancing sensory feedback for prosthetic limb
              users. Board-level participation by StrykeFox leadership.
            </p>
          </div>
          <div className={cx(styles.platCard, styles.reveal, styles.d6)}>
            <div className={styles.platCode}>EGR</div>
            <p className={styles.platName}>Egeiro Holdings</p>
            <p className={styles.platRole}>Institutional Parent</p>
            <p className={styles.platDesc}>
              The long-horizon holding architecture. Capital structure,
              acquisition strategy, and enterprise map for the Healthcare Lineage.
            </p>
          </div>
        </div>
      </section>

      <section className={styles.founder} id="founder">
        <div className={styles.founderInner}>
          <div className={styles.reveal}>
            <p className={styles.fQuote}>
              &quot;Vertical stacks create operational control. Horizontal
              expansion unlocks scale. The result is{" "}
              <strong>
                better outcomes for patients, better tools for physicians, and a
                system whose complexity is invisible to the people it serves.
              </strong>
              &quot;
            </p>
            <p className={styles.fAttr}>Adam W. Stryker — Founder &amp; CEO</p>
          </div>
          <div className={cx(styles.fCard, styles.reveal, styles.d2)}>
            <h3 className={styles.fName}>Adam W. Stryker</h3>
            <p className={styles.fTitle}>
              Founder &amp; CEO — StrykeFox Medical
            </p>
            <p className={styles.fBio}>
              Healthcare operator and platform builder. Architect of vertically
              integrated healthcare infrastructure built for national scale.
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
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <div className={styles.reveal}>
          <p className={cx(styles.secEye, styles.secEyeCenter)}>
            Partner With CarePath
          </p>
          <h2 className={styles.cTitle}>
            Own the <em>pathway.</em>
          </h2>
          <p className={styles.cLora}>&quot;The thread belongs to someone now.&quot;</p>
          <p className={styles.cDesc}>
            CarePath partners with surgical groups, orthopedic practices, ASCs, OB
            groups, and discharge-heavy providers who are ready to deliver what
            comes next.
          </p>
          <div className={styles.cCtas}>
              <a href={contactHandlerUrl} className={styles.btnMain}>
                Contact Our Team
              </a>
            <a href={physicianPortalUrl} className={styles.btnGhost}>
              Rep Portal
            </a>
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
