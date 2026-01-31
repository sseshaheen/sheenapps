'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import Icon, { type IconName } from '@/components/ui/icon'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/i18n/routing'
import { cn } from '@/lib/utils'

// RTL detection utility
const isRTLLocale = (locale: string) => locale.startsWith('ar')

interface SetupWizardProps {
  projectId: string
  integrations: { tracking: boolean; payments: boolean; forms: boolean }
  locale: string
  onDismiss: () => void
  onComplete: () => void
}

interface SetupGate {
  id: 'tracking' | 'payments' | 'forms'
  icon: IconName
  title: string
  description: string
  completed: boolean
  required: boolean
  actionLabel: string
  actionHref: string
}

/**
 * Setup Wizard for Run Hub - Phase 5
 *
 * Full-screen modal overlay that guides first-time users through
 * setting up their integrations before they expect to see data.
 */
export function SetupWizard({
  projectId,
  integrations,
  locale,
  onDismiss,
  onComplete,
}: SetupWizardProps) {
  const t = useTranslations('run')
  const router = useRouter()
  const isRTL = isRTLLocale(locale)

  // Define the 3 setup gates
  // P0 Trust Fix: Added wizard=true param so destination pages can show simplified view
  const gates: SetupGate[] = [
    {
      id: 'tracking',
      icon: 'activity',
      title: t('wizard.tracking.title'),
      description: t('wizard.tracking.description'),
      completed: integrations.tracking,
      required: true,
      actionLabel: t('wizard.tracking.action'),
      actionHref: `/builder/workspace/${projectId}?infra=api-keys&wizard=true`,
    },
    {
      id: 'payments',
      icon: 'credit-card',
      title: t('wizard.payments.title'),
      description: t('wizard.payments.description'),
      completed: integrations.payments,
      required: false,
      actionLabel: t('wizard.payments.action'),
      actionHref: `/builder/workspace/${projectId}?infra=phase3&wizard=true`,
    },
    {
      id: 'forms',
      icon: 'file-text',
      title: t('wizard.forms.title'),
      description: t('wizard.forms.description'),
      completed: integrations.forms,
      required: false,
      actionLabel: t('wizard.forms.action'),
      actionHref: `/builder/workspace/${projectId}?infra=cms&wizard=true`,
    },
  ]

  // Calculate progress
  const completedGates = gates.filter((gate) => gate.completed).length
  const progressPercentage = (completedGates / gates.length) * 100
  const allGatesComplete = completedGates === gates.length

  // Handle gate action - navigate to infrastructure panel
  const handleGateAction = (gate: SetupGate) => {
    router.push(gate.actionHref)
  }

  // Handle completion
  const handleComplete = () => {
    onComplete()
  }

  // Get status icon for gate
  const getGateStatusIcon = (gate: SetupGate): IconName => {
    if (gate.completed) return 'check-circle'
    return gate.icon
  }

  // Get status color for gate
  const getGateStatusColor = (gate: SetupGate) => {
    if (gate.completed) return 'text-green-600 bg-green-100 dark:bg-green-900/30'
    return 'text-gray-600 bg-gray-100 dark:bg-gray-800'
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm overflow-y-auto"
      dir={isRTL ? 'rtl' : 'ltr'}
    >
      <div className="min-h-screen px-4 py-8 sm:px-6 lg:px-8 pb-[env(safe-area-inset-bottom,20px)]">
        <div className="mx-auto max-w-2xl">
          {/* Header */}
          <div className="text-center mb-10">
            <div className="mb-6">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <Icon name="rocket" className="w-10 h-10 text-primary" />
              </div>
            </div>

            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-3">
              {t('wizard.title')}
            </h1>

            <p className="text-lg text-muted-foreground mb-8">
              {t('wizard.subtitle')}
            </p>

            {/* Progress Overview */}
            <div className="max-w-md mx-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">
                  {t('wizard.progress')}
                </span>
                <span className="text-sm text-muted-foreground">
                  {completedGates} / {gates.length}
                </span>
              </div>
              <Progress value={progressPercentage} className="h-3" />
            </div>
          </div>

          {/* Setup Gates */}
          <div className="space-y-4 mb-10">
            {gates.map((gate) => (
              <Card
                key={gate.id}
                className={cn(
                  'transition-all duration-200',
                  gate.completed && 'border-green-200 bg-green-50/50 dark:border-green-800 dark:bg-green-900/20'
                )}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0',
                        getGateStatusColor(gate)
                      )}
                    >
                      <Icon name={getGateStatusIcon(gate)} className="w-6 h-6" />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <CardTitle className="text-base">{gate.title}</CardTitle>
                        {gate.required && (
                          <Badge variant="secondary" className="text-[10px]">
                            {t('wizard.required') || 'Required'}
                          </Badge>
                        )}
                        {gate.completed && (
                          <Badge variant="default" className="text-[10px] bg-green-600">
                            {t('wizard.complete') || 'Complete'}
                          </Badge>
                        )}
                      </div>
                      <CardDescription className="text-sm">
                        {gate.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-2">
                  <div className="flex justify-start sm:justify-end">
                    {gate.completed ? (
                      <Button variant="ghost" disabled className="text-green-600 min-h-[44px]">
                        <Icon name="check-circle" className="w-4 h-4 me-2" />
                        {t('wizard.done') || 'Done'}
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        className="min-h-[44px] w-full sm:w-auto"
                        onClick={() => handleGateAction(gate)}
                      >
                        <Icon name={gate.icon} className="w-4 h-4 me-2" />
                        {gate.actionLabel}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* All Done State */}
          {allGatesComplete && (
            <Card className="border-2 border-primary bg-primary/5 mb-6">
              <CardContent className="p-6 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto mb-4">
                  <Icon name="check-circle" className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold mb-2">{t('wizard.allDone')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('wizard.allDoneDescription')}
                </p>
                <Button onClick={handleComplete} size="lg" className="min-h-[48px] w-full sm:w-auto">
                  <Icon name="bar-chart" className="w-5 h-5 me-2" />
                  {t('wizard.startMonitoring')}
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col-reverse sm:flex-row items-center justify-center gap-3">
            <Button
              variant="ghost"
              onClick={onDismiss}
              className="text-muted-foreground min-h-[44px] w-full sm:w-auto"
            >
              {t('wizard.skip')}
            </Button>
            {!allGatesComplete && (
              <Button
                variant="outline"
                onClick={handleComplete}
                className="min-h-[44px] w-full sm:w-auto"
              >
                {t('wizard.complete')}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
