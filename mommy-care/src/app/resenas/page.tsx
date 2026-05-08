'use client';

import { useState } from 'react';
import { Star, Filter } from 'lucide-react';
import Image from 'next/image';

const reviews = [
  {
    id: 1,
    name: "María González",
    location: "Houston, TX",
    rating: 5,
    date: "2 de abril, 2026",
    title: "El mejor regalo para mi embarazo",
    content: "Estaba en mi segundo trimestre y el dolor de espalda era insoportable. La faja de soporte cambió completamente mi calidad de vida. Puedo dormir mejor y moverme sin dolor. Lo mejor es que mi seguro lo cubrió al 100%.",
    favoriteProduct: "Faja de soporte 3-en-1",
    verified: true,
    imageAlt: "María González con su bebé",
    imageSrc: "/api/placeholder/80/80"
  },
  {
    id: 2,
    name: "Ana Rodríguez",
    location: "Los Angeles, CA",
    rating: 5,
    date: "30 de marzo, 2026",
    title: "Hablaron español y me entendieron perfectamente",
    content: "Como inmigrante, siempre me preocupan los servicios médicos en EE.UU. Pero el equipo me habló en español, explicó todo detalladamente y me hizo sentir segura. Las medias de compresión salvaron mis piernas hinchadas.",
    favoriteProduct: "Medias de compresión",
    verified: true,
    imageAlt: "Ana Rodríguez sonriendo",
    imageSrc: "/api/placeholder/80/80"
  },
  {
    id: 3,
    name: "Carmen López",
    location: "Miami, FL",
    rating: 5,
    date: "28 de marzo, 2026",
    title: "La unidad TENS es milagrosa",
    content: "Después del parto tenía mucho dolor y no quería tomar medicamentos. La TENS unit me alivió el dolor de forma natural. Es increíble que todo esto esté cubierto por el seguro. ¡Recomendado 100%!",
    favoriteProduct: "TENS Unit",
    verified: true,
    imageAlt: "Carmen López con su familia",
    imageSrc: "/api/placeholder/80/80"
  },
  {
    id: 4,
    name: "Sofia Martinez",
    location: "Phoenix, AZ",
    rating: 4,
    date: "25 de marzo, 2026",
    title: "Buen producto pero tardó un poco en llegar",
    content: "El kit es excelente y me ayudó mucho con el dolor de espalda. El único inconveniente fue que tardó una semana en llegar, pero valió la pena la espera. El equipo fue muy amable y paciente con mis preguntas.",
    favoriteProduct: "Soporte lumbar",
    verified: true,
    imageAlt: "Sofia Martinez embarazada",
    imageSrc: "/api/placeholder/80/80"
  },
  {
    id: 5,
    name: "Patricia Morales",
    location: "San Antonio, TX",
    rating: 5,
    date: "22 de marzo, 2026",
    title: "Mi doctora quedó impresionada",
    content: "Llevé el kit a mi cita prenatal y mi doctora dijo que eran productos de excelente calidad. Me explicó que muchos de sus pacientes podrían beneficiarse. El PlasmaFlow me dio mucha tranquilidad sobre los coágulos.",
    favoriteProduct: "PlasmaFlow",
    verified: true,
    imageAlt: "Patricia Morales en consulta médica",
    imageSrc: "/api/placeholder/80/80"
  },
  {
    id: 6,
    name: "Lucia Hernandez",
    location: "Chicago, IL",
    rating: 5,
    date: "20 de marzo, 2026",
    title: "Perfecto para mi segunda vez",
    content: "Con mi primer bebé sufrí mucho dolor de espalda. Esta vez con el kit ha sido completamente diferente. Me siento más activa y con menos dolor. Mis amigas embarazadas ya pidieron su kit también.",
    favoriteProduct: "Faja de soporte 3-en-1",
    verified: true,
    imageAlt: "Lucia Hernandez con sus hijos",
    imageSrc: "/api/placeholder/80/80"
  }
];

const products = ["Todos", "Faja de soporte 3-en-1", "Soporte lumbar", "Medias de compresión", "TENS Unit", "PlasmaFlow"];
const ratings = ["Todos", "5 estrellas", "4 estrellas", "3 estrellas"];

