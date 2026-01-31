// Warm & Approachable Theme: Comprehensive Response Matrix (17 responses)
// 4 Headers + 5 Heroes + 4 Features + 4 Testimonials = 17 total
import { warmApproachableCSS } from '../../refinement/customCSS'

// Header Components (4 variations)
export const warmApproachableHeaders = {
  // H1: Cozy neighborhood header
  'cozy-neighborhood': {
    component: 'cozy-neighborhood',
    props: {
      businessName: 'Sunny Side Salon',
      tagline: 'Your Neighborhood Beauty Haven',
      logoIcon: '☀️',
      navItems: [
        { label: 'Services', url: '#services' },
        { label: 'Our Team', url: '#team' },
        { label: 'Community', url: '#community' },
        { label: 'Book Now', url: '#booking' }
      ],
      ctaText: 'Book Appointment',
      headerStyle: 'friendly-nav'
    }
  },

  // H2: Family-first header
  'family-first': {
    component: 'family-first',
    props: {
      businessName: 'Family Tree Salon',
      tagline: 'Where Everyone Feels at Home',
      logoIcon: '🏡',
      navItems: [
        { label: 'All Ages', url: '#services' },
        { label: 'About Us', url: '#about' },
        { label: 'Gallery', url: '#gallery' },
        { label: 'Contact', url: '#contact' }
      ],
      ctaText: 'Schedule Visit',
      headerStyle: 'warm-welcome'
    }
  },

  // H3: Community-centered header
  'community-hub': {
    component: 'community-hub',
    props: {
      businessName: 'The Community Cut',
      tagline: 'Bringing People Together',
      logoIcon: '🤝',
      navItems: [
        { label: 'Services', url: '#services' },
        { label: 'Events', url: '#events' },
        { label: 'Local Love', url: '#community' },
        { label: 'Join Us', url: '#booking' }
      ],
      ctaText: 'Get Started',
      headerStyle: 'community-first'
    }
  },

  // H4: Accessible-friendly header
  'accessible-care': {
    component: 'accessible-care',
    props: {
      businessName: 'Open Arms Salon',
      tagline: 'Beauty for Every Body',
      logoIcon: '💚',
      navItems: [
        { label: 'Services', url: '#services' },
        { label: 'Accessibility', url: '#access' },
        { label: 'Our Story', url: '#story' },
        { label: 'Book Today', url: '#booking' }
      ],
      ctaText: 'Book Easily',
      headerStyle: 'inclusive-design'
    }
  }
}

// Hero Components (5 variations)
export const warmApproachableHeros = {
  // HE1: Welcoming community hero
  'welcoming-community': {
    component: 'welcoming-community',
    props: {
      badge: 'FAMILY OWNED SINCE 2010',
      title: 'Where Every Visit Feels Like Coming Home',
      subtitle: 'Join our warm community of friends and neighbors who trust us with their beauty needs. Everyone is welcome here!',
      primaryCTA: 'Book Your Visit',
      secondaryCTA: 'Meet Our Team',
      heroStyle: 'community-warmth',
      backgroundType: 'friendly-atmosphere'
    }
  },

  // HE2: Affordable quality hero
  'affordable-quality': {
    component: 'affordable-quality',
    props: {
      badge: 'QUALITY YOU CAN AFFORD',
      title: 'Beautiful Hair, Happy Wallet',
      subtitle: 'Professional salon services at prices that make sense for your budget. Great hair shouldnt break the bank!',
      primaryCTA: 'See Our Prices',
      secondaryCTA: 'View Services',
      heroStyle: 'budget-friendly',
      backgroundType: 'value-focused'
    }
  },

  // HE3: All-ages welcome hero
  'all-ages-welcome': {
    component: 'all-ages-welcome',
    props: {
      badge: 'KIDS TO GRANDPARENTS',
      title: 'Beauty Services for the Whole Family',
      subtitle: 'From first haircuts to senior styling, we love serving every generation. Bring the whole family!',
      primaryCTA: 'Family Packages',
      secondaryCTA: 'Kids Services',
      heroStyle: 'multi-generational',
      backgroundType: 'family-friendly'
    }
  },

  // HE4: Comfort-first hero
  'comfort-first': {
    component: 'comfort-first',
    props: {
      badge: 'COMFORT IS KEY',
      title: 'Relax, Youre in Good Hands',
      subtitle: 'Take a break from the busy world. Our cozy salon is designed to help you unwind while we take care of you.',
      primaryCTA: 'Book Relaxation',
      secondaryCTA: 'Our Atmosphere',
      heroStyle: 'comfort-zone',
      backgroundType: 'relaxing-vibes'
    }
  },

  // HE5: Local favorite hero
  'local-favorite': {
    component: 'local-favorite',
    props: {
      badge: 'NEIGHBORHOOD FAVORITE',
      title: 'Your Local Beauty Destination',
      subtitle: 'Proud to be part of this amazing community. Supporting local families with great hair and genuine care.',
      primaryCTA: 'Join Our Family',
      secondaryCTA: 'Local Reviews',
      heroStyle: 'neighborhood-pride',
      backgroundType: 'local-community'
    }
  }
}

