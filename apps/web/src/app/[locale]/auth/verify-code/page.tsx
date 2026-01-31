import { AuthLayout } from '@/components/auth/auth-layout'
import { VerifyCodeForm } from '@/components/auth/verify-code-form'

export const dynamic = 'force-dynamic'

interface VerifyCodePageProps {
  params: Promise<{ locale: string }>
  searchParams: Promise<{ email?: string; type?: string }>
}

export default async function VerifyCodePage({ params, searchParams }: VerifyCodePageProps) {
  const { locale } = await params
  const { email, type = 'signup' } = await searchParams

  return (
    <AuthLayout
      title="Enter verification code"
      subtitle="Enter the 6-digit code from your email"
      locale={locale}
    >
      <VerifyCodeForm 
        email={email || ''} 
        locale={locale}
        type={type as any}
      />
    </AuthLayout>
  )
}