# SheenApps Architecture Overview

## Core Stack
- **Framework**: Next.js 15.3.3 with App Router (React 19)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 + Framer Motion
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **Deployment**: Vercel Edge

## Architecture Layers

### 1. Frontend
- **Server Components**: React 19 with SSR-first approach
- **State Management**: Zustand + Immer (unified store pattern)
- **Data Fetching**: React Query for caching & optimistic updates
- **Internationalization**: 9 locales via next-intl

### 2. AI Website Builder
- **Preview System**: Direct React rendering (2-5x faster than iframe)
- **History**: Pure data snapshots with per-section undo/redo
- **Event System**: 30+ event types for component coordination
- **Mobile**: Adaptive layouts with touch optimization

### 3. AI Services
- **Providers**: OpenAI GPT-4 + Anthropic Claude
- **Architecture**: Multi-tier routing (dev/staging/prod)
- **Optimization**: Response caching, mock mode for development

### 4. Backend Services
- **Authentication**: Supabase Auth (magic links + OAuth)
- **Database**: PostgreSQL with Row Level Security
- **Payments**: Stripe primary + multi-gateway ready
- **Real-time**: WebSocket subscriptions

### 5. Infrastructure
- **API**: Next.js App Router endpoints
- **Monitoring**: Sentry, Web Vitals, custom analytics
- **Security**: Rate limiting, CSP, webhook verification
- **Performance**: Bundle optimization (327% of goal achieved)

## Key Design Patterns
1. **Feature Flags**: Runtime feature toggles
2. **Lazy Loading**: Component-level code splitting
3. **Optimistic UI**: Updates before server confirmation
4. **Event-Driven**: Loosely coupled components
5. **Service Layer**: Business logic separation

## Directory Structure
```
src/
├── app/[locale]/    # Internationalized pages
├── app/api/         # API endpoints
├── components/      # React components
├── services/        # Business logic
├── store/           # State management
├── hooks/           # Custom hooks
└── config/          # Configuration
```

## Performance Metrics
- Homepage: 233KB bundle (26% reduction)
- Builder: 257KB bundle (24% reduction)
- Build time: 5s (3x improvement)
- Zero request timeouts

## Technical Status
- ✅ Production-ready core features
- ✅ React Query integration complete
- ✅ Event system fully integrated
- ⚠️ Some test file technical debt
- ⚠️ Event coordination complexity