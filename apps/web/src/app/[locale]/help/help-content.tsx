'use client'

import { m } from '@/components/ui/motion-provider'
import Icon, { type IconName } from '@/components/ui/icon'
import { Link } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'

const categories = [
  {
    icon: 'rocket' as IconName,
    title: 'Getting Started',
    description: 'Learn the basics of building with SheenApps',
    articles: [
      'Creating your first app',
      'Understanding the AI builder',
      'Working with templates',
      'Deploying your application'
    ],
    color: 'from-purple-600 to-pink-600'
  },
  {
    icon: 'code' as IconName,
    title: 'Building Apps',
    description: 'Deep dive into app development features',
    articles: [
      'Using the visual editor',
      'Adding custom code',
      'Integrating APIs',
      'Managing databases'
    ],
    color: 'from-blue-600 to-cyan-600'
  },
  {
    icon: 'credit-card' as IconName,
    title: 'Billing & Subscription',
    description: 'Manage your account and payments',
    articles: [
      'Understanding pricing plans',
      'Upgrading your subscription',
      'Managing payment methods',
      'Viewing invoices'
    ],
    color: 'from-green-600 to-emerald-600'
  },
  {
    icon: 'users' as IconName,
    title: 'Working with Advisors',
    description: 'Get the most from human expertise',
    articles: [
      'Booking consultations',
      'Preparing for sessions',
      'Advisor specializations',
      'Best practices'
    ],
    color: 'from-orange-600 to-red-600'
  },
  {
    icon: 'shield' as IconName,
    title: 'Security & Privacy',
    description: 'Keep your data and apps secure',
    articles: [
      'Security best practices',
      'Data encryption',
      'Access controls',
      'GDPR compliance'
    ],
    color: 'from-indigo-600 to-purple-600'
  },
  {
    icon: 'wrench' as IconName,
    title: 'Troubleshooting',
    description: 'Solutions to common issues',
    articles: [
      'Deployment failures',
      'Build errors',
      'Performance issues',
      'Browser compatibility'
    ],
    color: 'from-red-600 to-pink-600'
  }
]

const popularArticles = [
  { title: 'How to create your first app in 5 minutes', icon: 'clock' as IconName, views: '12.5k' },
  { title: 'Understanding AI prompts for better results', icon: 'cpu' as IconName, views: '8.3k' },
  { title: 'Connecting your custom domain', icon: 'globe' as IconName, views: '7.1k' },
  { title: 'Managing team members and permissions', icon: 'users' as IconName, views: '5.9k' },
  { title: 'Integrating payment processing with Stripe', icon: 'credit-card' as IconName, views: '5.2k' }
]

const faqs = [
  {
    question: 'Do I need coding experience to use SheenApps?',
    answer: 'No! SheenApps is designed for everyone. Our AI handles the technical complexity while you focus on your ideas.'
  },
  {
    question: 'Can I export my code?',
    answer: 'Yes, you own all the code generated. You can export and deploy it anywhere you like.'
  },
  {
    question: 'What happens if I cancel my subscription?',
    answer: 'Your apps remain deployed. You can export your code but won\'t be able to make new changes through our platform.'
  },
  {
    question: 'How quickly can I get help from an advisor?',
    answer: 'Most advisors are available within 24 hours. Premium plans include priority access for immediate assistance.'
  }
]

