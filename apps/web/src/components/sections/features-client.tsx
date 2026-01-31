"use client"

import { m } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'

const featureIcons: IconName[] = ['zap', 'users', 'code', 'globe', 'shield', 'rocket']

interface FeaturesClientProps {
  title: string;
  subtitle: string;
  list: Array<{
    title: string;
    description: string;
  }>;
}

export function FeaturesClient({
  title,
  subtitle,
  list
}: FeaturesClientProps) {
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
            {title}
          </h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            {subtitle}
          </p>
        </m.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {list.map((feature, index) => {
            const iconName = featureIcons[index] || 'zap'
            return (
              <m.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-lg border border-white/10 hover:border-white/20 hover:shadow-lg transition-all"
              >
                <Icon name={iconName} className="h-10 w-10 text-purple-400 mb-4" />
                <h3 className="text-xl font-semibold mb-2 text-white">{feature.title}</h3>
                <p className="text-gray-300">{feature.description}</p>
              </m.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}