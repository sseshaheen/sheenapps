'use client'

import { m } from '@/components/ui/motion-provider'
import Icon from '@/components/ui/icon'
import Image from 'next/image'
import { Link } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'

const integrations = [
  // ✅ ACTIVE INTEGRATIONS (Connected)
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Open source Firebase alternative. Instant APIs, authentication, real-time subscriptions, and storage.',
    logo: 'https://avatars.githubusercontent.com/u/54469796?s=200&v=4',
    category: 'Backend & Database',
    features: [
      'PostgreSQL Database',
      'Authentication & Authorization',
      'Real-time Subscriptions',
      'Storage & CDN',
      'Edge Functions',
      'Vector Embeddings'
    ],
    status: 'active',
    comingSoon: false
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Version control and collaboration platform. Manage your code, track issues, and deploy with confidence.',
    logo: 'https://github.githubassets.com/images/modules/logos_page/GitHub-Mark.png',
    category: 'Version Control',
    features: [
      'Repository Management',
      'Pull Requests & Code Review',
      'Actions & CI/CD',
      'Issues & Project Management',
      'Packages & Releases',
      'Security & Dependabot'
    ],
    status: 'active',
    comingSoon: false
  },
  {
    id: 'vercel',
    name: 'Vercel',
    description: 'Deploy your frontend instantly. Optimized for Next.js with automatic deployments and global edge network.',
    logo: 'https://assets.vercel.com/image/upload/front/favicon/vercel/180x180.png',
    category: 'Hosting & Deployment',
    features: [
      'Instant Deployments',
      'Auto-Deploy from Git',
      'Preview Deployments',
      'Custom Domains & SSL',
      'Build Optimization',
      'Team Collaboration'
    ],
    status: 'active',
    comingSoon: false
  },
  {
    id: 'sanity',
    name: 'Sanity',
    description: 'Structured content platform. Build, manage, and deliver content with a powerful API-first CMS.',
    logo: 'https://avatars.githubusercontent.com/u/17177659?s=200&v=4',
    category: 'Content Management',
    features: [
      'Structured Content',
      'Real-time Collaboration',
      'Visual Editing',
      'API-first Architecture',
      'Custom Schemas',
      'Asset Management'
    ],
    status: 'active',
    comingSoon: false
  },
  
  // 🔄 COMING SOON INTEGRATIONS
  {
    id: 'stripe',
    name: 'Stripe',
    description: 'Complete payment infrastructure. Accept payments, manage subscriptions, and scale your business globally.',
    logo: 'https://avatars.githubusercontent.com/u/856813?s=200&v=4',
    category: 'Payments',
    features: [
      'Payment Processing',
      'Subscription Management',
      'Invoicing',
      'Global Payments',
      'Fraud Prevention',
      'Financial Reporting'
    ],
    status: 'coming-soon',
    comingSoon: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    description: 'Advanced AI models for natural language, code generation, and more. Power your apps with cutting-edge AI.',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ChatGPT_logo.svg/512px-ChatGPT_logo.svg.png',
    category: 'AI & Machine Learning',
    features: [
      'GPT-4 Integration',
      'Code Generation',
      'Natural Language Processing',
      'Image Generation',
      'Embeddings & Search',
      'Fine-tuning'
    ],
    status: 'coming-soon',
    comingSoon: true
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Team communication hub. Get notifications, collaborate, and stay updated on your projects.',
    logo: 'https://a.slack-edge.com/80588/marketing/img/icons/icon_slack_hash_colored.png',
    category: 'Communication',
    features: [
      'Real-time Notifications',
      'Team Channels',
      'Direct Messaging',
      'File Sharing',
      'App Workflows',
      'Webhooks'
    ],
    status: 'coming-soon',
    comingSoon: true
  }
]

export function IntegrationsContent() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-24 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/20 border border-purple-600/30 mb-8">
            <Icon name="plug" className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Seamless Integrations</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Connect with the tools
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"> you love</span>
          </h1>
          
          <p className="text-xl text-gray-300 mb-12">
            SheenApps seamlessly integrates with your favorite platforms, 
            enabling you to build faster and ship with confidence.
          </p>
        </m.div>
      </div>

      {/* Integrations Grid */}
      <div className="container mx-auto px-4 pb-24">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {integrations.map((integration, index) => (
            <m.div
              key={integration.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className={`group relative rounded-2xl border ${
                integration.comingSoon 
                  ? 'bg-gray-900/50 border-gray-800' 
                  : 'bg-gradient-to-br from-purple-900/20 to-pink-900/20 border-purple-800/30'
              } p-6 hover:border-purple-600/50 transition-all duration-300`}
            >
              {integration.comingSoon && (
                <div className="absolute top-4 right-4">
                  <span className="px-3 py-1 rounded-full bg-yellow-500/20 border border-yellow-500/30 text-yellow-400 text-xs font-medium">
                    Coming Soon
                  </span>
                </div>
              )}
              
              <div className="flex items-start gap-4 mb-4">
                <div className="w-16 h-16 rounded-xl bg-white/10 p-3 flex items-center justify-center">
                  <img 
                    src={integration.logo} 
                    alt={`${integration.name} logo`}
                    className="w-full h-full object-contain"
                  />
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold text-white mb-1">{integration.name}</h3>
                  <p className="text-sm text-purple-400">{integration.category}</p>
                </div>
              </div>
              
              <p className="text-gray-300 mb-4 text-sm leading-relaxed">
                {integration.description}
              </p>
              
              <div className="space-y-2 mb-6">
                {integration.features.map((feature) => (
                  <div key={feature} className="flex items-center gap-2">
                    <Icon name="check" className="w-4 h-4 text-green-400 flex-shrink-0" />
                    <span className="text-sm text-gray-400">{feature}</span>
                  </div>
                ))}
              </div>
              
              {integration.comingSoon ? (
                <button 
                  disabled
                  className="px-4 py-2 rounded-lg bg-gray-800 text-gray-500 text-sm font-medium cursor-not-allowed w-full"
                >
                  <Icon name="clock" className="w-4 h-4 inline mr-2" />
                  Coming Soon
                </button>
              ) : (
                <button className="px-4 py-2 rounded-lg bg-purple-600/20 border border-purple-600/30 text-purple-300 hover:bg-purple-600/30 transition-colors text-sm font-medium w-full">
                  <Icon name="plug" className="w-4 h-4 inline mr-2" />
                  Connected
                </button>
              )}
            </m.div>
          ))}
        </div>
      </div>

      {/* CTA Section */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-600/30 p-12 text-center"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Need a specific integration?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            We're constantly adding new integrations. Let us know what tools you need 
            and we'll prioritize them in our roadmap.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={ROUTES.ADVISOR_BROWSE}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
            >
              <Icon name="message-circle" className="w-5 h-5 mr-2" />
              Talk to an Advisor
            </Link>
            <a
              href="mailto:support@sheenapps.com?subject=Integration%20Request"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              <Icon name="mail" className="w-5 h-5 mr-2" />
              Request Integration
            </a>
          </div>
        </m.div>
      </div>
    </div>
  )
}