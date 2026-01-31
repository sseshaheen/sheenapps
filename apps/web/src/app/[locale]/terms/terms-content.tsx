'use client'

import { m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import { Link } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'

const sections = [
  {
    title: 'Account Terms',
    content: [
      {
        subtitle: 'Account Creation',
        items: [
          'You must be 13 years or older to use this service',
          'You must provide accurate and complete information',
          'You are responsible for maintaining account security',
          'One person or legal entity per account',
          'You must be a human (no bots or automated accounts)'
        ]
      },
      {
        subtitle: 'Account Responsibilities',
        items: [
          'You are responsible for all activity under your account',
          'You must notify us immediately of unauthorized access',
          'You may not use the service for illegal purposes',
          'You must comply with all applicable laws and regulations',
          'You may not share your account credentials'
        ]
      }
    ]
  },
  {
    title: 'Acceptable Use',
    content: [
      {
        subtitle: 'Permitted Uses',
        items: [
          'Building and deploying web applications',
          'Creating content for legitimate business purposes',
          'Collaborating with team members and advisors',
          'Testing and development of software',
          'Educational and learning purposes'
        ]
      },
      {
        subtitle: 'Prohibited Uses',
        items: [
          'Illegal activities or promoting illegal content',
          'Harassment, abuse, or harm to others',
          'Spreading malware, viruses, or malicious code',
          'Violating intellectual property rights',
          'Attempting to breach or test our security',
          'Excessive automated usage that impacts service',
          'Mining cryptocurrency without explicit permission',
          'Creating competing services using our platform'
        ]
      }
    ]
  },
  {
    title: 'Payment Terms',
    content: [
      {
        subtitle: 'Billing',
        items: [
          'Subscription fees are billed in advance',
          'All fees are in USD unless otherwise specified',
          'Prices may change with 30 days notice',
          'You authorize automatic recurring payments',
          'Payment processing is handled by Stripe'
        ]
      },
      {
        subtitle: 'Refunds',
        items: [
          '30-day money-back guarantee for new accounts',
          'No refunds for partial months of service',
          'Credits may be issued at our discretion',
          'Refunds processed through original payment method',
          'Processing time: 5-10 business days'
        ]
      }
    ]
  },
  {
    title: 'Intellectual Property',
    content: [
      {
        subtitle: 'Your Content',
        items: [
          'You retain all rights to content you create',
          'You grant us license to host and display your content',
          'You are responsible for your content\'s legality',
          'You warrant you have rights to use uploaded content',
          'We may remove content that violates these terms'
        ]
      },
      {
        subtitle: 'Our Property',
        items: [
          'SheenApps platform and brand are our property',
          'You may not copy or reverse engineer our service',
          'Our AI models and algorithms are proprietary',
          'Templates and system-generated code have specific licenses',
          'Feedback and suggestions become our property'
        ]
      }
    ]
  },
  {
    title: 'Service Terms',
    content: [
      {
        subtitle: 'Service Availability',
        items: [
          'We strive for 99.9% uptime but do not guarantee it',
          'Scheduled maintenance will be announced in advance',
          'We may modify or discontinue features with notice',
          'Emergency maintenance may occur without notice',
          'Service availability may vary by geographic region'
        ]
      },
      {
        subtitle: 'Support',
        items: [
          'Support is provided via email and chat',
          'Response times vary by subscription tier',
          'We do not guarantee resolution of all issues',
          'Support is provided in English',
          'Premium support available for enterprise customers'
        ]
      }
    ]
  },
  {
    title: 'Data and Privacy',
    content: [
      {
        subtitle: 'Data Handling',
        items: [
          'We handle data according to our Privacy Policy',
          'You are responsible for data you process',
          'We provide tools for data export and deletion',
          'Backups are maintained for disaster recovery',
          'Data residency options available for enterprise'
        ]
      },
      {
        subtitle: 'Security',
        items: [
          'We implement industry-standard security measures',
          'You must use strong passwords and 2FA when available',
          'Report security vulnerabilities responsibly',
          'We are not liable for third-party breaches',
          'Security incidents will be disclosed as required by law'
        ]
      }
    ]
  },
  {
    title: 'Limitation of Liability',
    content: [
      {
        subtitle: 'Disclaimers',
        items: [
          'Service provided "as is" without warranties',
          'We do not guarantee specific results or outcomes',
          'We are not responsible for lost profits or data',
          'Our liability is limited to fees paid in last 12 months',
          'Some jurisdictions do not allow liability limitations'
        ]
      },
      {
        subtitle: 'Indemnification',
        items: [
          'You indemnify us against claims from your use',
          'This includes legal fees and damages',
          'Indemnification survives termination',
          'We may defend ourselves at your expense',
          'You must cooperate with our defense'
        ]
      }
    ]
  },
  {
    title: 'Termination',
    content: [
      {
        subtitle: 'Termination by You',
        items: [
          'You may cancel your account at any time',
          'Cancellation takes effect at end of billing period',
          'You can export your data before cancellation',
          'No refunds for unused time',
          'Some data may be retained as required by law'
        ]
      },
      {
        subtitle: 'Termination by Us',
        items: [
          'We may terminate for violation of terms',
          'We may terminate for non-payment',
          'We may terminate inactive accounts after 12 months',
          'Termination for cause is immediate',
          'We will attempt to notify you before termination'
        ]
      }
    ]
  }
]

export function TermsContent() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-24 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <Icon name="file-text" className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">Terms of Service</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Terms of Service
          </h1>
          
          <p className="text-xl text-muted-foreground mb-4">
            By using SheenApps, you agree to these terms. We've written them to be 
            clear and fair, protecting both your interests and ours.
          </p>
          
          <p className="text-sm text-muted-foreground">
            Last updated: January 2025 · Effective date: January 1, 2025
          </p>
        </m.div>
      </div>

      {/* Quick Summary */}
      <div className="container mx-auto px-4 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="rounded-2xl bg-card border border-border p-8">
            <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
              <Icon name="zap" className="w-6 h-6 text-primary" />
              The Basics
            </h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">You own your content and code</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">30-day money-back guarantee for new users</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Cancel anytime, no questions asked</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Use for any legal purpose</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">We respect your privacy and data</span>
              </li>
            </ul>
          </div>
        </m.div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 pb-24">
        <div className="max-w-4xl mx-auto space-y-12">
          {sections.map((section, sectionIndex) => (
            <m.div
              key={section.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: sectionIndex * 0.1 }}
            >
              <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-6">
                {sectionIndex + 1}. {section.title}
              </h2>
              
              <div className="space-y-6">
                {section.content.map((subsection) => (
                  <div key={subsection.subtitle}>
                    <h3 className="text-xl font-semibold text-purple-400 mb-3">
                      {subsection.subtitle}
                    </h3>
                    <ul className="space-y-2">
                      {subsection.items.map((item) => (
                        <li key={item} className="flex items-start gap-3">
                          <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                          <span className="text-muted-foreground">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </m.div>
          ))}
        </div>
      </div>

      {/* Additional Terms */}
      <div className="container mx-auto px-4 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="rounded-2xl bg-gray-900/50 border border-gray-800 p-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Additional Terms
            </h2>
            
            <div className="space-y-4 text-muted-foreground">
              <div>
                <h3 className="text-lg font-semibold text-purple-400 mb-2">Governing Law</h3>
                <p>
                  These Terms are governed by the laws of Delaware, United States, 
                  without regard to conflict of law principles. Any disputes will be 
                  resolved in the courts of Delaware.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-purple-400 mb-2">Entire Agreement</h3>
                <p>
                  These Terms, together with our Privacy Policy and any other agreements 
                  you enter with us, constitute the entire agreement between you and SheenApps.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-purple-400 mb-2">Severability</h3>
                <p>
                  If any provision of these Terms is found to be unenforceable, the 
                  remaining provisions will continue in full force and effect.
                </p>
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-purple-400 mb-2">Waiver</h3>
                <p>
                  Our failure to enforce any right or provision of these Terms will not 
                  be considered a waiver of those rights.
                </p>
              </div>
            </div>
          </div>
        </m.div>
      </div>

      {/* Updates Section */}
      <div className="container mx-auto px-4 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="rounded-2xl bg-gray-900/50 border border-gray-800 p-8">
            <h2 className="text-2xl font-bold text-foreground mb-4">
              Changes to Terms
            </h2>
            <p className="text-muted-foreground mb-4">
              We may update these Terms from time to time. When we make significant changes:
            </p>
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <Icon name="bell" className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">We'll notify you via email and in-app notification</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="calendar" className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Changes take effect 30 days after notification</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="x-circle" className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">You can cancel if you disagree with changes</span>
              </li>
            </ul>
          </div>
        </m.div>
      </div>

      {/* Contact Section */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="rounded-2xl bg-card border border-border p-8 text-center">
            <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
              Questions About Our Terms?
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              We're here to help clarify anything about our terms of service.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:legal@sheenapps.com"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
              >
                <Icon name="mail" className="w-5 h-5 mr-2" />
                Email Legal Team
              </a>
              <Link
                href={ROUTES.HELP}
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
              >
                <Icon name="help-circle" className="w-5 h-5 mr-2" />
                Visit Help Center
              </Link>
            </div>
            
            <div className="mt-8 pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                SheenApps, Inc.<br />
                Legal Department<br />
                legal@sheenapps.com
              </p>
            </div>
          </div>
        </m.div>
      </div>
    </div>
  )
}