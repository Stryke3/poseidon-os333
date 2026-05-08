"use client"

'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqItems: FAQItem[] = [
  {
    category: "Seguro",
    question: "¿El kit está cubierto por mi seguro?",
    answer: "Sí, el kit está cubierto por la mayoría de seguros médicos, incluyendo Medicaid, Medicare y planes privados. Verificamos tu cobertura antes de enviarte el kit y te avisamos si hay algún costo."
  },
  {
    category: "Seguro",
    question: "¿Me avisarán si hay algún costo?",
    answer: "Absolutamente. Te contactamos antes de enviar cualquier producto para explicarte los costos, si los hubiera. No hay sorpresas ni cargos ocultos. Tú decides si continuar."
  },
  {
    category: "Seguro",
    question: "¿Afectará mi plan de seguro?",
    answer: "No, recibir el kit no afecta tu plan de seguro. Es un beneficio preventivo cubierto por la mayoría de planes para ayudarte a tener un embarazo más saludable."
  },
  {
    category: "Productos",
    question: "¿Necesito receta médica?",
    answer: "Para algunos productos sí, pero nosotros te ayudamos a obtenerla. Nuestro equipo médico puede evaluar tu caso y proporcionar la documentación necesaria."
  },
  {
    category: "Productos",
    question: "¿Son seguros los productos durante el embarazo?",
    answer: "Sí, todos nuestros productos están aprobados por la FDA y son específicamente diseñados para ser seguros durante el embarazo y el posparto. No contienen medicamentos."
  },
  {
    category: "Envío",
    question: "¿Cuánto tiempo tarda en llegar?",
    answer: "Una vez aprobado tu seguro, el kit suele llegar en 3-5 días hábiles. Enviamos por UPS con seguimiento en tiempo real."
  },
  {
    category: "General",
    question: "¿Puedo pedir el kit si no hablo inglés?",
    answer: "¡Por supuesto! Nuestro equipo habla español y podemos atenderte en tu idioma. Todo nuestro proceso está disponible en español."
  },
  {
    category: "General",
    question: "¿Qué incluye exactamente el kit?",
    answer: "El kit incluye faja de soporte 3-en-1, soporte lumbar, medias de compresión, unidad TENS con suministros, y dispositivo PlasmaFlow para prevención de coágulos."
  }
];

export default function FAQAccordion() {
  const [openItems, setOpenItems] = useState<number[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("Todos");

  const categories = ["Todos", ...Array.from(new Set(faqItems.map(item => item.category)))];
  
  const filteredItems = selectedCategory === "Todos" 
    ? faqItems 
    : faqItems.filter(item => item.category === selectedCategory);

  const toggleItem = (index: number) => {
    setOpenItems(prev => 
      prev.includes(index) 
        ? prev.filter(i => i !== index)
        : [...prev, index]
    );
  };

  return (
    <section className="py-16 bg-warm">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
            Preguntas Frecuentes
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Todo lo que necesitas saber sobre el kit de cuidado para mamá
          </p>
        </div>

        {/* Category Filter */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
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

        {/* FAQ Items */}
        <div className="max-w-3xl mx-auto space-y-4">
          {filteredItems.map((item, index) => {
            const isOpen = openItems.includes(index);
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
                  <div className="flex items-center space-x-3">
                    <span className="text-xs font-medium text-secondary bg-secondary/10 px-2 py-1 rounded">
                      {item.category}
                    </span>
                    <span className="font-medium text-warm">{item.question}</span>
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

        {/* Still have questions */}
        <div className="text-center mt-12">
          <div className="bg-accent/20 rounded-2xl p-8 max-w-2xl mx-auto">
            <h3 className="text-xl font-serif text-warm mb-4">
              ¿Aún tienes preguntas?
            </h3>
            <p className="text-gray-600 mb-6">
              Nuestro equipo está aquí para ayudarte. Hablamos español y podemos responder todas tus dudas.
            </p>
            <a 
              href="/contacto"
              className="inline-flex items-center space-x-2 bg-secondary text-white px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors font-medium"
            >
              <span>Contactar al Equipo</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}