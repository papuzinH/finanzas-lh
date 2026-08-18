// Destinos de la bottom nav mobile (5º = "Más", que abre un sheet — ver main-nav).
// Los íconos viven en main-nav.tsx: este módulo es puro para poder testearlo.

export const MOBILE_ITEMS = [
  { label: 'Inicio', href: '/' },
  { label: 'Movimientos', href: '/movimientos' },
  { label: 'Compromisos', href: '/compromisos' },
  { label: 'Objetivos', href: '/objetivos' },
];

export const MORE_DESTINATIONS = [
  { label: 'Inversiones', href: '/inversiones' },
  { label: 'Medios de pago', href: '/medios-pago' },
  { label: 'Ajustes', href: '/ajustes' },
];

export function isActive(href: string, pathname: string) {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(href + '/');
}

export function isMoreActive(pathname: string) {
  return MORE_DESTINATIONS.some((d) => isActive(d.href, pathname));
}
