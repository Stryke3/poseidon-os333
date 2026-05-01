'use client';

import { useState, useEffect } from 'react';

export default function FloatingCTA() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      // Show after scrolling past hero section
      if (window.scrollY > 600) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-4 right-4 z-40 md:hidden">
      <div className="bg-white rounded-full shadow-2xl p-2 border border-gray-200">
        <a 
          href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-secondary text-white text-center py-3 px-6 rounded-full font-medium hover:bg-opacity-90 transition-colors"
          onClick={() => {
            if (typeof window !== 'undefined' && window.trackCTAClick) {
              window.trackCTAClick('Ver si Califico', 'Floating CTA');
            }
          }}
        >
          Ver si Califico
        </a>
      </div>
    </div>
  );
}
