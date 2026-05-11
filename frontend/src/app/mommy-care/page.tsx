import { Metadata } from "next"
import Image from "next/image"
import styles from "../page.module.css"

const cx = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ")

export const metadata: Metadata = {
  title: "Mommy Care Kit - Complete Postpartum Recovery | StrykeFox Medical",
  description: "Comprehensive postpartum recovery kit with medical supplies, recovery garments, and care essentials. Designed for new mothers by healthcare professionals.",
}

export default function MommyCarePage() {
  return (
    <div className={styles.page}>
      <section className={cx(styles.hero, styles.mommyHero)}>
        <div className={styles.heroBg} />
        <div className={styles.mommyHeroPhoto}>
          <Image
            src="/images/medical-tray.svg"
            alt=""
            fill
            sizes="42vw"
            priority
          />
        </div>
        <div className={styles.mommyLogoWatermark}>
          <Image
            src="/images/mommy-care-kit-logo.png"
            alt=""
            fill
            sizes="48vw"
            priority
          />
        </div>
        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.matLeft}>
              <h1 className={styles.matTitle}>Mommy Care Kit</h1>
              <p className={styles.matDesc}>
                Complete postpartum recovery essentials designed by healthcare professionals. 
                Medical supplies, recovery garments, and care items for your healing journey.
              </p>
              <div className={styles.matFeatures}>
                <div className={styles.matFeature}>
                  <h3>Medical Grade Supplies</h3>
                  <p>Hospital-quality recovery items and medical essentials</p>
                </div>
                <div className={styles.matFeature}>
                  <h3>Comfort & Recovery</h3>
                  <p>Specialized garments and products for healing</p>
                </div>
                <div className={styles.matFeature}>
                  <h3>Professional Support</h3>
                  <p>Guided by clinical best practices and care protocols</p>
                </div>
              </div>
            </div>
            <div className={styles.matRight}>
              <div className={styles.matLogoWrap}>
                <Image
                  src="/images/mommy-care-kit-logo.png"
                  alt="Mommy Care Kit"
                  width={360}
                  height={360}
                  className={styles.matLogo}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.matDetails}>
        <div className={styles.matDetailsInner}>
          <h2>What's Included in Your Mommy Care Kit</h2>
          <div className={styles.matGrid}>
            <div className={styles.matItem}>
              <h3>Recovery Garments</h3>
              <p>Medical-grade compression garments and support wear designed for postpartum healing and comfort.</p>
            </div>
            <div className={styles.matItem}>
              <h3>Medical Supplies</h3>
              <p>Professional-grade medical supplies and essentials for your postpartum recovery period.</p>
            </div>
            <div className={styles.matItem}>
              <h3>Care Products</h3>
              <p>Specialized care products formulated for postpartum skin health and overall wellness.</p>
            </div>
            <div className={styles.matItem}>
              <h3>Support Materials</h3>
              <p>Educational materials and recovery guides to support your healing journey.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <div className={styles.contactInner}>
          <div className={cx(styles.contactHead, styles.reveal)}>
            <p className={cx(styles.secEye)}>
              Request Your Mommy Care Kit
            </p>
            <h2 className={styles.cTitle}>
              Complete Your <em>Recovery.</em>
            </h2>
            <p className={styles.cLora}>&quot;Healing supported by professional care.&quot;</p>
            <p className={styles.cDesc}>
              Get your Mommy Care Kit delivered directly to your door. Professional-grade 
              postpartum recovery essentials designed by healthcare professionals for new mothers.
            </p>
            <div className={styles.cCtas}>
              <a href="/el-kit-de-cuidado" className={styles.btnGhost}>
                View Spanish Version →
              </a>
            </div>
          </div>
          <div className={cx(styles.contactForm, styles.reveal, styles.d2)}>
            <form className={styles.contactFormInner} action="/api/carepath-intake" method="POST">
              <input type="hidden" name="pathway" value="maternity" />
              
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Your Name</label>
                  <input 
                    type="text" 
                    name="refName" 
                    className={styles.formInput}
                    placeholder="Full name"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email</label>
                  <input 
                    type="email" 
                    name="refEmail" 
                    className={styles.formInput}
                    placeholder="email@example.com"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Phone</label>
                  <input 
                    type="tel" 
                    name="refPhone" 
                    className={styles.formInput}
                    placeholder="(555) 123-4567"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Practice/Facility</label>
                  <input 
                    type="text" 
                    name="refPractice" 
                    className={styles.formInput}
                    placeholder="Hospital or practice name"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className={styles.btnMain}>
                Request Mommy Care Kit →
              </button>
              
              <p className={styles.formNote}>
                NPI: 1821959420 · HIPAA-Compliant · Professional Medical Supply
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}
