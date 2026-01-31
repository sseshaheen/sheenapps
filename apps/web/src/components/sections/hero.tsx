"use client"

import { Button } from "@/components/ui/button"
import { m } from "@/components/ui/motion-provider"
import Icon from '@/components/ui/icon'
import { useRouter } from "@/i18n/routing"

interface HeroProps {
  locale?: string
}

export function Hero({ locale }: HeroProps = {}) {
  const router = useRouter()
  return (
    <section className="relative pt-32 pb-20 px-4">
      <div className="container mx-auto max-w-6xl">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-6 text-sm border rounded-full bg-muted/50">
            <Icon name="sparkles" className="h-4 w-4 text-primary"  />
            <span>Your Tech Team. AI + Humans</span>
          </div>

          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
            Build Your Business in 5 minutes
          </h1>

          <p className="text-xl md:text-2xl text-muted-foreground mb-8 max-w-3xl mx-auto">
            Add features in minutes. Real humans on standby.
            We&apos;re not just a builder, we&apos;re your permanent tech department.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button 
              size="lg" 
              className="group"
              onClick={() => router.push('/builder/new')}
            >
              Start Building Now
              <Icon name="arrow-right" className="ml-2 h-4 w-4 transition-colors group-hover:text-primary/70"  />
            </Button>
            <Button size="lg" variant="outline">
              Watch Demo
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-center"
            >
              <div className="text-3xl font-bold text-primary mb-2">5 mins</div>
              <p className="text-sm text-muted-foreground">From idea to live</p>
            </m.div>

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-center"
            >
              <div className="text-3xl font-bold text-primary mb-2">24/7</div>
              <p className="text-sm text-muted-foreground">Human + AI support</p>
            </m.div>

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="text-center"
            >
              <div className="text-3xl font-bold text-primary mb-2">$9/mo</div>
              <p className="text-sm text-muted-foreground">Starting price</p>
            </m.div>
          </div>
        </m.div>
      </div>
    </section>
  )
}