export function HelpContent() {
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
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8">
            <Icon name="help-circle" className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Help Center</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-6">
            How can we
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"> help you?</span>
          </h1>
          
          <p className="text-xl text-muted-foreground mb-8">
            Find answers, browse tutorials, and get support for building amazing apps.
          </p>
          
          {/* Search Bar */}
          <div className="relative max-w-2xl mx-auto">
            <Icon name="search" className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search for articles, tutorials, or topics..."
              className="w-full pl-12 pr-4 py-4 rounded-xl bg-card border border-border text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
            />
          </div>
        </m.div>
      </div>

      {/* Coming Soon Notice */}
      <div className="container mx-auto px-4 pb-12">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="rounded-2xl bg-gradient-to-r from-yellow-600/20 to-orange-600/20 border border-yellow-600/30 p-6 flex items-start gap-4">
            <Icon name="info" className="w-6 h-6 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-foreground mb-2">Documentation Coming Soon</h3>
              <p className="text-muted-foreground mb-3">
                We're building comprehensive documentation with Mintlify. In the meantime, 
                explore our quick guides below or talk to an advisor for immediate help.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={ROUTES.ADVISOR_BROWSE}
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-300 font-medium transition-colors text-sm"
                >
                  <Icon name="message-circle" className="w-4 h-4 mr-2" />
                  Talk to Advisor
                </Link>
                <a
                  href="mailto:support@sheenapps.com"
                  className="inline-flex items-center px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors text-sm"
                >
                  <Icon name="mail" className="w-4 h-4 mr-2" />
                  Email Support
                </a>
              </div>
            </div>
          </div>
        </m.div>
      </div>

      {/* Popular Articles */}
      <div className="container mx-auto px-4 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">Popular Articles</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {popularArticles.map((article, index) => (
              <m.div
                key={article.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group rounded-xl bg-card border border-border p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <Icon name={article.icon} className="w-5 h-5 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-foreground font-medium mb-2 group-hover:text-primary transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">{article.views} views</p>
                  </div>
                </div>
              </m.div>
            ))}
          </div>
        </m.div>
      </div>

      {/* Categories Grid */}
      <div className="container mx-auto px-4 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8">Browse by Category</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category, index) => (
              <m.div
                key={category.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="group rounded-2xl bg-card border border-border p-6 hover:border-primary/50 transition-all duration-300 cursor-pointer"
              >
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${category.color} p-2.5 mb-4`}>
                  <Icon name={category.icon} className="w-full h-full text-foreground" />
                </div>
                
                <h3 className="text-xl font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {category.title}
                </h3>
                <p className="text-muted-foreground text-sm mb-4">{category.description}</p>
                
                <ul className="space-y-2">
                  {category.articles.slice(0, 3).map((article) => (
                    <li key={article} className="flex items-center gap-2">
                      <Icon name="chevron-right" className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{article}</span>
                    </li>
                  ))}
                </ul>
                
                <button className="mt-4 text-sm text-purple-400 hover:text-purple-300 transition-colors">
                  View all articles →
                </button>
              </m.div>
            ))}
          </div>
        </m.div>
      </div>

      {/* FAQs */}
      <div className="container mx-auto px-4 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-foreground mb-8 text-center">
            Frequently Asked Questions
          </h2>
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <m.div
                key={faq.question}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="rounded-xl bg-card border border-border p-6"
              >
                <h3 className="text-lg font-semibold text-foreground mb-2 flex items-start gap-2">
                  <Icon name="help-circle" className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                  {faq.question}
                </h3>
                <p className="text-muted-foreground ml-7">{faq.answer}</p>
              </m.div>
            ))}
          </div>
        </m.div>
      </div>

      {/* Contact Support */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl bg-gradient-to-r from-purple-600/20 to-pink-600/20 border border-purple-600/30 p-12 text-center"
        >
          <Icon name="headphones" className="w-16 h-16 text-purple-400 mx-auto mb-6" />
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Still need help?
          </h2>
          <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
            Our support team and expert advisors are here to help you succeed. 
            Get personalized assistance with your projects.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={ROUTES.ADVISOR_BROWSE}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors"
            >
              <Icon name="message-circle" className="w-5 h-5 mr-2" />
              Talk to an Advisor
            </Link>
            <a
              href="mailto:support@sheenapps.com"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-secondary hover:bg-secondary/80 text-secondary-foreground font-medium transition-colors"
            >
              <Icon name="mail" className="w-5 h-5 mr-2" />
              Email Support
            </a>
          </div>
          
          <div className="mt-8 pt-8 border-t border-white/10">
            <p className="text-sm text-muted-foreground">
              Average response time: Under 2 hours during business hours
            </p>
          </div>
        </m.div>
      </div>
    </div>
  )
}