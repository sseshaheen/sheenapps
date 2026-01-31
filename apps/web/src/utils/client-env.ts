export function isLocalDevelopment(): boolean {
  if (typeof window === 'undefined') return false

  const hostname = window.location.hostname
  if (!hostname) return false

  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.local')
  )
}