// Features Components (4 variations)
export const warmApproachableFeatures = {
  // F1: Family-focused services
  'family-services': {
    component: 'family-services',
    props: {
      sectionTitle: 'Services for Everyone',
      subtitle: 'From toddlers to grandparents, we have something special for every family member',
      primaryServices: [
        {
          name: 'Kids Cuts',
          description: 'Fun, gentle haircuts with patience and care',
          icon: '👶',
          price: 'From $25',
          ageGroup: 'Children'
        },
        {
          name: 'Teen Styling',
          description: 'Trendy styles that help teens express themselves',
          icon: '✨',
          price: 'From $35',
          ageGroup: 'Teens'
        },
        {
          name: 'Senior Care',
          description: 'Comfortable, accessible services with extra attention',
          icon: '🌟',
          price: 'From $30',
          ageGroup: 'Seniors'
        },
        {
          name: 'Family Packages',
          description: 'Special pricing when the whole family visits together',
          icon: '👨‍👩‍👧‍👦',
          price: 'Save 20%',
          ageGroup: 'All Ages'
        }
      ]
    }
  },

  // F2: Comfort amenities
  'comfort-amenities': {
    component: 'comfort-amenities',
    props: {
      sectionTitle: 'Designed for Your Comfort',
      subtitle: 'Every detail in our salon is chosen to make you feel welcome and relaxed',
      primaryServices: [
        {
          name: 'Complimentary Beverages',
          description: 'Coffee, tea, or water while you wait',
          icon: '☕',
          price: 'Always Free',
          category: 'Hospitality'
        },
        {
          name: 'Kids Play Area',
          description: 'Safe, fun space to keep little ones entertained',
          icon: '🎨',
          price: 'Included',
          category: 'Family'
        },
        {
          name: 'Easy Parking',
          description: 'Plenty of free parking right outside our door',
          icon: '🚗',
          price: 'No Charge',
          category: 'Convenience'
        },
        {
          name: 'Flexible Scheduling',
          description: 'Early mornings, evenings, and weekend appointments',
          icon: '📅',
          price: 'Your Schedule',
          category: 'Accessibility'
        }
      ]
    }
  },

  // F3: Community connections
  'community-connections': {
    component: 'community-connections',
    props: {
      sectionTitle: 'Part of the Community',
      subtitle: 'We believe in giving back and supporting our neighbors',
      primaryServices: [
        {
          name: 'School Fundraisers',
          description: 'Donating services to local school events',
          icon: '🏫',
          price: 'Giving Back',
          impact: 'Education Support'
        },
        {
          name: 'Senior Discounts',
          description: '15% off all services for customers 65+',
          icon: '💝',
          price: '15% Off',
          impact: 'Senior Care'
        },
        {
          name: 'Local Partnerships',
          description: 'Supporting other neighborhood businesses',
          icon: '🤝',
          price: 'Community First',
          impact: 'Local Economy'
        },
        {
          name: 'Charity Drives',
          description: 'Regular collection drives for local causes',
          icon: '❤️',
          price: 'Together Strong',
          impact: 'Social Good'
        }
      ]
    }
  },

  // F4: Accessible services
  'accessible-services': {
    component: 'accessible-services',
    props: {
      sectionTitle: 'Beauty for Everyone',
      subtitle: 'We believe everyone deserves to feel beautiful and welcome',
      primaryServices: [
        {
          name: 'Wheelchair Accessible',
          description: 'Full accessibility throughout our salon',
          icon: '♿',
          price: 'Standard Rates',
          feature: 'Physical Access'
        },
        {
          name: 'Sensory-Friendly Hours',
          description: 'Quiet times for sensitive clients',
          icon: '🌙',
          price: 'By Appointment',
          feature: 'Sensory Comfort'
        },
        {
          name: 'Payment Flexibility',
          description: 'Multiple payment options and payment plans',
          icon: '💳',
          price: 'Your Way',
          feature: 'Financial Access'
        },
        {
          name: 'Home Visits',
          description: 'Mobile services for those who can\'t travel',
          icon: '🏠',
          price: 'Travel Fee Applies',
          feature: 'Mobility Solutions'
        }
      ]
    }
  }
}

