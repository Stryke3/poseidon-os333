import Image from 'next/image';

interface ProductCardProps {
  name: string;
  description: string;
  imageAlt: string;
  imageSrc?: string;
  featured?: boolean;
}

export default function ProductCard({ 
  name, 
  description, 
  imageAlt,
  imageSrc = "/assets/mommy-care-logo.png",
  featured = false
}: ProductCardProps) {
  return (
    <div className={`bg-white rounded-2xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 border ${
      featured ? 'ring-2 ring-rose-terracotta ring-offset-4 border-rose-terracotta/30' : 'border-terracotta-light/20'
    }`}>
      {featured && (
        <div className="bg-gradient-to-r from-rose-terracotta to-terracotta text-white text-center py-2 text-sm font-medium">
          ⭐ Más Popular
        </div>
      )}
      
      <div className="relative h-64 p-8 bg-cream/30">
        <Image
          src={imageSrc}
          alt={imageAlt}
          fill
          className="object-contain"
        />
      </div>
      
      <div className="p-6">
        <h3 className="text-xl font-serif text-warm mb-3">{name}</h3>
        <p className="text-warm-brown text-sm leading-relaxed">{description}</p>
        
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center space-x-1 text-sage">
            <span className="text-xs">✓</span>
            <span className="text-xs font-medium">Aprobado FDA</span>
          </div>
          <div className="text-xs text-warm-brown">
            Incluido en kit
          </div>
        </div>
      </div>
    </div>
  );
}
