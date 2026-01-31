# Easy Mode Email - Domain Transfer-In User Frontend Plan

> **Status:** In Progress (Implementation Started 2026-01-28)
> **Created:** 2026-01-28
> **Depends On:** `easy-mode-email-enhancements-plan.md` (backend complete), `easy-mode-email-user-frontend-plan.md` (patterns established)
> **Scope:** End-user frontend for domain transfer-in functionality

---

## Context

The domain transfer-in backend is complete (Enhancement 4 in `easy-mode-email-enhancements-plan.md`), but users have no way to initiate transfers. The admin panel has a Transfers tab for monitoring, but the end-user flow is missing entirely.

### What Exists

| Layer | Status | Details |
|-------|--------|---------|
| **Worker routes** | ⚠️ Partial | 7 endpoints exist; need to add `transfer-payment` (Stripe PaymentIntent) |
| **Service layer** | ✅ Done | `InhouseDomainTransferService.ts` with payment verification |
| **Database** | ✅ Done | `inhouse_domain_transfers` table (migration 144) |
| **Admin frontend** | ✅ Done | Transfers tab in `InhouseDomainsAdmin.tsx` |
| **User frontend** | ❌ Missing | No proxy routes, no hooks, no components |

### Worker Endpoints (User-Facing)

```
POST /v1/inhouse/projects/:projectId/transfer-check     # Check eligibility
POST /v1/inhouse/projects/:projectId/transfer-intent    # Create intent (returns pricing)
POST /v1/inhouse/projects/:projectId/transfer-payment   # Create/retrieve Stripe PaymentIntent (NEW)
POST /v1/inhouse/projects/:projectId/transfer-confirm   # Submit auth code after payment
GET  /v1/inhouse/projects/:projectId/transfers          # List transfers
GET  /v1/inhouse/projects/:projectId/transfers/:id      # Get single transfer
POST /v1/inhouse/projects/:projectId/transfers/:id/cancel       # Cancel pending
POST /v1/inhouse/projects/:projectId/transfers/:id/poll-status  # Poll status from OpenSRS
```

---

## User Journey

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. ENTRY POINT                                                              │
│    User clicks "Transfer Domain" in EmailDomains > Registered Domains tab   │
│    (alongside existing "Buy a Domain" button)                               │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. ELIGIBILITY CHECK                                                        │
│    - User enters domain name                                                │
│    - We call transfer-check endpoint                                        │
│    - Show: eligible/ineligible + reason + current registrar (if known)      │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. CONTACT DETAILS                                                          │
│    - Same form as domain registration (reuse ContactField components)       │
│    - Required: firstName, lastName, email, phone, address1, city, state,    │
│                postalCode, country                                          │
│    - Creates transfer-intent (returns transferId + pricing)                 │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. PAYMENT                                                                  │
│    - Show price + "Transfer extends domain by 1 year" note                  │
│    - User completes Stripe payment (PaymentIntent flow)                     │
│    - Payment confirmation returns to step 5                                 │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. AUTH CODE                                                                │
│    - User enters EPP/auth code from current registrar                       │
│    - Link to help article: "How to get your auth code"                      │
│    - Optional: nameservers, WHOIS privacy toggle                            │
│    - Calls transfer-confirm endpoint                                        │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. TRACKING                                                                 │
│    - Show transfer status (pending → processing → completed)                │
│    - Poll button to check status                                            │
│    - Cancel button (if still pending_payment or pending)                    │
│    - "Transfers typically complete in 5-7 days"                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Step 1: Next.js Proxy Routes

Create proxy routes using `withProjectOwner` wrapper (same pattern as existing email routes).

**Files to create:**

```
src/app/api/inhouse/projects/[id]/
  transfer-check/route.ts              # POST - Check eligibility
  transfer-intent/route.ts             # POST - Create intent
  transfer-confirm/route.ts            # POST - Confirm with auth code
  transfers/route.ts                   # GET - List transfers
  transfers/[transferId]/route.ts      # GET - Get single transfer
  transfers/[transferId]/cancel/route.ts     # POST - Cancel
  transfers/[transferId]/poll-status/route.ts # POST - Poll status
```

