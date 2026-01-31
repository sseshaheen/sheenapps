export function getUserInitials(name?: string, email?: string): string {
  const displayName = name || email?.split('@')[0] || 'User'
  
  // Split by spaces and get first letter of each word
  const parts = displayName.trim().split(/\s+/)
  
  if (parts.length >= 2) {
    // Take first letter of first two words
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase()
  } else {
    // Take first two letters of single word
    return displayName.slice(0, 2).toUpperCase()
  }
}

export function getInitialsAvatar(name?: string, email?: string): string {
  const initials = getUserInitials(name, email)
  
  // Create SVG with initials
  const svg = `
    <svg width="40" height="40" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="20" fill="url(#gradient)" />
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#8B5CF6;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#EC4899;stop-opacity:1" />
        </linearGradient>
      </defs>
      <text x="50%" y="50%" text-anchor="middle" dy=".35em" fill="white" font-family="system-ui, -apple-system, sans-serif" font-size="16" font-weight="600">
        ${initials}
      </text>
    </svg>
  `.trim()
  
  // Convert to data URL - use encodeURIComponent for non-ASCII character support
  // btoa() fails with non-ASCII chars like Arabic, so we encode first
  return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
}