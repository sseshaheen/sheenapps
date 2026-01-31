/**
 * In-House Services Index
 *
 * Central export for all Easy Mode / In-House infrastructure services.
 */

export { InhouseGatewayService } from './InhouseGatewayService'
export { InhouseDeploymentService, getInhouseDeploymentService } from './InhouseDeploymentService'
export { InhouseProjectService, getInhouseProjectService } from './InhouseProjectService'
export { InhouseAuthService } from './InhouseAuthService'
export { InhouseCmsService } from './InhouseCmsService'
export { InhouseStorageService, getInhouseStorageService } from './InhouseStorageService'
export { InhouseJobsService, getInhouseJobsService } from './InhouseJobsService'
export { InhouseMeteringService, getInhouseMeteringService } from './InhouseMeteringService'
export { InhouseEmailService, getInhouseEmailService } from './InhouseEmailService'
export { InhousePaymentsService, createInhousePaymentsService } from './InhousePaymentsService'
export { InhouseAnalyticsService, getInhouseAnalyticsService } from './InhouseAnalyticsService'
export { InhouseSecretsService, getInhouseSecretsService } from './InhouseSecretsService'
export { InhouseBackupService, getInhouseBackupService } from './InhouseBackupService'
export { InhouseRestoreService, getInhouseRestoreService } from './InhouseRestoreService'
export { InhouseFlagsService, getInhouseFlagsService } from './InhouseFlagsService'
export {
  InhouseActivityLoggerService,
  getInhouseActivityLogger,
  logActivity,
  logActivityAsync,
  startActivityTimer,
} from './InhouseActivityLogger'

export { InhouseAIService, getInhouseAIService } from './InhouseAIService'

export { InhouseRealtimeService, getInhouseRealtimeService } from './InhouseRealtimeService'

export { InhouseNotificationsService, getInhouseNotificationsService } from './InhouseNotificationsService'

export { InhouseFormsService, getInhouseFormsService } from './InhouseFormsService'

export { InhouseSearchService, getInhouseSearchService } from './InhouseSearchService'

export { InhouseDomainsService, getInhouseDomainsService } from './InhouseDomainsService'

export {
  DnsVerificationService,
  getDnsVerificationService,
  generateVerificationToken,
} from './DnsVerificationService'

export {
  CloudflareService,
  getCloudflareService,
  isCloudflareConfigured,
} from './CloudflareService'

export {
  EMAIL_DNS,
  RESEND_SPF_INCLUDE,
  RESEND_SPF_RECORD,
  RESEND_MX_TARGET,
  RESEND_RETURN_PATH_TARGET,
  RESEND_DKIM_SELECTORS,
  OPENSRS_EMAIL_DNS,
  spfIncludesResend,
  parseOwnershipValue,
  isValidVerificationToken,
} from './emailDnsConstants'

// Re-export types
export type {
  QueryContract,
  QueryResponse,
  QueryError,
  GatewayContext,
  TableMetadata,
  ColumnMetadata,
  ApiKeyValidation,
  RateLimitResult,
  QuotaCheckResult,
} from '../../types/inhouseGateway'

export type {
  DeploymentConfig,
  DeploymentResult,
  BuildAsset,
  ServerBundle,
} from './InhouseDeploymentService'

export type {
  CreateEasyModeProjectInput,
  EasyModeProject,
  CreateTableInput,
} from './InhouseProjectService'

export type {
  SignedUploadOptions,
  SignedUploadResult,
  SignedDownloadOptions,
  SignedDownloadResult,
  ListFilesOptions,
  FileMetadata,
  ListFilesResult,
  DeleteFilesResult,
} from './InhouseStorageService'

export type {
  EnqueueJobOptions,
  JobInfo,
  ListJobsOptions,
  ListJobsResult,
  ScheduleOptions,
  ScheduleInfo,
  UpdateScheduleOptions,
} from './InhouseJobsService'

export type {
  MetricName,
  UsageRecord,
  QuotaCheckResult as MeteringQuotaCheckResult,
  PlanLimits,
} from './InhouseMeteringService'

export type {
  SendEmailOptions,
  EmailResult,
  EmailInfo,
  ListEmailsOptions,
  ListEmailsResult,
} from './InhouseEmailService'

export { InhouseInboxService, getInhouseInboxService, resolveProjectFromRecipient } from './InhouseInboxService'

export type {
  InboxConfig,
  InboxMessage,
  InboxThread,
  InboxAlias,
  AttachmentMeta,
  ReceiveMessageInput,
  ReceiveMessageResult,
  ListMessagesOptions,
  ListMessagesResult,
  ListThreadsOptions,
  ListThreadsResult,
  UpdateConfigInput,
} from './InhouseInboxService'

export type {
  PaymentClientConfig,
  CreateCheckoutParams,
  CreatePortalParams,
  CreateCustomerParams,
  GetSubscriptionParams,
  CancelSubscriptionParams,
  WebhookEventResult,
  CheckoutSession,
  Customer,
  Subscription,
  PortalSession,
  PaymentEvent,
} from './InhousePaymentsService'

export type {
  TrackEventInput,
  PageViewInput,
  IdentifyInput,
  EventContext,
  AnalyticsEvent,
  ListEventsOptions,
  ListEventsResult,
  EventCounts,
  GetCountsOptions,
} from './InhouseAnalyticsService'

export type {
  CreateBackupOptions,
  BackupMetadata,
  ListBackupsOptions,
  ListBackupsResult,
} from './InhouseBackupService'