**Example route (transfer-check):**

```typescript
// src/app/api/inhouse/projects/[id]/transfer-check/route.ts
import { withProjectOwner, PROJECT_ROUTE_EXPORTS } from '@/lib/api/with-project-owner'
import { callWorker } from '@/lib/api/worker-helpers'

export const { dynamic, revalidate, fetchCache } = PROJECT_ROUTE_EXPORTS

export const POST = withProjectOwner(async (request, ctx) => {
  const body = await request.json()

  const result = await callWorker({
    method: 'POST',
    path: `/v1/inhouse/projects/${ctx.projectId}/transfer-check`,
    body: { ...body, userId: ctx.userId },
    claims: { userId: ctx.userId },
  })

  return ctx.workerResponse(result)
})
```

**Count:** 7 route files, each ~15-20 lines.

---

### Step 2: React Query Hooks

Create hooks for transfer operations (same pattern as `use-registered-domains.ts`).

**File to create:** `src/hooks/use-domain-transfers.ts`

```typescript
'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { emailKeys } from '@/lib/query-keys'
import type { DomainContact } from './use-registered-domains'

// ============================================================================
// TYPES
// ============================================================================

export interface DomainTransfer {
  id: string
  projectId: string
  domain: string
  tld: string
  status: 'pending_payment' | 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  statusMessage?: string
  sourceRegistrar?: string
  priceCents: number
  currency: string
  opensrsOrderId?: string
  initiatedAt?: string
  completedAt?: string
  createdAt: string
}

export interface TransferEligibility {
  domain: string
  eligible: boolean
  reason?: string
  currentRegistrar?: string
  expiresAt?: string
}

export interface TransferIntent {
  transferId: string
  priceCents: number
  currency: string
  currentRegistrar?: string
  expiresAt?: string
}

// ============================================================================
// QUERIES
// ============================================================================

export function useDomainTransfers(projectId: string, options?: { status?: string }, enabled = true) {
  const params = new URLSearchParams()
  if (options?.status) params.set('status', options.status)

  return useQuery({
    queryKey: emailKeys.transfers(projectId, options?.status),
    queryFn: async () => {
      // Avoid ?& glitch when params is empty
      const qs = params.toString()
      const url = `/api/inhouse/projects/${projectId}/transfers${qs ? `?${qs}&` : '?'}_t=${Date.now()}`
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`Failed to fetch transfers: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch transfers')
      return data.data as { transfers: DomainTransfer[]; total: number; hasMore: boolean }
    },
    enabled: !!projectId && enabled,
    staleTime: 30_000,
  })
}

export function useDomainTransfer(projectId: string, transferId: string, enabled = true) {
  return useQuery({
    queryKey: emailKeys.transfer(projectId, transferId),
    queryFn: async () => {
      const res = await fetch(
        `/api/inhouse/projects/${projectId}/transfers/${transferId}?_t=${Date.now()}`,
        { cache: 'no-store' }
      )
      if (!res.ok) throw new Error(`Failed to fetch transfer: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to fetch transfer')
      return data.data as DomainTransfer
    },
    enabled: !!projectId && !!transferId && enabled,
    staleTime: 10_000, // More frequent for status tracking
  })
}

// ============================================================================
// MUTATIONS
// ============================================================================

export function useCheckTransferEligibility(projectId: string) {
  return useMutation({
    mutationFn: async (domain: string): Promise<TransferEligibility> => {
      // Normalize domain (trim + lowercase) for consistent UX
      // Worker is authoritative but UI normalization prevents user confusion
      const normalized = domain.trim().toLowerCase()
      const res = await fetch(`/api/inhouse/projects/${projectId}/transfer-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: normalized }),
      })
      if (!res.ok) throw new Error(`Failed to check eligibility: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to check eligibility')
      return data.data
    },
  })
}

export function useCreateTransferIntent(projectId: string) {
  return useMutation({
    mutationFn: async (input: {
      domain: string
      contacts: { owner: DomainContact }
      userEmail: string
    }): Promise<TransferIntent> => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/transfer-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          domain: input.domain.trim().toLowerCase(), // Normalize
        }),
      })
      if (!res.ok) throw new Error(`Failed to create transfer intent: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to create transfer intent')
      return data.data
    },
  })
}

