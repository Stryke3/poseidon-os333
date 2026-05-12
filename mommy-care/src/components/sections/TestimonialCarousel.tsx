'use client';

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Star } from 'lucide-react';
import Image from 'next/image';

interface Testimonial {
  id: number;
  name: string;
  location: string;
  rating: number;
  content: string;
  favoriteProduct: string;
  imageAlt: string;
  imageSrc?: string;
}

const testimonials: Testimonial[] = [
  {
    id: 1,
    name: "María G.",
    location: "Houston, TX",
    rating: 5,
    content: "This kit completely changed my postpartum experience. The lumbar support saved me when I couldn't sleep from back pain. And the best part — my insurance covered it 100%.",
    favoriteProduct: "3-in-1 Support Band",
    imageAlt: "Happy mother with her baby",
    imageSrc: "/assets/mommy-care-logo.png"
  },
  {
    id: 2,
    name: "Ana R.",
    location: "Los Angeles, CA",
    rating: 5,
    content: "As a first-time mom I was nervous about everything. The team walked me through every product and the compression stockings were a miracle for my swollen legs.",
    favoriteProduct: "Compression Stockings",
    imageAlt: "Smiling new mother",
    imageSrc: "/assets/mommy-care-logo.png"
  },
  {
    id: 3,
    name: "Carmen L.",
    location: "Miami, FL",
    rating: 5,
    content: "The TENS unit helped me so much with postpartum pain without any medication. It's incredible that all of this is covered by insurance. 100% recommended!",
    favoriteProduct: "TENS Unit",
    imageAlt: "Mother with her family",
    imageSrc: "/assets/mommy-care-logo.png"
  }
];

export default function TestimonialCarousel() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const nextTestimonial = () => {
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
  };

  const prevTestimonial = () => {
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
  };

  const currentTestimonial = testimonials[currentIndex];

  return (
    <section className="py-16 bg-warm">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-serif text-warm mb-4">
            Real Mom Stories
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Thousands of mothers have transformed their pregnancy and postpartum experience with the Mommy Care Kit
          </p>
        </div>

        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-3xl shadow-xl p-8 md:p-12">
            <div className="flex flex-col md:flex-row items-center md:items-start gap-8">
              {/* Image */}
              <div className="flex-shrink-0">
                <div className="relative w-24 h-24 md:w-32 md:h-32">
                  <Image
                    src={currentTestimonial.imageSrc || "/assets/mommy-care-logo.png"}
                    alt={currentTestimonial.imageAlt}
                    fill
                    className="rounded-full object-cover"
                  />
                </div>
              </div>

              {/* Content */}
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start mb-4">
                  {[...Array(currentTestimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                <blockquote className="text-lg text-gray-700 mb-6 leading-relaxed">
                  &ldquo;{currentTestimonial.content}&rdquo;
                </blockquote>

                <div className="mb-4">
                  <cite className="font-semibold text-warm not-italic">
                    {currentTestimonial.name}
                  </cite>
                  <span className="text-gray-500 text-sm ml-2">
                    • {currentTestimonial.location}
                  </span>
                </div>

                <div className="bg-accent/20 rounded-lg px-4 py-2 inline-block">
                  <p className="text-sm text-warm">
                    <span className="font-medium">Favorite product:</span> {currentTestimonial.favoriteProduct}
                  </p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <div className="flex items-center justify-center space-x-4 mt-8">
              <button
                onClick={prevTestimonial}
                className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors flex items-center justify-center group"
                aria-label="Previous testimonial"
              >
                <ChevronLeft className="w-5 h-5 text-warm group-hover:text-primary" />
              </button>

              <div className="flex space-x-2">
                {testimonials.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentIndex(index)}
                    className={`w-2 h-2 rounded-full transition-colors ${
                      index === currentIndex ? 'bg-secondary' : 'bg-gray-300'
                    }`}
                    aria-label={`Go to testimonial ${index + 1}`}
                  />
                ))}
              </div>

              <button
                onClick={nextTestimonial}
                className="w-10 h-10 rounded-full bg-primary/20 hover:bg-primary/30 transition-colors flex items-center justify-center group"
                aria-label="Next testimonial"
              >
                <ChevronRight className="w-5 h-5 text-warm group-hover:text-primary" />
              </button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="text-3xl font-bold text-secondary mb-2">50,000+</div>
            <div className="text-gray-600">Happy Moms</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-secondary mb-2">4.9/5</div>
            <div className="text-gray-600">Average Rating</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-secondary mb-2">98%</div>
            <div className="text-gray-600">Would Recommend</div>
          </div>
        </div>
      </div>
    </section>
  );
}