// Testimonials Components (4 variations)
export const warmApproachableTestimonials = {
  // T1: Family testimonials
  'family-love': {
    component: 'family-love',
    props: {
      sectionTitle: 'Our Salon Family Says',
      subtitle: 'Real stories from real neighbors who have become part of our extended family',
      testimonials: [
        {
          text: 'I\'ve been bringing my whole family here for 5 years. They treat my kids like their own grandchildren, and my mom loves coming for her weekly wash and set. It\'s like having family do your hair!',
          author: 'Maria Rodriguez',
          relationship: 'Family of 5',
          yearsAsClient: '5 years',
          rating: 5
        },
        {
          text: 'After my husband passed, I wasn\'t sure I could afford to keep up with salon visits. They worked with me on pricing and always make sure I feel beautiful. This place has a heart.',
          author: 'Dorothy Chen',
          relationship: 'Widow & Grandmother',
          yearsAsClient: '8 years',
          rating: 5
        },
        {
          text: 'My daughter has autism and can be particular about who touches her hair. The staff here are so patient and understanding. She actually looks forward to haircut day now!',
          author: 'Jennifer Thompson',
          relationship: 'Special Needs Mom',
          yearsAsClient: '3 years',
          rating: 5
        }
      ]
    }
  },

  // T2: Affordability testimonials
  'budget-friendly': {
    component: 'budget-friendly',
    props: {
      sectionTitle: 'Great Hair, Great Prices',
      subtitle: 'Quality salon services that fit real family budgets',
      testimonials: [
        {
          text: 'As a single mom, every dollar counts. I can bring both my kids here and not stress about the cost. The quality is amazing for the price, and they even have family discounts!',
          author: 'Ashley Martinez',
          situation: 'Single Mother',
          savings: 'Family Package Savings',
          rating: 5
        },
        {
          text: 'I was tired of expensive downtown salons where you pay for the location. Here, you pay for great service and skilled stylists. My highlights look just as good for half the price.',
          author: 'Rebecca Kim',
          situation: 'Budget-Conscious Professional',
          savings: '50% Less Than Downtown',
          rating: 5
        },
        {
          text: 'On a teacher\'s salary, I have to be careful where I spend. But I refuse to compromise on feeling good about myself. This place proves you don\'t have to choose between quality and affordability.',
          author: 'Michael Davis',
          situation: 'Public School Teacher',
          savings: 'Educator Discount Applied',
          rating: 5
        }
      ]
    }
  },

  // T3: Community testimonials
  'neighborhood-love': {
    component: 'neighborhood-love',
    props: {
      sectionTitle: 'Neighbors Supporting Neighbors',
      subtitle: 'What happens when a salon becomes part of the community fabric',
      testimonials: [
        {
          text: 'When I was going through chemo, they donated wigs and gave me free scalp treatments. They didn\'t have to do that, but that\'s just who they are. This neighborhood is lucky to have them.',
          author: 'Carol Peterson',
          story: 'Cancer Survivor',
          impact: 'Free Support Services',
          rating: 5
        },
        {
          text: 'They sponsor our little league team and always donate gift certificates to our school auctions. It\'s clear they care about more than just business - they care about our community.',
          author: 'Tom Bradley',
          story: 'Youth Coach & Father',
          impact: 'Community Sponsorship',
          rating: 5
        },
        {
          text: 'I love that I can walk here from my house, catch up with neighbors in the waiting area, and support a local business. It feels like the old days when you knew everyone in the neighborhood.',
          author: 'Linda Washington',
          story: 'Longtime Resident',
          impact: 'Neighborhood Connection',
          rating: 5
        }
      ]
    }
  },

  // T4: Comfort & care testimonials
  'comfort-care': {
    component: 'comfort-care',
    props: {
      sectionTitle: 'A Place Where You Can Relax',
      subtitle: 'Sometimes the best part isn\'t just the great hair - it\'s how we make you feel',
      testimonials: [
        {
          text: 'I have social anxiety and big salons overwhelm me. Here, everyone knows my name and my coffee order. I can actually relax and enjoy getting my hair done instead of feeling stressed.',
          author: 'Sarah Mitchell',
          concern: 'Social Anxiety',
          solution: 'Personal Attention',
          rating: 5
        },
        {
          text: 'After working 60-hour weeks, this is my sanctuary. They dim the lights during my wash, play relaxing music, and I sometimes fall asleep in the chair. It\'s like therapy.',
          author: 'David Park',
          concern: 'Work Stress',
          solution: 'Relaxation Focus',
          rating: 5
        },
        {
          text: 'I use a walker and most places make me feel like a burden. Here, they clear a path, have a special chair, and never rush me. I feel like a valued client, not a problem to solve.',
          author: 'Margaret Foster',
          concern: 'Mobility Issues',
          solution: 'Accessibility & Patience',
          rating: 5
        }
      ]
    }
  }
}

// Main warm-approachable impact with response selection logic
export const warmApproachableImpact = {
  type: "modular-transformation" as const,
  modules: {
    colorScheme: "warm",
    typography: "friendly",
    
    // Default header (can be overridden by response selector)
    header: warmApproachableHeaders['cozy-neighborhood'],
    
    // Default hero (can be overridden by response selector)  
    hero: warmApproachableHeros['welcoming-community'],
    
    // Default features (can be overridden by response selector)
    features: warmApproachableFeatures['family-services'],
    
    // Default testimonials (can be overridden by response selector)
    testimonials: warmApproachableTestimonials['family-love'],
    
    animations: ["gentleBounce", "warmGlow", "heartFloat"],
    customCSS: warmApproachableCSS
  }
}

// Response matrices are exported individually above for potential future use