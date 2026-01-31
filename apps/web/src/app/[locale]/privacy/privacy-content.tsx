'use client'

import { m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'

const sections = [
  {
    title: 'Information We Collect',
    content: [
      {
        subtitle: 'Information You Provide',
        items: [
          'Account information (name, email, password)',
          'Profile information (company name, role, preferences)',
          'Payment information (processed securely through Stripe)',
          'Content you create (projects, designs, configurations)',
          'Communications with us (support tickets, feedback)'
        ]
      },
      {
        subtitle: 'Information Collected Automatically',
        items: [
          'Usage data (features used, time spent, interactions)',
          'Device information (browser type, operating system)',
          'Log data (IP address, access times, pages viewed)',
          'Cookies and similar technologies for authentication and preferences'
        ]
      }
    ]
  },
  {
    title: 'How We Use Your Information',
    content: [
      {
        subtitle: 'To Provide Our Services',
        items: [
          'Create and manage your account',
          'Process your projects and deploy applications',
          'Provide customer support and respond to inquiries',
          'Process payments and manage subscriptions',
          'Send important service updates and notifications'
        ]
      },
      {
        subtitle: 'To Improve Our Platform',
        items: [
          'Analyze usage patterns to enhance features',
          'Develop new functionalities based on user needs',
          'Optimize performance and user experience',
          'Conduct research and analytics',
          'Prevent fraud and enhance security'
        ]
      }
    ]
  },
  {
    title: 'Data Sharing and Disclosure',
    content: [
      {
        subtitle: 'We Do Not Sell Your Data',
        items: [
          'We never sell, rent, or trade your personal information',
          'Your data is not used for advertising by third parties',
          'We only share data when necessary to provide our services'
        ]
      },
      {
        subtitle: 'Limited Sharing',
        items: [
          'Service providers who assist in operations (hosting, analytics)',
          'Payment processors for billing (Stripe)',
          'Legal requirements or to protect rights and safety',
          'With your explicit consent for specific purposes',
          'In connection with a merger or acquisition (with notice)'
        ]
      }
    ]
  },
  {
    title: 'Data Security',
    content: [
      {
        subtitle: 'Security Measures',
        items: [
          'Industry-standard encryption for data in transit and at rest',
          'Regular security audits and vulnerability assessments',
          'Access controls and authentication mechanisms',
          'Secure development practices and code reviews',
          'Incident response and data breach procedures'
        ]
      },
      {
        subtitle: 'Your Security Responsibilities',
        items: [
          'Keep your password secure and unique',
          'Enable two-factor authentication when available',
          'Report any suspicious activity immediately',
          'Keep your account information up to date'
        ]
      }
    ]
  },
  {
    title: 'Your Rights and Choices',
    content: [
      {
        subtitle: 'Your Data Rights',
        items: [
          'Access your personal information',
          'Correct inaccurate or incomplete data',
          'Request deletion of your account and data',
          'Export your data in a portable format',
          'Opt-out of non-essential communications'
        ]
      },
      {
        subtitle: 'How to Exercise Your Rights',
        items: [
          'Through your account settings',
          'By contacting support@sheenapps.com',
          'Response within 30 days of request',
          'No discrimination for exercising rights'
        ]
      }
    ]
  },
  {
    title: 'Data Retention',
    content: [
      {
        subtitle: 'Retention Periods',
        items: [
          'Active account data: As long as your account is active',
          'Deleted account data: Removed within 90 days',
          'Backups: Purged according to rotation schedule',
          'Legal obligations: As required by law',
          'Aggregated analytics: Indefinitely (anonymized)'
        ]
      }
    ]
  },
  {
    title: 'International Data Transfers',
    content: [
      {
        subtitle: 'Global Operations',
        items: [
          'Data may be processed in multiple countries',
          'Appropriate safeguards for international transfers',
          'Compliance with data protection regulations',
          'Your data rights apply regardless of location'
        ]
      }
    ]
  },
  {
    title: 'Children\'s Privacy',
    content: [
      {
        subtitle: 'Age Restrictions',
        items: [
          'Our services are not directed to children under 13',
          'We do not knowingly collect data from children',
          'Parents may contact us to remove children\'s data',
          'Age verification for certain features'
        ]
      }
    ]
  }
]

export function PrivacyContent() {
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
            <Icon name="shield" className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">Privacy Policy</span>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
            Your Privacy Matters
          </h1>
          
          <p className="text-xl text-muted-foreground mb-4">
            At SheenApps, we are committed to protecting your privacy and ensuring 
            the security of your personal information. This policy explains how we 
            collect, use, and safeguard your data.
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
              Quick Summary
            </h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">We never sell your personal data to third parties</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Your projects and code belong to you</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">We use industry-standard encryption and security measures</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">You can request data deletion at any time</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="check" className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">We comply with GDPR and CCPA regulations</span>
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
              Updates to This Policy
            </h2>
            <p className="text-muted-foreground mb-4">
              We may update this Privacy Policy from time to time to reflect changes in our 
              practices or for legal, operational, or regulatory reasons. When we make material 
              changes, we will:
            </p>
            <ul className="space-y-2">
              <li className="flex items-start gap-3">
                <Icon name="bell" className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Notify you via email or through the platform</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="calendar" className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Update the "Last updated" date at the top of this policy</span>
              </li>
              <li className="flex items-start gap-3">
                <Icon name="clock" className="w-4 h-4 text-purple-400 flex-shrink-0 mt-0.5" />
                <span className="text-muted-foreground">Provide at least 30 days notice for significant changes</span>
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
              Questions About Privacy?
            </h2>
            <p className="text-lg text-muted-foreground mb-6">
              If you have any questions about this Privacy Policy or how we handle your data, 
              we're here to help.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:privacy@sheenapps.com"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
              >
                <Icon name="mail" className="w-5 h-5 mr-2" />
                Email Privacy Team
              </a>
              <a
                href="mailto:support@sheenapps.com"
                className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
              >
                <Icon name="message-circle" className="w-5 h-5 mr-2" />
                Contact Support
              </a>
            </div>
            
            <div className="mt-8 pt-8 border-t border-border">
              <p className="text-sm text-muted-foreground">
                SheenApps, Inc.<br />
                Data Protection Officer<br />
                privacy@sheenapps.com
              </p>
            </div>
          </div>
        </m.div>
      </div>
    </div>
  )
}