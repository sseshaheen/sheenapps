-- -------------------------------------------------------------
-- TablePlus 6.4.8(608)
--
-- https://tableplus.com/
--
-- Database: postgres
-- Generation Time: 2025-06-29 06:32:18.5510
-- -------------------------------------------------------------


DROP VIEW IF EXISTS "public"."quota_failures_realtime";


DROP VIEW IF EXISTS "public"."quota_usage_spikes";


DROP VIEW IF EXISTS "public"."quota_concurrent_attempts";


DROP VIEW IF EXISTS "public"."quota_high_denial_users";


DROP VIEW IF EXISTS "public"."quota_collision_analysis";


DROP TABLE IF EXISTS "public"."projects";
-- Table Definition
CREATE TABLE "public"."projects" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "owner_id" uuid,
    "name" text NOT NULL,
    "subdomain" text,
    "config" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "archived_at" timestamptz,
    "last_accessed_at" timestamptz,
    "thumbnail_url" text,
    PRIMARY KEY ("id")
);

-- Column Comment
COMMENT ON COLUMN "public"."projects"."archived_at" IS 'Timestamp when project was archived (NULL = active)';
COMMENT ON COLUMN "public"."projects"."last_accessed_at" IS 'Last time project was opened in builder';
COMMENT ON COLUMN "public"."projects"."thumbnail_url" IS 'URL to project thumbnail image for dashboard cards';

DROP TABLE IF EXISTS "public"."branches";
-- Table Definition
CREATE TABLE "public"."branches" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "project_id" uuid,
    "name" text NOT NULL DEFAULT 'main'::text,
    "head_id" uuid,
    "is_published" bool DEFAULT false,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."commits";
-- Table Definition
CREATE TABLE "public"."commits" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "project_id" uuid,
    "author_id" uuid,
    "parent_ids" _uuid NOT NULL DEFAULT '{}'::uuid[],
    "tree_hash" text NOT NULL,
    "message" text,
    "payload_size" int4 DEFAULT 0 CHECK (payload_size <= 256000),
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."assets";
-- Table Definition
CREATE TABLE "public"."assets" (
    "hash" text NOT NULL,
    "project_id" uuid,
    "mime_type" text,
    "size" int8,
    "uploaded_at" timestamptz DEFAULT now(),
    "uploader_id" uuid,
    PRIMARY KEY ("hash")
);

DROP TABLE IF EXISTS "public"."storage_audit_log";
-- Table Definition
CREATE TABLE "public"."storage_audit_log" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "bucket_id" text NOT NULL,
    "object_name" text NOT NULL,
    "operation" text NOT NULL,
    "user_id" uuid,
    "ip_address" inet,
    "user_agent" text,
    "created_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."project_collaborators";
-- Table Definition
CREATE TABLE "public"."project_collaborators" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "role" text NOT NULL DEFAULT 'viewer'::text CHECK (role = ANY (ARRAY['owner'::text, 'admin'::text, 'editor'::text, 'viewer'::text])),
    "invited_by" uuid,
    "invited_at" timestamptz DEFAULT now(),
    "accepted_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."currencies";
-- Table Definition
CREATE TABLE "public"."currencies" (
    "code" bpchar(3) NOT NULL,
    "name" text NOT NULL,
    "stripe_enabled" bool DEFAULT true,
    PRIMARY KEY ("code")
);

DROP TABLE IF EXISTS "public"."customers";
-- Table Definition
CREATE TABLE "public"."customers" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "stripe_customer_id" varchar(255) NOT NULL,
    "email" text NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."subscriptions";
DROP TYPE IF EXISTS "public"."subscription_status";
CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'paused', 'trialing', 'unpaid');

-- Table Definition
CREATE TABLE "public"."subscriptions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" uuid NOT NULL,
    "stripe_subscription_id" varchar(255) NOT NULL,
    "stripe_price_id" varchar(255) NOT NULL,
    "plan_name" text NOT NULL CHECK (plan_name = ANY (ARRAY['free'::text, 'starter'::text, 'growth'::text, 'scale'::text])),
    "status" "public"."subscription_status" NOT NULL,
    "current_period_start" timestamptz NOT NULL,
    "current_period_end" timestamptz NOT NULL,
    "cancel_at_period_end" bool DEFAULT false,
    "canceled_at" timestamptz,
    "trial_start" timestamptz,
    "trial_end" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "currency" bpchar(3) NOT NULL DEFAULT 'USD'::bpchar,
    "organization_id" uuid,
    "is_trial" bool DEFAULT false,
    "is_paused" bool DEFAULT false,
    "pause_reason" varchar(255),
    "resume_at" timestamptz,
    "tax_rate_id" varchar(255),
    "tax_percentage" numeric(5,2),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."payments";
DROP TYPE IF EXISTS "public"."payment_status";
CREATE TYPE "public"."payment_status" AS ENUM ('succeeded', 'pending', 'failed', 'refunded', 'partially_refunded');

