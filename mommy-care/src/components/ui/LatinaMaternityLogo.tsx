'use client';

export default function LatinaMaternityLogo() {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

  return (
    <div className="flex items-center justify-center mb-8">
      <img
        src={`${basePath}/assets/mommy-care-logo.png`}
        alt="Mommy Care Kit — Kit de Cuidado Materno"
        className="w-24 h-24 object-contain drop-shadow-md"
        onError={(e) => {
          (e.currentTarget as HTMLImageElement).style.display = 'none';
        }}
      />
    </div>
  );
}
