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
      title: "Alivio de Dolor",
      description: "Reduce el dolor de espalda y abdomen con nuestra faja de soporte 3-en-1 diseñada específicamente para el cambio de cuerpo durante el embarazo.",
      imageAlt: "Mamá usando faja de soporte abdominal"
    },
    {
      icon: "🦵",
      title: "Reduce Hinchazón",
      description: "Las medias de compresión médica mejoran la circulación y reducen la hinchazón en piernas y pies, un problema común en el embarazo.",
      imageAlt: "Medias de compresión para embarazo"
    },
    {
      icon: "🛡",
      title: "Prevención de Coágulos",
      description: "El dispositivo PlasmaFlow previene coágulos sanguíneos (DVT), una preocupación seria durante el embarazo y posparto.",
      imageAlt: "Dispositivo de prevención de coágulos"
    },
    {
      icon: "✨",
      title: "Minimiza Estrías",
      description: "Nuestros productos ayudan a mantener la elasticidad de la piel, reduciendo la aparición de estrías durante el embarazo.",
      imageAlt: "Cremas y productos para piel embarazada"
    },
    {
      icon: "💪",
      title: "Alivio de Venas Varicosas",
      description: "La compresión graduada alivia las venas varicosas y mejora la circulación en las piernas.",
      imageAlt: "Alivio de venas varicosas en embarazo"
    },
    {
      icon: "🤱",
      title: "Apoyo para Lactancia",
      description: "Incluye productos que te ayudan a mantener una postura cómoda durante la lactancia y extracción de leche.",
      imageAlt: "Apoyo para lactancia materna"
    }
  ];

  const products = [
    {
      name: "Faja de Soporte 3-en-1",
      description: "Proporciona soporte abdominal, lumbar y pélvico. Ajustable para adaptarse a tu cuerpo cambiante durante todo el embarazo.",
      imageAlt: "Faja de soporte 3-en-1 para embarazo",
      featured: true
    },
    {
      name: "Soporte Lumbar",
      description: "Alivia el dolor de espalda causado por el peso adicional y los cambios posturales del embarazo.",
      imageAlt: "Soporte lumbar para embarazo"
    },
    {
      name: "Medias de Compresión",
      description: "Medias de compresión médica de 20-30 mmHg para mejorar circulación y reducir hinchazón.",
      imageAlt: "Medias de compresión médica"
    },
    {
      name: "TENS Unit",
      description: "Unidad de estimulación eléctrica para alivio del dolor sin medicamentos, segura durante el embarazo.",
      imageAlt: "Unidad TENS para alivio del dolor"
    },
    {
      name: "PlasmaFlow",
      description: "Dispositivo portátil que previene coágulos sanguíneos mediante compresión neumática secuencial.",
      imageAlt: "Dispositivo PlasmaFlow para prevención de DVT"
    }
  ];

  return (
    <div className="min-h-screen">
      <AnnouncementBar />
      <HeroBanner />
      
      {/* Stats Section */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              La Realidad del Cuidado Maternal en EE.UU.
            </h2>
            <p className="text-gray-600 max-w-3xl mx-auto">
              Las estadísticas muestran por qué el cuidado preventivo es crucial, especialmente para las madres latinas
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <div className="text-3xl font-bold text-secondary mb-2">37%</div>
              <p className="text-gray-600">de la población vive en un desierto de salud</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <div className="text-3xl font-bold text-secondary mb-2">45°</div>
              <p className="text-gray-600">lugar ocupa EE.UU. en mortalidad materna mundial</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <div className="text-3xl font-bold text-secondary mb-2">80%</div>
              <p className="text-gray-600">de las muertes maternas son prevenibles</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center">
              <div className="text-3xl font-bold text-secondary mb-2">3x</div>
              <p className="text-gray-600">más probabilidad de muerte para mujeres negras</p>
            </div>
            <div className="bg-white rounded-xl shadow-lg p-6 text-center lg:col-span-2">
              <div className="text-3xl font-bold text-secondary mb-2">🌟</div>
              <p className="text-gray-600">Las mujeres latinas enfrentan barreras adicionales de idioma y acceso al sistema de salud</p>
            </div>
          </div>
          
          <div className="mt-12 bg-accent/20 rounded-2xl p-8 max-w-3xl mx-auto">
            <h3 className="text-xl font-serif text-warm mb-4 text-center">
              ¿Qué es el Kit de Cuidado para Mamá?
            </h3>
            <p className="text-gray-600 leading-relaxed text-center">
              Es un conjunto de productos médicos aprobados por la FDA diseñados para aliviar las molestias comunes del embarazo y posparto. 
              Sin medicamentos adictivos, soluciones naturales respaldadas por ciencia, y cubierto por la mayoría de seguros médicos.
            </p>
          </div>
        </div>
      </section>

      <StepTimeline />
      
      {/* Benefits Section */}
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Beneficios del Kit
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Cada producto está diseñado para abordar las necesidades específicas de tu embarazo y recuperación
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
      <section className="py-16 bg-warm">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
              Productos del Kit
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Conoce cada producto incluido en tu kit de cuidado maternal
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

      <TrustBar />
      
      {/* Final CTA Section */}
      <section className="py-20 bg-gradient-to-br from-secondary to-secondary/80">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl md:text-4xl font-serif text-white mb-6">
            Tu bienestar importa — verifica si calificas hoy
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Miles de mamás latinas ya están disfrutando de un embarazo más cómodo. 
            Únete a ellas y descubre por qué nuestro kit es la solución perfecta para ti.
          </p>
          <a 
            href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 bg-white text-secondary px-8 py-4 rounded-full hover:bg-gray-100 transition-colors font-medium text-lg shadow-xl"
          >
            <span>Ver si Califico</span>
          </a>
          <p className="text-white/80 text-sm mt-4">
            Solo 5 minutos • Sin compromiso • Hablamos español
          </p>
        </div>
      </section>
    </div>
  );
}
