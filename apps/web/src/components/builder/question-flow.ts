export interface Question {
  id: string
  text: string
  chips: string[]
  type: 'business_type' | 'color_theme' | 'features' | 'brand_name' | 'target_audience'
  followUp?: Record<string, string>
}

export const questionFlow: Question[] = [
  {
    id: 'business_type',
    text: "I love your idea! Let me help bring it to life. First, what type of business is this?",
    chips: ['SaaS Platform', 'E-commerce Store', 'Marketplace', 'Portfolio Site', 'Other'],
    type: 'business_type',
    followUp: {
      'SaaS Platform': 'subscription_model',
      'E-commerce Store': 'product_type',
      'Marketplace': 'marketplace_type',
      'Portfolio Site': 'portfolio_type'
    }
  },
  {
    id: 'color_theme',
    text: "Great choice! Now, what color palette speaks to your brand?",
    chips: ['Purple Passion', 'Ocean Blue', 'Forest Green', 'Sunset Orange', 'Midnight Dark'],
    type: 'color_theme'
  },
  {
    id: 'brand_name',
    text: "Looking amazing! What should we call your business?",
    chips: ['Use AI suggestion', "I'll type my own"],
    type: 'brand_name'
  },
  {
    id: 'features',
    text: "Which features are must-haves for launch?",
    chips: ['User Authentication', 'Payment Processing', 'Email Notifications', 'Analytics Dashboard', 'AI Integration'],
    type: 'features'
  },
  {
    id: 'target_audience',
    text: "Who's your primary target audience?",
    chips: ['Small Businesses', 'Enterprise', 'Consumers', 'Freelancers', 'Everyone'],
    type: 'target_audience'
  }
]

export const dynamicQuestions: Record<string, Question> = {
  subscription_model: {
    id: 'subscription_model',
    text: "What pricing model works best for you?",
    chips: ['Freemium', 'Free Trial', 'Paid Only', 'Usage Based'],
    type: 'features'
  },
  product_type: {
    id: 'product_type',
    text: "What type of products will you sell?",
    chips: ['Physical Products', 'Digital Downloads', 'Services', 'Mixed'],
    type: 'features'
  },
  marketplace_type: {
    id: 'marketplace_type',
    text: "What kind of marketplace are you building?",
    chips: ['B2B', 'B2C', 'C2C', 'Service Marketplace'],
    type: 'features'
  },
  portfolio_type: {
    id: 'portfolio_type',
    text: "What's your creative focus?",
    chips: ['Design', 'Photography', 'Development', 'Writing', 'Multi-disciplinary'],
    type: 'features'
  }
}

export const buildStepTemplates = {
  analyzing: {
    messages: [
      "Analyzing your business idea...",
      "Understanding your requirements...",
      "Identifying key features..."
    ]
  },
  scaffolding: {
    messages: [
      "Creating your app structure...",
      "Setting up the foundation...",
      "Building core components..."
    ]
  },
  generating: {
    messages: [
      "Generating your pages...",
      "Creating custom layouts...",
      "Building user interfaces..."
    ]
  },
  styling: {
    messages: [
      "Applying your brand colors...",
      "Creating beautiful designs...",
      "Polishing the experience..."
    ]
  },
  features: {
    messages: [
      "Adding authentication...",
      "Setting up payment processing...",
      "Implementing core features..."
    ]
  }
}