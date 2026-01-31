/**
 * In-House Email Service
 *
 * Transactional email operations for Easy Mode projects.
 * Uses Resend as the email provider with project-level domain configuration.
 *
 * Part of EASY_MODE_SDK_PLAN.md
 */

import { randomUUID } from 'crypto';
import { getPool } from '../databaseWrapper';
import { getInhouseMeteringService } from './InhouseMeteringService';
import { getInhouseDomainsService, type EmailDomain } from './InhouseDomainsService';

// =============================================================================
// CONFIGURATION
// =============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const DEFAULT_FROM_EMAIL = process.env.EMAIL_FROM || 'noreply@sheenapps.com';
const RESEND_API_URL = 'https://api.resend.com/emails';

// =============================================================================
// TYPES
// =============================================================================

export type SupportedLocale = 'en' | 'ar' | 'fr' | 'es' | 'de';

export interface SendEmailOptions {
  to: string | string[];
  subject?: string;
  template?: string;
  variables?: Record<string, string | number | boolean>;
  html?: string;
  text?: string;
  from?: string;
  /** Display name for the From header (e.g., "Acme Support") */
  fromName?: string;
  /** Local part for custom domain sending (e.g., "support" for support@domain.com). Only used if project has verified custom domain. */
  fromLocalPart?: string;
  replyTo?: string;
  tags?: Record<string, string>;
  sendAt?: string; // ISO timestamp for delayed sending
  idempotencyKey?: string;
  locale?: SupportedLocale; // Locale for template localization
  /** Custom email headers (e.g., In-Reply-To, References for threading) */
  headers?: Record<string, string>;
}

export interface EmailResult {
  id: string;
  status: 'queued' | 'sent' | 'failed';
  to: string[];
  createdAt: string;
  scheduledAt?: string;
  warning?: string;
}

export interface EmailInfo {
  id: string;
  projectId: string;
  to: string[];
  subject: string;
  template?: string;
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed';
  resendId?: string;
  createdAt: string;
  sentAt?: string;
  deliveredAt?: string;
  failedAt?: string;
  error?: string;
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
  tags?: Record<string, string>;
  locale?: SupportedLocale;
}

export interface ListEmailsOptions {
  status?: string;
  limit?: number;
  offset?: number;
}

export interface ListEmailsResult {
  emails: EmailInfo[];
  total: number;
  hasMore: boolean;
}

// Built-in templates
export type BuiltInTemplate =
  | 'welcome'
  | 'magic-link'
  | 'password-reset'
  | 'email-verification'
  | 'receipt'
  | 'notification'
  | 'daily_digest';

// Template structure with locale support
interface TemplateContent {
  subject: string;
  html: string;
  text: string;
}

type LocalizedTemplates = Record<SupportedLocale, TemplateContent>;

// RTL wrapper for Arabic emails
const RTL_WRAPPER_START = `<div dir="rtl" style="direction:rtl;text-align:right;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">`;
const RTL_WRAPPER_END = `</div>`;

// Helper to check if locale is RTL
function isRTL(locale: SupportedLocale): boolean {
  return locale === 'ar';
}

// Wrap content in RTL container if needed
function wrapRTL(html: string, locale: SupportedLocale): string {
  if (isRTL(locale)) {
    return `${RTL_WRAPPER_START}${html}${RTL_WRAPPER_END}`;
  }
  return html;
}

