import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Admin Login - SheenApps',
  description: 'Admin login portal for SheenApps management',
}

export default function AdminLoginLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}