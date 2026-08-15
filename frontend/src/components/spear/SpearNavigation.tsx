"use client";
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ROUTES = [
  { name: 'CEO', path: '/spear' },
  { name: 'Ops', path: '/spear/ops' },
  { name: 'Cases', path: '/spear/cases' },
  { name: 'Intake', path: '/spear/intake' },
  { name: 'Trident', path: '/spear/trident' },
  { name: 'Settings', path: '/spear/settings' },
];

export default function SpearNavigation() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col space-y-1 p-4 border-r border-zinc-100 min-h-screen">
      {ROUTES.map((route) => (
        <Link 
          key={route.path}
          href={route.path}
          className={`px-4 py-3 text-xs font-bold tracking-widest uppercase transition-colors ${
            pathname === route.path
              ? 'bg-slate-900 text-white' 
              : 'text-zinc-400 hover:text-slate-900 hover:bg-zinc-50'
          }`}
        >
          {route.name}
        </Link>
      ))}
    </nav>
  );
}
