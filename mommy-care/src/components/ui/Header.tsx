"use client"

'use client';

import Link from 'next/link';
import { Phone, Menu, X } from 'lucide-react';
import { useState } from 'react';
import IntakeForm from '@/components/sections/IntakeForm';

export default function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="bg-warm border-b border-gray-200 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-3">
            <img 
              src="/assets/mommy-care-logo.png" 
              alt="Mommy Care Kit Logo" 
              className="w-10 h-10"
            />
            <div>
              <h1 className="text-xl font-serif text-warm">Mommy Care Kit</h1>
              <p className="text-xs text-gray-600">For Mom</p>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-8">
            <Link href="/" className="text-warm hover:text-primary transition-colors">
              Home
            </Link>
            <Link href="/blog" className="text-warm hover:text-primary transition-colors">
              Blog
            </Link>
            <Link href="/resenas" className="text-warm hover:text-primary transition-colors">
              Reviews
            </Link>
            <Link href="/preguntas-frecuentes" className="text-warm hover:text-primary transition-colors">
              FAQ
            </Link>
            <Link href="/contacto" className="text-warm hover:text-primary transition-colors">
              Contact
            </Link>
            <Link href="/ser-socio" className="text-warm hover:text-primary transition-colors">
              Become a Partner
            </Link>
          </nav>

          {/* CTA Button & Phone */}
          <div className="hidden md:flex items-center space-x-4">
            <a 
              href="tel:888-464-9015" 
              className="flex items-center space-x-2 text-warm hover:text-primary transition-colors"
            >
              <Phone className="w-4 h-4" />
              <span className="text-sm">(888) 464-9015</span>
            </a>
            <IntakeForm />
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden text-warm"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isMenuOpen && (
          <div className="md:hidden mt-4 pt-4 border-t border-gray-200">
            <nav className="flex flex-col space-y-4">
              <Link href="/" className="text-warm hover:text-primary transition-colors">
                Home
              </Link>
              <Link href="/blog" className="text-warm hover:text-primary transition-colors">
                Blog
              </Link>
              <Link href="/resenas" className="text-warm hover:text-primary transition-colors">
                Reviews
              </Link>
              <Link href="/preguntas-frecuentes" className="text-warm hover:text-primary transition-colors">
                FAQ
              </Link>
              <Link href="/contacto" className="text-warm hover:text-primary transition-colors">
                Contact
              </Link>
              <Link href="/ser-socio" className="text-warm hover:text-primary transition-colors">
                Become a Partner
              </Link>
              <div className="flex items-center space-x-4">
                <a 
                  href="tel:888-464-9015" 
                  className="flex items-center space-x-2 text-warm hover:text-primary transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  <span className="text-sm">(888) 464-9015</span>
                </a>
                <IntakeForm />
              </div>
            </nav>
          </div>
        )}
      </div>
      
      {/* Language Badge */}
      <div className="bg-accent text-center py-2">
        <p className="text-sm font-medium text-warm">
          🌟 English Support - Service in your language
        </p>
      </div>
    </header>
  );
}