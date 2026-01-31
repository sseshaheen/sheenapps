# MENA Localization Technical Implementation Guide

## Overview
This guide provides technical details for implementing Arabic-first and MENA-specific features in the integration platform.

## 1. RTL (Right-to-Left) Implementation

### Next.js Configuration
```typescript
// next.config.js
module.exports = {
  i18n: {
    locales: ['ar', 'en', 'ar-SA', 'ar-EG', 'ar-AE'],
    defaultLocale: 'ar',
    localeDetection: true,
  },
}

// App Router (app/[locale]/layout.tsx)
export default function RootLayout({ 
  children, 
  params: { locale } 
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const dir = locale?.startsWith('ar') ? 'rtl' : 'ltr';
  return (
    <html lang={locale || 'ar'} dir={dir}>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
      </head>
      <body className={locale?.startsWith('ar') ? 'font-arabic' : ''}>
        {children}
      </body>
    </html>
  );
}

// Pages Router (_document.tsx) 
import Document, { Html, Head, Main, NextScript, DocumentContext } from 'next/document'

class MyDocument extends Document {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    const locale = ctx?.locale || 'ar';
    return { ...initialProps, locale };
  }

  render() {
    const { locale } = this.props as any;
    const dir = locale?.startsWith('ar') ? 'rtl' : 'ltr';
    
    return (
      <Html lang={locale} dir={dir}>
        <Head>
          <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap" rel="stylesheet" />
        </Head>
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
```

### Tailwind RTL Support
```javascript
// tailwind.config.js
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  plugins: [
    require('tailwindcss-rtl'), // For rtl: variants
    require('tailwindcss-logical'), // For ps/pe logical properties
  ],
  theme: {
    extend: {
      fontFamily: {
        'arabic': ['Cairo', 'Tajawal', '-apple-system', 'sans-serif'],
      }
    }
  }
}
```

```css
/* Component using both logical properties and RTL variants */
.card {
  @apply ps-4 pe-2; /* Logical: padding-inline-start/end */
  @apply text-start; /* Logical: text at start of line */
  @apply rounded-s-lg; /* Logical: rounded start corners */
  @apply rtl:text-right ltr:text-left; /* Explicit RTL variants when needed */
}

/* Critical: Never use letter-spacing with Arabic */
.arabic-text {
  letter-spacing: 0 !important;
  font-feature-settings: 'liga' 1, 'calt' 1;
}
```

### Mixed LTR/RTL Content
```typescript
// Handle mixed directional content (URLs, code, English names in Arabic text)
function MixedContent({ arabic, english }: { arabic: string; english: string }) {
  return (
    <p dir="rtl">
      {arabic}
      <span dir="ltr" className="inline-block px-1 font-mono">
        {english}
      </span>
    </p>
  );
}

// Force LTR for code blocks even in RTL layout
<pre dir="ltr" className="text-left">
  {codeContent}
</pre>
```

## 2. Arabic Search Configuration

### Elasticsearch Arabic Analyzer
```json
// Elasticsearch index configuration - using built-in analyzers
{
  "settings": {
    "analysis": {
      "analyzer": {
        "arabic_analyzer": {
          "type": "arabic"
          // Built-in Arabic analyzer handles:
          // - Arabic normalization
          // - Arabic stop words
          // - Arabic stemming
        },
        "arabic_with_icu": {
          "type": "custom",
          "tokenizer": "icu_tokenizer",
          "filter": [
            "lowercase",
            "icu_normalizer",
            "arabic_normalization",
            "arabic_stop",
            "arabic_stemmer"
          ]
        }
      },
      "filter": {
        "arabic_stop": {
          "type": "stop",
          "stopwords": "_arabic_"
        },
        "arabic_stemmer": {
          "type": "stemmer",
          "language": "arabic"
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "title_ar": {
        "type": "text",
        "analyzer": "arabic",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 256
          },
          "icu": {
            "type": "text",
            "analyzer": "arabic_with_icu"
          }
        }
      },
      "content_ar": {
        "type": "text",
        "analyzer": "arabic",
        "fields": {
          "keyword": {
            "type": "keyword",
            "ignore_above": 512
          }
        }
      }
    }
  }
}
```

