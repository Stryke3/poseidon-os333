import HeroBannerClient from '@/components/sections/HeroBannerClient';
import LatinaMaternityLogo from '@/components/ui/LatinaMaternityLogo';

export default function HeroBanner() {
  return (
    <section className="mommy-care-hero">
      
      {/* Logo */}
      <LatinaMaternityLogo />

      {/* Headline */}
      <h1>
        My love, my life, my baby.<br />
        <span>Taking care of myself is taking care of my family.</span>
      </h1>

      {/* Subtext */}
      <p>
        Real support for your recovery, comfort, and wellness after childbirth. 
        Because when mom is well, she can enjoy every moment with her baby.
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