const BUILT_IN_TEMPLATES: Record<BuiltInTemplate, LocalizedTemplates> = {
  welcome: {
    en: {
      subject: 'Welcome to {{appName}}!',
      html: `
        <h1>Welcome, {{name}}!</h1>
        <p>Thank you for joining {{appName}}. We're excited to have you on board.</p>
        {{#if loginUrl}}<p><a href="{{loginUrl}}">Log in to your account</a></p>{{/if}}
      `,
      text: `Welcome, {{name}}!\n\nThank you for joining {{appName}}. We're excited to have you on board.\n{{#if loginUrl}}Log in: {{loginUrl}}{{/if}}`,
    },
    ar: {
      subject: 'مرحباً بك في {{appName}}!',
      html: `
        <h1>مرحباً {{name}}!</h1>
        <p>شكراً لانضمامك إلى {{appName}}. نحن سعداء بوجودك معنا.</p>
        {{#if loginUrl}}<p><a href="{{loginUrl}}">تسجيل الدخول إلى حسابك</a></p>{{/if}}
      `,
      text: `مرحباً {{name}}!\n\nشكراً لانضمامك إلى {{appName}}. نحن سعداء بوجودك معنا.\n{{#if loginUrl}}تسجيل الدخول: {{loginUrl}}{{/if}}`,
    },
    fr: {
      subject: 'Bienvenue sur {{appName}} !',
      html: `
        <h1>Bienvenue, {{name}} !</h1>
        <p>Merci de rejoindre {{appName}}. Nous sommes ravis de vous accueillir.</p>
        {{#if loginUrl}}<p><a href="{{loginUrl}}">Connectez-vous à votre compte</a></p>{{/if}}
      `,
      text: `Bienvenue, {{name}} !\n\nMerci de rejoindre {{appName}}. Nous sommes ravis de vous accueillir.\n{{#if loginUrl}}Connexion: {{loginUrl}}{{/if}}`,
    },
    es: {
      subject: '¡Bienvenido a {{appName}}!',
      html: `
        <h1>¡Bienvenido, {{name}}!</h1>
        <p>Gracias por unirte a {{appName}}. Estamos emocionados de tenerte.</p>
        {{#if loginUrl}}<p><a href="{{loginUrl}}">Inicia sesión en tu cuenta</a></p>{{/if}}
      `,
      text: `¡Bienvenido, {{name}}!\n\nGracias por unirte a {{appName}}. Estamos emocionados de tenerte.\n{{#if loginUrl}}Iniciar sesión: {{loginUrl}}{{/if}}`,
    },
    de: {
      subject: 'Willkommen bei {{appName}}!',
      html: `
        <h1>Willkommen, {{name}}!</h1>
        <p>Vielen Dank, dass Sie sich bei {{appName}} angemeldet haben. Wir freuen uns, Sie an Bord zu haben.</p>
        {{#if loginUrl}}<p><a href="{{loginUrl}}">Melden Sie sich bei Ihrem Konto an</a></p>{{/if}}
      `,
      text: `Willkommen, {{name}}!\n\nVielen Dank, dass Sie sich bei {{appName}} angemeldet haben.\n{{#if loginUrl}}Anmelden: {{loginUrl}}{{/if}}`,
    },
  },
  'magic-link': {
    en: {
      subject: 'Your login link for {{appName}}',
      html: `
        <h1>Log in to {{appName}}</h1>
        <p>Click the link below to log in. This link expires in {{expiresIn}}.</p>
        <p><a href="{{magicLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Log In</a></p>
        <p style="color:#666;font-size:12px;">If you didn't request this link, you can safely ignore this email.</p>
      `,
      text: `Log in to {{appName}}\n\nClick the link below to log in. This link expires in {{expiresIn}}.\n\n{{magicLink}}\n\nIf you didn't request this link, you can safely ignore this email.`,
    },
    ar: {
      subject: 'رابط تسجيل الدخول لـ {{appName}}',
      html: `
        <h1>تسجيل الدخول إلى {{appName}}</h1>
        <p>انقر على الرابط أدناه لتسجيل الدخول. ينتهي هذا الرابط خلال {{expiresIn}}.</p>
        <p><a href="{{magicLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">تسجيل الدخول</a></p>
        <p style="color:#666;font-size:12px;">إذا لم تطلب هذا الرابط، يمكنك تجاهل هذا البريد الإلكتروني.</p>
      `,
      text: `تسجيل الدخول إلى {{appName}}\n\nانقر على الرابط أدناه لتسجيل الدخول. ينتهي هذا الرابط خلال {{expiresIn}}.\n\n{{magicLink}}\n\nإذا لم تطلب هذا الرابط، يمكنك تجاهل هذا البريد الإلكتروني.`,
    },
    fr: {
      subject: 'Votre lien de connexion pour {{appName}}',
      html: `
        <h1>Connexion à {{appName}}</h1>
        <p>Cliquez sur le lien ci-dessous pour vous connecter. Ce lien expire dans {{expiresIn}}.</p>
        <p><a href="{{magicLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Se connecter</a></p>
        <p style="color:#666;font-size:12px;">Si vous n'avez pas demandé ce lien, vous pouvez ignorer cet email.</p>
      `,
      text: `Connexion à {{appName}}\n\nCliquez sur le lien ci-dessous pour vous connecter. Ce lien expire dans {{expiresIn}}.\n\n{{magicLink}}`,
    },
    es: {
      subject: 'Tu enlace de acceso para {{appName}}',
      html: `
        <h1>Inicia sesión en {{appName}}</h1>
        <p>Haz clic en el enlace a continuación para iniciar sesión. Este enlace expira en {{expiresIn}}.</p>
        <p><a href="{{magicLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Iniciar sesión</a></p>
        <p style="color:#666;font-size:12px;">Si no solicitaste este enlace, puedes ignorar este correo.</p>
      `,
      text: `Inicia sesión en {{appName}}\n\nHaz clic en el enlace a continuación. Este enlace expira en {{expiresIn}}.\n\n{{magicLink}}`,
    },
    de: {
      subject: 'Ihr Anmeldelink für {{appName}}',
      html: `
        <h1>Bei {{appName}} anmelden</h1>
        <p>Klicken Sie auf den Link unten, um sich anzumelden. Dieser Link läuft in {{expiresIn}} ab.</p>
        <p><a href="{{magicLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Anmelden</a></p>
        <p style="color:#666;font-size:12px;">Wenn Sie diesen Link nicht angefordert haben, können Sie diese E-Mail ignorieren.</p>
      `,
      text: `Bei {{appName}} anmelden\n\nKlicken Sie auf den Link unten. Dieser Link läuft in {{expiresIn}} ab.\n\n{{magicLink}}`,
    },
  },
  'password-reset': {
    en: {
      subject: 'Reset your {{appName}} password',
      html: `
        <h1>Reset Your Password</h1>
        <p>You requested to reset your password. Click the link below to set a new password.</p>
        <p><a href="{{resetLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Reset Password</a></p>
        <p style="color:#666;font-size:12px;">This link expires in {{expiresIn}}. If you didn't request this, you can safely ignore this email.</p>
      `,
      text: `Reset Your Password\n\nYou requested to reset your password. Click the link below to set a new password:\n\n{{resetLink}}\n\nThis link expires in {{expiresIn}}. If you didn't request this, you can safely ignore this email.`,
    },
    ar: {
      subject: 'إعادة تعيين كلمة المرور لـ {{appName}}',
      html: `
        <h1>إعادة تعيين كلمة المرور</h1>
        <p>لقد طلبت إعادة تعيين كلمة المرور الخاصة بك. انقر على الرابط أدناه لتعيين كلمة مرور جديدة.</p>
        <p><a href="{{resetLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">إعادة تعيين كلمة المرور</a></p>
        <p style="color:#666;font-size:12px;">ينتهي هذا الرابط خلال {{expiresIn}}. إذا لم تطلب ذلك، يمكنك تجاهل هذا البريد الإلكتروني.</p>
      `,
      text: `إعادة تعيين كلمة المرور\n\nلقد طلبت إعادة تعيين كلمة المرور. انقر على الرابط أدناه:\n\n{{resetLink}}\n\nينتهي هذا الرابط خلال {{expiresIn}}.`,
    },
    fr: {
      subject: 'Réinitialiser votre mot de passe {{appName}}',
      html: `
        <h1>Réinitialiser votre mot de passe</h1>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous.</p>
        <p><a href="{{resetLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Réinitialiser</a></p>
        <p style="color:#666;font-size:12px;">Ce lien expire dans {{expiresIn}}.</p>
      `,
      text: `Réinitialiser votre mot de passe\n\nCliquez sur le lien ci-dessous:\n\n{{resetLink}}\n\nCe lien expire dans {{expiresIn}}.`,
    },
    es: {
      subject: 'Restablecer tu contraseña de {{appName}}',
      html: `
        <h1>Restablecer tu contraseña</h1>
        <p>Solicitaste restablecer tu contraseña. Haz clic en el enlace a continuación.</p>
        <p><a href="{{resetLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Restablecer</a></p>
        <p style="color:#666;font-size:12px;">Este enlace expira en {{expiresIn}}.</p>
      `,
      text: `Restablecer tu contraseña\n\nHaz clic en el enlace a continuación:\n\n{{resetLink}}\n\nEste enlace expira en {{expiresIn}}.`,
    },
    de: {
      subject: 'Setzen Sie Ihr {{appName}} Passwort zurück',
      html: `
        <h1>Passwort zurücksetzen</h1>
        <p>Sie haben angefordert, Ihr Passwort zurückzusetzen. Klicken Sie auf den Link unten.</p>
        <p><a href="{{resetLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Zurücksetzen</a></p>
        <p style="color:#666;font-size:12px;">Dieser Link läuft in {{expiresIn}} ab.</p>
      `,
      text: `Passwort zurücksetzen\n\nKlicken Sie auf den Link unten:\n\n{{resetLink}}\n\nDieser Link läuft in {{expiresIn}} ab.`,
    },
  },
  'email-verification': {
    en: {
      subject: 'Verify your email for {{appName}}',
      html: `
        <h1>Verify Your Email</h1>
        <p>Please verify your email address by clicking the link below.</p>
        <p><a href="{{verifyLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Verify Email</a></p>
        <p style="color:#666;font-size:12px;">This link expires in {{expiresIn}}.</p>
      `,
      text: `Verify Your Email\n\nPlease verify your email address by clicking the link below:\n\n{{verifyLink}}\n\nThis link expires in {{expiresIn}}.`,
    },
    ar: {
      subject: 'تأكيد بريدك الإلكتروني لـ {{appName}}',
      html: `
        <h1>تأكيد بريدك الإلكتروني</h1>
        <p>يرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الرابط أدناه.</p>
        <p><a href="{{verifyLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">تأكيد البريد الإلكتروني</a></p>
        <p style="color:#666;font-size:12px;">ينتهي هذا الرابط خلال {{expiresIn}}.</p>
      `,
      text: `تأكيد بريدك الإلكتروني\n\nيرجى تأكيد عنوان بريدك الإلكتروني بالنقر على الرابط أدناه:\n\n{{verifyLink}}\n\nينتهي هذا الرابط خلال {{expiresIn}}.`,
    },
    fr: {
      subject: 'Vérifiez votre email pour {{appName}}',
      html: `
        <h1>Vérifiez votre email</h1>
        <p>Veuillez vérifier votre adresse email en cliquant sur le lien ci-dessous.</p>
        <p><a href="{{verifyLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Vérifier</a></p>
        <p style="color:#666;font-size:12px;">Ce lien expire dans {{expiresIn}}.</p>
      `,
      text: `Vérifiez votre email\n\nCliquez sur le lien ci-dessous:\n\n{{verifyLink}}\n\nCe lien expire dans {{expiresIn}}.`,
    },
    es: {
      subject: 'Verifica tu correo para {{appName}}',
      html: `
        <h1>Verifica tu correo</h1>
        <p>Por favor verifica tu dirección de correo haciendo clic en el enlace a continuación.</p>
        <p><a href="{{verifyLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Verificar</a></p>
        <p style="color:#666;font-size:12px;">Este enlace expira en {{expiresIn}}.</p>
      `,
      text: `Verifica tu correo\n\nHaz clic en el enlace a continuación:\n\n{{verifyLink}}\n\nEste enlace expira en {{expiresIn}}.`,
    },
    de: {
      subject: 'Bestätigen Sie Ihre E-Mail für {{appName}}',
      html: `
        <h1>E-Mail bestätigen</h1>
        <p>Bitte bestätigen Sie Ihre E-Mail-Adresse, indem Sie auf den Link unten klicken.</p>
        <p><a href="{{verifyLink}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">Bestätigen</a></p>
        <p style="color:#666;font-size:12px;">Dieser Link läuft in {{expiresIn}} ab.</p>
      `,
      text: `E-Mail bestätigen\n\nKlicken Sie auf den Link unten:\n\n{{verifyLink}}\n\nDieser Link läuft in {{expiresIn}} ab.`,
    },
  },
  receipt: {
    en: {
      subject: 'Receipt for your {{appName}} purchase',
      html: `
        <h1>Receipt</h1>
        <p>Thank you for your purchase!</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Order #</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{orderId}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Date</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{date}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Amount</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{amount}}</td></tr>
        </table>
        {{#if receiptUrl}}<p><a href="{{receiptUrl}}">View full receipt</a></p>{{/if}}
      `,
      text: `Receipt\n\nThank you for your purchase!\n\nOrder #: {{orderId}}\nDate: {{date}}\nAmount: {{amount}}\n{{#if receiptUrl}}View receipt: {{receiptUrl}}{{/if}}`,
    },
    ar: {
      subject: 'إيصال الشراء من {{appName}}',
      html: `
        <h1>إيصال</h1>
        <p>شكراً لشرائك!</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>رقم الطلب</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{orderId}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>التاريخ</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{date}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>المبلغ</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{amount}}</td></tr>
        </table>
        {{#if receiptUrl}}<p><a href="{{receiptUrl}}">عرض الإيصال الكامل</a></p>{{/if}}
      `,
      text: `إيصال\n\nشكراً لشرائك!\n\nرقم الطلب: {{orderId}}\nالتاريخ: {{date}}\nالمبلغ: {{amount}}\n{{#if receiptUrl}}عرض الإيصال: {{receiptUrl}}{{/if}}`,
    },
    fr: {
      subject: 'Reçu pour votre achat {{appName}}',
      html: `
        <h1>Reçu</h1>
        <p>Merci pour votre achat !</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Commande #</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{orderId}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Date</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{date}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Montant</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{amount}}</td></tr>
        </table>
        {{#if receiptUrl}}<p><a href="{{receiptUrl}}">Voir le reçu complet</a></p>{{/if}}
      `,
      text: `Reçu\n\nMerci pour votre achat !\n\nCommande #: {{orderId}}\nDate: {{date}}\nMontant: {{amount}}`,
    },
    es: {
      subject: 'Recibo de tu compra en {{appName}}',
      html: `
        <h1>Recibo</h1>
        <p>¡Gracias por tu compra!</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Pedido #</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{orderId}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Fecha</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{date}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Monto</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{amount}}</td></tr>
        </table>
        {{#if receiptUrl}}<p><a href="{{receiptUrl}}">Ver recibo completo</a></p>{{/if}}
      `,
      text: `Recibo\n\n¡Gracias por tu compra!\n\nPedido #: {{orderId}}\nFecha: {{date}}\nMonto: {{amount}}`,
    },
    de: {
      subject: 'Quittung für Ihren {{appName}} Einkauf',
      html: `
        <h1>Quittung</h1>
        <p>Vielen Dank für Ihren Einkauf!</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Bestellung #</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{orderId}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Datum</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{date}}</td></tr>
          <tr><td style="padding:8px;border-bottom:1px solid #eee;"><strong>Betrag</strong></td><td style="padding:8px;border-bottom:1px solid #eee;">{{amount}}</td></tr>
        </table>
        {{#if receiptUrl}}<p><a href="{{receiptUrl}}">Vollständige Quittung anzeigen</a></p>{{/if}}
      `,
      text: `Quittung\n\nVielen Dank für Ihren Einkauf!\n\nBestellung #: {{orderId}}\nDatum: {{date}}\nBetrag: {{amount}}`,
    },
  },
  notification: {
    en: {
      subject: '{{subject}}',
      html: `
        <h1>{{title}}</h1>
        <p>{{message}}</p>
        {{#if actionUrl}}<p><a href="{{actionUrl}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">{{actionText}}</a></p>{{/if}}
      `,
      text: `{{title}}\n\n{{message}}\n{{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}`,
    },
    ar: {
      subject: '{{subject}}',
      html: `
        <h1>{{title}}</h1>
        <p>{{message}}</p>
        {{#if actionUrl}}<p><a href="{{actionUrl}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">{{actionText}}</a></p>{{/if}}
      `,
      text: `{{title}}\n\n{{message}}\n{{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}`,
    },
    fr: {
      subject: '{{subject}}',
      html: `
        <h1>{{title}}</h1>
        <p>{{message}}</p>
        {{#if actionUrl}}<p><a href="{{actionUrl}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">{{actionText}}</a></p>{{/if}}
      `,
      text: `{{title}}\n\n{{message}}\n{{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}`,
    },
    es: {
      subject: '{{subject}}',
      html: `
        <h1>{{title}}</h1>
        <p>{{message}}</p>
        {{#if actionUrl}}<p><a href="{{actionUrl}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">{{actionText}}</a></p>{{/if}}
      `,
      text: `{{title}}\n\n{{message}}\n{{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}`,
    },
    de: {
      subject: '{{subject}}',
      html: `
        <h1>{{title}}</h1>
        <p>{{message}}</p>
        {{#if actionUrl}}<p><a href="{{actionUrl}}" style="display:inline-block;padding:12px 24px;background:#0066cc;color:#fff;text-decoration:none;border-radius:4px;">{{actionText}}</a></p>{{/if}}
      `,
      text: `{{title}}\n\n{{message}}\n{{#if actionUrl}}{{actionText}}: {{actionUrl}}{{/if}}`,
    },
  },
  daily_digest: {
    en: {
      subject: '{{subject}}',
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px;">{{projectName}}</h1>
          <p style="color:#666;font-size:14px;margin-top:0;">Daily Summary for {{date}}</p>

          <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:24px 0;">
            <h2 style="font-size:18px;margin:0 0 16px 0;color:#1a1a1a;">{{headlineText}}</h2>

            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#666;">Revenue</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{revenueValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{revenueDeltaColor}};">
                  {{revenueDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Orders</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{ordersValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{ordersDeltaColor}};">
                  {{ordersDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Leads</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{leadsValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{leadsDeltaColor}};">
                  {{leadsDeltaText}}
                </td>
              </tr>
            </table>
          </div>

          {{#if hasAnomaly}}
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#991b1b;font-weight:500;">⚠️ Heads up</p>
            <p style="margin:8px 0 0 0;color:#7f1d1d;">{{anomalyMessage}}</p>
          </div>
          {{/if}}

          {{#if hasAction}}
          <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#1e40af;font-weight:500;">💡 Suggested action</p>
            <p style="margin:8px 0 0 0;color:#1e3a8a;">{{actionLabel}}: {{actionReason}}</p>
          </div>
          {{/if}}

          {{#if hasOutcome}}
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#15803d;font-weight:500;">✓ Last action worked</p>
            <p style="margin:8px 0 0 0;color:#166534;">{{outcomeActionLabel}} recovered {{outcomeRevenueFormatted}} from {{outcomeConversions}} conversion(s) {{outcomeWhen}}</p>
          </div>
          {{/if}}

          <div style="text-align:center;margin-top:32px;">
            <a href="{{runHubUrl}}" style="display:inline-block;padding:12px 32px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">View Full Dashboard</a>
          </div>
        </div>
      `,
      text: `{{projectName}} - Daily Summary for {{date}}\n\n{{headlineText}}\n\nRevenue: {{revenueValue}} ({{revenueDeltaPercent}}%)\nOrders: {{ordersValue}} ({{ordersDeltaPercent}}%)\nLeads: {{leadsValue}} ({{leadsDeltaPercent}}%)\n\n{{#if hasAnomaly}}⚠️ Heads up: {{anomalyMessage}}\n\n{{/if}}{{#if hasAction}}💡 Suggested action: {{actionLabel}} - {{actionReason}}\n\n{{/if}}{{#if hasOutcome}}✓ Last action worked: {{outcomeActionLabel}} recovered {{outcomeCurrency}} {{outcomeRevenueCents}} from {{outcomeConversions}} conversion(s) {{outcomeWhen}}\n\n{{/if}}View full dashboard: {{runHubUrl}}`,
    },
    ar: {
      subject: '{{subject}}',
      html: `
        <div style="font-family:'Segoe UI',Tahoma,Arial,sans-serif;max-width:600px;margin:0 auto;direction:rtl;text-align:right;">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px;">{{projectName}}</h1>
          <p style="color:#666;font-size:14px;margin-top:0;">ملخص يومي لـ {{date}}</p>

          <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:24px 0;">
            <h2 style="font-size:18px;margin:0 0 16px 0;color:#1a1a1a;">{{headlineText}}</h2>

            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#666;">الإيرادات</td>
                <td style="padding:8px 0;text-align:left;font-weight:500;">{{revenueValue}}</td>
                <td style="padding:8px 0;text-align:left;color:{{revenueDeltaColor}};">
                  {{revenueDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">الطلبات</td>
                <td style="padding:8px 0;text-align:left;font-weight:500;">{{ordersValue}}</td>
                <td style="padding:8px 0;text-align:left;color:{{ordersDeltaColor}};">
                  {{ordersDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">العملاء المحتملون</td>
                <td style="padding:8px 0;text-align:left;font-weight:500;">{{leadsValue}}</td>
                <td style="padding:8px 0;text-align:left;color:{{leadsDeltaColor}};">
                  {{leadsDeltaText}}
                </td>
              </tr>
            </table>
          </div>

          {{#if hasAnomaly}}
          <div style="background:#fef2f2;border-right:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#991b1b;font-weight:500;">⚠️ تنبيه</p>
            <p style="margin:8px 0 0 0;color:#7f1d1d;">{{anomalyMessage}}</p>
          </div>
          {{/if}}

          {{#if hasAction}}
          <div style="background:#eff6ff;border-right:4px solid #2563eb;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#1e40af;font-weight:500;">💡 إجراء مقترح</p>
            <p style="margin:8px 0 0 0;color:#1e3a8a;">{{actionLabel}}: {{actionReason}}</p>
          </div>
          {{/if}}

          {{#if hasOutcome}}
          <div style="background:#f0fdf4;border-right:4px solid #16a34a;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#15803d;font-weight:500;">✓ نجح الإجراء الأخير</p>
            <p style="margin:8px 0 0 0;color:#166534;">{{outcomeActionLabel}} استعاد {{outcomeRevenueFormatted}} من {{outcomeConversions}} تحويل {{outcomeWhen}}</p>
          </div>
          {{/if}}

          <div style="text-align:center;margin-top:32px;">
            <a href="{{runHubUrl}}" style="display:inline-block;padding:12px 32px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">عرض لوحة التحكم الكاملة</a>
          </div>
        </div>
      `,
      text: `{{projectName}} - ملخص يومي لـ {{date}}\n\n{{headlineText}}\n\nالإيرادات: {{revenueValue}} ({{revenueDeltaPercent}}%)\nالطلبات: {{ordersValue}} ({{ordersDeltaPercent}}%)\nالعملاء المحتملون: {{leadsValue}} ({{leadsDeltaPercent}}%)\n\n{{#if hasAnomaly}}⚠️ تنبيه: {{anomalyMessage}}\n\n{{/if}}{{#if hasAction}}💡 إجراء مقترح: {{actionLabel}} - {{actionReason}}\n\n{{/if}}{{#if hasOutcome}}✓ نجح الإجراء الأخير: {{outcomeActionLabel}} استعاد {{outcomeRevenueCents}} {{outcomeCurrency}} من {{outcomeConversions}} تحويل {{outcomeWhen}}\n\n{{/if}}عرض لوحة التحكم الكاملة: {{runHubUrl}}`,
    },
    fr: {
      subject: '{{subject}}',
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px;">{{projectName}}</h1>
          <p style="color:#666;font-size:14px;margin-top:0;">Résumé quotidien du {{date}}</p>

          <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:24px 0;">
            <h2 style="font-size:18px;margin:0 0 16px 0;color:#1a1a1a;">{{headlineText}}</h2>

            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#666;">Revenus</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{revenueValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{revenueDeltaColor}};">
                  {{revenueDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Commandes</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{ordersValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{ordersDeltaColor}};">
                  {{ordersDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Prospects</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{leadsValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{leadsDeltaColor}};">
                  {{leadsDeltaText}}
                </td>
              </tr>
            </table>
          </div>

          {{#if hasAnomaly}}
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#991b1b;font-weight:500;">⚠️ Attention</p>
            <p style="margin:8px 0 0 0;color:#7f1d1d;">{{anomalyMessage}}</p>
          </div>
          {{/if}}

          {{#if hasAction}}
          <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#1e40af;font-weight:500;">💡 Action suggérée</p>
            <p style="margin:8px 0 0 0;color:#1e3a8a;">{{actionLabel}}: {{actionReason}}</p>
          </div>
          {{/if}}

          {{#if hasOutcome}}
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#15803d;font-weight:500;">✓ Dernière action réussie</p>
            <p style="margin:8px 0 0 0;color:#166534;">{{outcomeActionLabel}} a récupéré {{outcomeRevenueFormatted}} de {{outcomeConversions}} conversion(s) {{outcomeWhen}}</p>
          </div>
          {{/if}}

          <div style="text-align:center;margin-top:32px;">
            <a href="{{runHubUrl}}" style="display:inline-block;padding:12px 32px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Voir le tableau de bord complet</a>
          </div>
        </div>
      `,
      text: `{{projectName}} - Résumé quotidien du {{date}}\n\n{{headlineText}}\n\nRevenus: {{revenueValue}} ({{revenueDeltaPercent}}%)\nCommandes: {{ordersValue}} ({{ordersDeltaPercent}}%)\nProspects: {{leadsValue}} ({{leadsDeltaPercent}}%)\n\n{{#if hasAnomaly}}⚠️ Attention: {{anomalyMessage}}\n\n{{/if}}{{#if hasAction}}💡 Action suggérée: {{actionLabel}} - {{actionReason}}\n\n{{/if}}{{#if hasOutcome}}✓ Dernière action réussie: {{outcomeActionLabel}} a récupéré {{outcomeRevenueCents}} {{outcomeCurrency}} de {{outcomeConversions}} conversion(s) {{outcomeWhen}}\n\n{{/if}}Voir le tableau de bord complet: {{runHubUrl}}`,
    },
    es: {
      subject: '{{subject}}',
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px;">{{projectName}}</h1>
          <p style="color:#666;font-size:14px;margin-top:0;">Resumen diario del {{date}}</p>

          <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:24px 0;">
            <h2 style="font-size:18px;margin:0 0 16px 0;color:#1a1a1a;">{{headlineText}}</h2>

            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#666;">Ingresos</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{revenueValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{revenueDeltaColor}};">
                  {{revenueDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Pedidos</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{ordersValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{ordersDeltaColor}};">
                  {{ordersDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Clientes potenciales</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{leadsValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{leadsDeltaColor}};">
                  {{leadsDeltaText}}
                </td>
              </tr>
            </table>
          </div>

          {{#if hasAnomaly}}
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#991b1b;font-weight:500;">⚠️ Atención</p>
            <p style="margin:8px 0 0 0;color:#7f1d1d;">{{anomalyMessage}}</p>
          </div>
          {{/if}}

          {{#if hasAction}}
          <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#1e40af;font-weight:500;">💡 Acción sugerida</p>
            <p style="margin:8px 0 0 0;color:#1e3a8a;">{{actionLabel}}: {{actionReason}}</p>
          </div>
          {{/if}}

          {{#if hasOutcome}}
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#15803d;font-weight:500;">✓ Última acción exitosa</p>
            <p style="margin:8px 0 0 0;color:#166534;">{{outcomeActionLabel}} recuperó {{outcomeRevenueFormatted}} de {{outcomeConversions}} conversión(es) {{outcomeWhen}}</p>
          </div>
          {{/if}}

          <div style="text-align:center;margin-top:32px;">
            <a href="{{runHubUrl}}" style="display:inline-block;padding:12px 32px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Ver panel completo</a>
          </div>
        </div>
      `,
      text: `{{projectName}} - Resumen diario del {{date}}\n\n{{headlineText}}\n\nIngresos: {{revenueValue}} ({{revenueDeltaPercent}}%)\nPedidos: {{ordersValue}} ({{ordersDeltaPercent}}%)\nClientes potenciales: {{leadsValue}} ({{leadsDeltaPercent}}%)\n\n{{#if hasAnomaly}}⚠️ Atención: {{anomalyMessage}}\n\n{{/if}}{{#if hasAction}}💡 Acción sugerida: {{actionLabel}} - {{actionReason}}\n\n{{/if}}{{#if hasOutcome}}✓ Última acción exitosa: {{outcomeActionLabel}} recuperó {{outcomeRevenueCents}} {{outcomeCurrency}} de {{outcomeConversions}} conversión(es) {{outcomeWhen}}\n\n{{/if}}Ver panel completo: {{runHubUrl}}`,
    },
    de: {
      subject: '{{subject}}',
      html: `
        <div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto;">
          <h1 style="color:#1a1a1a;font-size:24px;margin-bottom:8px;">{{projectName}}</h1>
          <p style="color:#666;font-size:14px;margin-top:0;">Tägliche Zusammenfassung vom {{date}}</p>

          <div style="background:#f5f5f5;border-radius:8px;padding:20px;margin:24px 0;">
            <h2 style="font-size:18px;margin:0 0 16px 0;color:#1a1a1a;">{{headlineText}}</h2>

            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#666;">Umsatz</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{revenueValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{revenueDeltaColor}};">
                  {{revenueDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Bestellungen</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{ordersValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{ordersDeltaColor}};">
                  {{ordersDeltaText}}
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#666;">Leads</td>
                <td style="padding:8px 0;text-align:right;font-weight:500;">{{leadsValue}}</td>
                <td style="padding:8px 0;text-align:right;color:{{leadsDeltaColor}};">
                  {{leadsDeltaText}}
                </td>
              </tr>
            </table>
          </div>

          {{#if hasAnomaly}}
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#991b1b;font-weight:500;">⚠️ Achtung</p>
            <p style="margin:8px 0 0 0;color:#7f1d1d;">{{anomalyMessage}}</p>
          </div>
          {{/if}}

          {{#if hasAction}}
          <div style="background:#eff6ff;border-left:4px solid #2563eb;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#1e40af;font-weight:500;">💡 Vorgeschlagene Aktion</p>
            <p style="margin:8px 0 0 0;color:#1e3a8a;">{{actionLabel}}: {{actionReason}}</p>
          </div>
          {{/if}}

          {{#if hasOutcome}}
          <div style="background:#f0fdf4;border-left:4px solid #16a34a;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;color:#15803d;font-weight:500;">✓ Letzte Aktion erfolgreich</p>
            <p style="margin:8px 0 0 0;color:#166534;">{{outcomeActionLabel}} hat {{outcomeRevenueFormatted}} von {{outcomeConversions}} Conversion(s) {{outcomeWhen}} wiederhergestellt</p>
          </div>
          {{/if}}

          <div style="text-align:center;margin-top:32px;">
            <a href="{{runHubUrl}}" style="display:inline-block;padding:12px 32px;background:#0066cc;color:#fff;text-decoration:none;border-radius:6px;font-weight:500;">Vollständiges Dashboard anzeigen</a>
          </div>
        </div>
      `,
      text: `{{projectName}} - Tägliche Zusammenfassung vom {{date}}\n\n{{headlineText}}\n\nUmsatz: {{revenueValue}} ({{revenueDeltaPercent}}%)\nBestellungen: {{ordersValue}} ({{ordersDeltaPercent}}%)\nLeads: {{leadsValue}} ({{leadsDeltaPercent}}%)\n\n{{#if hasAnomaly}}⚠️ Achtung: {{anomalyMessage}}\n\n{{/if}}{{#if hasAction}}💡 Vorgeschlagene Aktion: {{actionLabel}} - {{actionReason}}\n\n{{/if}}{{#if hasOutcome}}✓ Letzte Aktion erfolgreich: {{outcomeActionLabel}} hat {{outcomeRevenueCents}} {{outcomeCurrency}} von {{outcomeConversions}} Conversion(s) {{outcomeWhen}} wiederhergestellt\n\n{{/if}}Vollständiges Dashboard anzeigen: {{runHubUrl}}`,
    },
  },
};

/**
 * Get localized template content
 */
function getLocalizedTemplate(
  templateName: BuiltInTemplate,
  locale: SupportedLocale = 'en'
): TemplateContent {
  const templates = BUILT_IN_TEMPLATES[templateName];
  // Fallback to English if locale not available
  return templates[locale] || templates.en;
}

// =============================================================================
// TEMPLATE ENGINE (Simple Handlebars-like)
// =============================================================================

/**
 * Validate that a URL is safe (http: or https: protocol only).
 * Prevents javascript: and data: URL injection attacks.
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize a validated URL for safe insertion into an HTML href attribute.
 * Even after protocol validation, characters like quotes/angle brackets
 * could break out of the href="..." attribute context.
 */
function sanitizeUrlForHtmlAttr(url: string): string {
  if (/[<>"'\s]/.test(url)) return '#';
  return url;
}

/**
 * List of template variable names that represent URLs and need validation.
 * These are used in href attributes in email templates.
 */
const URL_VARIABLE_NAMES = new Set([
  'magicLink',
  'resetLink',
  'verifyLink',
  'loginUrl',
  'receiptUrl',
  'actionUrl',
  'runHubUrl',
]);

/**
 * HTML escape special characters to prevent XSS attacks.
 * This is applied to ALL template variable values.
 * URLs in href attributes still work correctly because browsers decode entities.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function renderTemplate(template: string, variables: Record<string, string | number | boolean> = {}): string {
  let result = template;

  // Handle {{#if var}}...{{/if}} blocks
  result = result.replace(/\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, content) => {
    return variables[key] ? content : '';
  });

  // Handle {{var}} replacements with HTML escaping for XSS prevention
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const value = variables[key];
    if (value === undefined || value === null) return '';

    const strValue = String(value);

    // URL variables are validated and inserted WITHOUT HTML escaping
    // HTML-escaping URLs can break them in some email clients (& becomes &amp;)
    if (URL_VARIABLE_NAMES.has(key)) {
      if (!isValidUrl(strValue)) {
        // Replace invalid URLs with '#' to prevent XSS while not breaking the template
        console.warn(`[Email] Invalid URL detected for variable "${key}": ${strValue.substring(0, 50)}...`);
        return '#';
      }
      // URL is validated as http/https - sanitize for attribute context before inserting
      return sanitizeUrlForHtmlAttr(strValue);
    }

    // Non-URL variables: escape HTML to prevent XSS
    return escapeHtml(strValue);
  });

  return result;
}

// =============================================================================
// SERVICE
// =============================================================================

export class InhouseEmailService {
  private projectId: string;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  /**
   * Get project's email configuration (from domain, custom domain, etc.)
   */
  private async getProjectEmailConfig(): Promise<{
    from: string;
    replyTo?: string;
    verifiedDomain?: EmailDomain;
    defaultLocalPart: string;
    defaultFromName?: string;
  }> {
    let verifiedDomain: EmailDomain | null = null;
    let defaultFromName: string | undefined;
    let defaultLocalPart = 'noreply';

    try {
      // Check for project-level email configuration in secrets or settings
      const { rows } = await getPool().query(
        `SELECT name, settings FROM projects WHERE id = $1`,
        [this.projectId]
      );

      const projectName = rows[0]?.name;
      const settings = rows[0]?.settings;

      // Use project name as default from name
      defaultFromName = projectName;

      // Check for custom email settings
      if (settings?.email?.defaultLocalPart) {
        defaultLocalPart = settings.email.defaultLocalPart;
      }
      if (settings?.email?.defaultFromName) {
        defaultFromName = settings.email.defaultFromName;
      }

      // If explicit from is set in settings, use that (legacy support)
      if (settings?.email?.from) {
        return {
          from: settings.email.from,
          replyTo: settings.email.replyTo,
          defaultLocalPart,
          defaultFromName,
        };
      }

      // Check for verified custom domain
      const domainsService = getInhouseDomainsService(this.projectId);
      verifiedDomain = await domainsService.getVerifiedSendingDomain();

      if (verifiedDomain) {
        // Build from address using verified domain
        const fromAddress = `${defaultLocalPart}@${verifiedDomain.domain}`;
        const from = defaultFromName ? `"${defaultFromName}" <${fromAddress}>` : fromAddress;

        return {
          from,
          replyTo: settings?.email?.replyTo,
          verifiedDomain,
          defaultLocalPart,
          defaultFromName,
        };
      }
    } catch (error) {
      console.error('[Email] Failed to get project config:', error);
      // Fall back to default
    }

    return {
      from: DEFAULT_FROM_EMAIL,
      defaultLocalPart,
      defaultFromName,
    };
  }

  /**
   * Build the From address based on options and verified domain
   */
  private buildFromAddress(
    options: SendEmailOptions,
    config: { from: string; verifiedDomain?: EmailDomain; defaultLocalPart: string; defaultFromName?: string }
  ): string {
    // If explicit from is provided, use it directly
    if (options.from) {
      return options.from;
    }

    // If no verified domain, return default from config
    if (!config.verifiedDomain) {
      return config.from;
    }

    // Build from address using verified custom domain
    const localPart = options.fromLocalPart || config.defaultLocalPart;
    const fromName = options.fromName || config.defaultFromName;
    const fromAddress = `${localPart}@${config.verifiedDomain.domain}`;

    return fromName ? `"${fromName}" <${fromAddress}>` : fromAddress;
  }

  /**
   * Get app name from project settings
   */
  private async getAppName(): Promise<string> {
    try {
      const { rows } = await getPool().query(
        `SELECT name FROM projects WHERE id = $1`,
        [this.projectId]
      );
      return rows[0]?.name || 'App';
    } catch {
      return 'App';
    }
  }

  /**
   * Mark a reserved idempotency record as failed (cleanup on validation error)
   */
  private async failReservedIdempotencyKey(emailId: string, error: string): Promise<void> {
    try {
      await getPool().query(
        `UPDATE inhouse_emails
         SET status = 'failed', error_message = $2, failed_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'pending'`,
        [emailId, error]
      );
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Reserve idempotency key atomically using INSERT ... ON CONFLICT.
   * Returns existing email if duplicate, null if reservation succeeded.
   * This prevents race conditions where two requests could pass a SELECT check.
   */
  private async reserveIdempotencyKey(
    idempotencyKey: string,
    emailId: string,
    toArray: string[],
    subject: string
  ): Promise<{ reserved: boolean; existing: EmailInfo | null }> {
    try {
      // Try to reserve the idempotency key by inserting a placeholder record
      const result = await getPool().query(
        `INSERT INTO inhouse_emails (id, project_id, to_addresses, subject, idempotency_key, status)
         VALUES ($1, $2, $3, $4, $5, 'pending')
         ON CONFLICT (project_id, idempotency_key) WHERE idempotency_key IS NOT NULL
         DO NOTHING
         RETURNING id`,
        [emailId, this.projectId, JSON.stringify(toArray), subject, idempotencyKey]
      );

      if ((result.rowCount ?? 0) > 0) {
        // Successfully reserved
        return { reserved: true, existing: null };
      }

      // Conflict - fetch existing record
      const { rows } = await getPool().query(
        `SELECT * FROM inhouse_emails
         WHERE project_id = $1 AND idempotency_key = $2
         LIMIT 1`,
        [this.projectId, idempotencyKey]
      );

      if (rows.length > 0) {
        return { reserved: false, existing: this.rowToEmailInfo(rows[0]) };
      }

      // Edge case: conflict but no record found (shouldn't happen)
      return { reserved: true, existing: null };
    } catch {
      // Table might not exist yet, assume no duplicate
      return { reserved: true, existing: null };
    }
  }

  /**
   * Check suppression list for any recipient
   */
  private async getSuppressedRecipients(recipients: string[]): Promise<string[]> {
    if (recipients.length === 0) return [];
    try {
      const normalized = recipients.map((email) => email.toLowerCase());
      const { rows } = await getPool().query(
        `SELECT email FROM inhouse_email_suppressions
         WHERE project_id = $1
           AND status = 'active'
           AND email = ANY($2::text[])`,
        [this.projectId, normalized]
      );
      return rows.map((row: { email: string }) => row.email);
    } catch {
      return [];
    }
  }

  /**
   * Send an email
   *
   * Uses atomic quota reservation to prevent race conditions where multiple
   * concurrent requests could exceed quota by passing the check before any tracking happens.
   */
  async send(options: SendEmailOptions): Promise<EmailResult> {
    if (!RESEND_API_KEY) {
      throw new Error('Email service not configured (RESEND_API_KEY missing)');
    }

    // Normalize recipients
    const toArray = Array.isArray(options.to) ? options.to : [options.to];

    // Check suppression list BEFORE reserving quota
    const suppressed = await this.getSuppressedRecipients(toArray);
    if (suppressed.length > 0) {
      throw new Error(`SUPPRESSED: ${suppressed.join(', ')}`);
    }

    // Reserve quota atomically BEFORE sending (prevents race condition)
    // This increments usage count immediately; we release on failure
    const meteringService = getInhouseMeteringService();
    const quotaReservation = await meteringService.reserveProjectQuota(this.projectId, 'email_sends', 1);

    if (!quotaReservation.allowed) {
      throw new Error(`Email quota exceeded: ${quotaReservation.used}/${quotaReservation.limit} sends used this period`);
    }

    // Generate email ID early for idempotency reservation
    const emailId = randomUUID();

    // Check idempotency atomically - if already sent, release the quota reservation
    if (options.idempotencyKey) {
      // Use atomic reservation to prevent race conditions
      const { reserved, existing } = await this.reserveIdempotencyKey(
        options.idempotencyKey,
        emailId,
        toArray,
        options.subject || ''
      );

      if (!reserved && existing) {
        // Release the quota reservation since we're returning an existing email
        await meteringService.releaseProjectQuota(this.projectId, 'email_sends', 1);
        return {
          id: existing.id,
          status: existing.status === 'failed' ? 'failed' : existing.status === 'queued' ? 'queued' : 'sent',
          to: existing.to,
          createdAt: existing.createdAt,
        };
      }
      // If reserved=true, we own this idempotency key and can proceed
    }

    // Get project config
    const emailConfig = await this.getProjectEmailConfig();
    const appName = await this.getAppName();

    // Resolve template and content
    let subject = options.subject || '';
    let html = options.html || '';
    let text = options.text || '';

    if (options.template) {
      const templateName = options.template as BuiltInTemplate;
      const locale = options.locale || 'en';
      const template = getLocalizedTemplate(templateName, locale);

      if (!template) {
        // Release the quota and clean up idempotency reservation
        await meteringService.releaseProjectQuota(this.projectId, 'email_sends', 1);
        if (options.idempotencyKey) {
          await this.failReservedIdempotencyKey(emailId, `Unknown template: ${options.template}`);
        }
        throw new Error(`Unknown template: ${options.template}`);
      }

      // Add appName to variables
      const vars = { appName, ...options.variables } as Record<string, string | number | boolean>;

      subject = options.subject || renderTemplate(template.subject, vars);
      const renderedHtml = renderTemplate(template.html, vars);
      // Wrap Arabic emails in RTL container
      html = wrapRTL(renderedHtml, locale);
      text = renderTemplate(template.text, vars);
    }

    if (!subject) {
      // Release quota and clean up idempotency reservation
      await meteringService.releaseProjectQuota(this.projectId, 'email_sends', 1);
      if (options.idempotencyKey) {
        await this.failReservedIdempotencyKey(emailId, 'Email subject is required');
      }
      throw new Error('Email subject is required');
    }

    if (!html && !text) {
      // Release quota and clean up idempotency reservation
      await meteringService.releaseProjectQuota(this.projectId, 'email_sends', 1);
      if (options.idempotencyKey) {
        await this.failReservedIdempotencyKey(emailId, 'Email content (html or text) is required');
      }
      throw new Error('Email content (html or text) is required');
    }

    const createdAt = new Date().toISOString();

    // Build the from address (uses verified custom domain if available)
    const fromAddress = this.buildFromAddress(options, emailConfig);

    // Prepare Resend payload
    const resendPayload: Record<string, unknown> = {
      from: fromAddress,
      to: toArray,
      subject,
      ...(html ? { html } : {}),
      ...(text ? { text } : {}),
      ...(options.replyTo || emailConfig.replyTo ? { reply_to: options.replyTo || emailConfig.replyTo } : {}),
      ...(options.tags ? { tags: Object.entries(options.tags).map(([name, value]) => ({ name, value })) } : {}),
      ...(options.headers ? { headers: options.headers } : {}),
    };

    // Handle scheduled sending
    if (options.sendAt) {
      resendPayload.scheduled_at = options.sendAt;
    }

    try {
      // Send via Resend API
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(resendPayload),
      });

      const responseData = await response.json() as { id?: string; message?: string };

      if (!response.ok) {
        throw new Error(responseData.message || `Resend API error: ${response.status}`);
      }

      const resendId = responseData.id;

      // Store email record
      const recordStored = await this.storeEmailRecord({
        id: emailId,
        projectId: this.projectId,
        to: toArray,
        subject,
        template: options.template,
        status: options.sendAt ? 'queued' : 'sent',
        resendId,
        idempotencyKey: options.idempotencyKey,
        createdAt,
        sentAt: options.sendAt ? undefined : createdAt,
        html,
        text,
        from: fromAddress,
        replyTo: options.replyTo || emailConfig.replyTo,
        tags: options.tags,
        locale: options.locale,
      });

      // Quota was already reserved, no need to track again

      const result: EmailResult = {
        id: emailId,
        status: options.sendAt ? 'queued' : 'sent',
        to: toArray,
        createdAt,
        scheduledAt: options.sendAt,
      };

      // Add warning if record wasn't stored
      if (!recordStored) {
        result.warning = 'Email sent successfully but the record could not be stored in the database. Email history may be incomplete.';
      }

      return result;
    } catch (error) {
      // Release the quota reservation on failure
      await meteringService.releaseProjectQuota(this.projectId, 'email_sends', 1);

      // Store failed attempt
      await this.storeEmailRecord({
        id: emailId,
        projectId: this.projectId,
        to: toArray,
        subject,
        template: options.template,
        status: 'failed',
        idempotencyKey: options.idempotencyKey,
        createdAt,
        failedAt: createdAt,
        error: error instanceof Error ? error.message : 'Unknown error',
        html,
        text,
        from: fromAddress,
        replyTo: options.replyTo,
        tags: options.tags,
        locale: options.locale,
      });

      throw error;
    }
  }

  /**
   * Store email record in database
   */
  private async storeEmailRecord(record: {
    id: string;
    projectId: string;
    to: string[];
    subject: string;
    template?: string;
    status: string;
    resendId?: string;
    idempotencyKey?: string;
    createdAt: string;
    sentAt?: string;
    failedAt?: string;
    error?: string;
    html?: string;
    text?: string;
    from?: string;
    replyTo?: string;
    tags?: Record<string, string>;
    locale?: SupportedLocale;
  }): Promise<boolean> {
    try {
      await getPool().query(
        `INSERT INTO inhouse_emails
         (id, project_id, to_addresses, subject, template_name, status, resend_id, idempotency_key, created_at, sent_at, failed_at, error_message, html, text, from_address, reply_to, tags, locale)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           resend_id = EXCLUDED.resend_id,
           sent_at = EXCLUDED.sent_at,
           failed_at = EXCLUDED.failed_at,
           error_message = EXCLUDED.error_message,
           html = EXCLUDED.html,
           text = EXCLUDED.text,
           from_address = EXCLUDED.from_address,
           reply_to = EXCLUDED.reply_to,
           tags = EXCLUDED.tags,
           locale = EXCLUDED.locale,
           updated_at = NOW()`,
        [
          record.id,
          record.projectId,
          JSON.stringify(record.to),
          record.subject,
          record.template || null,
          record.status,
          record.resendId || null,
          record.idempotencyKey || null,
          record.createdAt,
          record.sentAt || null,
          record.failedAt || null,
          record.error || null,
          record.html || null,
          record.text || null,
          record.from || null,
          record.replyTo || null,
          record.tags ? JSON.stringify(record.tags) : null,
          record.locale || null,
        ]
      );
      return true;
    } catch (error) {
      console.error('[Email] Failed to store email record:', error);
      // Don't fail the send if we can't store the record
      return false;
    }
  }

  /**
   * Get email by ID
   */
  async get(emailId: string): Promise<EmailInfo | null> {
    try {
      const { rows } = await getPool().query(
        `SELECT * FROM inhouse_emails
         WHERE id = $1 AND project_id = $2`,
        [emailId, this.projectId]
      );

      if (rows.length === 0) {
        return null;
      }

      return this.rowToEmailInfo(rows[0]);
    } catch {
      return null;
    }
  }

  /**
   * List emails
   */
  async list(options: ListEmailsOptions = {}): Promise<ListEmailsResult> {
    const limit = Math.min(options.limit || 20, 100);
    const offset = options.offset || 0;

    try {
      let query = `SELECT * FROM inhouse_emails WHERE project_id = $1`;
      const params: (string | number)[] = [this.projectId];

      if (options.status) {
        query += ` AND status = $2`;
        params.push(options.status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit + 1, offset);

      const { rows } = await getPool().query(query, params);

      const hasMore = rows.length > limit;
      const emails = rows.slice(0, limit).map(row => this.rowToEmailInfo(row));

      // Get total count
      const countQuery = options.status
        ? `SELECT COUNT(*) FROM inhouse_emails WHERE project_id = $1 AND status = $2`
        : `SELECT COUNT(*) FROM inhouse_emails WHERE project_id = $1`;
      const countParams = options.status ? [this.projectId, options.status] : [this.projectId];
      const { rows: countRows } = await getPool().query(countQuery, countParams);
      const total = parseInt(countRows[0]?.count || '0', 10);

      return { emails, total, hasMore };
    } catch {
      return { emails: [], total: 0, hasMore: false };
    }
  }

  /**
   * Convert database row to EmailInfo
   */
  private rowToEmailInfo(row: Record<string, unknown>): EmailInfo {
    // Safely parse to_addresses - handle corrupted JSON gracefully
    let toAddresses: string[];
    if (typeof row.to_addresses === 'string') {
      try {
        toAddresses = JSON.parse(row.to_addresses);
      } catch {
        // Fallback: treat as single address or empty
        toAddresses = row.to_addresses ? [row.to_addresses] : [];
      }
    } else {
      toAddresses = (row.to_addresses as string[]) || [];
    }

    return {
      id: row.id as string,
      projectId: row.project_id as string,
      to: toAddresses,
      subject: row.subject as string,
      template: row.template_name as string | undefined,
      status: row.status as EmailInfo['status'],
      resendId: row.resend_id as string | undefined,
      createdAt: row.created_at as string,
      sentAt: row.sent_at as string | undefined,
      deliveredAt: row.delivered_at as string | undefined,
      failedAt: row.failed_at as string | undefined,
      error: row.error_message as string | undefined,
      html: row.html as string | undefined,
      text: row.text as string | undefined,
      from: row.from_address as string | undefined,
      replyTo: row.reply_to as string | undefined,
      tags: row.tags ? (row.tags as Record<string, string>) : undefined,
      locale: row.locale as SupportedLocale | undefined,
    };
  }
}

// =============================================================================
// SINGLETON FACTORY
// =============================================================================

const SERVICE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_CACHE_SIZE = 100;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  service: InhouseEmailService;
  createdAt: number;
}

const serviceCache = new Map<string, CacheEntry>();

function cleanupServiceCache(): void {
  const now = Date.now();

  // Remove entries older than TTL
  for (const [key, entry] of serviceCache) {
    if (now - entry.createdAt > SERVICE_TTL_MS) {
      serviceCache.delete(key);
    }
  }

  // Enforce max size by removing oldest entries
  if (serviceCache.size > MAX_CACHE_SIZE) {
    const entries = [...serviceCache.entries()]
      .sort((a, b) => a[1].createdAt - b[1].createdAt);
    const toDelete = entries.slice(0, entries.length - MAX_CACHE_SIZE);
    for (const [key] of toDelete) {
      serviceCache.delete(key);
    }
  }
}

export function getInhouseEmailService(projectId: string): InhouseEmailService {
  const cached = serviceCache.get(projectId);
  const now = Date.now();

  // Return cached if exists and not expired
  if (cached && now - cached.createdAt < SERVICE_TTL_MS) {
    return cached.service;
  }

  // Create new service instance
  const service = new InhouseEmailService(projectId);
  serviceCache.set(projectId, { service, createdAt: now });
  return service;
}

// Run cleanup periodically
setInterval(cleanupServiceCache, CLEANUP_INTERVAL_MS);