### Arabic Text Handling
```typescript
// IMPORTANT: Do NOT manually normalize Arabic text for storage
// Let Elasticsearch handle normalization in analyzers
// Only use this for display purposes if needed

function prepareForDisplay(text: string): string {
  // Only remove Tatweel for display
  return text.replace(/ـ/g, '');
}

// For search, always use Elasticsearch analyzers
async function searchArabicContent(query: string) {
  return await elastic.search({
    index: 'content',
    body: {
      query: {
        multi_match: {
          query: query, // Raw query - let ES handle normalization
          fields: ['title_ar', 'content_ar', 'title_ar.icu'],
          type: 'best_fields',
          analyzer: 'arabic' // Use built-in analyzer
        }
      }
    }
  });
}

// Keep original text intact for data integrity
function storeArabicContent(content: string) {
  // Store as-is, including diacritics
  return db.insert('content', { 
    text_ar: content, // Original unchanged
    // Let DB/Elasticsearch handle any needed transformations
  });
}
```

## 3. Payment Method Localization

### Dynamic Payment Form
```typescript
interface PaymentFormProps {
  country: 'SA' | 'EG' | 'AE' | 'KW' | 'BH' | 'QA' | 'OM';
  locale: 'ar' | 'en';
}

function PaymentMethodSelector({ country, locale }: PaymentFormProps) {
  const methods = getPaymentMethods(country);
  
  return (
    <div className="grid grid-cols-2 gap-4" dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      {methods.map(method => (
        <button
          key={method.id}
          className="payment-method-card"
          onClick={() => selectMethod(method)}
        >
          <img src={method.logo} alt={method.name[locale]} />
          <span>{method.name[locale]}</span>
        </button>
      ))}
    </div>
  );
}

function getPaymentMethods(country: string) {
  const methods = {
    SA: [
      { id: 'mada', name: { ar: 'مدى', en: 'mada' }, logo: '/mada.svg' },
      { id: 'visa', name: { ar: 'فيزا', en: 'Visa' }, logo: '/visa.svg' },
      { id: 'stcpay', name: { ar: 'STC Pay', en: 'STC Pay' }, logo: '/stcpay.svg' },
      { id: 'tabby', name: { ar: 'تابي', en: 'Tabby' }, logo: '/tabby.svg' }
    ],
    EG: [
      { id: 'meeza', name: { ar: 'ميزة', en: 'Meeza' }, logo: '/meeza.svg' },
      { id: 'vodafone', name: { ar: 'فودافون كاش', en: 'Vodafone Cash' }, logo: '/vcash.svg' },
      { id: 'fawry', name: { ar: 'فوري', en: 'Fawry' }, logo: '/fawry.svg' }
    ],
    KW: [
      { id: 'knet', name: { ar: 'كي نت', en: 'KNET' }, logo: '/knet.svg' },
      { id: 'visa', name: { ar: 'فيزا', en: 'Visa' }, logo: '/visa.svg' }
    ]
    // Add more countries...
  };
  
  return methods[country] || methods.SA;
}
```

## 4. WhatsApp Business Integration

### Message Templates
```typescript
// Arabic WhatsApp templates with variables
const templates = {
  orderConfirmation: {
    ar: `مرحباً {{name}}! 
    
تم استلام طلبك رقم #{{orderNumber}} بنجاح ✅

📦 عدد المنتجات: {{itemCount}}
💰 المجموع: {{total}} {{currency}}
🚚 التوصيل: {{deliveryDate}}

لتتبع طلبك: {{trackingUrl}}

شكراً لثقتك بنا! 🙏`,
    en: `Hello {{name}}!

Your order #{{orderNumber}} has been received successfully ✅

📦 Items: {{itemCount}}
💰 Total: {{total}} {{currency}}
🚚 Delivery: {{deliveryDate}}

Track your order: {{trackingUrl}}

Thank you for your trust! 🙏`
  },
  
  appointmentReminder: {
    ar: `تذكير: لديك موعد غداً

📅 التاريخ: {{date}}
⏰ الوقت: {{time}}
📍 المكان: {{location}}

