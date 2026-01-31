'use client'

import { m } from '@/components/ui/motion-provider'
import Icon, { type IconName } from '@/components/ui/icon'
import { Link } from '@/i18n/routing'
import { ROUTES } from '@/i18n/routes'

const stats = [
  { value: '10K+', label: 'Active Users' },
  { value: '50K+', label: 'Apps Built' },
  { value: '99.9%', label: 'Uptime' },
  { value: '24/7', label: 'Support' },
]

const values = [
  {
    icon: 'users' as IconName,
    title: 'Democratization',
    description: 'Making software development accessible to everyone, regardless of technical background or budget.'
  },
  {
    icon: 'zap' as IconName,
    title: 'Speed',
    description: 'From idea to deployed app in minutes, not months. We believe in rapid iteration and fast feedback.'
  },
  {
    icon: 'brain' as IconName,
    title: 'AI + Human',
    description: 'The perfect blend of AI efficiency and human creativity. Technology amplifies human potential.'
  },
  {
    icon: 'shield' as IconName,
    title: 'Trust',
    description: 'Your data, your code, your business. We prioritize security, privacy, and transparency.'
  }
]

const team = [
  {
    name: 'The Builders',
    role: 'AI Development Team',
    description: 'Our AI agents work 24/7 to turn your ideas into reality, learning and improving with every project.',
    icon: 'cpu' as IconName
  },
  {
    name: 'The Advisors',
    role: 'Human Expert Network',
    description: 'Real developers, designers, and strategists ready to guide you through complex challenges.',
    icon: 'users' as IconName
  },
  {
    name: 'The Innovators',
    role: 'Product Team',
    description: 'Constantly pushing boundaries to make app development faster, easier, and more powerful.',
    icon: 'lightbulb' as IconName
  }
]

export function AboutContent() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="container mx-auto px-4 pt-24 pb-16">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-4xl mx-auto"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600/20 border border-purple-600/30 mb-8">
            <Icon name="sparkles" className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">About SheenApps</span>
          </div>
          
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6">
            Your permanent tech team for the 
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400"> price of a gym membership</span>
          </h1>
          
          <p className="text-xl text-gray-300 mb-12 leading-relaxed">
            We believe everyone should be able to build software. No coding required, 
            no massive budgets, no waiting months for developers. Just describe what 
            you want, and watch it come to life.
          </p>
        </m.div>
      </div>

      {/* Stats Section */}
      <div className="container mx-auto px-4 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {stats.map((stat, index) => (
            <m.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400 mb-2">
                {stat.value}
              </div>
              <div className="text-gray-400">{stat.label}</div>
            </m.div>
          ))}
        </div>
      </div>

      {/* Mission Section */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="rounded-3xl bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-800/30 p-8 md:p-12">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">Our Mission</h2>
            <p className="text-lg text-gray-300 leading-relaxed mb-6">
              We're on a mission to democratize software development. Every business, 
              entrepreneur, and creative mind should have the power to build digital 
              products without the traditional barriers of cost, time, and technical expertise.
            </p>
            <p className="text-lg text-gray-300 leading-relaxed">
              By combining cutting-edge AI with a global network of human experts, 
              we're creating a new paradigm where ideas transform into reality at the 
              speed of thought. This isn't just about building apps—it's about empowering 
              millions to bring their visions to life.
            </p>
          </div>
        </m.div>
      </div>

      {/* Values Section */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Our Values</h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            These principles guide everything we do, from product development to customer support.
          </p>
        </m.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {values.map((value, index) => (
            <m.div
              key={value.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="rounded-2xl bg-gray-900/50 border border-gray-800 p-6 hover:border-purple-600/50 transition-all duration-300"
            >
              <div className="w-12 h-12 rounded-lg bg-purple-600/20 flex items-center justify-center mb-4">
                <Icon name={value.icon} className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{value.title}</h3>
              <p className="text-gray-400 text-sm leading-relaxed">{value.description}</p>
            </m.div>
          ))}
        </div>
      </div>

      {/* Team Section */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">Meet the Team</h2>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto">
            A unique combination of AI and human expertise working together to make your ideas reality.
          </p>
        </m.div>

        <div className="grid md:grid-cols-3 gap-6">
          {team.map((member, index) => (
            <m.div
              key={member.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="rounded-2xl bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-800/30 p-8 text-center"
            >
              <div className="w-20 h-20 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto mb-4">
                <Icon name={member.icon} className="w-10 h-10 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{member.name}</h3>
              <p className="text-purple-400 text-sm mb-4">{member.role}</p>
              <p className="text-gray-400 text-sm leading-relaxed">{member.description}</p>
            </m.div>
          ))}
        </div>
      </div>

      {/* Story Section */}
      <div className="container mx-auto px-4 pb-24">
        <m.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-8 text-center">Our Story</h2>
          
          <div className="space-y-6 text-lg text-gray-300 leading-relaxed">
            <p>
              SheenApps was born from a simple observation: building software is too hard, 
              too expensive, and takes too long. We watched countless entrepreneurs abandon 
              their dreams because they couldn't afford developers or couldn't code themselves.
            </p>
            
            <p>
              We asked ourselves: What if building an app was as easy as describing what you want? 
              What if you could have a tech team available 24/7 for less than the cost of a gym membership? 
              What if AI could handle the technical complexity while humans provided the creativity and strategy?
            </p>
            
            <p>
              Today, SheenApps is that answer. We've built a platform where AI agents work alongside 
              human advisors to transform ideas into fully functional applications. No coding required, 
              no huge budgets, no waiting months for development.
            </p>
            
            <p>
              We're not just building a product—we're democratizing an entire industry. Every day, 
              people who never thought they could build software are launching their dreams on our platform. 
              And we're just getting started.
            </p>
          </div>
        </m.div>
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
            Ready to build something amazing?
          </h2>
          <p className="text-lg text-gray-300 mb-8 max-w-2xl mx-auto">
            Join thousands of builders who are turning their ideas into reality with SheenApps.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href={ROUTES.BUILDER_NEW}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
            >
              <Icon name="sparkles" className="w-5 h-5 mr-2" />
              Start Building Free
            </Link>
            <Link
              href={ROUTES.ADVISOR_BROWSE}
              className="inline-flex items-center justify-center px-6 py-3 rounded-lg bg-white/10 hover:bg-white/20 text-white font-medium transition-colors"
            >
              <Icon name="message-circle" className="w-5 h-5 mr-2" />
              Talk to an Advisor
            </Link>
          </div>
        </m.div>
      </div>
    </div>
  )
}