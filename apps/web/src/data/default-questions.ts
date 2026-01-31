// Default question flows for performance optimization
// Extracted from AIQuestionGenerator to reduce bundle size

import type { MCQQuestion, QuestionFlow } from '@/types/question-flow'

export function createSalonQuestions(): MCQQuestion[] {
  return [
    {
      id: 'q1',
      type: 'single_choice',
      category: 'audience',
      question: 'What type of salon services will you offer?',
      context: 'This helps us customize your booking system for the right services.',
      options: [
        {
          id: 'o1',
          text: 'Hair Salon',
          description: 'Haircuts, styling, coloring, and treatments',
          businessImplications: ['Service Menu', 'Stylist Profiles', 'Color Bar'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'hair-salon' },
            animationDuration: 500
          }
        },
        {
          id: 'o2',
          text: 'Beauty Salon',
          description: 'Facials, makeup, skincare, and beauty treatments',
          businessImplications: ['Treatment Rooms', 'Product Sales', 'Skincare Plans'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'beauty-salon' },
            animationDuration: 500
          }
        },
        {
          id: 'o3',
          text: 'Full Service Spa',
          description: 'Complete salon services including massage and wellness',
          businessImplications: ['Spa Services', 'Wellness Programs', 'Package Deals'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'full-spa' },
            animationDuration: 500
          }
        },
        {
          id: 'o4',
          text: 'Nail Salon',
          description: 'Manicures, pedicures, nail art, and nail treatments',
          businessImplications: ['Nail Services', 'Nail Art Gallery', 'Treatment Packages'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'nail-salon' },
            animationDuration: 500
          }
        },
        {
          id: 'o5',
          text: 'Barbershop',
          description: 'Traditional and modern barbering services for men',
          businessImplications: ['Barber Services', 'Grooming Products', 'Classic Styling'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'barbershop' },
            animationDuration: 500
          }
        },
        {
          id: 'o6',
          text: 'Wellness Center',
          description: 'Holistic wellness services including massage and therapy',
          businessImplications: ['Wellness Programs', 'Therapy Services', 'Holistic Approach'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'wellness-center' },
            animationDuration: 500
          }
        },
        {
          id: 'o7',
          text: 'Medical Spa',
          description: 'Advanced treatments combining medical expertise with spa luxury',
          businessImplications: ['Medical Treatments', 'Licensed Professionals', 'Advanced Equipment'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'medical-spa' },
            animationDuration: 500
          }
        },
        {
          id: 'o8',
          text: 'Mobile Salon',
          description: 'On-location beauty services bringing the salon to customers',
          businessImplications: ['Mobile Services', 'Booking System', 'Service Areas'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'mobile-salon' },
            animationDuration: 500
          }
        }
      ],
      metadata: {
        aiReasoning: 'Service type determines booking complexity and features needed',
        estimatedTime: 30,
        difficultyLevel: 'beginner',
        businessImpact: 'high'
      },
      followUpLogic: {
        conditions: [],
        nextQuestionId: 'q2'
      }
    }
  ]
}