للتأكيد اضغط 1
للإلغاء اضغط 2
لإعادة الجدولة اضغط 3`,
    en: `Reminder: You have an appointment tomorrow

📅 Date: {{date}}
⏰ Time: {{time}}
📍 Location: {{location}}

To confirm press 1
To cancel press 2
To reschedule press 3`
  }
};

// Send WhatsApp message via Infobip - using parameter arrays
async function sendWhatsAppMessage(
  phoneNumber: string,
  templateName: string,
  parameters: string[], // Ordered array of parameters
  locale: 'ar' | 'en' = 'ar'
) {
  const response = await fetch(`${process.env.INFOBIP_BASE_URL}/whatsapp/1/message/template`, {
    method: 'POST',
    headers: {
      'Authorization': `App ${process.env.INFOBIP_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messages: [{
        from: process.env.WHATSAPP_SENDER_ID,
        to: phoneNumber,
        content: {
          templateName: templateName,
          templateData: {
            body: {
              placeholders: parameters // BSP handles variable substitution
            }
          },
          language: locale === 'ar' ? 'ar' : 'en'
        }
      }]
    })
  });
  
  return response.json();
}

// Helper to manage WhatsApp opt-ins
class WhatsAppOptInManager {
  async recordOptIn(phoneNumber: string, source: string) {
    await db.insert('whatsapp_opt_ins', {
      phone_number: phoneNumber,
      opted_in_at: new Date(),
      source, // 'checkout', 'support', 'marketing'
      locale: 'ar'
    });
  }
  
  async checkOptIn(phoneNumber: string): Promise<boolean> {
    const result = await db.query(
      'SELECT * FROM whatsapp_opt_ins WHERE phone_number = $1 AND opted_out_at IS NULL',
      [phoneNumber]
    );
    return result.rows.length > 0;
  }
  
  async recordOptOut(phoneNumber: string) {
    await db.query(
      'UPDATE whatsapp_opt_ins SET opted_out_at = NOW() WHERE phone_number = $1',
      [phoneNumber]
    );
  }
}

// Template registration helper
class WhatsAppTemplateRegistry {
  private templates = new Map<string, TemplateConfig>();
  
  registerTemplate(name: string, config: TemplateConfig) {
    this.templates.set(name, {
      ...config,
      parameterCount: config.parameters.length,
      approvalStatus: 'pending' // Track BSP approval
    });
  }
  
  async sendMessage(
    phoneNumber: string,
    templateName: string,
    data: Record<string, any>
  ) {
    const template = this.templates.get(templateName);
    if (!template) throw new Error(`Template ${templateName} not found`);
    
    // Map data to ordered parameters
    const parameters = template.parameters.map(param => 
      String(data[param] || '')
    );
    
    return sendWhatsAppMessage(
      phoneNumber,
      templateName,
      parameters,
      template.locale
    );
  }
}

interface TemplateConfig {
  parameters: string[]; // Ordered list of parameter names
  locale: 'ar' | 'en';
  category: 'transactional' | 'marketing' | 'otp';
}
```

## 5. Regional Deployment Configuration

### AWS Middle East Deployment
```typescript
// serverless.yml for AWS Lambda
service: mena-app

provider:
  name: aws
  runtime: nodejs18.x
  region: me-south-1 # Bahrain
  # Alternative: me-central-1 (UAE)
  
  environment:
    DYNAMODB_REGION: me-south-1
    S3_BUCKET_REGION: me-south-1
    
custom:
  # Multi-region deployment
  regions:
    production: me-south-1
    failover: me-central-1
    
resources:
  Resources:
    # S3 bucket in ME region
    AssetsBucket:
      Type: AWS::S3::Bucket
      Properties:
        BucketName: ${self:service}-assets-${self:provider.region}
        CorsConfiguration:
          CorsRules:
            - AllowedOrigins: ['*']
              AllowedHeaders: ['*']
              AllowedMethods: [GET, PUT, POST]
