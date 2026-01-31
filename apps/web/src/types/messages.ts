// Type definitions for translation messages
// This should be generated from your translation files

export interface Messages {
  navigation: {
    howItWorks: string
    yourTeam: string
    pricing: string
    features: string
    talkToAdvisor: string
    startBuilding: string
    login: string
    signup: string
    dashboard: string
    logout: string
  }
  hero: {
    badge: string
    title: string
    titleHighlight: string
    subtitle: string
    subtitleSecond: string
    demoPrompt: string
    buildingText: string
    buildingTextShort: string
    startBuilding: string
    startBuildingShort: string
    useVoice: string
    noCreditCard: string
    demoTime: string
    businessIdeas: string[]
    floatingBadges: {
      aiPowered: string
      responsive: string
      seoOptimized: string
      secure: string
      fast: string
      customizable: string
    }
    trustBar: {
      businesses: string
      rating: string
      support: string
    }
  }
  dashboard: {
    title: string
    welcome: string
    welcomeMessage: string
    projectCount: string
    noProjects: string
    createFirst: string
    recentProjects: string
    allProjects: string
  }
  billing: {
    title: string
    currentPlan: string
    usage: string
    upgrade: string
    manageSubscription: string
    price: string
  }
  common: {
    loading: string
    error: string
    success: string
    cancel: string
    save: string
    delete: string
    edit: string
    create: string
    update: string
    confirm: string
    back: string
    next: string
    previous: string
    close: string
    open: string
    search: string
    filter: string
    sort: string
    refresh: string
    retry: string
    skip: string
    done: string
    termsAndConditions: string
  }
  auth: {
    login: string
    signup: string
    logout: string
    forgotPassword: string
    resetPassword: string
    email: string
    password: string
    confirmPassword: string
    rememberMe: string
    loginWith: string
    signupWith: string
    alreadyHaveAccount: string
    dontHaveAccount: string
    orContinueWith: string
  }
  errors: {
    notFound: string
    unauthorized: string
    forbidden: string
    serverError: string
    networkError: string
    validationError: string
    genericError: string
  }
}

// Extend this as you add more translation namespaces