import HeroBanner from '@/components/sections/HeroBanner';
import StepTimeline from '@/components/sections/StepTimeline';
import BenefitCard from '@/components/sections/BenefitCard';
import ProductCard from '@/components/sections/ProductCard';
import TrustBar from '@/components/sections/TrustBar';
import AnnouncementBar from '@/components/ui/AnnouncementBar';

export const dynamic = 'force-dynamic';

export default function Home() {
  const benefits = [
    {
      icon: "🤰",
      title: "Pain Relief",
      description: "Reduce back and abdominal pain with our 3-in-1 support band specifically designed for body changes during pregnancy.",
      imageAlt: "Mother wearing abdominal support band"
    },
    {
      icon: "🦵",
      title: "Reduces Swelling",
      description: "Medical compression stockings improve circulation and reduce swelling in legs and feet, a common issue during pregnancy.",
      imageAlt: "Compression stockings for pregnancy"
    },
    {
      icon: "🛡",
      title: "Clot Prevention",
      description: "The PlasmaFlow device prevents blood clots (DVT), a serious concern during pregnancy and postpartum.",
      imageAlt: "Blood clot prevention device"
    },
    {
      icon: "✨",
      title: "Minimizes Stretch Marks",
      description: "Our products help maintain skin elasticity, reducing the appearance of stretch marks during pregnancy.",
      imageAlt: "Creams and products for pregnancy skin"
    },
    {
      icon: "💪",
      title: "Varicose Vein Relief",
      description: "Graduated compression relieves varicose veins and improves circulation in your legs.",
      imageAlt: "Varicose vein relief during pregnancy"
    },
    {
      icon: "🤱",
      title: "Breastfeeding Support",
      description: "Includes products that help you maintain comfortable posture during breastfeeding and milk expression.",
      imageAlt: "Breastfeeding support"
    }
  ];

  const products = [
    {
      name: "3-in-1 Support Band",
      description: "Provides abdominal, lumbar, and pelvic support. Adjustable to fit your changing body throughout pregnancy.",
      imageAlt: "3-in-1 support band for pregnancy",
      featured: true
    },
    {
      name: "Lumbar Support",
      description: "Relieves back pain caused by additional weight and postural changes during pregnancy.",
      imageAlt: "Lumbar support for pregnancy"
    },
    {
      name: "Compression Stockings",
      description: "Medical compression stockings of 20-30 mmHg to improve circulation and reduce swelling.",
      imageAlt: "Medical compression stockings"
    },
    {
      name: "TENS Unit",
      description: "Electrical stimulation unit for drug-free pain relief, safe during pregnancy.",
      imageAlt: "TENS unit for pain relief"
    },
    {
      name: "PlasmaFlow",
      description: "Portable device that prevents blood clots through sequential pneumatic compression.",
      imageAlt: "DVT prevention PlasmaFlow device"
    }
  ];

  return (
    <div className="min-h-screen">
      <AnnouncementBar />
      <HeroBanner />
      
      {/* Stats Section */}
      <section className="py-16 bg-cream">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Maternal Care Reality in the U.S.
            </h2>
            <p className="text-warm-brown max-w-3xl mx-auto">
              Statistics show why preventive care is crucial, especially for diverse mothers
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-6 text-center border border-terracotta-light/20">
              <div className="text-3xl font-bold text-rose-terracotta mb-2">37%</div>
              <p className="text-warm-brown">of the population lives in a health desert</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center border border-terracotta-light/20">
              <div className="text-3xl font-bold text-rose-terracotta mb-2">45°</div>
              <p className="text-warm-brown">U.S. ranks 45th in global maternal mortality</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center border border-terracotta-light/20">
              <div className="text-3xl font-bold text-rose-terracotta mb-2">80%</div>
              <p className="text-warm-brown">of maternal deaths are preventable</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center border border-terracotta-light/20">
              <div className="text-3xl font-bold text-rose-terracotta mb-2">3x</div>
              <p className="text-warm-brown">more likely to die for Black women</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center lg:col-span-2 border border-terracotta-light/20">
              <div className="text-3xl font-bold text-rose-terracotta mb-2">🌟</div>
              <p className="text-warm-brown">Latina women face additional language and healthcare access barriers</p>
            </div>
          </div>
          
          <div className="mt-12 bg-terracotta-light/10 rounded-2xl p-8 max-w-3xl mx-auto border border-terracotta-light/30">
            <h3 className="text-xl font-serif text-warm mb-4 text-center">
              What is the Mommy Care Kit?
            </h3>
            <p className="text-warm-brown leading-relaxed text-center">
              It's a collection of FDA-cleared medical products designed to relieve common discomforts of pregnancy and postpartum. 
              No addictive medications, science-backed natural solutions, and covered by most insurance plans.
            </p>
          </div>
        </div>
      </section>

      <StepTimeline />
      
      {/* Benefits Section */}
      <section className="py-16 bg-sage-light/20">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Kit Benefits
            </h2>
            <p className="text-warm-brown max-w-2xl mx-auto">
              Each product is designed to address the specific needs of your pregnancy and recovery
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <BenefitCard
                key={index}
                icon={benefit.icon}
                title={benefit.title}
                description={benefit.description}
                imageAlt={benefit.imageAlt}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Products Section */}
      <section className="py-16 bg-cream">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Kit Products
            </h2>
            <p className="text-warm-brown max-w-2xl mx-auto">
              Meet each product included in your maternal care kit
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {products.map((product, index) => (
              <ProductCard
                key={index}
                name={product.name}
                description={product.description}
                imageAlt={product.imageAlt}
                featured={product.featured}
              />
            ))}
          </div>
        </div>
      </section>
      
      {/* DME/Patient Support Section */}
      <TrustBar />
      
      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-br from-rose-terracotta to-rose-terracotta/90">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-serif text-white mb-6">
            Your wellness matters — check eligibility today
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Thousands of diverse mothers are already enjoying a more comfortable pregnancy. 
            Join them and discover why our kit is the perfect solution for you.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a 
              href="https://dashboard.strykefox.com/mommy-care/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-white text-rose-terracotta px-8 py-4 rounded-full hover:bg-cream transition-colors font-medium text-lg shadow-xl font-semibold"
            >
              <span>Check Eligibility</span>
            </a>
            <a 
              href="https://dashboard.strykefox.com/el-kit-de-cuidado/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-white text-rose-terracotta px-8 py-4 rounded-full hover:bg-cream transition-colors font-medium text-lg shadow-xl font-semibold"
            >
              <span>Request a Kit</span>
            </a>
            <a 
              href="https://dashboard.strykefox.com/mommy-care/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center space-x-2 bg-white text-rose-terracotta px-8 py-4 rounded-full hover:bg-cream transition-colors font-medium text-lg shadow-xl font-semibold"
            >
              <span>Request a Care Kit</span>
            </a>
          </div>
          <p className="text-white/80 text-sm mt-4">
            Just 5 minutes • No commitment • We speak English
          </p>
        </div>
      </section>
    </div>
  );
}
