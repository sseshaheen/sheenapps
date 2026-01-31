'use client'

import { m } from '@/components/ui/motion-provider'
import { Link } from '@/i18n/routing'

interface WhySheenAppsProps {
  locale: string
  translations: any
}

export function WhySheenApps({ locale, translations }: WhySheenAppsProps) {
  const isRTL = ['ar', 'ar-sa', 'ar-eg', 'ar-ae'].includes(locale)

  const perks = [
    {
      icon: '🏠',
      title: translations.perks?.remote_first || 'Remote First',
      description: translations.perks?.remote_first_desc || 'Work from anywhere in the world. We trust our team to deliver great results.',
      gradient: 'from-blue-500 to-cyan-500'
    },
    {
      icon: '🚀',
      title: translations.perks?.cutting_edge || 'Cutting-Edge Tech',
      description: translations.perks?.cutting_edge_desc || 'Work with the latest AI tools and technologies. Push the boundaries of what\'s possible.',
      gradient: 'from-purple-500 to-pink-500'
    },
    {
      icon: '⚡',
      title: translations.perks?.rapid_growth || 'Rapid Growth',
      description: translations.perks?.rapid_growth_desc || 'Join a fast-growing startup. Your work directly impacts millions of users.',
      gradient: 'from-orange-500 to-red-500'
    },
    {
      icon: '💰',
      title: translations.perks?.competitive_pay || 'Competitive Package',
      description: translations.perks?.competitive_pay_desc || 'Attractive salary, equity, health benefits, and flexible time off.',
      gradient: 'from-green-500 to-emerald-500'
    },
    {
      icon: '🧠',
      title: translations.perks?.learning || 'Learning & Growth',
      description: translations.perks?.learning_desc || 'Conference budget, courses, mentorship. We invest in your professional development.',
      gradient: 'from-indigo-500 to-purple-500'
    },
    {
      icon: '🎯',
      title: translations.perks?.impact || 'Meaningful Impact',
      description: translations.perks?.impact_desc || 'Build tools that democratize app development for creators worldwide.',
      gradient: 'from-teal-500 to-blue-500'
    }
  ]

  const values = [
    {
      title: translations.values?.innovation || 'Innovation First',
      description: translations.values?.innovation_desc || 'We constantly push boundaries and challenge the status quo.',
      icon: '💡'
    },
    {
      title: translations.values?.transparency || 'Radical Transparency',
      description: translations.values?.transparency_desc || 'Open communication, honest feedback, and shared decision-making.',
      icon: '👁️'
    },
    {
      title: translations.values?.ownership || 'Ownership Mindset',
      description: translations.values?.ownership_desc || 'Take initiative, own outcomes, and drive results.',
      icon: '🎯'
    },
    {
      title: translations.values?.diversity || 'Diversity & Inclusion',
      description: translations.values?.diversity_desc || 'Different perspectives make us stronger and more creative.',
      icon: '🌍'
    }
  ]

  return (
    <section className="bg-gradient-to-b from-background to-muted/20">
      {/* Why SheenApps Section */}
      <div className="container mx-auto px-4 py-20">
        <m.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            {translations.why_sheenapps || "Why SheenApps?"}
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {translations.why_subtitle || 
              "Join a team that's reshaping how the world builds software. Here's what makes working with us special."}
          </p>
        </m.div>

        {/* Perks Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-20">
          {perks.map((perk, index) => (
            <m.div
              key={perk.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="group"
            >
              <div className="relative overflow-hidden rounded-2xl bg-card border border-border p-6 h-full hover:shadow-lg transition-all duration-300 hover:-translate-y-1">
                {/* Gradient background */}
                <div className={`absolute inset-0 bg-gradient-to-br ${perk.gradient} opacity-5 group-hover:opacity-10 transition-opacity duration-300`} />
                
                <div className="relative">
                  {/* Icon */}
                  <div className="text-3xl mb-4">{perk.icon}</div>
                  
                  {/* Content */}
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {perk.title}
                  </h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {perk.description}
                  </p>
                </div>
              </div>
            </m.div>
          ))}
        </div>

        {/* Company Values */}
        <m.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h3 className="text-2xl md:text-3xl font-bold text-foreground mb-4">
            {translations.our_values || "Our Values"}
          </h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {translations.values_subtitle || 
              "These principles guide everything we do, from product development to how we treat each other."}
          </p>
        </m.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {values.map((value, index) => (
            <m.div
              key={value.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.1 }}
              className="text-center p-6 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <div className="text-2xl mb-3">{value.icon}</div>
              <h4 className="text-lg font-semibold text-foreground mb-2">
                {value.title}
              </h4>
              <p className="text-sm text-muted-foreground">
                {value.description}
              </p>
            </m.div>
          ))}
        </div>

        {/* Team Stats */}
        <m.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/20 rounded-2xl p-8 text-center"
        >
          <h3 className="text-2xl font-bold text-foreground mb-6">
            {translations.join_team || "Ready to Join Our Team?"}
          </h3>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            {translations.join_team_desc || 
              "We're always looking for exceptional talent. Even if we don't have an open position that matches your skills, we'd love to hear from you."}
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/careers#positions"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:opacity-90 transition-opacity font-medium"
            >
              {translations.view_positions || "View Open Positions"}
            </Link>
            <Link
              href="mailto:careers@sheenapps.com"
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg border border-border bg-background hover:bg-muted transition-colors font-medium"
            >
              {translations.send_resume || "Send Your Resume"}
            </Link>
          </div>

          {/* Contact Info */}
          <div className="mt-8 pt-8 border-t border-border/50">
            <p className="text-sm text-muted-foreground">
              {translations.questions || "Have questions?"} {' '}
              <Link
                href="mailto:careers@sheenapps.com"
                className="text-primary hover:underline"
              >
                careers@sheenapps.com
              </Link>
            </p>
          </div>
        </m.div>
      </div>
    </section>
  )
}