-- Table Definition
CREATE TABLE "public"."payments" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "customer_id" uuid NOT NULL,
    "stripe_payment_intent_id" varchar(255) NOT NULL,
    "amount" int8 NOT NULL CHECK (amount >= 0),
    "currency" text NOT NULL DEFAULT 'usd'::text,
    "status" "public"."payment_status" NOT NULL,
    "description" text,
    "created_at" timestamptz DEFAULT now(),
    "exchange_rate" numeric(18,9) DEFAULT 1,
    "amount_usd" int8,
    "stripe_invoice_id" varchar(255),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."plan_limits";
-- Table Definition
CREATE TABLE "public"."plan_limits" (
    "plan_name" text NOT NULL CHECK (plan_name = ANY (ARRAY['free'::text, 'starter'::text, 'growth'::text, 'scale'::text])),
    "max_projects" int4 NOT NULL,
    "max_ai_generations_per_month" int4 NOT NULL,
    "max_exports_per_month" int4 NOT NULL,
    "max_storage_mb" int4 NOT NULL,
    "features" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("plan_name")
);

DROP TABLE IF EXISTS "public"."usage_tracking";
-- Table Definition
CREATE TABLE "public"."usage_tracking" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "metric_name" text NOT NULL CHECK (metric_name = ANY (ARRAY['projects_created'::text, 'ai_generations'::text, 'exports'::text, 'storage_mb'::text])),
    "metric_value" int4 NOT NULL DEFAULT 0,
    "period_start" timestamptz NOT NULL,
    "period_end" timestamptz NOT NULL,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    "usage_amount" int4 DEFAULT 0,
    PRIMARY KEY ("user_id","period_start")
);

DROP TABLE IF EXISTS "public"."invoices";
-- Table Definition
CREATE TABLE "public"."invoices" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "stripe_invoice_id" varchar(255) NOT NULL,
    "customer_id" uuid NOT NULL,
    "subscription_id" uuid,
    "amount_paid" int8 NOT NULL CHECK (amount_paid >= 0),
    "amount_due" int8 NOT NULL CHECK (amount_due >= 0),
    "currency" bpchar(3) NOT NULL DEFAULT 'USD'::bpchar,
    "exchange_rate" numeric(18,9) DEFAULT 1,
    "amount_paid_usd" int8,
    "status" text NOT NULL,
    "invoice_pdf" text,
    "hosted_invoice_url" text,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."subscription_history";
DROP TYPE IF EXISTS "public"."subscription_status";
CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'paused', 'trialing', 'unpaid');
DROP TYPE IF EXISTS "public"."subscription_status";
CREATE TYPE "public"."subscription_status" AS ENUM ('active', 'canceled', 'incomplete', 'incomplete_expired', 'past_due', 'paused', 'trialing', 'unpaid');

-- Table Definition
CREATE TABLE "public"."subscription_history" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "subscription_id" uuid NOT NULL,
    "action" text NOT NULL CHECK (action = ANY (ARRAY['created'::text, 'updated'::text, 'canceled'::text, 'reactivated'::text])),
    "old_status" "public"."subscription_status",
    "new_status" "public"."subscription_status",
    "old_plan_name" text,
    "new_plan_name" text,
    "metadata" jsonb,
    "created_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."transactions";
-- Table Definition
CREATE TABLE "public"."transactions" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "gateway" varchar(50) NOT NULL,
    "gateway_transaction_id" varchar(255) NOT NULL,
    "status" varchar(50) NOT NULL,
    "amount_cents" int4 NOT NULL,
    "currency" varchar(3) NOT NULL,
    "plan_name" varchar(50),
    "product_type" varchar(50) NOT NULL,
    "transaction_date" timestamptz NOT NULL DEFAULT now(),
    "country" varchar(2),
    "utm_source" varchar(255),
    "utm_medium" varchar(255),
    "utm_campaign" varchar(255),
    "utm_content" varchar(255),
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Column Comment
COMMENT ON COLUMN "public"."transactions"."gateway" IS 'Payment gateway identifier (stripe, cashier, paypal, etc)';
COMMENT ON COLUMN "public"."transactions"."product_type" IS 'Type of product (subscription, one-time, bonus)';

DROP TABLE IF EXISTS "public"."webhook_dead_letter";
-- Table Definition
CREATE TABLE "public"."webhook_dead_letter" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "gateway" varchar(50) NOT NULL,
    "event_type" varchar(100) NOT NULL,
    "payload" jsonb NOT NULL,
    "error_message" text,
    "retry_count" int4 DEFAULT 0,
    "max_retries" int4 DEFAULT 3,
    "retry_history" _jsonb DEFAULT ARRAY[]::jsonb[],
    "created_at" timestamptz DEFAULT now(),
    "last_retry_at" timestamptz,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."usage_bonuses";
-- Table Definition
CREATE TABLE "public"."usage_bonuses" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "metric" varchar(50) NOT NULL,
    "amount" int4 NOT NULL,
    "reason" varchar(100) NOT NULL,
    "expires_at" timestamptz,
    "consumed" int4 DEFAULT 0,
    "redeemed_at" timestamptz,
    "expiry_notified" bool DEFAULT false,
    "archived" bool DEFAULT false,
    "archived_at" timestamptz,
    "created_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

