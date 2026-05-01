export default function AnnouncementBar() {
  return (
    <div className="fixed top-16 left-0 right-0 z-99 bg-gradient-to-r from-secondary to-primary text-white text-center py-2 px-4 text-sm font-semibold tracking-wide">
      📦 ¡Tu kit puede ser 100% cubierto por tu seguro médico! —{' '}
      <button 
        onClick={() => {
          if (typeof window !== 'undefined' && window.trackCTAClick) {
            window.trackCTAClick('Verifica aquí', 'Announcement Bar');
          }
        }}
        className="underline hover:no-underline transition-colors cursor-pointer"
      >
        Verifica aquí →
      </button>
    </div>
  );
}