export function createGeneralBusinessQuestions(): MCQQuestion[] {
  return [
    {
      id: 'q1',
      type: 'single_choice',
      category: 'audience',
      question: 'Who is your primary target audience?',
      context: 'Understanding your target audience helps us design the right experience.',
      options: [
        {
          id: 'o1',
          text: 'Professional & Trustworthy',
          description: 'Clean, professional design that builds trust and credibility',
          businessImplications: ['Corporate Colors', 'Clean Layout', 'Professional Imagery'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'professional' },
            animationDuration: 500
          }
        },
        {
          id: 'o2',
          text: 'Modern & Innovative',
          description: 'Cutting-edge design with bold colors and modern aesthetics',
          businessImplications: ['Tech Integration', 'Interactive Elements', 'Dynamic Animations'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'modern' },
            animationDuration: 500
          }
        },
        {
          id: 'o3',
          text: 'Warm & Welcoming',
          description: 'Friendly, approachable design that makes visitors feel at home',
          businessImplications: ['Warm Colors', 'Personal Touch', 'Customer Stories'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'warm' },
            animationDuration: 500
          }
        },
        {
          id: 'o4',
          text: 'Luxury & Premium',
          description: 'Sophisticated design that conveys exclusivity and high quality',
          businessImplications: ['Premium Imagery', 'Elegant Typography', 'Exclusive Offers'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'luxury' },
            animationDuration: 500
          }
        },
        {
          id: 'o5',
          text: 'Playful & Creative',
          description: 'Fun, vibrant design that showcases personality and creativity',
          businessImplications: ['Bright Colors', 'Unique Layouts', 'Interactive Features'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'playful' },
            animationDuration: 500
          }
        },
        {
          id: 'o6',
          text: 'Minimalist & Clean',
          description: 'Simple, uncluttered design that focuses on content and usability',
          businessImplications: ['White Space', 'Simple Navigation', 'Clear Messaging'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'minimal' },
            animationDuration: 500
          }
        },
        {
          id: 'o7',
          text: 'Bold & Confident',
          description: 'Strong, assertive design that commands attention and authority',
          businessImplications: ['Strong Typography', 'Confident Messaging', 'Striking Visuals'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'bold' },
            animationDuration: 500
          }
        },
        {
          id: 'o8',
          text: 'Elegant & Sophisticated',
          description: 'Refined design with tasteful elegance and sophisticated appeal',
          businessImplications: ['Elegant Typography', 'Refined Colors', 'Sophisticated Layout'],
          previewImpact: {
            action: 'theme_change',
            target: 'hero',
            changes: { theme: 'elegant' },
            animationDuration: 500
          }
        }
      ],
      metadata: {
        aiReasoning: 'Target audience is fundamental to all design decisions',
        estimatedTime: 30,
        difficultyLevel: 'beginner',
        businessImpact: 'high'
      },
      followUpLogic: {
        conditions: [],
        nextQuestionId: 'q2'
      }
    }
  ]
}

export function createBookingQuestions(isSalonBusiness: boolean): MCQQuestion[] {
  return [
    {
      id: 'q2',
      type: 'single_choice',
      category: 'features',
      question: isSalonBusiness
        ? 'How do you want customers to book appointments?'
        : 'What core features do you need?',
      context: isSalonBusiness
        ? 'Choose the booking method that works best for your salon workflow.'
        : 'Select the most important features for your business.',
      options: [
        {
          id: 'o1',
          text: isSalonBusiness ? 'Online booking only' : 'Basic features',
          description: isSalonBusiness
            ? 'Customers book directly through your website'
            : 'Essential features to get started',
          businessImplications: isSalonBusiness
            ? ['24/7 Booking', 'Automated Confirmations', 'Calendar Sync']
            : ['Core Functionality', 'Simple UI', 'Quick Setup'],
          previewImpact: {
            action: 'feature_add',
            target: 'booking-section',
            changes: { bookingType: 'online-only' },
            animationDuration: 500
          }
        },
        {
          id: 'o2',
          text: isSalonBusiness ? 'Phone + Online booking' : 'Advanced features',
          description: isSalonBusiness
            ? 'Accept bookings both online and by phone'
            : 'Advanced capabilities for growth',
          businessImplications: isSalonBusiness
            ? ['Phone Integration', 'Staff Dashboard', 'Dual Booking']
            : ['Pro Features', 'Automation', 'Analytics'],
          previewImpact: {
            action: 'feature_add',
            target: 'booking-section',
            changes: { bookingType: 'hybrid-booking' },
            animationDuration: 500
          }
        }
      ],
      metadata: {
        aiReasoning: 'Booking method affects user experience and salon operations',
        estimatedTime: 30,
        difficultyLevel: 'beginner',
        businessImpact: 'high'
      },
      followUpLogic: {
        conditions: [],
        nextQuestionId: null
      }
    }
  ]
}

export function generateDefaultQuestionFlow(businessIdea: string): QuestionFlow {
  // Create salon-specific questions based on the business idea
  const isSalonBusiness = businessIdea.toLowerCase().includes('salon') || 
                         businessIdea.toLowerCase().includes('booking')
  
  const firstQuestions = isSalonBusiness 
    ? createSalonQuestions() 
    : createGeneralBusinessQuestions()
    
  const secondQuestions = createBookingQuestions(isSalonBusiness)
  
  const defaultQuestions: MCQQuestion[] = [...firstQuestions, ...secondQuestions]
  
  return {
    id: `flow_${Date.now()}`,
    businessContext: {
      originalIdea: businessIdea,
      industryCategory: isSalonBusiness ? 'beauty-services' : 'general',
      complexity: 'moderate',
      previousAnswers: []
    },
    questions: defaultQuestions,
    currentQuestionIndex: 0,
    completionPercentage: 0,
    engagementScore: 0,
    adaptivePath: []
  }
}