-- Column Comment
COMMENT ON COLUMN "public"."usage_bonuses"."reason" IS 'Reason for bonus grant (signup, referral, social_share, profile_complete)';

DROP TABLE IF EXISTS "public"."referrals";
-- Table Definition
CREATE TABLE "public"."referrals" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "referrer_user_id" uuid NOT NULL,
    "referred_user_id" uuid,
    "referral_code" varchar(50) NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'pending'::character varying,
    "converted_at" timestamptz,
    "conversion_plan" varchar(50),
    "referrer_bonus_granted" bool DEFAULT false,
    "created_at" timestamptz DEFAULT now(),
    "expires_at" timestamptz DEFAULT (now() + '30 days'::interval),
    PRIMARY KEY ("id")
);

-- Column Comment
COMMENT ON COLUMN "public"."referrals"."status" IS 'Referral status (pending, converted, expired)';

DROP TABLE IF EXISTS "public"."organizations";
-- Table Definition
CREATE TABLE "public"."organizations" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "name" varchar(255) NOT NULL,
    "slug" varchar(255),
    "owner_id" uuid NOT NULL,
    "settings" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT now(),
    "updated_at" timestamptz DEFAULT now(),
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."organization_members";
-- Table Definition
CREATE TABLE "public"."organization_members" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" uuid,
    "user_id" uuid,
    "role" varchar(50) DEFAULT 'member'::character varying,
    "invited_by" uuid,
    "invited_at" timestamptz DEFAULT now(),
    "joined_at" timestamptz,
    PRIMARY KEY ("id")
);

-- Column Comment
COMMENT ON COLUMN "public"."organization_members"."role" IS 'Member role (owner, admin, member, viewer)';

DROP TABLE IF EXISTS "public"."organization_usage";
-- Table Definition
CREATE TABLE "public"."organization_usage" (
    "organization_id" uuid NOT NULL,
    "period_start" timestamptz NOT NULL,
    "metric_name" varchar(50) NOT NULL,
    "metric_value" int4,
    PRIMARY KEY ("organization_id","period_start","metric_name")
);

DROP TABLE IF EXISTS "public"."usage_events";
-- Table Definition
CREATE TABLE "public"."usage_events" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "metric" text NOT NULL,
    "amount" int4 NOT NULL DEFAULT 1,
    "idempotency_key" text,
    "metadata" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    "collision_detected" bool DEFAULT false,
    "collision_metadata" jsonb DEFAULT '{}'::jsonb,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."user_bonuses";
-- Table Definition
CREATE TABLE "public"."user_bonuses" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "metric" text NOT NULL,
    "amount" int4 NOT NULL,
    "used_amount" int4 NOT NULL DEFAULT 0,
    "reason" text,
    "expires_at" timestamptz,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    "updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."export_logs";
-- Table Definition
CREATE TABLE "public"."export_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "project_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "format" text NOT NULL,
    "exported_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."quota_audit_log";
-- Table Definition
CREATE TABLE "public"."quota_audit_log" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "metric" text NOT NULL,
    "attempted_amount" int4 NOT NULL,
    "success" bool NOT NULL,
    "reason" text NOT NULL,
    "context" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."quota_audit_logs";
-- Table Definition
CREATE TABLE "public"."quota_audit_logs" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "event_type" text NOT NULL,
    "user_id" uuid NOT NULL,
    "metric" text NOT NULL,
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."admin_alerts";
-- Table Definition
CREATE TABLE "public"."admin_alerts" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "type" text NOT NULL,
    "severity" text NOT NULL CHECK (severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text, 'critical'::text])),
    "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "acknowledged" bool DEFAULT false,
    "acknowledged_by" uuid,
    "acknowledged_at" timestamptz,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."quota_rate_limits";
-- Table Definition
CREATE TABLE "public"."quota_rate_limits" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "identifier" text NOT NULL,
    "identifier_type" text NOT NULL CHECK (identifier_type = ANY (ARRAY['ip'::text, 'user'::text])),
    "request_count" int4 NOT NULL DEFAULT 1,
    "window_start" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

DROP TABLE IF EXISTS "public"."plan_change_log";
-- Table Definition
CREATE TABLE "public"."plan_change_log" (
    "id" uuid NOT NULL DEFAULT gen_random_uuid(),
    "user_id" uuid NOT NULL,
    "old_plan" text,
    "new_plan" text NOT NULL,
    "change_reason" text,
    "effective_date" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usage_preserved" jsonb DEFAULT '{}'::jsonb,
    "created_at" timestamptz DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("id")
);

