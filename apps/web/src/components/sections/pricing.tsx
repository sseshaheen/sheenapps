"use client"

import { m } from '@/components/ui/motion-provider'
import Icon, { IconName } from '@/components/ui/icon'
import { Button } from "@/components/ui/button"
import { useState } from "react"

const plans = [
  {
    name: "Free",
    price: "$0",
    period: "/forever",
    description: "Try before you buy",
    icon: 'sparkles',
    color: "from-gray-600 to-gray-700",
    features: [
      "60-second business builder",
      "1 advisor hour/month",
      "2 feature additions",
      "Community support",
      "Basic analytics",
      "sheenapps.com subdomain"
    ],
    limitations: [
      "Custom domain",
      "Priority support",
      "Advanced features"
    ],
    cta: "Start Free",
    popular: false
  },
  {
    name: "Starter",
    price: "$9",
    period: "/month",
    description: "Perfect for testing ideas",
    icon: 'zap' as IconName,
    color: "from-blue-600 to-cyan-600",
    features: [
      "Everything in Free",
      "3 advisor hours/month",
      "5 feature additions",
      "Email support",
      "SSL certificate",
      "Basic templates"
    ],
    limitations: [
      "Custom domain (+$5/mo)",
      "Priority support"
    ],
    cta: "Start Building",
    popular: false
  },
  {
    name: "Growth",
    price: "$29",
    period: "/month",
    description: "For serious entrepreneurs",
    icon: 'users' as IconName,
    color: "from-purple-600 to-pink-600",
    features: [
      "Everything in Starter",
      "10 advisor hours/month",
      "50 features/month",
      "Priority support",
      "Custom domain included",
      "Advanced analytics",
      "A/B testing",
      "API access"
    ],
    limitations: [],
    cta: "Go Pro",
    popular: true,
    savings: "Save $120/year"
  },
  {
    name: "Scale",
    price: "$59",
    period: "/month",
    description: "Your dedicated tech team",
    icon: 'crown' as IconName,
    color: "from-yellow-600 to-orange-600",
    features: [
      "Everything in Growth",
      "Dedicated advisor",
      "Unlimited features",
      "Same-day deployment",
      "White-glove onboarding",
      "Custom integrations",
      "SLA guarantee",
      "Weekly strategy calls"
    ],
    limitations: [],
    cta: "Scale Now",
    popular: false
  }
]