export default function ReviewsPage() {
  const [selectedProduct, setSelectedProduct] = useState("Todos");
  const [selectedRating, setSelectedRating] = useState("Todos");

  const filteredReviews = reviews.filter(review => {
    const productMatch = selectedProduct === "Todos" || review.favoriteProduct === selectedProduct;
    const ratingMatch = selectedRating === "Todos" || 
      (selectedRating === "5 estrellas" && review.rating === 5) ||
      (selectedRating === "4 estrellas" && review.rating === 4) ||
      (selectedRating === "3 estrellas" && review.rating === 3);
    
    return productMatch && ratingMatch;
  });

  const averageRating = (reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length).toFixed(1);
  const totalReviews = reviews.length;
  const fiveStarReviews = reviews.filter(review => review.rating === 5).length;
  const recommendPercentage = Math.round((reviews.filter(review => review.rating >= 4).length / totalReviews) * 100);

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
              Reseñas de Mamás Reales
            </h1>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
              Descubre por qué miles de mamás latinas confían en nuestro kit para su embarazo y posparto.
            </p>
            
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl mx-auto">
              <div className="text-center">
                <div className="text-3xl font-bold text-secondary mb-1">{averageRating}</div>
                <div className="text-sm text-gray-600">Calificación</div>
                <div className="flex justify-center mt-1">
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-secondary mb-1">{totalReviews}</div>
                <div className="text-sm text-gray-600">Reseñas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-secondary mb-1">{fiveStarReviews}</div>
                <div className="text-sm text-gray-600">5 Estrellas</div>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-secondary mb-1">{recommendPercentage}%</div>
                <div className="text-sm text-gray-600">Recomiendan</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="bg-white rounded-xl shadow-md p-6">
            <div className="flex items-center space-x-2 mb-4">
              <Filter className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-warm">Filtrar Reseñas</h3>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Producto Favorito
                </label>
                <div className="flex flex-wrap gap-2">
                  {products.map((product) => (
                    <button
                      key={product}
                      onClick={() => setSelectedProduct(product)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedProduct === product
                          ? 'bg-secondary text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {product}
                    </button>
                  ))}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Calificación
                </label>
                <div className="flex flex-wrap gap-2">
                  {ratings.map((rating) => (
                    <button
                      key={rating}
                      onClick={() => setSelectedRating(rating)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        selectedRating === rating
                          ? 'bg-secondary text-white'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {rating}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Reviews Grid */}
      <section className="py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {filteredReviews.map((review) => (
              <article key={review.id} className="bg-white rounded-2xl shadow-lg p-6 hover:shadow-xl transition-shadow">
                <div className="flex items-start space-x-4">
                  <div className="flex-shrink-0">
                    <div className="relative w-16 h-16">
                      <Image
                        src={review.imageSrc || "/api/placeholder/80/80"}
                        alt={review.imageAlt}
                        fill
                        className="rounded-full object-cover"
                      />
                    </div>
                  </div>
                  
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-warm">{review.name}</h3>
                        <p className="text-sm text-gray-500">{review.location} • {review.date}</p>
                      </div>
                      {review.verified && (
                        <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full font-medium">
                          ✓ Verificado
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center space-x-1 mb-3">
                      {[...Array(5)].map((_, i) => (
                        <Star 
                          key={i} 
                          className={`w-4 h-4 ${
                            i < review.rating 
                              ? 'fill-yellow-400 text-yellow-400' 
                              : 'text-gray-300'
                          }`} 
                        />
                      ))}
                    </div>
                    
                    <h4 className="font-medium text-warm mb-2">{review.title}</h4>
                    <p className="text-gray-600 mb-4 leading-relaxed">{review.content}</p>
                    
                    <div className="bg-accent/20 rounded-lg px-3 py-2 inline-block">
                      <p className="text-sm text-warm">
                        <span className="font-medium">Producto favorito:</span> {review.favoriteProduct}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          
          {filteredReviews.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-500">No se encontraron reseñas con los filtros seleccionados.</p>
            </div>
          )}
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 bg-secondary">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-serif text-white mb-6">
            ¿Lista para Unirte a Miles de Mamás Felices?
          </h2>
          <p className="text-white/90 text-lg mb-8 max-w-2xl mx-auto">
            Descubre por qué nuestras calificaciones son tan altas y cómo nuestro kit puede transformar tu experiencia de embarazo.
          </p>
          <a 
            href="https://www.mommycarekits.com/mommycarekit?src=scancenter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center space-x-2 bg-white text-secondary px-8 py-4 rounded-full hover:bg-gray-100 transition-colors font-medium text-lg shadow-xl"
          >
            <span>Obtén tu Kit Ahora</span>
          </a>
        </div>
      </section>
    </div>
  );
}
