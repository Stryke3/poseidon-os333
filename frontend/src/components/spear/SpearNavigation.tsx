"use client";
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const ROUTES = [
  { name: 'Command', path: '/spear' },
  { name: 'Cases', path: '/spear/cases' },
  { name: 'Intake', path: '/spear/intake' },
  { name: 'Trident', path: '/spear/trident' },
  { name: 'Authorization', path: '/spear/queues' },
  { name: 'Fulfillment', path: '/spear/fulfillment' },
  { name: 'Revenue', path: '/spear/revenue-support' },
  { name: 'Integrations', path: '/spear/integrations' },
  { name: 'Settings', path: '/spear/settings' },
];

export default function SpearNavigation() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col space-y-1 p-4 min-h-screen">
      <Link href="/spear" className="block px-3 pt-2 pb-5 mb-2 border-b border-slate-100">
        <Image src="/images/spear-logo.png" alt="SPEAR by StrykeFox Medical" width={174} height={64} priority style={{ width: "100%", height: "auto", objectFit: "contain" }} />
      </Link>
      {ROUTES.map((route) => (
        <Link 
          key={route.path}
          href={route.path}
          className={`px-4 py-3 text-xs font-bold tracking-widest uppercase transition-colors ${
            pathname === route.path || (route.path !== '/spear' && pathname.startsWith(`${route.path}/`))
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