INSERT INTO "public"."projects" ("id", "owner_id", "name", "subdomain", "config", "created_at", "updated_at", "archived_at", "last_accessed_at", "thumbnail_url") VALUES
('0f8361df-f96c-475a-8d1f-949f329e15b3', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'Booking System', 'booking-system-2i4m76', '{"content": {}, "archived": true, "archived_at": "2025-06-26T21:06:52.823Z", "description": "I need a booking app for my salon", "businessIdea": "I need a booking app for my salon"}', '2025-06-26 08:29:23.101915+00', '2025-06-26 21:06:53.318361+00', NULL, NULL, NULL),
('59965005-3db4-442a-8e2e-ea58c39faf7f', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'Booking System old4', 'booking-system-6skoms', '{"content": {}, "archived": true, "archived_at": "2025-06-26T21:05:45.301Z", "description": "I need a booking app for my salon", "businessIdea": "I need a booking app for my salon"}', '2025-06-21 23:56:55.150508+00', '2025-06-26 21:05:46.036838+00', NULL, NULL, NULL),
('6bbfd6e5-d363-4750-ae84-78a6cddbff20', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'Untitled Project [TEST]', 'untitled-project-p7nobo', '{"content": {}, "archived": true, "archived_at": "2025-06-26T18:26:53.773Z"}', '2025-06-24 04:26:13.618066+00', '2025-06-26 18:26:55.458598+00', NULL, NULL, NULL),
('9d01e4ea-99e8-4aed-b7c0-4fe33ccd857d', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'Booking System', 'booking-system-kwre9c', '{"content": {}, "description": "I need a booking app for my salon", "businessIdea": "I need a booking app for my salon"}', '2025-06-26 22:53:54.03375+00', '2025-06-26 22:53:54.03375+00', NULL, NULL, NULL),
('ade6fff0-950d-4515-8604-63297800873a', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'Booking System', 'booking-system-aiy8sw', '{"content": {}, "description": "I need a booking app for my salon", "businessIdea": "I need a booking app for my salon"}', '2025-06-21 20:13:04.686405+00', '2025-06-21 20:13:04.686405+00', NULL, NULL, NULL),
('bc51a814-fe40-4942-bb74-ec7dc45db712', 'cdd4830d-2e42-489e-a633-ab9fc2263aeb', 'Booking System', 'booking-system-kdoeyk', '{"content": {}, "description": "I need a booking app for my salon", "businessIdea": "I need a booking app for my salon"}', '2025-06-21 20:16:22.511124+00', '2025-06-21 20:16:22.511124+00', NULL, NULL, NULL),
('bef9b528-6f9f-4373-a86b-b43d8e1827c9', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'Booking System latest', 'booking-system-wf2gbh', '{"content": {}, "description": "I need a booking app for my salon", "businessIdea": "I need a booking app for my salon"}', '2025-06-23 22:58:34.751907+00', '2025-06-26 21:06:48.598759+00', NULL, NULL, NULL);

INSERT INTO "public"."branches" ("id", "project_id", "name", "head_id", "is_published", "created_at", "updated_at") VALUES
('14817e3d-e806-428a-bb60-0f0a7d066281', 'bef9b528-6f9f-4373-a86b-b43d8e1827c9', 'main', NULL, 'f', '2025-06-23 22:58:35.125744+00', '2025-06-23 22:58:35.125744+00'),
('5fdf7f94-845a-4033-a5ac-457ef07a9a0e', 'ade6fff0-950d-4515-8604-63297800873a', 'main', NULL, 'f', '2025-06-21 20:13:04.97073+00', '2025-06-21 20:13:04.97073+00'),
('63af1080-6d6a-40cb-b60a-0e0883d9b65b', '59965005-3db4-442a-8e2e-ea58c39faf7f', 'main', NULL, 'f', '2025-06-21 23:56:55.441568+00', '2025-06-21 23:56:55.441568+00'),
('9ca1c619-6192-43dd-8703-332e964d7e0f', 'bc51a814-fe40-4942-bb74-ec7dc45db712', 'main', NULL, 'f', '2025-06-21 20:16:22.903805+00', '2025-06-21 20:16:22.903805+00'),
('b8f24ad3-4379-41ef-b986-4b0b616a92b1', '9d01e4ea-99e8-4aed-b7c0-4fe33ccd857d', 'main', NULL, 'f', '2025-06-26 22:53:54.490378+00', '2025-06-26 22:53:54.490378+00'),
('caa79bea-8427-40a7-adc4-036f1302935d', '6bbfd6e5-d363-4750-ae84-78a6cddbff20', 'main', NULL, 'f', '2025-06-24 04:26:13.953462+00', '2025-06-24 04:26:13.953462+00'),
('f43cc792-8fb5-41e9-ba2d-5987e47af4d2', '0f8361df-f96c-475a-8d1f-949f329e15b3', 'main', NULL, 'f', '2025-06-26 08:29:23.578382+00', '2025-06-26 08:29:23.578382+00');

