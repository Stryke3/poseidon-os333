import StrykeFoxFaxSystem from "@/components/fax/StrykeFoxFaxSystem";

export const metadata = {
  title: "StrykeFox Fax System | Poseidon",
  description: "HIPAA-compliant fax and OCR intake system",
};

export default function FaxPage() {
  return (
    <div className="relative min-h-screen">
      <nav className="absolute top-3 left-4 z-10">
        <a
          href="/"
          className="text-xs text-slate-400 hover:text-teal-600 transition-colors font-medium"
        >
          &larr; Dashboard
        </a>
      </nav>
      <StrykeFoxFaxSystem />
    </div>
  );
}
