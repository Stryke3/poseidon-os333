'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, Search } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqItems: FAQItem[] = [
  {
    category: "Seguro y Costos",
    question: "¿El kit está cubierto por mi seguro médico?",
    answer: "Sí, el kit está cubierto por la mayoría de seguros médicos, incluyendo Medicaid, Medicare y la mayoría de planes privados. Nuestro equipo verifica tu cobertura antes de enviarte el kit y te confirma si calificas."
  },
  {
    category: "Seguro y Costos",
    question: "¿Me avisarán si hay algún costo?",
    answer: "Absolutamente. Te contactamos antes de enviar cualquier producto para explicarte los costos, si los hubiera. No hay sorpresas ni cargos ocultos. Tú decides si continuar con el pedido."
  },
  {
    category: "Seguro y Costos",
    question: "¿Afectará mi plan de seguro?",
    answer: "No, recibir el kit no afecta tu plan de seguro. Es un beneficio preventivo cubierto por la mayoría de planes para ayudarte a tener un embarazo más saludable y reducir complicaciones."
  },
  {
    category: "Seguro y Costos",
    question: "¿Qué pasa si no tengo seguro?",
    answer: "Ofrecemos opciones de pago accesibles si no tienes seguro o si tu plan no cubre el kit. Contáctanos para discutir las opciones disponibles para tu situación específica."
  },
  {
    category: "Productos",
    question: "¿Necesito receta médica?",
    answer: "Para algunos productos sí, pero nosotros te ayudamos a obtenerla. Nuestro equipo médico puede evaluar tu caso y proporcionar la documentación necesaria sin costo adicional."
  },
  {
    category: "Productos",
    question: "¿Son seguros los productos durante el embarazo?",
    answer: "Sí, todos nuestros productos están aprobados por la FDA y son específicamente diseñados para ser seguros durante el embarazo y el posparto. No contienen medicamentos y son 100% no invasivos."
  },
  {
    category: "Productos",
    question: "¿Qué incluye exactamente el kit?",
    answer: "El kit incluye: faja de soporte 3-en-1, soporte lumbar, medias de compresión médica, unidad TENS con suministros, y dispositivo PlasmaFlow para prevención de coágulos sanguíneos."
  },
  {
    category: "Productos",
    question: "¿Puedo elegir qué productos recibir?",
    answer: "El kit está diseñado como un paquete completo para abordar las necesidades más comunes del embarazo y posparto. Sin embargo, podemos ajustar ciertos productos según las recomendaciones de tu médico."
  },
  {
    category: "Envío y Entrega",
    question: "¿Cuánto tiempo tarda en llegar?",
    answer: "Una vez aprobado tu seguro, el kit suele llegar en 3-5 días hábiles. Enviamos por UPS con seguimiento en tiempo real para que sepas exactamente cuándo llegará."
  },
  {
    category: "Envío y Entrega",
    question: "¿Envían a todos los estados?",
    answer: "Sí, enviamos a todos los 50 estados de EE.UU. Algunas áreas remotas pueden tener tiempos de entrega ligeramente más largos."
  },
  {
    category: "Envío y Entrega",
    question: "¿El envío es gratis?",
    answer: "Sí, el envío es completamente gratuito si tu seguro cubre el kit. Si hay algún costo, te lo comunicamos antes de enviar."
  },
  {
    category: "General",
    question: "¿Puedo pedir el kit si no hablo inglés?",
    answer: "¡Por supuesto! Nuestro equipo habla español y podemos atenderte en tu idioma. Todo nuestro proceso, desde la solicitud hasta las instrucciones del producto, está disponible en español."
  },
  {
    category: "General",
    question: "¿En qué momento del embarazo debo pedir el kit?",
    answer: "Puedes pedir el kit en cualquier momento después del primer trimestre. Muchas mamás lo piden entre las semanas 16-20 para tenerlo listo para cuando más lo necesiten."
  },
  {
    category: "General",
    question: "¿Puedo usar el kit después del parto?",
    answer: "Sí, muchos productos están diseñados específicamente para el posparto. El soporte lumbar y las medias de compresión son especialmente útiles durante la recuperación."
  },
  {
    category: "General",
    question: "¿Qué hago si un producto no me queda bien?",
    answer: "Ofrecemos diferentes tallas y ajustes. Si un producto no te queda correctamente, contacta a nuestro equipo y te enviaremos el tamaño correcto sin costo adicional."
  },
  {
    category: "General",
    question: "¿Cómo sé si califico?",
    answer: "La mejor manera es completar nuestro formulario de calificación. Solo toma 5 minutos y te daremos una respuesta inmediata sobre si calificas para el kit cubierto por seguro."
  },
  {
    category: "General",
    question: "¿Puedo pedir el kit si soy primeriza?",
    answer: "¡Sí! De hecho, muchas primerizas se benefician enormemente del kit porque no tienen experiencia previa con los malestares del embarazo. El kit les ayuda a prepararse mejor."
  },
  {
    category: "General",
    question: "¿Hay alguna restricción médica?",
    answer: "Algunas condiciones médicas específicas pueden requerir aprobación médica adicional. Siempre recomendamos consultar con tu médico, y nuestro equipo puede coordinar directamente con ellos si es necesario."
  }
];

const categories = ["Todos", "Seguro y Costos", "Productos", "Envío y Entrega", "General"];

