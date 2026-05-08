'use client';

export default function LatinaMaternityLogo() {
  return (
    <div className="relative inline-block">
      {/* Logo Container */}
      <div className="flex items-center justify-center w-80 h-40 relative mx-auto">
        {/* Decorative Circle Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-orange-100 to-orange-50 rounded-full border-2 border-orange-200 shadow-lg"></div>
        
        {/* Main Logo Content */}
        <div className="relative z-10 text-center px-6">
          {/* Mom Icon with Heart */}
          <div className="flex justify-center mb-4">
            <div className="relative">
              {/* Mom silhouette */}
              <svg 
                width="60" 
                height="65" 
                viewBox="0 0 60 65" 
                className="fill-orange-600 drop-shadow-md"
              >
                <path d="M30 15C24.5 15 20 19.5 20 25C20 28 21.5 30.8 23.8 32.5V36C23.8 38.2 25.5 40 27.5 40H32.5C34.5 40 36.2 38.2 36.2 36V32.5C38.5 30.8 40 28 40 25C40 19.5 35.5 15 30 15Z" />
                <circle cx="30" cy="25" r="10" fill="#FEF9F5" />
              </svg>
              
              {/* Baby silhouette */}
              <svg 
                width="30" 
                height="30" 
                viewBox="0 0 30 30" 
                className="fill-orange-500 absolute -top-4 -right-4 drop-shadow-md"
              >
                <circle cx="15" cy="15" r="12" />
                <circle cx="15" cy="12" r="5" fill="#FEF9F5" />
              </svg>
              
              {/* Heart */}
              <svg 
                width="18" 
                height="18" 
                viewBox="0 0 18 18" 
                className="fill-yellow-600 absolute top-1 -right-5 drop-shadow-md"
              >
                <path d="M9 15.5L3 9.5C1.5 8 1.5 6 3 4.5C4.5 3 6.5 3 8 4.5L9 5L10 4.5C11.5 3 13.5 3 15 4.5C16.5 6 16.5 8 15 9.5L9 15.5Z" />
              </svg>
            </div>
          </div>
          
          {/* Brand Name */}
          <div className="space-y-2">
            <h1 className="text-4xl font-serif text-orange-800 font-bold leading-tight">
              Mommy Care
            </h1>
            <div className="text-base text-orange-700 font-semibold tracking-wider">
              KIT DE CUIDADO MATERNO
            </div>
          </div>
        </div>
      </div>
      
      {/* Decorative Elements */}
      <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-2 h-12 bg-gradient-to-b from-orange-600 to-orange-400 rounded-full shadow-md"></div>
      <div className="absolute -right-4 top-1/2 -translate-y-1/2 w-2 h-12 bg-gradient-to-b from-orange-400 to-orange-600 rounded-full shadow-md"></div>
    </div>
  );
}