export function useCreateTransferPayment(projectId: string) {
  return useMutation({
    mutationFn: async (transferId: string): Promise<{ clientSecret: string; paymentIntentId: string }> => {
      // Idempotent: safe to call multiple times (returns existing PaymentIntent if present)
      const res = await fetch(`/api/inhouse/projects/${projectId}/transfer-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transferId }),
      })
      if (!res.ok) throw new Error(`Failed to create payment: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to create payment')
      return data.data
    },
  })
}

export function useConfirmTransfer(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: {
      transferId: string
      authCode: string
      stripePaymentIntentId: string
      nameservers?: string[]
      whoisPrivacy?: boolean
    }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/transfer-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error(`Failed to confirm transfer: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to confirm transfer')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.allTransfers(projectId) })
    },
  })
}

export function useCancelTransfer(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ transferId, reason }: { transferId: string; reason?: string }) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/transfers/${transferId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error(`Failed to cancel transfer: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to cancel transfer')
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: emailKeys.allTransfers(projectId) })
    },
  })
}

export function usePollTransferStatus(projectId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (transferId: string) => {
      const res = await fetch(`/api/inhouse/projects/${projectId}/transfers/${transferId}/poll-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error(`Failed to poll status: ${res.status}`)
      const data = await res.json()
      if (!data.ok) throw new Error(data.error?.message || 'Failed to poll status')
      return data.data
    },
    onSuccess: (_, transferId) => {
      queryClient.invalidateQueries({ queryKey: emailKeys.transfer(projectId, transferId) })
      queryClient.invalidateQueries({ queryKey: emailKeys.allTransfers(projectId) })
    },
  })
}
```

**Update query-keys.ts:**

```typescript
// Add to emailKeys object
transfers: (projectId: string, status?: string) =>
  [...emailKeys.project(projectId), 'transfers', status ?? 'all'] as const,
transfer: (projectId: string, transferId: string) =>
  [...emailKeys.project(projectId), 'transfer', transferId] as const,
allTransfers: (projectId: string) =>
  [...emailKeys.project(projectId), 'transfers'] as const,
```

---

### Step 3: Transfer Wizard Component

Create a multi-step transfer wizard (similar to `DomainRegistration.tsx`).

**File to create:** `src/components/project/email/DomainTransferWizard.tsx`

**Steps:**

1. **Check Eligibility** - Enter domain, validate transferability
2. **Contact Details** - Reuse `ContactField` pattern from `DomainRegistration.tsx`
3. **Payment** - Show price, integrate Stripe PaymentElement
4. **Auth Code** - Enter EPP code, optional settings
5. **Tracking** - Show status, poll button, cancel option

**Key features:**

- **Resumable:** If user has an in-progress transfer (`pending_payment`), resume from payment step
- Status badges matching admin panel style
- Help link for "How to get your auth code"
- Reuse `DomainContact` interface and validation from `use-registered-domains.ts`
- Reuse `COUNTRIES` list from `./countries.ts`
- Domain normalization (trim + lowercase) on input

**Component structure:**

```typescript
interface DomainTransferWizardProps {
  projectId: string
  userEmail: string
  onBack: () => void
  onComplete?: () => void
  // Optional: resume an existing transfer
  existingTransferId?: string
}

type TransferStep = 'check' | 'contact' | 'payment' | 'authCode' | 'tracking'
```

**Resume Logic (Critical for UX):**

```typescript
function DomainTransferWizard({ projectId, userEmail, existingTransferId, ... }) {
  const [step, setStep] = useState<TransferStep>('check')
  const [transferId, setTransferId] = useState<string | null>(existingTransferId || null)

  // If resuming an existing transfer, fetch it and jump to appropriate step
  const { data: existingTransfer } = useDomainTransfer(
    projectId,
    existingTransferId || '',
    !!existingTransferId
  )

  useEffect(() => {
    if (existingTransfer) {
      setTransferId(existingTransfer.id)
      // Jump to appropriate step based on status
      switch (existingTransfer.status) {
        case 'pending_payment':
          setStep('payment')
          break
        case 'pending':
        case 'processing':
          setStep('tracking')
          break
        default:
          // completed/failed/cancelled - don't resume
          break
      }
    }
  }, [existingTransfer])

  // Payment step: call transfer-payment (idempotent)
  const createPayment = useCreateTransferPayment(projectId)

  async function handlePaymentStep() {
    if (!transferId) return
    // Safe to call multiple times - returns existing PaymentIntent if present
    const { clientSecret } = await createPayment.mutateAsync(transferId)
    // ... render Stripe Elements with clientSecret
  }
}
```

**Entry from EmailDomains with resume:**

```typescript
// In RegisteredDomainsView
const { data: transfersData } = useDomainTransfers(projectId)
const pendingTransfer = transfersData?.transfers?.find(
  t => t.status === 'pending_payment' || t.status === 'pending'
)

// If user has a pending transfer, show resume button instead of "Transfer Domain"
{pendingTransfer ? (
  <Button onClick={() => openWizardWithTransfer(pendingTransfer.id)}>
    Resume Transfer ({pendingTransfer.domain})
  </Button>
) : (
  <Button onClick={() => setShowTransferWizard(true)}>
    <ArrowRightLeft className="h-4 w-4 me-1.5" />
    {t('transfer.title')}
  </Button>
)}
```

---

### Step 4: Integration with EmailDomains

Update `EmailDomains.tsx` to include transfer functionality.

**Changes:**

1. Add "Transfer Domain" button next to "Buy a Domain" in Registered Domains sub-tab
2. Add transfers section showing in-progress transfers
3. Wire up wizard dialog

**In RegisteredDomainsView:**

```typescript
const [showTransferWizard, setShowTransferWizard] = useState(false)
const { data: transfersData } = useDomainTransfers(projectId)
const pendingTransfers = transfersData?.transfers?.filter(
  t => !['completed', 'failed', 'cancelled'].includes(t.status)
) ?? []

// In JSX:
<div className="flex gap-2">
  <Button onClick={() => setShowRegistration(true)}>
    <Plus className="h-4 w-4 me-1.5" />
    {t('registration.title')}
  </Button>
  <Button variant="outline" onClick={() => setShowTransferWizard(true)}>
    <ArrowRightLeft className="h-4 w-4 me-1.5" />
    {t('transfer.title')}
  </Button>
</div>

{/* Pending Transfers Card */}
{pendingTransfers.length > 0 && (
  <Card className="mb-4">
    <CardHeader>
      <CardTitle className="text-sm">{t('transfer.pendingTransfers')}</CardTitle>
    </CardHeader>
    <CardContent>
      {/* List pending transfers with status badges */}
    </CardContent>
  </Card>
)}
```

---

### Step 5: i18n Keys

Add `transfer` namespace to `project-email` in all 9 locale files.

```json
{
  "transfer": {
    "title": "Transfer Domain",
    "pendingTransfers": "Pending Transfers",
    "checkEligibility": "Check Eligibility",
    "enterDomain": "Enter the domain you want to transfer",
    "domainPlaceholder": "example.com",
    "check": "Check",
    "eligible": "Eligible for Transfer",
    "notEligible": "Not Eligible",
    "currentRegistrar": "Current Registrar",
    "expiresAt": "Expires",
    "reasonPrefix": "Reason:",
    "continueToContact": "Continue",
    "contactDetails": "Contact Details",
    "contactDescription": "These details will be used for domain registration records.",
    "payment": "Payment",
    "paymentDescription": "Transfer fee includes 1 year extension.",
    "transferPrice": "Transfer Price",
    "yearExtension": "Includes 1 year extension",
    "proceedToPayment": "Proceed to Payment",
    "authCode": "Authorization Code",
    "authCodeDescription": "Enter the EPP/auth code from your current registrar.",
    "authCodePlaceholder": "Enter auth code",
    "authCodeHelp": "How to get your auth code",
    "optionalSettings": "Optional Settings",
    "nameservers": "Custom Nameservers",
    "nameserversPlaceholder": "ns1.example.com",
    "whoisPrivacy": "WHOIS Privacy",
    "startTransfer": "Start Transfer",
    "tracking": "Transfer Status",
    "trackingDescription": "Domain transfers typically complete in 5-7 days.",
    "checkStatus": "Check Status",
    "cancelTransfer": "Cancel Transfer",
    "cancelConfirm": "Are you sure you want to cancel this transfer?",
    "status": {
      "pending_payment": "Awaiting Payment",
      "pending": "Pending",
      "processing": "Processing",
      "completed": "Completed",
      "failed": "Failed",
      "cancelled": "Cancelled"
    },
    "errors": {
      "domainRequired": "Domain name is required",
      "authCodeRequired": "Auth code is required",
      "paymentRequired": "Payment is required",
      "transferFailed": "Transfer failed"
    },
    "success": "Transfer initiated successfully!"
  }
}
```

---

### Step 6: Stripe Payment Integration

The transfer flow requires Stripe PaymentIntent integration with **idempotency and resume support**.

**Critical Design: Idempotent + Resumable Payments**

Users will:
- Refresh the page mid-payment
- Retry after card failure
- Resume a `pending_payment` transfer later

The `transfer-payment` endpoint must handle all these cases gracefully.

**Required: New Payment Route for Transfers**

**File to create:** `src/app/api/inhouse/projects/[id]/transfer-payment/route.ts`

```typescript
// POST /api/inhouse/projects/[id]/transfer-payment
// Idempotent: returns existing PaymentIntent if one exists, creates new otherwise
// Body: { transferId } - that's all we need (pricing is on the transfer record)

export const POST = withProjectOwner(async (request, ctx) => {
  const { transferId } = await request.json()

  if (!transferId) {
    return NextResponse.json(
      { ok: false, error: { code: 'INVALID_REQUEST', message: 'transferId is required' } },
      { status: 400 }
    )
  }

  const result = await callWorker({
    method: 'POST',
    path: `/v1/inhouse/projects/${ctx.projectId}/transfer-payment`,
    body: { transferId },
    claims: { userId: ctx.userId },
  })

  return ctx.workerResponse(result)
})
```

**Backend Route (Worker):** Add to `inhouseDomainTransfer.ts`

```typescript
// POST /v1/inhouse/projects/:projectId/transfer-payment
// Idempotent PaymentIntent creation/retrieval
// Returns: { clientSecret, paymentIntentId }

fastify.post('/v1/inhouse/projects/:projectId/transfer-payment', async (request, reply) => {
  const { projectId } = request.params
  const { transferId } = request.body
  const userId = request.body.userId // from claims

  // 1. Get transfer (validates ownership + status)
  const transfer = await service.getTransfer(transferId)
  if (!transfer || transfer.projectId !== projectId) {
    return reply.status(404).send({ ok: false, error: 'Transfer not found' })
  }
  if (transfer.status !== 'pending_payment') {
    return reply.status(400).send({ ok: false, error: 'Transfer not in pending_payment status' })
  }

  // 2. If PaymentIntent already exists, reuse it
  if (transfer.stripePaymentIntentId) {
    const pi = await stripe.paymentIntents.retrieve(transfer.stripePaymentIntentId)
    // Handle expired/canceled PaymentIntents
    if (pi.status === 'canceled' || pi.status === 'succeeded') {
      // For succeeded, they should call transfer-confirm instead
      // For canceled, create a new one (fall through)
    } else {
      return reply.send({
        ok: true,
        data: { clientSecret: pi.client_secret, paymentIntentId: pi.id }
      })
    }
  }

  // 3. Create new PaymentIntent with idempotency key
  const pi = await stripe.paymentIntents.create(
    {
      amount: transfer.priceCents,
      currency: transfer.currency.toLowerCase(),
      metadata: {
        kind: 'domain_transfer_in',
        transferId,
        projectId,
        userId,
      },
    },
    { idempotencyKey: `domain-transfer:${transferId}` }
  )

  // 4. Store PaymentIntent ID on transfer record
  await service.attachPaymentIntent(projectId, transferId, pi.id)

  return reply.send({
    ok: true,
    data: { clientSecret: pi.client_secret, paymentIntentId: pi.id }
  })
})
```

**Key Points:**
- Only needs `transferId` in request body (pricing already on transfer record)
- Reuses existing PaymentIntent if present (safe refresh/retry)
- Uses `idempotencyKey: domain-transfer:${transferId}` for Stripe-level idempotency
- Handles expired/canceled PaymentIntents by creating new ones

**Frontend Integration:**

```typescript
// In DomainTransferWizard payment step
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'

// 1. Call transfer-payment (idempotent - safe to retry)
const { clientSecret, paymentIntentId } = await createTransferPayment({ transferId })

// 2. Render Elements with the clientSecret
<Elements stripe={stripePromise} options={{ clientSecret }}>
  <PaymentForm />
</Elements>

// 3. On form submit, confirm payment
const { paymentIntent, error } = await stripe.confirmPayment({
  elements,
  confirmParams: { return_url: `${origin}/project/${projectId}/email?transfer=${transferId}` },
  redirect: 'if_required',
})

// 4. If succeeded, proceed to auth code step
// (transfer-confirm will be called after user enters auth code)
```

**Dependencies:** ✅ Already installed
- `@stripe/stripe-js` v7.9.0
- `@stripe/react-stripe-js` v3.9.2
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env var (verify exists)

---

## File Summary

### New Files (Frontend)

| File | Purpose |
|------|---------|
| `src/app/api/inhouse/projects/[id]/transfer-check/route.ts` | Check eligibility proxy |
| `src/app/api/inhouse/projects/[id]/transfer-intent/route.ts` | Create intent proxy |
| `src/app/api/inhouse/projects/[id]/transfer-confirm/route.ts` | Confirm transfer proxy |
| `src/app/api/inhouse/projects/[id]/transfer-payment/route.ts` | Create Stripe PaymentIntent proxy |
| `src/app/api/inhouse/projects/[id]/transfers/route.ts` | List transfers proxy |
| `src/app/api/inhouse/projects/[id]/transfers/[transferId]/route.ts` | Get transfer proxy |
| `src/app/api/inhouse/projects/[id]/transfers/[transferId]/cancel/route.ts` | Cancel transfer proxy |
| `src/app/api/inhouse/projects/[id]/transfers/[transferId]/poll-status/route.ts` | Poll status proxy |
| `src/hooks/use-domain-transfers.ts` | React Query hooks for transfers |
| `src/components/project/email/DomainTransferWizard.tsx` | Multi-step transfer wizard |

### New Files (Backend - Worker)

| File | Purpose |
|------|---------|
| `sheenapps-claude-worker/src/routes/inhouseDomainTransfer.ts` | Add `POST /transfer-payment` endpoint |

### Modified Files

| File | Change |
|------|--------|
| `src/lib/query-keys.ts` | Add `transfers`, `transfer`, `allTransfers` keys |
| `src/components/project/email/EmailDomains.tsx` | Add transfer button + pending transfers card |
| `messages/*.json` (9 files) | Add `transfer` namespace to `project-email` |

---

## Implementation Order

1. **Backend: Payment endpoint** - Add `POST /transfer-payment` to worker (creates Stripe PaymentIntent)
2. **API Routes** (8 files including transfer-payment) - Unblocks all frontend work
3. **Query Keys** - Required by hooks
4. **Hooks** (`use-domain-transfers.ts`) - Data layer
5. **i18n Keys** (9 locale files) - Required by components
6. **DomainTransferWizard** - Core component with Stripe Elements integration
7. **EmailDomains Integration** - Entry point + pending transfers display

**Critical Path:** Steps 1-2 are backend/API work. Steps 3-7 are pure frontend.

---

## Resolved Questions

### 1. Payment Flow ✅ RESOLVED

**Finding:** The `transfer-intent` endpoint does NOT create a Stripe PaymentIntent. Per the service code comment:

> "Stripe payment intent should be created by caller using billing service"

**Required flow:**
1. Call `transfer-intent` → get `transferId` + `priceCents` + `currency`
2. Create Stripe PaymentIntent separately (via billing routes or frontend SDK) with metadata:
   ```json
   {
     "kind": "domain_transfer_in",
     "transferId": "<transferId>",
     "projectId": "<projectId>",
     "userId": "<userId>"
   }
   ```
3. User completes payment via Stripe Elements
4. Call `transfer-confirm` with `stripePaymentIntentId` + auth code

**Backend enforces:**
- PaymentIntent status must be `succeeded`
- PaymentIntent metadata must match (kind, transferId, projectId, userId)

**Frontend implementation:** Need to either:
- Use existing billing route to create PaymentIntent
- Or use Stripe SDK directly from frontend (requires publishable key)

### 2. User Email ✅ RESOLVED

The `transfer-intent` endpoint requires `userEmail`. This should be:
- Fetched from Supabase auth session (`user.email`)
- Passed from the authenticated context in the wizard component

### 3. Polling Interval

For the tracking step, should we auto-poll transfer status?
- Current pattern: Manual "Check Status" button
- Alternative: Auto-poll every 30s while on tracking step

**Recommendation:** Start with manual polling, add auto-poll later if UX demands it.

---

## Security Considerations

1. **All routes use `withProjectOwner`** - Ownership verified before any operation
2. **Auth code only submitted after payment** - Backend validates PaymentIntent status before accepting auth code
3. **Auth code never stored in plaintext** - Backend stores SHA-256 hash for audit
4. **Cancel only works for pending states** - Backend prevents canceling in-progress transfers

---

---

## Expert Review Improvements Applied

The following improvements were incorporated from expert review:

### 1. Idempotent + Resumable Payments ✅
- `transfer-payment` endpoint reuses existing PaymentIntent if present
- Uses Stripe idempotency key: `domain-transfer:${transferId}`
- Handles expired/canceled PaymentIntents gracefully
- Only needs `transferId` in request (pricing already on transfer record)

### 2. Domain Normalization ✅
- UI normalizes domain input: `domain.trim().toLowerCase()`
- Applied in `useCheckTransferEligibility` and `useCreateTransferIntent`
- Worker remains authoritative for validation

### 3. Querystring Construction Fix ✅
- Fixed `?&` glitch in `useDomainTransfers`
- Pattern: `${qs ? `?${qs}&` : '?'}_t=${Date.now()}`

### 4. Resume from pending_payment ✅
- Wizard accepts `existingTransferId` prop
- Fetches existing transfer and jumps to appropriate step
- EmailDomains shows "Resume Transfer" button for pending transfers

### 5. Items NOT Adopted
- **Zod validation in proxy routes**: Existing routes don't use Zod. Keeping consistent with codebase patterns. Worker validates.

---

## Related Documents

- [easy-mode-email-enhancements-plan.md](./easy-mode-email-enhancements-plan.md) - Backend implementation
- [easy-mode-email-user-frontend-plan.md](./easy-mode-email-user-frontend-plan.md) - Existing user frontend patterns

---

## Implementation Progress

### Completed (2026-01-28)

| Step | Status | Notes |
|------|--------|-------|
| Backend: `attachPaymentIntent` method | ✅ Done | Added to `InhouseDomainTransferService.ts` |
| Backend: `POST /transfer-payment` route | ✅ Done | Added to `inhouseDomainTransfer.ts` - idempotent Stripe PaymentIntent creation |

### In Progress

| Step | Status | Notes |
|------|--------|-------|
| API Routes (8 files) | ⏳ Pending | Next step - use `withProjectOwner` pattern |
| Query Keys | ⏳ Pending | |
| Hooks (`use-domain-transfers.ts`) | ⏳ Pending | |
| i18n Keys (9 locale files) | ⏳ Pending | |
| `DomainTransferWizard` component | ⏳ Pending | |
| EmailDomains integration | ⏳ Pending | |

### Notes / Discoveries

- Existing routes use `withProjectOwner` helper which reduces each route to ~10 lines
- The `transfer-payment` endpoint is idempotent: if PaymentIntent already exists and is valid, it returns it; otherwise creates new one
- Uses Stripe idempotency key: `domain-transfer:${transferId}` to prevent duplicate charges