export default function FAQPage() {
  const [openItems, setOpenItems] = useState<number[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredItems = faqItems.filter(item => {
    const categoryMatch = selectedCategory === "Todos" || item.category === selectedCategory;
    const searchMatch = searchQuery === "" || 
      item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.answer.toLowerCase().includes(searchQuery.toLowerCase());
    
    return categoryMatch && searchMatch;
  });

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  const toggleAll = () => {
    if (openItems.length === filteredItems.length) {
      setOpenItems([]);
    } else {
      setOpenItems(filteredItems.map((_, index) => faqItems.findIndex((item: any) => item.question === filteredItems[index].question)));
    }
  };

  return (
    <div className="min-h-screen bg-warm">
      {/* Hero Section */}
      <section className="py-16 bg-gradient-to-br from-primary/20 to-accent/20">
        <div className="container mx-auto px-4">
          <div className="text-center">
            {/* Logo */}
            <div className="flex justify-center mb-6">
              <img 
                src="/assets/mommy-care-logo.png" 
                alt="Mommy Care Kit Logo" 
                className="w-16 h-16"
              />
            </div>
            <h1 className="text-4xl md:text-5xl font-serif text-warm mb-6">
              Preguntas Frecuentes
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Todo lo que necesitas saber sobre el kit de cuidado para mamá. 
              Si no encuentras tu respuesta, contáctanos directamente.
            </p>
            
            {/* Search Bar */}
            <div className="max-w-2xl mx-auto">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Buscar preguntas..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 rounded-full border border-gray-300 focus:ring-2 focus:ring-secondary focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === category
                    ? 'bg-secondary text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
          
          <div className="text-center">
            <button
              onClick={toggleAll}
              className="text-secondary hover:text-secondary/80 transition-colors text-sm font-medium"
            >
              {openItems.length === filteredItems.length ? 'Cerrar todas' : 'Abrir todas'}
            </button>
          </div>
        </div>
      </section>

      {/* FAQ Items */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredItems.map((item, index) => {
              const isOpen = openItems.includes(faqItems.indexOf(item));
              const originalIndex = faqItems.indexOf(item);
              
              return (
                <div 
                  key={originalIndex}
                  className="bg-white rounded-xl shadow-md overflow-hidden"
                >
                  <button
                    onClick={() => toggleItem(originalIndex)}
                    className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center space-x-3 flex-1">
                      <span className="text-xs font-medium text-secondary bg-secondary/10 px-2 py-1 rounded flex-shrink-0">
                        {item.category}
                      </span>
                      <span className="font-medium text-warm text-left">{item.question}</span>
                    </div>
                    {isOpen ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  
                  {isOpen && (
                    <div className="px-6 pb-4">
                      <p className="text-gray-600 leading-relaxed">{item.answer}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          
          {filteredItems.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No se encontraron preguntas con los filtros seleccionados.</p>
              <button
                onClick={() => {
                  setSelectedCategory("Todos");
                  setSearchQuery("");
                }}
                className="mt-4 text-secondary hover:text-secondary/80 transition-colors font-medium"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Still have questions */}
      <section className="py-16 bg-accent/20">
        <div className="container mx-auto px-4">
          <div className="text-center">
            <h2 className="text-3xl font-serif text-warm mb-6">
              ¿Aún tienes preguntas?
            </h2>
            <p className="text-gray-600 max-w-2xl mx-auto mb-8">
              Nuestro equipo de expertos está aquí para ayudarte. No importa cuál sea tu duda, 
              estamos listos para responderla en español.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-3xl mx-auto mb-8">
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="text-3xl mb-3">📞</div>
                <h3 className="font-semibold text-warm mb-2">Llámanos</h3>
                <p className="text-gray-600 text-sm mb-3">
                  Habla directamente con nuestro equipo
                </p>
                <a 
                  href="tel:888-464-9015"
                  className="text-secondary font-medium hover:text-secondary/80 transition-colors"
                >
                  (888) 464-9015
                </a>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="text-3xl mb-3">✉️</div>
                <h3 className="font-semibold text-warm mb-2">Envíanos un email</h3>
                <p className="text-gray-600 text-sm mb-3">
                  Responderemos en 24-48 horas
                </p>
                <a 
                  href="/contacto"
                  className="text-secondary font-medium hover:text-secondary/80 transition-colors"
                >
                  Formulario de contacto
                </a>
              </div>
              
              <div className="bg-white rounded-xl shadow-lg p-6">
                <div className="text-3xl mb-3">🔍</div>
                <h3 className="font-semibold text-warm mb-2">Verifica si calificas</h3>
                <p className="text-gray-600 text-sm mb-3">
                  Solo toma 5 minutos
                </p>
                <a 
                  href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-secondary font-medium hover:text-secondary/80 transition-colors"
                >
                  Verificar ahora
                </a>
              </div>
            </div>
            
            <div className="bg-secondary rounded-2xl p-8 max-w-2xl mx-auto">
              <h3 className="text-xl font-serif text-white mb-4">
                ¿Lista para obtener tu kit?
              </h3>
              <a 
                href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-2 bg-white text-secondary px-8 py-4 rounded-full hover:bg-gray-100 transition-colors font-medium text-lg shadow-xl"
              >
                <span>Verificar si Califico</span>
              </a>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
