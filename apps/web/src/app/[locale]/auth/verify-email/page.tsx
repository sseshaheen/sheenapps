import { AuthLayout } from '@/components/auth/auth-layout'
import { VerifyEmailContent } from '@/components/auth/verify-email-content'

export const dynamic = 'force-dynamic'

interface VerifyEmailPageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ email?: string }>
}

export default async function VerifyEmailPage({ params, searchParams }: VerifyEmailPageProps) {
  const { locale } = await params
  const { email } = await searchParams

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Check your inbox to complete registration"
      locale={locale}
    >
      <VerifyEmailContent email={email || ''} locale={locale} />
    </AuthLayout>
  )
}