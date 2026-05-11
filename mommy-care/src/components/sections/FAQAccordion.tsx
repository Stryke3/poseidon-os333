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
    category: "Insurance",
    question: "Is the kit covered by my insurance?",
    answer: "Yes, the kit is covered by most health insurance plans, including Medicaid, Medicare, and most private plans. We verify your coverage before shipping and let you know if there are any costs."
  },
  {
    category: "Insurance",
    question: "Will you notify me if there's any cost?",
    answer: "Absolutely. We contact you before sending any product to explain any costs that may apply. No surprises, no hidden charges. You decide whether to continue."
  },
  {
    category: "Insurance",
    question: "Will it affect my insurance plan?",
    answer: "No, receiving the kit does not affect your insurance plan. It is a preventive benefit covered by most plans to help you have a healthier pregnancy."
  },
  {
    category: "Products",
    question: "Do I need a prescription?",
    answer: "Some products do require a prescription, but we help you get one. Our medical team can evaluate your case and provide the necessary documentation."
  },
  {
    category: "Products",
    question: "Are the products safe during pregnancy?",
    answer: "Yes, all our products are FDA-cleared and specifically designed to be safe during pregnancy and postpartum. They contain no medications and are 100% non-invasive."
  },
  {
    category: "Shipping",
    question: "How long does delivery take?",
    answer: "Once your insurance is approved, the kit typically arrives in 3–5 business days. We ship via UPS with real-time tracking."
  },
  {
    category: "General",
    question: "What exactly is included in the kit?",
    answer: "The kit includes a 3-in-1 support band, lumbar support, compression stockings, a TENS unit with supplies, and a PlasmaFlow device for blood clot prevention."
  },
  {
    category: "General",
    question: "Is support available in Spanish?",
    answer: "Yes! Our team is fully bilingual. We offer complete support in both English and Spanish throughout the entire process."
  }
];

export default function FAQAccordion() {
  const [openItems, setOpenItems] = useState<number[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("All");

  const categories = ["All", ...Array.from(new Set(faqItems.map(item => item.category)))];

  const filteredItems = selectedCategory === "All"
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
            Frequently Asked Questions
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Everything you need to know about the Mommy Care Kit
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
              Still have questions?
            </h3>
            <p className="text-gray-600 mb-6">
              Our team is here to help — in English and Spanish.
            </p>
            <a
              href="/contacto"
              className="inline-flex items-center space-x-2 bg-secondary text-white px-6 py-3 rounded-full hover:bg-opacity-90 transition-colors font-medium"
            >
              <span>Contact Our Team</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
