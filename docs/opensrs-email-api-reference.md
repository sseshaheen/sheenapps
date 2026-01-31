# OpenSRS Hosted Email API Reference

Research compiled for Phase 4: Real Mailbox via OpenSRS Hosted Email.

Our account is on **Cluster A**.

---

## API Basics

- **Base URL (Cluster A):** `https://admin.a.hostedemail.com/api`
- **Base URL (Cluster B):** `https://admin.b.hostedemail.com/api`
- **Production Test:** `https://admin.test.hostedemail.com/api`
- **Protocol:** HTTP POST with JSON body
- **Stateless:** Every request is independent; no persistent connections needed
- **API Version:** 1.1 (current stable)

Methods are appended to the base URL: `https://admin.a.hostedemail.com/api/get_user`

## Authentication

Every request includes a `credentials` object:

```json
{
  "credentials": {
    "user": "admin@example.com",
    "password": "the_password",
    "client": "SheenApps v1.0"
  },
  "user": "target@example.com"
}
```

Two auth modes:
1. **Password-based** — supply the user's password directly
2. **Token-based** — use a session token from `authenticate` or `generate_token`

### Session Tokens

Call `authenticate` with `"generate_session_token": true` to get a token. Use the token in place of `password` in the credentials object.

- Default lifetime: 10,800 seconds (3 hours)
- Max lifetime: 86,400 seconds (24 hours)
- Configurable via `session_token_duration`

## Response Format

All responses return JSON:

```json
// Success
{ "success": true }

// Failure
{
  "success": false,
  "error": "description of what went wrong",
  "error_number": 123,
  "hints": { "field": "reason" }
}
```

## Roles & Permissions Hierarchy

| Level | Role | Can Do |
|-------|------|--------|
| Company | Company Administrator | Everything — all domains, all users, suspend accounts |
| Company | Company Mail | Manage non-billable mailbox settings only |
| Company | Company Read Only | View only |
| Company | Company Token Only | Generate SSO tokens only |
| Company | Company View | View all + non-billable changes |
| Domain | Domain Administrator | Manage workgroups, create/edit mailboxes |
| Domain | Mail Administrator | Mailbox ops: passwords, forwarding, autoresponders |
| Workgroup | Workgroup Administrator | Manage mailboxes within assigned workgroups |

As a reseller, we authenticate as a **Company Administrator** to provision domains and mailboxes.

---

## Domain Methods

### `change_domain` — Create or Modify Domain

```json
{
  "credentials": { "user": "admin@company.com", "password": "..." },
  "domain": "example.com",
  "attributes": {
    "service_imap4": "enabled",
    "service_pop3": "enabled",
    "service_smtpin": "enabled",
    "service_webmail": "enabled",
    "quota": 1073741824,
    "limit_users": 50,
    "limit_aliases": 2000,
    "spamlevel": "Normal",
    "filterdelivery": "quarantine",
    "smtp_sent_limit": 500
  },
  "create_only": true
}
```

Key attributes:
| Attribute | Description |
|-----------|-------------|
| `service_imap4` | enabled / disabled / suspended |
| `service_pop3` | enabled / disabled / suspended |
| `service_smtpin` | enabled / disabled / suspended |
| `service_webmail` | enabled / disabled / suspended |
| `quota` | Default mailbox storage limit in bytes |
| `limit_users` | Max user accounts |
| `limit_aliases` | Max aliases (up to 2000) |
| `spamlevel` | Normal, High, or Very High |
| `filterdelivery` | quarantine or passthrough |
| `smtp_sent_limit` | Max messages per 24h per user (max 10,000) |
| `catchall` | Forward unmapped addresses (cannot enable on new domains) |
| `aliases` | Alternate domain names that receive mail |
| `allow` | Whitelist senders (max 1000) |
| `block` | Blacklist senders (max 1000) |
| `brand` | Default branding for mailboxes |
| `create_only` | If true, fails if domain already exists |

### `get_domain` — Get Domain Config

```json
{
  "credentials": { "user": "admin@company.com", "password": "..." },
  "domain": "example.com"
}
```

