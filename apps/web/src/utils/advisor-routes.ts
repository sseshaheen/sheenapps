/**
 * Utility functions for advisor route detection
 * Used by both middleware and client components for consistent routing
 */

export function isPublicAdvisorPath(pathname: string): boolean {
  // Handle /advisor, /advisor/join, /advisor/apply, and /advisor/browse with or without locale prefixes
  return (
    pathname === '/advisor' ||
    pathname === '/advisor/' ||
    pathname === '/advisor/join' ||
    pathname === '/advisor/join/' ||
    pathname === '/advisor/apply' ||
    pathname === '/advisor/browse' ||
    pathname === '/advisor/browse/' ||
    pathname.endsWith('/advisor') ||
    pathname.endsWith('/advisor/join') ||
    pathname.endsWith('/advisor/apply') ||
    pathname.endsWith('/advisor/browse') ||
    /^\/[a-z]{2}(-[a-z]{2})?\/advisor(\/join|\/apply|\/browse)?\/?$/.test(pathname)
  );
}

export function isProtectedAdvisorPath(pathname: string): boolean {
  // Protected advisor routes that require authentication
  const protectedRoutes = [
    '/advisor/dashboard',
    '/advisor/profile', 
    '/advisor/consultations',
    '/advisor/earnings',
    '/advisor/settings',
    '/advisor/dashboard/onboarding'
  ];
  
  return protectedRoutes.some(route => pathname.includes(route));
}