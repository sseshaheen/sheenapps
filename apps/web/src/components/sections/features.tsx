"use client"

import { m } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'

const features = [
  {
    icon: 'zap' as IconName,
    title: "Instant Generation",
    description: "Describe your idea, watch it build in real-time with AI + human expertise"
  },
  {
    icon: 'users' as IconName,
    title: "Your Tech Team",
    description: "Dedicated advisors who know your business and grow with you"
  },
  {
    icon: 'code' as IconName,
    title: "Full Ownership",
    description: "Export your code and data anytime. No vendor lock-in, ever"
  },
  {
    icon: 'globe' as IconName,
    title: "Multi-Language",
    description: "Arabic (Multiple dialects), French, English - we speak your language"
  },
  {
    icon: 'shield' as IconName,
    title: "Always Supported",
    description: "Real humans + AI supporting you 24/7, not just a chatbot"
  },
  {
    icon: 'rocket' as IconName,
    title: "Continuous Development",
    description: "Request features in the morning, get them live by afternoon"
  }
]

export function Features() {
  return (
    <section id="features" className="relative py-20 px-4 bg-gray-900/50">
      <div className="container mx-auto max-w-6xl">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold mb-4 text-white">
            Everything You Need to Succeed
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            We&apos;re not just another AI builder. We&apos;re your permanent tech department.
          </p>
        </m.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <m.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-white/10 hover:border-white/20 hover:shadow-lg transition-all"
            >
              <Icon name={feature.icon} className="h-10 w-10 text-purple-400 mb-4" />
              <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
              <p className="text-gray-300">{feature.description}</p>
            </m.div>
          ))}
        </div>
      </div>
    </section>
  )
}