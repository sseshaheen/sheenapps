'use client'

/**
 * Waitlist Form Component
 * Email signup form for early access / coming soon page
 */

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { m } from '@/components/ui/motion-provider'
import { Icon } from '@/components/ui/icon'

interface WaitlistFormProps {
  translations: {
    title: string
    subtitle: string
    placeholder: string
    button: string
    submitting: string
    success: string
    successSubtitle: string
    error: string
    alreadyJoined: string
    spots: string
    privacy: string
  }
  locale: string
}

type FormStatus = 'idle' | 'submitting' | 'success' | 'error' | 'already_joined'

export function WaitlistForm({ translations, locale }: WaitlistFormProps) {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<FormStatus>('idle')
  const isRTL = locale.startsWith('ar')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || status === 'submitting') return

    setStatus('submitting')

    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, locale }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409 || data.error === 'already_joined') {
          setStatus('already_joined')
          return
        }
        throw new Error(data.error || 'Failed to join waitlist')
      }

      setStatus('success')
      setEmail('')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <m.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="text-center py-8"
      >
        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
          <Icon name="check" className="w-8 h-8 text-green-500" />
        </div>
        <h3 className="text-xl font-semibold text-white mb-2">
          {translations.success}
        </h3>
        <p className="text-gray-400">
          {translations.successSubtitle}
        </p>
      </m.div>
    )
  }

  return (
    <div className="w-full max-w-md mx-auto" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="text-center mb-6">
        <h3 className="text-xl font-semibold text-white mb-2">
          {translations.title}
        </h3>
        <p className="text-gray-400 text-sm">
          {translations.subtitle}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={translations.placeholder}
            required
            disabled={status === 'submitting'}
            className="flex-1 bg-white/10 border-white/20 text-white placeholder:text-gray-400 focus:border-purple-500"
          />
          <Button
            type="submit"
            disabled={status === 'submitting' || !email}
            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-6 whitespace-nowrap"
          >
            {status === 'submitting' ? (
              <>
                <Icon name="loader-2" className="w-4 h-4 me-2 animate-spin" />
                {translations.submitting}
              </>
            ) : (
              translations.button
            )}
          </Button>
        </div>

        {status === 'error' && (
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-red-400 text-sm text-center"
          >
            {translations.error}
          </m.p>
        )}

        {status === 'already_joined' && (
          <m.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-yellow-400 text-sm text-center"
          >
            {translations.alreadyJoined}
          </m.p>
        )}

        <div className="flex items-center justify-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <Icon name="shield-check" className="w-3 h-3" />
            {translations.privacy}
          </span>
        </div>
      </form>

      {/* Spots indicator */}
      <div className="mt-6 flex items-center justify-center gap-2">
        <div className="flex -space-x-2 rtl:space-x-reverse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="w-6 h-6 rounded-full bg-gradient-to-br from-purple-400 to-pink-400 border-2 border-black"
              style={{ opacity: 1 - i * 0.15 }}
            />
          ))}
        </div>
        <span className="text-sm text-gray-400">
          {translations.spots}
        </span>
      </div>
    </div>
  )
}