```

### Azure Middle East Configuration
```json
// Azure ARM template
{
  "location": "uaenorth", // or "qatarcentral"
  "properties": {
    "dataResidency": {
      "type": "Zone",
      "locations": ["uaenorth", "uaecentral"]
    }
  }
}
```

## 6. Currency and Number Formatting

```typescript
// Arabic number and currency formatting
import { parsePhoneNumber, isValidPhoneNumber, formatPhoneNumber } from 'libphonenumber-js';

class ArabicFormatter {
  static formatCurrency(
    amount: number,
    currency: string,
    locale: 'ar' | 'en' = 'ar'
  ): string {
    // For Eastern Arabic numerals reliably
    const formatter = new Intl.NumberFormat(
      locale === 'ar' ? 'ar-SA-u-nu-arab' : 'en-US',
      {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2
      }
    );
    
    return formatter.format(amount);
  }
  
  static formatPhoneNumber(
    phone: string,
    country: 'SA' | 'EG' | 'AE' | 'KW' | 'BH' | 'QA' | 'OM',
    format: 'INTERNATIONAL' | 'NATIONAL' | 'E164' = 'NATIONAL'
  ): string {
    try {
      const phoneNumber = parsePhoneNumber(phone, country);
      if (!phoneNumber || !phoneNumber.isValid()) {
        return phone; // Return as-is if invalid
      }
      
      // Store E.164 in database, display in national format
      switch (format) {
        case 'E164':
          return phoneNumber.format('E.164'); // +966501234567
        case 'INTERNATIONAL':
          return phoneNumber.format('INTERNATIONAL'); // +966 50 123 4567
        case 'NATIONAL':
        default:
          return phoneNumber.format('NATIONAL'); // 050 123 4567
      }
    } catch (error) {
      console.warn('Phone parsing error:', error);
      return phone;
    }
  }
  
  static validatePhoneNumber(
    phone: string,
    country: string
  ): { valid: boolean; normalized?: string; displayFormat?: string } {
    try {
      const isValid = isValidPhoneNumber(phone, country);
      if (!isValid) {
        return { valid: false };
      }
      
      const phoneNumber = parsePhoneNumber(phone, country);
      return {
        valid: true,
        normalized: phoneNumber.format('E.164'), // For storage
        displayFormat: phoneNumber.format('NATIONAL') // For display
      };
    } catch (error) {
      return { valid: false };
    }
  }
  
  // Convert between Eastern and Western Arabic numerals
  static convertNumerals(text: string, toEastern: boolean = true): string {
    const easternNumerals = '٠١٢٣٤٥٦٧٨٩';
    const westernNumerals = '0123456789';
    
    if (toEastern) {
      // Western to Eastern
      return text.split('').map(char => {
        const index = westernNumerals.indexOf(char);
        return index !== -1 ? easternNumerals[index] : char;
      }).join('');
    } else {
      // Eastern to Western (for processing)
      return text.split('').map(char => {
        const index = easternNumerals.indexOf(char);
        return index !== -1 ? westernNumerals[index] : char;
      }).join('');
    }
  }
}
```

## 7. Address Handling

```typescript
// what3words Arabic integration
interface ArabicAddress {
  streetName?: string;
  buildingNumber?: string;
  district: string;
  city: string;
  postalCode?: string;
  country: string;
  what3words?: string;
  plusCode?: string;
  landmark?: string; // Common in MENA
}

async function getWhat3WordsArabic(lat: number, lng: number): Promise<string> {
  const response = await fetch(
    `https://api.what3words.com/v3/convert-to-3wa?coordinates=${lat},${lng}&language=ar`,
    {
      headers: {
        'X-Api-Key': process.env.WHAT3WORDS_API_KEY
      }
    }
  );
  
  const data = await response.json();
  return data.words; // Returns Arabic 3 word address
}