export type {
  RestoreStatus,
  InitiatedByType,
  RestoreMetadata,
  ValidationResults,
  RestoreStatusResult,
} from './InhouseRestoreService'

export type {
  ActivityLogEntry,
  ActivityService,
  ActivityStatus,
  ActorType,
  ActivityTimer,
} from './InhouseActivityLogger'

export type {
  AIProvider,
  MessageRole,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatStreamChunk,
  EmbedOptions,
  EmbedResponse,
  ImageOptions,
  ImageResponse,
  GeneratedImage,
  AIUsageStats,
  AIUsageOptions,
  AIResult,
} from './InhouseAIService'

export type {
  ChannelInfo,
  PublishOptions,
  PresenceMember,
  ChannelHistory,
  AuthTokenResult,
  RealtimeResult,
  RealtimeStats,
} from './InhouseRealtimeService'

export type {
  NotificationChannel,
  ChannelConfig,
  SendNotificationOptions,
  NotificationDelivery,
  SentNotification,
  NotificationTemplate,
  CreateTemplateOptions,
  UserPreferences,
  UpdatePreferencesOptions,
  ListNotificationsOptions,
  ListNotificationsResult,
  NotificationStats,
} from './InhouseNotificationsService'

export type {
  FieldType,
  FieldSchema,
  FormSettings,
  FormSchema,
  SubmissionStatus,
  FormSubmission,
  CreateFormInput,
  UpdateFormInput,
  SubmitFormInput,
  ListSubmissionsOptions,
  ListFormsOptions,
  BulkUpdateInput,
  FormStats,
  ExportOptions,
} from './InhouseFormsService'

export type {
  FieldWeight,
  IndexSettings,
  SearchIndex,
  SearchDocument,
  CreateIndexInput,
  UpdateIndexInput,
  IndexDocumentInput,
  QueryOptions,
  SearchHit,
  QueryResult,
  SuggestOptions,
  SuggestResult,
  SearchStats,
} from './InhouseSearchService'

export type {
  AuthorityLevel,
  DomainStatus,
  EmailDomain,
  AddDomainInput,
  AddDomainResult,
  VerifyDomainResult,
  SubdomainDelegationResult,
  NameserverSwitchResult,
  NameserverSwitchPreview,
  CloudflareDelegationStatus,
} from './InhouseDomainsService'

export type {
  DnsRecordStatus,
  DnsVerificationStatus,
  DnsRecord,
  DnsInstructions,
  ScannedDnsRecord,
  DnsScanResult,
  KnownRegistrar,
  RegistrarDetectionResult,
} from './DnsVerificationService'

export type {
  DnsRecordType as CloudflareDnsRecordType,
  CloudflareZone,
  CloudflareDnsRecord,
  CreateZoneInput,
  CreateDnsRecordInput,
  UpdateDnsRecordInput,
  EmailDnsRecordSet,
} from './CloudflareService'

export {
  OpenSrsService,
  getOpenSrsService,
  isOpenSrsConfigured,
} from './OpenSrsService'

export {
  OpenSrsEmailService,
  getOpenSrsEmailService,
  isOpenSrsEmailConfigured,
} from './OpenSrsEmailService'

export type {
  OmaApiResponse,
  OmaDomainInfo,
  OmaUserInfo,
  OmaCreateUserInput,
  OmaUpdateUserInput,
} from './OpenSrsEmailService'

export { InhouseMailboxService, getInhouseMailboxService } from './InhouseMailboxService'

export type {
  Mailbox,
  CreateMailboxInput as MailboxCreateInput,
  UpdateMailboxInput as MailboxUpdateInput,
  MailboxClientConfig,
  EnableMailboxesResult,
  MailboxDnsReadinessResult,
} from './InhouseMailboxService'

export type {
  MailboxEngineAdapter,
  MailboxProviderInfo,
  MailboxInfo,
  SsoTokenResult,
  CreateMailboxInput as AdapterCreateMailboxInput,
  CreateMailboxResult as AdapterCreateMailboxResult,
  UpdateMailboxInput as AdapterUpdateMailboxInput,
} from './adapters/MailboxEngineAdapter'

export { OpenSrsEmailAdapter, getOpenSrsEmailAdapter } from './adapters/OpenSrsEmailAdapter'

export type {
  DomainContact,
  DomainSearchResult,
  DomainAvailability,
  DomainPricing,
  DomainRegistrationInput,
  DomainRegistrationResult,
  DomainRenewalResult,
  DomainInfo,
  AuthCodeResult,
  NameserverUpdateResult,
} from './OpenSrsService'

export {
  InhouseDomainRegistrationService,
  getInhouseDomainRegistrationService,
} from './InhouseDomainRegistrationService'

export type {
  DomainSearchInput,
  DomainSearchResponse,
  DomainPurchaseInput,
  DomainPurchaseResult,
  DomainRenewalInput,
  DomainRenewalResult as DomainRegistrationRenewalResult,
  RegisteredDomain,
  DomainEvent,
  TldPricingInfo,
} from './InhouseDomainRegistrationService'

export {
  DomainBillingService,
  getDomainBillingService,
  isDomainBillingConfigured,
} from './DomainBillingService'

export type {
  DomainPaymentInput,
  DomainPaymentResult,
  SetupIntentInput,
  SetupIntentResult,
  SavedPaymentMethod,
  DomainInvoice,
} from './DomainBillingService'

export {
  checkDomainSearchRateLimit,
  parseClientIp,
} from './DomainSearchRateLimiter'

export type {
  RateLimitResult as DomainSearchRateLimitResult,
  DomainSearchRateLimitConfig,
} from './DomainSearchRateLimiter'