Returns all domain attributes plus `filtermx` (the mail server messages route through after spam/virus scanning). If domain doesn't exist but admin has creation permissions, returns `success: false` with error code 2 plus defaults.

### `delete_domain` / `restore_domain` / `search_domains`

Standard CRUD. `search_domains` lists domains under the account.

---

## User (Mailbox) Methods

### `change_user` — Create or Modify Mailbox

```json
{
  "credentials": { "user": "admin@company.com", "password": "..." },
  "user": "john@example.com",
  "attributes": {
    "password": "SecurePass123!",
    "quota": 536870912,
    "type": "mailbox",
    "service_imap4": "enabled",
    "service_pop3": "enabled",
    "service_smtpin": "enabled",
    "service_webmail": "enabled",
    "delivery_forward": false
  },
  "create_only": true
}
```

Key attributes:

| Attribute | Description |
|-----------|-------------|
| `password` | 1-54 chars. Cannot contain username or domain. Supports hashed formats (MD5, BCRYPT, SHA, etc.) |
| `quota` | Max storage in bytes |
| `type` | "mailbox", "forward", or "filter" (default: mailbox) |
| `service_imap4` | enabled / disabled / suspended |
| `service_pop3` | enabled / disabled / suspended |
| `service_smtpin` | enabled / disabled / suspended |
| `service_webmail` | enabled / disabled / suspended |
| `service_smtprelay` | SMTP relay access |
| `service_smtprelay_webmail` | SMTP relay via webmail |
| `delivery_forward` | Boolean — enable forwarding |
| `forward_recipients` | List of addresses (max 1,000) |
| `forward_option_restricted` | Limit forwarding to recipient list only |
| `forward_option_subject_prefix` | Prepend text to forwarded subjects |
| `forward_option_reply_to` | Set Reply-To on forwarded messages |
| `create_only` | If true, fails if user already exists |

Password rules:
- ASCII chars 33, 35-126 allowed; no spaces
- Cannot contain username or domain (case-insensitive)
- "Contains check" validation enforced in V1.1
- BCRYPT recommended for hashed passwords

Delivery modes (for mailbox type):
- Local storage only
- Local + forwarding
- Local + autoresponder
- Local + forwarding + autoresponder
- Forwarding only
- Forwarding + autoresponder
- Filter delivery (mutually exclusive with others)

New users inherit service settings from domain defaults unless overridden.

### `get_user` — Get Mailbox Details

```json
{
  "credentials": { "user": "admin@company.com", "password": "..." },
  "user": "john@example.com"
}
```

Returns:
- `type`: mailbox / filter / forward / alias
- `attributes`: All current settings
- `settable_attributes`: List of modifiable attributes
- `metadata`:
  - `quota`: `{ bytes_max, bytes_used, messages_max, messages_used }`
  - `folders`: List of email folders
  - `smtp_limit`: Sending restrictions
  - `roles`: Admin level and owned objects
  - `last_login`: Timestamps for IMAP4, POP3, webmail, etc.
  - `status`: active / deleted / suspended / quota / smtplimit
  - `2fa_enabled`: Two-factor auth status

### `delete_user` — Soft-Delete Mailbox

```json
{
  "credentials": { "user": "admin@company.com", "password": "..." },
  "user": "john@example.com"
}
```

Performs a **soft delete** — user cannot receive mail or access the system. Not permanently removed.

### `restore_user` — Restore Deleted Mailbox

Restores a soft-deleted user.

### `search_users` — List Mailboxes for Domain

Lists all users under a domain.

### `rename_user` — Rename Mailbox Address

Changes the email address of an existing user.

---

## Token Generation

### `generate_token` — Create SSO/Session Tokens

```json
{
  "credentials": { "user": "admin@company.com", "password": "..." },
  "user": "john@example.com",
  "reason": "Webmail SSO login",
  "type": "sso",
  "duration": 24
}
```

Token types:
| Type | Behavior |
|------|----------|
| `oma` | Valid for OMA API logins only |
| `session` | Valid until expiration; works with mail services + OMA |
| `sso` | **Single-use**; works with webmail, IMAP, SMTP, OMA |