// Address form with MENA-specific fields and validation
function AddressForm({ locale, country }: { locale: 'ar' | 'en'; country: string }) {
  const { register, handleSubmit, setValue } = useForm();
  
  // Country-specific required fields
  const getRequiredFields = (country: string) => {
    switch (country) {
      case 'SA':
      case 'AE':
        return ['district', 'city']; // Street/building often missing
      case 'EG':
        return ['district', 'city', 'landmark']; // Landmarks crucial
      default:
        return ['city'];
    }
  };
  
  const requiredFields = getRequiredFields(country);
  
  return (
    <form dir={locale === 'ar' ? 'rtl' : 'ltr'} onSubmit={handleSubmit(onSubmit)}>
      <input
        type="text"
        placeholder={locale === 'ar' ? 'رقم المبنى' : 'Building Number'}
        {...register('buildingNumber')}
      />
      <input
        type="text"
        placeholder={locale === 'ar' ? 'اسم الشارع' : 'Street Name'}
        {...register('streetName')}
      />
      <input
        type="text"
        placeholder={locale === 'ar' ? 'الحي *' : 'District *'}
        {...register('district', { 
          required: requiredFields.includes('district') 
        })}
      />
      <input
        type="text"
        placeholder={locale === 'ar' ? 'معلم قريب' : 'Nearby Landmark'}
        {...register('landmark', {
          required: requiredFields.includes('landmark')
        })}
      />
      
      {/* Optional: what3words with geocoding */}
      <What3WordsInput
        placeholder={locale === 'ar' ? 'كلمات ثلاث (اختياري)' : 'what3words (optional)'}
        onSelect={(coords) => {
          setValue('latitude', coords.lat);
          setValue('longitude', coords.lng);
        }}
        language={locale}
      />
      
      {/* Alternative: Plus Codes for areas without addresses */}
      <input
        type="text"
        placeholder={locale === 'ar' ? 'Plus Code (اختياري)' : 'Plus Code (optional)'}
        {...register('plusCode')}
        pattern="[23456789CFGHJMPQRVWX]{4,}\+[23456789CFGHJMPQRVWX]{2,}"
      />
    </form>
  );
}

