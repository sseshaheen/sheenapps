"use client"

import { m } from "@/components/ui/motion-provider"
import { useState } from "react"
import Icon from '@/components/ui/icon'
import { Button } from "@/components/ui/button"

// Default advisor data - will be overridden by translations
const defaultAdvisors = [
  {
    name: "Ahmed Hassan",
    role: "Arabic Tech Lead",
    language: "العربية",
    avatar: "👨‍💻",
    specialties: ["RTL Development", "MENA Market", "Payment Gateways"],
    availability: "Available now",
    online: true,
  },
  {
    name: "Sarah Chen",
    role: "Feature Specialist",
    language: "English",
    avatar: "👩‍💻",
    specialties: ["E-commerce", "SaaS", "API Integrations"],
    availability: "Next slot: 2:00 PM",
    online: true,
  },
  {
    name: "Pierre Dubois",
    role: "Growth Advisor",
    language: "Français",
    avatar: "🧑‍💻",
    specialties: ["Scaling", "Performance", "Analytics"],
    availability: "Next slot: 3:30 PM",
    online: false,
  },
]

interface TechTeamClientProps {
  badge: string;
  title: string;
  subtitle: string;
  subtitleSecond: string;
  advisors: {
    ahmed: { name: string; role: string; language: string; specialties: string[]; availability: string; };
    sarah: { name: string; role: string; language: string; specialties: string[]; availability: string; };
    pierre: { name: string; role: string; language: string; specialties: string[]; availability: string; };
  };
  scheduleCall: string;
  includedInPlans: string;
  howItWorks: {
    title: string;
    instantChat: {
      title: string;
      description: string;
    };
    scheduledCalls: {
      title: string;
      description: string;
    };
    proactiveUpdates: {
      title: string;
      description: string;
    };
  };
  /** When true, disables interactive elements (coming soon mode) */
  comingSoonMode?: boolean;
}

export function TechTeamClient({
  badge,
  title,
  subtitle,
  subtitleSecond,
  advisors,
  scheduleCall,
  includedInPlans,
  howItWorks,
  comingSoonMode = false
}: TechTeamClientProps) {
  const [selectedAdvisor, setSelectedAdvisor] = useState<number | null>(null)
  
  // Create advisor array from translations
  const advisorList = [
    {
      ...defaultAdvisors[0],
      name: advisors.ahmed.name,
      role: advisors.ahmed.role,
      language: advisors.ahmed.language,
      specialties: advisors.ahmed.specialties,
      availability: advisors.ahmed.availability,
    },
    {
      ...defaultAdvisors[1],
      name: advisors.sarah.name,
      role: advisors.sarah.role,
      language: advisors.sarah.language,
      specialties: advisors.sarah.specialties,
      availability: advisors.sarah.availability,
    },
    {
      ...defaultAdvisors[2],
      name: advisors.pierre.name,
      role: advisors.pierre.role,
      language: advisors.pierre.language,
      specialties: advisors.pierre.specialties,
      availability: advisors.pierre.availability,
    },
  ]

  return (
    <section id="team" className="py-16 sm:py-20 md:py-24 bg-gradient-to-b from-gray-900 to-black relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:16px_16px] md:bg-[size:24px_24px]" />
      
      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Section Header */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 mb-4 sm:mb-6">
            <Icon name="headphones" className="w-4 h-4 text-purple-400"  />
            <span className="text-xs sm:text-sm text-purple-300">{badge}</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            {title}
          </h2>
          <p className="text-base sm:text-lg md:text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed px-2">
            {subtitle}
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>{subtitleSecond}
          </p>
        </m.div>

        {/* Advisors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-12 sm:mb-16">
          {advisorList.map((advisor, index) => (
            <m.div
              key={advisor.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              onClick={comingSoonMode ? undefined : () => setSelectedAdvisor(index)}
              className={`relative ${comingSoonMode ? '' : 'cursor-pointer'} group ${
                selectedAdvisor === index && !comingSoonMode ? 'ring-2 ring-purple-500' : ''
              }`}
            >
              <div className="bg-gray-800/50 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8 border border-white/10 hover:border-purple-500/50 transition-all">
                {/* Online Status */}
                <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
                  <div className={`w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full ${advisor.online ? 'bg-green-400' : 'bg-gray-400'} animate-pulse`} />
                </div>

                {/* Avatar */}
                <div className="text-4xl sm:text-5xl md:text-6xl mb-3 sm:mb-4">{advisor.avatar}</div>

                {/* Info */}
                <h3 className="text-lg sm:text-xl font-semibold text-white mb-1">{advisor.name}</h3>
                <p className="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">{advisor.role}</p>
                <p className="text-xs sm:text-sm text-purple-400 mb-3 sm:mb-4">{advisor.language}</p>

                {/* Specialties */}
                <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3 sm:mb-4">
                  {advisor.specialties.map((specialty) => (
                    <span
                      key={specialty}
                      className="text-xs px-2 py-1 rounded-full bg-white/5 text-gray-300"
                    >
                      {specialty}
                    </span>
                  ))}
                </div>

                {/* Availability */}
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-sm text-gray-400 truncate pr-2">{advisor.availability}</span>
                  {!comingSoonMode && (
                    <Button size="sm" variant="ghost" className="text-purple-400 hover:text-purple-300 p-1 sm:p-2">
                      <Icon name="message-circle" className="w-3 h-3 sm:w-4 sm:h-4"  />
                    </Button>
                  )}
                </div>

                {/* Hover Effect */}
                <m.div
                  className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-pink-600/20 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
                />
              </div>
            </m.div>
          ))}
        </div>

        {/* How It Works */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-3xl p-8 md:p-12 border border-purple-500/20"
        >
          <h3 className="text-2xl font-bold text-white mb-8 text-center">
            {howItWorks.title}
          </h3>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center mx-auto mb-4">
                <Icon name="message-circle" className="w-8 h-8 text-purple-400"  />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">{howItWorks.instantChat.title}</h4>
              <p className="text-sm text-gray-400">
                {howItWorks.instantChat.description}
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-pink-500/20 flex items-center justify-center mx-auto mb-4">
                <Icon name="calendar" className="w-8 h-8 text-pink-400"  />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">{howItWorks.scheduledCalls.title}</h4>
              <p className="text-sm text-gray-400">
                {howItWorks.scheduledCalls.description}
              </p>
            </div>

            <div className="text-center">
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <Icon name="zap" className="w-8 h-8 text-blue-400"  />
              </div>
              <h4 className="text-lg font-semibold text-white mb-2">{howItWorks.proactiveUpdates.title}</h4>
              <p className="text-sm text-gray-400">
                {howItWorks.proactiveUpdates.description}
              </p>
            </div>
          </div>

          {!comingSoonMode && (
            <div className="mt-12 text-center">
              <button className="inline-flex items-center justify-center gap-2 rounded-md h-10 px-8 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-medium transition-colors duration-200">
                {scheduleCall}
                <Icon name="calendar" className="ml-2 w-5 h-5"  />
              </button>
              <p className="text-sm text-gray-400 mt-4">
                {includedInPlans}
              </p>
            </div>
          )}
        </m.div>
      </div>
    </section>
  )
}