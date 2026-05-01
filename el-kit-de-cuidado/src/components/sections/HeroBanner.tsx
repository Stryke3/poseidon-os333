import HeroBannerClient from '@/components/sections/HeroBannerClient';

export default function HeroBanner() {
  return (
    <section className="mommy-care-hero">
      
      {/* Logo */}
      <img 
        src="/assets/mommy-care-logo.png" 
        alt="Mommy Care Kit Logo" 
        className="logo"
      />

      {/* Headline */}
      <h1>
        Cuando nace el bebé… todos lo celebran.<br />
        <span>Nosotros cuidamos a mamá.</span>
      </h1>

      {/* Subtext */}
      <p>
        Apoyo real para la recuperación, comodidad y bienestar después del parto.
        Porque cuando mamá está bien, puede disfrutar cada momento con su bebé.
      </p>

      {/* CTA - Client Component */}
      <HeroBannerClient />
      
      {/* Windsurf Dropin Script */}
      <script 
        src="https://windsurf.com/dropin.js" 
        async
      />
      
    </section>
  );
}