INSERT INTO "public"."project_collaborators" ("id", "project_id", "user_id", "role", "invited_by", "invited_at", "accepted_at", "created_at", "updated_at") VALUES
('1b4340fb-c6ac-47b6-94a5-eef078caf66b', '0f8361df-f96c-475a-8d1f-949f329e15b3', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'owner', NULL, '2025-06-26 08:29:23.101915+00', '2025-06-26 08:29:23.101915+00', '2025-06-26 08:29:23.101915+00', '2025-06-26 08:29:23.101915+00'),
('2ea7c1ea-4c90-43de-8aa4-baba291ff5aa', '59965005-3db4-442a-8e2e-ea58c39faf7f', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'owner', NULL, '2025-06-21 23:56:55.150508+00', '2025-06-21 23:56:55.150508+00', '2025-06-21 23:56:55.150508+00', '2025-06-21 23:56:55.150508+00'),
('6b7fa987-5b9a-4bc7-b838-dc47095528be', '9d01e4ea-99e8-4aed-b7c0-4fe33ccd857d', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'owner', NULL, '2025-06-26 22:53:54.03375+00', '2025-06-26 22:53:54.03375+00', '2025-06-26 22:53:54.03375+00', '2025-06-26 22:53:54.03375+00'),
('8181d0f3-92f6-4d25-bb6e-2050ffa321cf', '6bbfd6e5-d363-4750-ae84-78a6cddbff20', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'owner', NULL, '2025-06-24 04:26:13.618066+00', '2025-06-24 04:26:13.618066+00', '2025-06-24 04:26:13.618066+00', '2025-06-24 04:26:13.618066+00'),
('a56002c4-bf8b-4de0-b762-cfc353a5e3d0', 'bef9b528-6f9f-4373-a86b-b43d8e1827c9', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'owner', NULL, '2025-06-23 22:58:34.751907+00', '2025-06-23 22:58:34.751907+00', '2025-06-23 22:58:34.751907+00', '2025-06-23 22:58:34.751907+00'),
('af532956-02ca-4945-a871-f36674f43e33', 'bc51a814-fe40-4942-bb74-ec7dc45db712', 'cdd4830d-2e42-489e-a633-ab9fc2263aeb', 'owner', NULL, '2025-06-21 20:16:22.511124+00', '2025-06-21 20:16:22.511124+00', '2025-06-21 20:16:22.511124+00', '2025-06-21 20:16:22.511124+00'),
('bd27bd5c-683b-46c6-a5eb-b5d94efecbc1', 'ade6fff0-950d-4515-8604-63297800873a', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'owner', NULL, '2025-06-21 20:13:04.686405+00', '2025-06-21 20:13:04.686405+00', '2025-06-21 20:13:04.686405+00', '2025-06-21 20:13:04.686405+00');

INSERT INTO "public"."currencies" ("code", "name", "stripe_enabled") VALUES
('AED', 'UAE Dirham', 't'),
('AUD', 'Australian Dollar', 't'),
('CAD', 'Canadian Dollar', 't'),
('EGP', 'Egyptian Pound', 't'),
('EUR', 'Euro', 't'),
('GBP', 'British Pound', 't'),
('JPY', 'Japanese Yen', 't'),
('MAD', 'Moroccan Dirham', 't'),
('SAR', 'Saudi Riyal', 't'),
('USD', 'US Dollar', 't');

INSERT INTO "public"."customers" ("id", "user_id", "stripe_customer_id", "email", "created_at", "updated_at") VALUES
('613406b5-5b98-4479-af08-92cde6bbf03e', 'cdd4830d-2e42-489e-a633-ab9fc2263aeb', 'cus_placeholder_613406b5', 'testclient2@sheenapps.com', '2025-06-21 20:14:47.312736+00', '2025-06-26 13:41:56.069009+00'),
('75dc5de5-9d98-4eca-b840-c2965fb8eed8', '74fc0fb3-d1c7-4bba-a185-611ba1edb017', 'cus_placeholder_75dc5de5', 'testclient@sheenapps.com', '2025-06-21 11:02:41.883907+00', '2025-06-26 13:41:56.069009+00');

INSERT INTO "public"."plan_limits" ("plan_name", "max_projects", "max_ai_generations_per_month", "max_exports_per_month", "max_storage_mb", "features", "created_at", "updated_at") VALUES
('free', 3, 10, 1, 100, '{"white_label": false, "custom_domain": false, "priority_support": false}', '2025-06-26 13:05:21.385558+00', '2025-06-26 13:05:21.385558+00'),
('growth', 50, 500, 50, 2000, '{"white_label": false, "custom_domain": true, "priority_support": true}', '2025-06-26 13:05:21.385558+00', '2025-06-26 13:05:21.385558+00'),
('scale', -1, -1, -1, 10000, '{"white_label": true, "custom_domain": true, "priority_support": true}', '2025-06-26 13:05:21.385558+00', '2025-06-26 13:05:21.385558+00'),
('starter', 10, 100, 10, 500, '{"white_label": false, "custom_domain": false, "priority_support": false}', '2025-06-26 13:05:21.385558+00', '2025-06-26 13:05:21.385558+00');

CREATE VIEW "public"."quota_failures_realtime" AS ;
CREATE VIEW "public"."quota_usage_spikes" AS ;
CREATE VIEW "public"."quota_concurrent_attempts" AS ;
CREATE VIEW "public"."quota_high_denial_users" AS ;
CREATE VIEW "public"."quota_collision_analysis" AS ;
ALTER TABLE "public"."projects" ADD FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


