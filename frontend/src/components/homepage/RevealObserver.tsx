'use client';

import { useEffect } from 'react';

export function RevealObserver() {
  useEffect(() => {
    const reveals = document.querySelectorAll('.sfm-reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) entry.target.classList.add('visible');
        });
      },
      { threshold: 0.12 },
    );
    reveals.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return null;
}
