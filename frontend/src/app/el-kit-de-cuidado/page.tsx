import { Metadata } from "next"
import Image from "next/image"
import styles from "../page.module.css"

const cx = (...classes: Array<string | false | undefined>) =>
  classes.filter(Boolean).join(" ")

export const metadata: Metadata = {
  title: "El Kit de Cuidado — Recuperación Postparto Completa | StrykeFox Medical",
  description:
    "Kit completo de recuperación postparto con suministros médicos, prendas de recuperación y esenciales de cuidado. Diseñado para nuevas madres por profesionales de la salud. El Cuidado de Maternidad por StrykeFox Medical.",
  alternates: {
    canonical: "https://www.strykefox.com/el-kit-de-cuidado",
    languages: {
      "en-US": "https://www.strykefox.com/mommy-care",
      "es-MX": "https://www.strykefox.com/el-kit-de-cuidado",
    },
  },
  openGraph: {
    title: "El Kit de Cuidado — Recuperación Postparto Completa",
    description:
      "Kit completo de recuperación postparto con suministros médicos, prendas de recuperación y esenciales de cuidado.",
    url: "https://www.strykefox.com/el-kit-de-cuidado",
  },
}

export default function ElKitCuidadoPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <div className={styles.heroContent}>
            <div className={styles.matLeft}>
              <h1 className={styles.matTitle}>El Kit de Cuidado</h1>
              <p className={styles.matDesc}>
                Esenciales completos de recuperación postparto diseñados por profesionales de la salud. 
                Suministros médicos, prendas de recuperación y artículos de cuidado para tu viaje de sanación.
              </p>
              <div className={styles.matFeatures}>
                <div className={styles.matFeature}>
                  <h3>Suministros Médicos</h3>
                  <p>Artículos de recuperación y esenciales médicos de calidad hospitalaria</p>
                </div>
                <div className={styles.matFeature}>
                  <h3>Comodidad y Recuperación</h3>
                  <p>Prendas especializadas y productos para la sanación</p>
                </div>
                <div className={styles.matFeature}>
                  <h3>Apoyo Profesional</h3>
                  <p>Guiado por mejores prácticas clínicas y protocolos de cuidado</p>
                </div>
              </div>
            </div>
            <div className={styles.matRight}>
              <div className={styles.matLogoWrap}>
                <Image
                  src="/images/mommy-care-en.png"
                  alt="El Kit de Cuidado"
                  width={220}
                  height={220}
                  className={styles.matLogo}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.matDetails}>
        <div className={styles.matDetailsInner}>
          <h2>Qué Incluye tu Kit de Cuidado</h2>
          <div className={styles.matGrid}>
            <div className={styles.matItem}>
              <h3>Prendas de Recuperación</h3>
              <p>Prendas de compresión médica y ropa de apoyo diseñadas para la sanación y comodidad postparto.</p>
            </div>
            <div className={styles.matItem}>
              <h3>Suministros Médicos</h3>
              <p>Suministros médicos y esenciales de grado profesional para tu período de recuperación postparto.</p>
            </div>
            <div className={styles.matItem}>
              <h3>Productos de Cuidado</h3>
              <p>Productos de cuidado especializados formulados para la salud de la piel y bienestar general postparto.</p>
            </div>
            <div className={styles.matItem}>
              <h3>Materiales de Apoyo</h3>
              <p>Materiales educativos y guías de recuperación para apoyar tu viaje de sanación.</p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.contact} id="contact">
        <div className={styles.contactInner}>
          <div className={cx(styles.contactHead, styles.reveal)}>
            <p className={cx(styles.secEye)}>
              Solicita tu Kit de Cuidado
            </p>
            <h2 className={styles.cTitle}>
              Completa tu <em>Recuperación.</em>
            </h2>
            <p className={styles.cLora}>&quot;Sanación apoyada por cuidado profesional.&quot;</p>
            <p className={styles.cDesc}>
              Recibe tu Kit de Cuidado entregado directamente a tu puerta. Esenciales de recuperación 
              postparto de grado profesional diseñados por profesionales de la salud para nuevas madres.
            </p>
            <div className={styles.cCtas}>
              <a href="/mommy-care" className={styles.btnGhost}>
                Ver Versión en Inglés →
              </a>
            </div>
          </div>
          <div className={cx(styles.contactForm, styles.reveal, styles.d2)}>
            <form className={styles.contactFormInner} action="/api/carepath-intake" method="POST">
              <input type="hidden" name="pathway" value="maternity" />
              
              <div className={styles.formGrid}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Tu Nombre</label>
                  <input 
                    type="text" 
                    name="refName" 
                    className={styles.formInput}
                    placeholder="Nombre completo"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Email</label>
                  <input 
                    type="email" 
                    name="refEmail" 
                    className={styles.formInput}
                    placeholder="email@ejemplo.com"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Teléfono</label>
                  <input 
                    type="tel" 
                    name="refPhone" 
                    className={styles.formInput}
                    placeholder="(555) 123-4567"
                    required
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Práctica/Facilidad</label>
                  <input 
                    type="text" 
                    name="refPractice" 
                    className={styles.formInput}
                    placeholder="Nombre del hospital o práctica"
                    required
                  />
                </div>
              </div>
              
              <button type="submit" className={styles.btnMain}>
                Solicitar Kit de Cuidado →
              </button>
              
              <p className={styles.formNote}>
                NPI: 1821959420 · Cumplimiento HIPAA · Suministro Médico Profesional
              </p>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}