-- Indices
CREATE UNIQUE INDEX projects_subdomain_key ON public.projects USING btree (subdomain);
CREATE INDEX idx_projects_owner ON public.projects USING btree (owner_id);
CREATE INDEX idx_projects_collaborators ON public.projects USING gin (((config -> 'collaborator_ids'::text)));
CREATE INDEX idx_projects_updated_at ON public.projects USING btree (updated_at DESC);
CREATE INDEX idx_projects_owner_updated ON public.projects USING btree (owner_id, updated_at DESC);
CREATE INDEX idx_projects_active ON public.projects USING btree (owner_id, archived_at) WHERE (archived_at IS NULL);
CREATE INDEX idx_projects_name_search ON public.projects USING gin (to_tsvector('english'::regconfig, name));
CREATE INDEX idx_projects_active_by_owner ON public.projects USING btree (owner_id, created_at DESC) WHERE (archived_at IS NULL);
ALTER TABLE "public"."branches" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE "public"."branches" ADD FOREIGN KEY ("head_id") REFERENCES "public"."commits"("id") ON DELETE SET NULL;


-- Indices
CREATE UNIQUE INDEX branches_project_id_name_key ON public.branches USING btree (project_id, name);
CREATE INDEX idx_branches_project ON public.branches USING btree (project_id);
ALTER TABLE "public"."commits" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE "public"."commits" ADD FOREIGN KEY ("author_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_commits_project ON public.commits USING btree (project_id);
CREATE INDEX idx_commits_author ON public.commits USING btree (author_id);
ALTER TABLE "public"."assets" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;
ALTER TABLE "public"."assets" ADD FOREIGN KEY ("uploader_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_assets_project ON public.assets USING btree (project_id);
ALTER TABLE "public"."storage_audit_log" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_storage_audit_created_at ON public.storage_audit_log USING btree (created_at);
CREATE INDEX idx_storage_audit_user_id ON public.storage_audit_log USING btree (user_id);
ALTER TABLE "public"."project_collaborators" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE "public"."project_collaborators" ADD FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");
ALTER TABLE "public"."project_collaborators" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE CASCADE;


-- Indices
CREATE UNIQUE INDEX project_collaborators_project_id_user_id_key ON public.project_collaborators USING btree (project_id, user_id);
CREATE INDEX idx_project_collaborators_project_id ON public.project_collaborators USING btree (project_id);
CREATE INDEX idx_project_collaborators_user_id ON public.project_collaborators USING btree (user_id);
CREATE INDEX idx_project_collaborators_role ON public.project_collaborators USING btree (role);
ALTER TABLE "public"."customers" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


-- Comments
COMMENT ON TABLE "public"."customers" IS 'Stripe customer records linked to auth users';


-- Indices
CREATE UNIQUE INDEX customers_user_id_key ON public.customers USING btree (user_id);
CREATE INDEX idx_customers_user_id ON public.customers USING btree (user_id);
CREATE UNIQUE INDEX customers_stripe_customer_id_key ON public.customers USING btree (stripe_customer_id);
CREATE INDEX idx_customers_stripe_id ON public.customers USING btree (stripe_customer_id);
CREATE INDEX idx_customers_to_user ON public.customers USING btree (user_id);
ALTER TABLE "public"."subscriptions" ADD FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code");
ALTER TABLE "public"."subscriptions" ADD FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
ALTER TABLE "public"."subscriptions" ADD FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE SET NULL;
ALTER TABLE "public"."subscriptions" ADD FOREIGN KEY ("plan_name") REFERENCES "public"."plan_limits"("plan_name") ON UPDATE CASCADE;


-- Comments
COMMENT ON TABLE "public"."subscriptions" IS 'Active and historical subscription data';


-- Indices
CREATE INDEX idx_subscriptions_customer_id ON public.subscriptions USING btree (customer_id);
CREATE INDEX idx_subscriptions_plan ON public.subscriptions USING btree (plan_name);
CREATE UNIQUE INDEX subscriptions_stripe_subscription_id_key ON public.subscriptions USING btree (stripe_subscription_id);
CREATE INDEX idx_subscriptions_stripe_id ON public.subscriptions USING btree (stripe_subscription_id);
CREATE INDEX idx_active_subscriptions ON public.subscriptions USING btree (customer_id) WHERE (status = ANY (ARRAY['active'::subscription_status, 'trialing'::subscription_status]));
CREATE INDEX idx_subscriptions_active_status ON public.subscriptions USING btree (customer_id, status) WHERE (status = ANY (ARRAY['active'::subscription_status, 'trialing'::subscription_status]));
ALTER TABLE "public"."payments" ADD FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code");
ALTER TABLE "public"."payments" ADD FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;


-- Comments
COMMENT ON TABLE "public"."payments" IS 'Payment transaction history';


-- Indices
CREATE INDEX idx_payments_customer_id ON public.payments USING btree (customer_id);
CREATE INDEX idx_payments_created_at ON public.payments USING btree (created_at DESC);
CREATE UNIQUE INDEX payments_stripe_payment_intent_id_key ON public.payments USING btree (stripe_payment_intent_id);
CREATE INDEX idx_successful_payments ON public.payments USING btree (created_at DESC) WHERE (status = 'succeeded'::payment_status);
CREATE INDEX idx_failed_payments ON public.payments USING btree (created_at DESC) WHERE (status = ANY (ARRAY['failed'::payment_status, 'partially_refunded'::payment_status]));
CREATE INDEX idx_payments_customer_date ON public.payments USING btree (customer_id, created_at DESC);


-- Comments
COMMENT ON TABLE "public"."plan_limits" IS 'Defines limits for each subscription plan. -1 = unlimited';


-- Indices
CREATE INDEX idx_plan_limits_name ON public.plan_limits USING btree (plan_name);
ALTER TABLE "public"."usage_tracking" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


-- Comments
COMMENT ON TABLE "public"."usage_tracking" IS 'Tracks API and resource usage per billing period';


-- Indices
CREATE UNIQUE INDEX usage_tracking_user_id_metric_name_period_start_key ON public.usage_tracking USING btree (user_id, metric_name, period_start);
CREATE INDEX idx_usage_tracking_user_period ON public.usage_tracking USING btree (user_id, period_start, period_end);
CREATE INDEX idx_usage_tracking_metric ON public.usage_tracking USING btree (metric_name);
CREATE INDEX idx_usage_tracking_period_range ON public.usage_tracking USING btree (user_id, period_start, period_end);
CREATE INDEX idx_usage_tracking_quota_lookup ON public.usage_tracking USING btree (user_id, metric_name, period_start DESC);
CREATE INDEX idx_usage_tracking_monitoring_dashboard ON public.usage_tracking USING btree (period_start, metric_name) INCLUDE (user_id, usage_amount);
ALTER TABLE "public"."invoices" ADD FOREIGN KEY ("currency") REFERENCES "public"."currencies"("code");
ALTER TABLE "public"."invoices" ADD FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE CASCADE;
ALTER TABLE "public"."invoices" ADD FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE SET NULL;


-- Comments
COMMENT ON TABLE "public"."invoices" IS 'Invoice records for full accounting ledger';


-- Indices
CREATE UNIQUE INDEX invoices_stripe_invoice_id_key ON public.invoices USING btree (stripe_invoice_id);
CREATE INDEX idx_invoices_customer ON public.invoices USING btree (customer_id);
CREATE INDEX idx_invoices_date ON public.invoices USING btree (created_at DESC);
ALTER TABLE "public"."subscription_history" ADD FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE CASCADE;


-- Indices
CREATE INDEX idx_subscription_history_sub ON public.subscription_history USING btree (subscription_id);
CREATE INDEX idx_subscription_history_date ON public.subscription_history USING btree (created_at DESC);
ALTER TABLE "public"."transactions" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Comments
COMMENT ON TABLE "public"."transactions" IS 'Unified payment transactions across all gateways';


-- Indices
CREATE INDEX idx_transactions_user_id ON public.transactions USING btree (user_id);
CREATE INDEX idx_transactions_gateway ON public.transactions USING btree (gateway);
CREATE INDEX idx_transactions_status ON public.transactions USING btree (status);
CREATE INDEX idx_transactions_transaction_date ON public.transactions USING btree (transaction_date);
CREATE INDEX idx_transactions_gateway_transaction_id ON public.transactions USING btree (gateway, gateway_transaction_id);
CREATE INDEX idx_transactions_product_type ON public.transactions USING btree (product_type);


-- Comments
COMMENT ON TABLE "public"."webhook_dead_letter" IS 'Failed webhook events for retry processing';


-- Indices
CREATE INDEX idx_webhook_dead_letter_gateway ON public.webhook_dead_letter USING btree (gateway);
CREATE INDEX idx_webhook_dead_letter_retry_count ON public.webhook_dead_letter USING btree (retry_count);
CREATE INDEX idx_webhook_dead_letter_created_at ON public.webhook_dead_letter USING btree (created_at);
ALTER TABLE "public"."usage_bonuses" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Comments
COMMENT ON TABLE "public"."usage_bonuses" IS 'Bonus usage grants for users (signup, referral, etc)';


-- Indices
CREATE INDEX idx_usage_bonuses_user_id ON public.usage_bonuses USING btree (user_id);
CREATE INDEX idx_usage_bonuses_metric ON public.usage_bonuses USING btree (metric);
CREATE INDEX idx_usage_bonuses_expires_at ON public.usage_bonuses USING btree (expires_at);
CREATE INDEX idx_usage_bonuses_archived ON public.usage_bonuses USING btree (archived);
ALTER TABLE "public"."referrals" ADD FOREIGN KEY ("referrer_user_id") REFERENCES "auth"."users"("id");
ALTER TABLE "public"."referrals" ADD FOREIGN KEY ("referred_user_id") REFERENCES "auth"."users"("id");


-- Comments
COMMENT ON TABLE "public"."referrals" IS 'User referral tracking and attribution';


-- Indices
CREATE UNIQUE INDEX referrals_referral_code_key ON public.referrals USING btree (referral_code);
CREATE INDEX idx_referrals_code ON public.referrals USING btree (referral_code);
CREATE INDEX idx_referrals_status ON public.referrals USING btree (status, created_at);
CREATE INDEX idx_referrals_referrer_user_id ON public.referrals USING btree (referrer_user_id);
CREATE INDEX idx_referrals_referred_user_id ON public.referrals USING btree (referred_user_id);
ALTER TABLE "public"."organizations" ADD FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id");


-- Comments
COMMENT ON TABLE "public"."organizations" IS 'Team/organization accounts';


-- Indices
CREATE UNIQUE INDEX organizations_slug_key ON public.organizations USING btree (slug);
CREATE INDEX idx_organizations_owner_id ON public.organizations USING btree (owner_id);
CREATE INDEX idx_organizations_slug ON public.organizations USING btree (slug);
ALTER TABLE "public"."organization_members" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;
ALTER TABLE "public"."organization_members" ADD FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE CASCADE;
ALTER TABLE "public"."organization_members" ADD FOREIGN KEY ("invited_by") REFERENCES "auth"."users"("id");


-- Comments
COMMENT ON TABLE "public"."organization_members" IS 'Members of organizations with roles';


-- Indices
CREATE UNIQUE INDEX organization_members_organization_id_user_id_key ON public.organization_members USING btree (organization_id, user_id);
CREATE INDEX idx_organization_members_org_id ON public.organization_members USING btree (organization_id);
CREATE INDEX idx_organization_members_user_id ON public.organization_members USING btree (user_id);
ALTER TABLE "public"."organization_usage" ADD FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id");


-- Comments
COMMENT ON TABLE "public"."organization_usage" IS 'Usage tracking at organization level';
ALTER TABLE "public"."usage_events" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE UNIQUE INDEX unique_idempotency_key ON public.usage_events USING btree (user_id, idempotency_key);
CREATE INDEX idx_usage_events_user ON public.usage_events USING btree (user_id, created_at DESC);
CREATE INDEX idx_usage_events_metric ON public.usage_events USING btree (metric, created_at DESC);
CREATE INDEX idx_usage_events_idempotency_lookup ON public.usage_events USING btree (user_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE INDEX idx_usage_events_time_metric ON public.usage_events USING btree (created_at DESC, metric);
CREATE INDEX idx_usage_events_collisions ON public.usage_events USING btree (collision_detected, created_at DESC) WHERE (collision_detected = true);
ALTER TABLE "public"."user_bonuses" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_user_bonuses_user ON public.user_bonuses USING btree (user_id, metric);
CREATE INDEX idx_user_bonuses_available ON public.user_bonuses USING btree (user_id, metric, expires_at) WHERE (used_amount < amount);
ALTER TABLE "public"."export_logs" ADD FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id");
ALTER TABLE "public"."export_logs" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_export_logs_project ON public.export_logs USING btree (project_id);
CREATE INDEX idx_export_logs_user ON public.export_logs USING btree (user_id);
CREATE INDEX idx_export_logs_user_time ON public.export_logs USING btree (user_id, exported_at DESC);
ALTER TABLE "public"."quota_audit_log" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_audit_user_metric ON public.quota_audit_log USING btree (user_id, metric, created_at DESC);
CREATE INDEX idx_audit_success ON public.quota_audit_log USING btree (success, created_at DESC);
CREATE INDEX idx_audit_reason ON public.quota_audit_log USING btree (reason, created_at DESC);
CREATE INDEX idx_quota_audit_log_created_at ON public.quota_audit_log USING btree (created_at DESC);
CREATE INDEX idx_quota_audit_log_failures ON public.quota_audit_log USING btree (created_at DESC) WHERE (success = false);
CREATE INDEX idx_quota_audit_log_user_activity ON public.quota_audit_log USING btree (user_id, created_at DESC);
CREATE INDEX idx_quota_audit_log_reasons ON public.quota_audit_log USING btree (reason, created_at DESC) WHERE (success = false);
ALTER TABLE "public"."quota_audit_logs" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_audit_user_event ON public.quota_audit_logs USING btree (user_id, event_type, created_at DESC);
CREATE INDEX idx_audit_metric_time ON public.quota_audit_logs USING btree (metric, created_at DESC);
CREATE INDEX idx_audit_event_type ON public.quota_audit_logs USING btree (event_type, created_at DESC);
CREATE INDEX idx_audit_created_at ON public.quota_audit_logs USING btree (created_at DESC);
ALTER TABLE "public"."admin_alerts" ADD FOREIGN KEY ("acknowledged_by") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_admin_alerts_unack ON public.admin_alerts USING btree (acknowledged, created_at DESC) WHERE (NOT acknowledged);
CREATE INDEX idx_admin_alerts_severity ON public.admin_alerts USING btree (severity, created_at DESC);
CREATE INDEX idx_admin_alerts_time_severity ON public.admin_alerts USING btree (created_at DESC, severity);


-- Indices
CREATE UNIQUE INDEX quota_rate_limits_identifier_identifier_type_window_start_key ON public.quota_rate_limits USING btree (identifier, identifier_type, window_start);
CREATE INDEX idx_quota_rate_limits_lookup ON public.quota_rate_limits USING btree (identifier, identifier_type, window_start DESC);
ALTER TABLE "public"."plan_change_log" ADD FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id");


-- Indices
CREATE INDEX idx_plan_change_log_user_time ON public.plan_change_log USING btree (user_id, effective_date DESC);
