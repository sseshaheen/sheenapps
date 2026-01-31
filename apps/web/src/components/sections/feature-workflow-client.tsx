"use client"

import { m, useScroll, useTransform } from "@/components/ui/motion-provider"
import { useRef } from "react"
import Icon, { IconName } from '@/components/ui/icon'

const workflowSteps = [
  {
    time: "9:00 AM",
    icon: 'message-square' as IconName,
    title: "You Request",
    description: "I need WhatsApp integration for my store",
    color: "from-purple-600 to-purple-700",
    output: "Request received ✓"
  },
  {
    time: "9:15 AM",
    icon: 'code' as IconName,
    title: "We Build",
    description: "Sarah starts implementing WhatsApp Business API",
    color: "from-pink-600 to-pink-700",
    output: "In progress..."
  },
  {
    time: "10:30 AM",
    icon: 'rocket' as IconName,
    title: "You Test",
    description: "Preview link ready - test on your phone",
    color: "from-blue-600 to-blue-700",
    output: "Ready to test!"
  },
  {
    time: "11:00 AM",
    icon: 'check-circle' as IconName,
    title: "It's Live!",
    description: "WhatsApp orders now flowing to your dashboard",
    color: "from-green-600 to-green-700",
    output: "Feature deployed 🎉"
  }
]

interface FeatureWorkflowClientProps {
  badge: string;
  title: string;
  titleHighlight: string;
  subtitle: string;
  steps: Array<{ title: string; description: string; time?: string; output?: string; }>;
  stats: Array<{ label: string; value: string; trend?: string; }>;
  /** When true, displays in preview/coming soon mode */
  comingSoonMode?: boolean;
}

export function FeatureWorkflowClient({
  badge,
  title,
  titleHighlight,
  subtitle,
  steps,
  stats,
  comingSoonMode = false
}: FeatureWorkflowClientProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Merge translated steps with icons and colors
  const stepsWithIcons = steps.map((step, index) => ({
    ...step,
    icon: workflowSteps[index]?.icon || 'message-square' as IconName,
    color: workflowSteps[index]?.color || "from-purple-600 to-purple-700",
  }))
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start end", "end start"]
  })

  const opacity = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0, 1, 1, 0])
  const scale = useTransform(scrollYProgress, [0, 0.2, 0.8, 1], [0.8, 1, 1, 0.8])

  return (
    <section id="how-it-works" ref={containerRef} className="py-24 bg-black relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        <div className="absolute inset-0 bg-gradient-to-b from-purple-900/10 via-transparent to-pink-900/10" />
      </div>

      <m.div style={{ opacity, scale }} className="container mx-auto px-4 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-16">
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 border border-green-500/20 mb-6"
          >
            <Icon name="rocket" className="w-4 h-4 text-green-400"  />
            <span className="text-sm text-green-300">{badge}</span>
          </m.div>
          
          <m.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-6xl font-bold text-white mb-6"
          >
            {title}
            <br />
            <span className="bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
              {titleHighlight}
            </span>
          </m.h2>
          
          <m.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-xl text-gray-300 max-w-3xl mx-auto"
          >
            {subtitle}
          </m.p>
        </div>

        {/* Workflow Timeline */}
        <div className="max-w-5xl mx-auto">
          <div className="relative">
            {/* Timeline Line */}
            <div className="absolute start-8 md:start-1/2 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-600 via-pink-600 to-green-600 ltr:md:-translate-x-1/2 rtl:md:translate-x-1/2" />

            {/* Steps */}
            {stepsWithIcons.map((step, index) => (
              <m.div
                key={step.title}
                initial={{ 
                  opacity: 0, 
                  x: index % 2 === 0 ? -50 : 50
                }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: index * 0.2 }}
                className={`relative flex items-center mb-12 ${
                  index % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'
                }`}
              >
                {/* Content */}
                <div className={`flex-1 ${
                  index % 2 === 0 ? 'md:text-right md:pr-12' : 'md:text-left md:pl-12'
                } ps-20 md:p-0`}>
                  <div className="bg-gray-900/50 backdrop-blur-sm rounded-2xl p-6 border border-white/10 hover:border-white/20 transition-all">
                    <div className="flex items-center gap-2 mb-2 text-sm text-gray-400">
                      <span className="font-mono">{step.time}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white mb-2">{step.title}</h3>
                    <p className="text-gray-300 mb-3">{step.description}</p>
                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r ${step.color} text-white text-sm`}>
                      {step.output}
                    </div>
                  </div>
                </div>

                {/* Icon */}
                <div className="absolute start-8 md:start-1/2 z-20 ltr:md:-translate-x-1/2 rtl:md:translate-x-1/2">
                  <m.div
                    whileHover={{ scale: 1.1 }}
                    className={`w-16 h-16 rounded-full bg-gradient-to-r ${step.color} flex items-center justify-center shadow-2xl`}
                  >
                    <Icon name={step.icon} className="w-8 h-8 text-white" />
                  </m.div>
                </div>

                {/* Empty space for alternating layout */}
                <div className="flex-1 hidden md:block" />
              </m.div>
            ))}
          </div>
        </div>

        {/* Stats - hidden in coming soon mode */}
        {!comingSoonMode && (
          <m.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
            className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto"
          >
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <div className="text-3xl font-bold text-white mb-1">{stat.value}</div>
                <div className="text-sm text-gray-400 mb-1">{stat.label}</div>
                <div className="text-xs text-green-400">{stat.trend}</div>
              </div>
            ))}
          </m.div>
        )}
      </m.div>
    </section>
  )
}