import Image from 'next/image';
import { CheckCircle } from 'lucide-react';

interface BenefitCardProps {
  icon: string;
  title: string;
  description: string;
  imageAlt: string;
  imageSrc?: string;
}

export default function BenefitCard({ 
  icon, 
  title, 
  description, 
  imageAlt,
  imageSrc = "/assets/mommy-care-logo.png"
}: BenefitCardProps) {
  return (
    <div className="bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 border border-terracotta-light/20">
      <div className="relative h-48">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-terracotta/60 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex items-center space-x-2 mb-2">
            <span className="text-2xl">{icon}</span>
            <h3 className="text-white font-semibold text-lg">{title}</h3>
          </div>
        </div>
      </div>
      
      <div className="p-6">
        <p className="text-warm-brown leading-relaxed">{description}</p>
        
        <div className="mt-4 flex items-center space-x-2 text-sage">
          <CheckCircle className="w-5 h-5" />
          <span className="text-sm font-medium">Incluido en tu kit</span>
        </div>
      </div>
    </div>
  );
}