// Helper component for what3words
function What3WordsInput({ onSelect, language, ...props }) {
  const [suggestions, setSuggestions] = useState([]);
  
  const handleInput = async (e) => {
    const input = e.target.value;
    if (input.length > 5) {
      const response = await fetch(
        `https://api.what3words.com/v3/autosuggest?input=${input}&language=${language}`,
        { headers: { 'X-Api-Key': process.env.NEXT_PUBLIC_W3W_API_KEY } }
      );
      const data = await response.json();
      setSuggestions(data.suggestions || []);
    }
  };
  
  return (
    <>
      <input {...props} onInput={handleInput} />
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map(s => (
            <li key={s.words} onClick={() => onSelect(s.coordinates)}>
              {s.words} - {s.nearestPlace}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
```

## 8. Testing Arabic Features

```typescript
// Jest tests for Arabic functionality
describe('Arabic Features', () => {
  test('should normalize Arabic text correctly', () => {
    const input = 'محمَّد';
    const expected = 'محمد';
    expect(normalizeArabic(input)).toBe(expected);
  });
  
  test('should format SAR currency in Arabic', () => {
    const amount = 100;
    const formatted = ArabicFormatter.formatCurrency(amount, 'SAR', 'ar');
    expect(formatted).toContain('١٠٠'); // Eastern Arabic numerals
    expect(formatted).toContain('ر.س'); // Saudi Riyal symbol
  });
  
  test('should handle RTL layout', () => {
    const { container } = render(
      <div dir="rtl">
        <button>العربية</button>
      </div>
    );
    expect(container.firstChild).toHaveAttribute('dir', 'rtl');
  });
  
  test('should validate Saudi phone number', () => {
    const validNumbers = ['0501234567', '+966501234567', '00966501234567'];
    validNumbers.forEach(number => {
      expect(isValidSaudiPhone(number)).toBe(true);
    });
  });
});
```

## 9. Payment Error Localization

```typescript
// Normalize payment errors into Arabic user-facing messages
class PaymentErrorLocalizer {
  private errorMap = {
    'insufficient_funds': {
      ar: 'الرصيد غير كافي في البطاقة',
      en: 'Insufficient funds'
    },
    'card_declined': {
      ar: 'المعاملة رُفضت من البنك المُصدِر',
      en: 'Transaction declined by issuing bank'
    },
    'expired_card': {
      ar: 'البطاقة منتهية الصلاحية',
      en: 'Card has expired'
    },
    'incorrect_cvc': {
      ar: 'رمز CVV غير صحيح',
      en: 'Incorrect security code'
    },
    'processing_error': {
      ar: 'حدث خطأ أثناء المعالجة، يرجى المحاولة مرة أخرى',
      en: 'Processing error, please try again'
    },
    '3d_secure_failed': {
      ar: 'فشلت المصادقة الثلاثية، يرجى المحاولة مرة أخرى',
      en: '3D Secure authentication failed'
    }
  };
  
  getLocalizedError(
    errorCode: string,
    locale: 'ar' | 'en' = 'ar',
    provider?: string
  ): string {
    // Map provider-specific codes to standard codes
    const standardCode = this.mapProviderCode(errorCode, provider);
    
    return this.errorMap[standardCode]?.[locale] || 
           this.errorMap['processing_error'][locale];
  }
  
  private mapProviderCode(code: string, provider?: string): string {
    if (provider === 'tap') {
      // Map Tap-specific codes
      switch(code) {
        case '51': return 'insufficient_funds';
        case '05': return 'card_declined';
        case '54': return 'expired_card';
        default: return 'processing_error';
      }
    }
    // Add more provider mappings
    return code;
  }
}
```

## 10. Common Gotchas and Solutions

### Problem: Mixed RTL/LTR Text Alignment
```css
/* Solution: Use logical properties */
.mixed-content {
  padding-inline-start: 1rem; /* instead of padding-left */
  margin-block-end: 0.5rem; /* instead of margin-bottom */
  text-align: start; /* instead of text-align: left */
}
```

### Problem: Arabic Font Rendering
```css
/* Solution: Proper font stack and features */
body[lang="ar"] {
  font-family: 'Cairo', 'Tajawal', -apple-system, sans-serif;
  font-feature-settings: 'liga' 1, 'calt' 1;
  letter-spacing: 0; /* Never use letter-spacing with Arabic */
}
```

### Problem: Number Input in Arabic
```typescript
// Solution: Handle both Eastern and Western numerals in forms
function ArabicNumberInput({ 
  value, 
  onChange,
  ...props 
}: InputProps) {
  const [displayValue, setDisplayValue] = useState('');
  
  useEffect(() => {
    // Display in Eastern Arabic numerals
    setDisplayValue(ArabicFormatter.convertNumerals(String(value), true));
  }, [value]);
  
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value;
    // Convert to Western for processing
    const westernValue = ArabicFormatter.convertNumerals(input, false);
    
    // Validate as number
    if (/^\d*\.?\d*$/.test(westernValue)) {
      onChange(westernValue);
    }
  };
  
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      dir="ltr" // Numbers always LTR even in RTL layout
      value={displayValue}
      onChange={handleChange}
    />
  );
}
```

## 10. Monitoring Arabic Features

```typescript
// Track Arabic-specific metrics
const arabicMetrics = {
  trackPaymentMethod: (method: string, country: string) => {
    analytics.track('Payment Method Selected', {
      method,
      country,
      isLocalMethod: ['mada', 'knet', 'meeza', 'benefit'].includes(method),
      timestamp: new Date().toISOString()
    });
  },
  
  trackLocaleUsage: (locale: string, feature: string) => {
    analytics.track('Locale Feature Usage', {
      locale,
      feature,
      isArabic: locale.startsWith('ar'),
      timestamp: new Date().toISOString()
    });
  },
  
  trackWhatsAppEngagement: (templateName: string, locale: string) => {
    analytics.track('WhatsApp Message Sent', {
      template: templateName,
      locale,
      timestamp: new Date().toISOString()
    });
  }
};
```

## Conclusion

This technical guide provides the foundation for implementing MENA-specific features. Key principles:

1. **Arabic-first, not Arabic-as-afterthought**
2. **Local payment methods take priority**
3. **WhatsApp is primary communication channel**
4. **RTL must work perfectly with mixed content**
5. **Regional data residency is critical**
6. **Test with real Arabic content, not Lorem Ipsum**

For questions or issues, consult the main implementation plan or reach out to the platform team.