export function Pricing() {
  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">("monthly")

  return (
    <section id="pricing" className="py-16 sm:py-20 md:py-24 bg-gradient-to-b from-black to-gray-900 relative overflow-hidden">
      {/* Background Elements */}
      <div className="absolute inset-0">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 sm:w-96 sm:h-96 bg-pink-600/20 rounded-full blur-3xl" />
      </div>

      <div className="container mx-auto px-4 sm:px-6 relative z-10">
        {/* Section Header */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-yellow-500/10 border border-yellow-500/20 mb-4 sm:mb-6">
            <Icon name="users" className="w-4 h-4 text-yellow-400"  />
            <span className="text-xs sm:text-sm text-yellow-300">Real humans included in every plan</span>
          </div>
          
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-6xl font-bold text-white mb-4 sm:mb-6 leading-tight">
            Your Tech Team for Less Than
            <br />
            <span className="bg-gradient-to-r from-yellow-400 to-orange-400 bg-clip-text text-transparent">
              A Gym Membership
            </span>
          </h2>
          
          <p className="text-sm sm:text-base md:text-lg lg:text-xl text-gray-300 max-w-3xl mx-auto mb-6 sm:mb-8 leading-relaxed px-2">
            Traditional agencies charge $10k+ and take months. Freelancers disappear. 
            <br className="hidden sm:block" />
            <span className="sm:hidden"> </span>We give you a permanent tech team that actually cares about your success.
          </p>

          {/* Billing Toggle */}
          <div className="flex items-center justify-center gap-4">
            <span className={`text-sm ${billingCycle === 'monthly' ? 'text-white' : 'text-gray-400'}`}>
              Monthly
            </span>
            <button
              onClick={() => setBillingCycle(billingCycle === 'monthly' ? 'yearly' : 'monthly')}
              className="relative w-14 h-7 bg-gray-700 rounded-full transition-colors"
            >
              <m.div
                animate={{ x: billingCycle === 'monthly' ? 2 : 26 }}
                transition={{ type: "spring", stiffness: 300, damping: 30 }}
                className="absolute top-1 w-5 h-5 bg-white rounded-full"
              />
            </button>
            <span className={`text-sm ${billingCycle === 'yearly' ? 'text-white' : 'text-gray-400'}`}>
              Yearly
              <span className="text-green-400 ml-1">(Save 20%)</span>
            </span>
          </div>
        </m.div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
          {plans.map((plan, index) => (
            <m.div
              key={plan.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8, delay: index * 0.1 }}
              className={`relative ${plan.popular ? 'md:-mt-4' : ''}`}
            >
              {/* Popular Badge */}
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 z-20">
                  <div className="bg-gradient-to-r from-purple-600 to-pink-600 text-white text-sm font-semibold px-4 py-1 rounded-full shadow-lg">
                    MOST POPULAR
                  </div>
                </div>
              )}

              <div className={`h-full bg-gray-800/50 backdrop-blur-sm rounded-3xl p-8 border ${
                plan.popular ? 'border-purple-500/50 shadow-2xl shadow-purple-500/20' : 'border-white/10'
              } hover:border-white/20 transition-all`}>
                {/* Plan Icon */}
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${plan.color} flex items-center justify-center mb-6`}>
                  <Icon name={plan.icon as IconName} className="w-6 h-6 text-white" />
                </div>

                {/* Plan Name & Price */}
                <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="flex items-baseline mb-2">
                  <span className="text-5xl font-bold text-white">
                    {plan.price === "$0" 
                      ? "$0"
                      : billingCycle === 'yearly' 
                        ? `$${Math.floor(parseInt(plan.price.slice(1)) * 0.8)}`
                        : plan.price
                    }
                  </span>
                  <span className="text-gray-400 ml-2">{plan.period}</span>
                </div>
                {plan.savings && billingCycle === 'yearly' && (
                  <p className="text-green-400 text-sm mb-4">{plan.savings}</p>
                )}
                <p className="text-gray-400 mb-6">{plan.description}</p>

                {/* CTA Button */}
                <Button
                  size="lg"
                  className={`w-full mb-6 ${
                    plan.popular
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white'
                      : 'bg-white/10 hover:bg-white/20 text-white'
                  }`}
                >
                  {plan.cta}
                </Button>

                {/* Features */}
                <div className="space-y-3">
                  {plan.features.map((feature) => (
                    <div key={feature} className="flex items-start gap-3">
                      <Icon name="check" className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0"  />
                      <span className="text-sm text-gray-300">{feature}</span>
                    </div>
                  ))}
                  {plan.limitations.map((limitation) => (
                    <div key={limitation} className="flex items-start gap-3 opacity-50">
                      <Icon name="check" className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0"  />
                      <span className="text-sm text-gray-500 line-through">{limitation}</span>
                    </div>
                  ))}
                </div>
              </div>
            </m.div>
          ))}
        </div>

        {/* Enterprise CTA */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-16 text-center"
        >
          <p className="text-gray-400 mb-4">
            Need more? Building multiple businesses? Have specific requirements?
          </p>
          <Button variant="outline" size="lg" className="border-white/20 text-white hover:bg-white/10">
            Contact for Enterprise Pricing
          </Button>
        </m.div>

        {/* Trust Statement */}
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="mt-16 bg-gradient-to-r from-purple-900/20 to-pink-900/20 rounded-3xl p-8 border border-purple-500/20 max-w-4xl mx-auto"
        >
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div>
              <div className="text-3xl font-bold text-white mb-2">30-day</div>
              <p className="text-sm text-gray-400">Money-back guarantee</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">Cancel</div>
              <p className="text-sm text-gray-400">Anytime, no questions</p>
            </div>
            <div>
              <div className="text-3xl font-bold text-white mb-2">Export</div>
              <p className="text-sm text-gray-400">Your code & data always</p>
            </div>
          </div>
        </m.div>
      </div>
    </section>
  )
}