Parameters:
- `user` (required): Target mailbox
- `reason` (required): Explanation for token generation
- `duration` (optional): Validity in hours (default: 24)
- `token` (optional): Custom token string (random if omitted)
- `type` (optional): oma / session / sso (default: session)
- `oma` (optional): Boolean enabling SSO/session tokens for OMA access (admin-only)

Response: `{ "success": true, "token": "abc123...", "duration": 24 }`

---

## DNS & Mail Server Configuration (Cluster A)

### MX Record

For domains using OpenSRS Hosted Email, MX must point to:
- **Cluster A:** `mail.hostedemail.com`
- **Cluster B:** `mail.b.hostedemail.com`

This **replaces** the Resend MX (`inbound-smtp.resend.io`). A domain cannot simultaneously use Resend inbound AND OpenSRS mailboxes.

### Client Mail Settings (Cluster A)

| Protocol | Server | SSL Port | TLS Port | Unencrypted |
|----------|--------|----------|----------|-------------|
| IMAP | mail.hostedemail.com | 993 | — | 143 |
| POP3 | mail.hostedemail.com | 995 | — | 110 |
| SMTP | mail.hostedemail.com | 465 | 25, 587 | — |

### Webmail Access

- **Cluster A:** `https://mail.hostedemail.com`
- **Cluster B:** `https://mail.b.hostedemail.com`

DNS propagation typically takes ~15 minutes after MX record changes.

---

## Additional Methods

### Company Methods
- `change_company` / `get_company` — Company settings
- `change_company_bulletin` / `get_company_bulletin` / `post_company_bulletin` — Announcements
- `get_company_changes` — Audit tracking

### Domain Bulletins
- `change_domain_bulletin` / `get_domain_bulletin` / `post_domain_bulletin`
- `get_domain_changes` — Domain audit log

### Workgroup Methods
- `create_workgroup` / `delete_workgroup` / `search_workgroups`

### User Extended Methods
- `add_role` / `set_role` / `remove_role` — Permission management
- `get_sieve` / `set_sieve` — Mail filtering (Sieve scripts)
- `user_disable_2fa` — Disable two-factor auth
- `app_password` — App-specific passwords
- `get_deleted_contacts` / `restore_deleted_contacts` — Contact recovery
- `get_deleted_messages` / `restore_deleted_messages` — Message recovery
- `get_user_messages` / `move_user_messages` — Message management
- `get_user_folders` — Folder listing
- `logout_user` — Session termination

### Brand Methods
- `search_brands` / `_change_brand` / `_get_brand` / `_delete_brand`
- `search_brand_members`

### Statistics
- `stats_list` / `stats_snapshot` / `stats_summary`

### Migration
- `migration_add` / `migration_jobs` / `migration_status` / `migration_trace`

---

## Key Architecture Decisions for SheenApps

### MX Routing Conflict

When a domain enables OpenSRS Hosted Email mailboxes:
1. MX must switch from `inbound-smtp.resend.io` → `mail.hostedemail.com`
2. Resend inbound (programmatic inbox) stops working for that domain
3. Our programmatic inbox on `inbox.sheenapps.com` continues working regardless
4. Outbound sending via Resend is unaffected (SPF/DKIM still valid)

### Password Handling

We should **never store user mailbox passwords**. Instead:
- Pass password to OpenSRS `change_user` at creation time
- For password resets, call `change_user` with new password attribute
- For webmail SSO, use `generate_token` with type `sso`

### Provisioning Flow

1. Call `change_domain` to register domain with OpenSRS Email
2. Switch MX record from Resend to OpenSRS via Cloudflare API
3. Update SPF to include OpenSRS (if needed alongside Resend for outbound)
4. Call `change_user` for each mailbox to create
5. Store mailbox metadata in our DB (but not passwords)

### Quota Tracking

`get_user` returns metadata with `quota.bytes_used` and `quota.bytes_max` — poll periodically or on-demand for dashboard display.
