#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Translations for each locale
const translations = {
  'ar-eg': {
    payWith: "الدفع باستخدام {provider}",
    paymentReference: "رقم المرجع",
    paymentInstructions: "تعليمات الدفع",
    timeRemaining: "الوقت المتبقي",
    voucherExpired: "انتهت صلاحية قسيمة الدفع",
    copyReference: "نسخ المرجع",
    referenceCopied: "تم نسخ المرجع!",
    generateNewVoucher: "إنشاء قسيمة جديدة",
    collectPhone: "إضافة رقم الهاتف",
    phoneLabel: "رقم الهاتف",
    phoneHelp: "أدخل رقم هاتفك بالصيغة الدولية (مثال: +201012345678)",
    phoneRequired: "رقم الهاتف مطلوب",
    invalidPhone: "يرجى إدخال رقم هاتف صحيح بالصيغة الدولية",
    switchToArabic: "التبديل إلى العربية",
    tryDifferentMethod: "جرب طريقة دفع مختلفة",
    retryAfterDelay: "حاول مرة أخرى لاحقاً",
    submit: "إرسال",
    cancel: "إلغاء",
    processing: "جاري المعالجة...",
    purchase: "شراء",
    subscribe: "اشترك",
    chargedIn: "سيتم الدفع بعملة",
    unavailable: "غير متاح",
    taxInclusive: "شامل الضريبة",
    dayTrial: "يوم تجربة",
    providers: {
      stripe: "سترايب",
      fawry: "فوري",
      paymob: "بايموب",
      stcpay: "STC Pay",
      paytabs: "بي تابس"
    },
    errors: {
      notSupported: "طريقة الدفع هذه غير متاحة في منطقتك",
      missingPhone: "رقم الهاتف مطلوب لطريقة الدفع هذه",
      missingLocale: "يرجى التبديل إلى العربية لاستخدام طريقة الدفع هذه",
      providerUnavailable: "مزود الدفع غير متاح مؤقتاً",
      rateLimited: "محاولات كثيرة جداً. يرجى الانتظار قبل المحاولة مرة أخرى",
      activeVoucherExists: "لديك قسيمة دفع نشطة. يرجى إكمالها أو الانتظار حتى انتهاء صلاحيتها قبل إنشاء قسيمة جديدة."
    },
    accessibility: {
      timerUpdate: "الدفع ينتهي خلال {time}",
      voucherExpiredAlert: "انتهت صلاحية قسيمة الدفع",
      qrCodeAlt: "رمز QR للدفع للمرجع {reference}"
    }
  },
  'ar-sa': {
    payWith: "الدفع باستخدام {provider}",
    paymentReference: "رقم المرجع",
    paymentInstructions: "تعليمات الدفع",
    timeRemaining: "الوقت المتبقي",
    voucherExpired: "انتهت صلاحية قسيمة الدفع",
    copyReference: "نسخ المرجع",
    referenceCopied: "تم نسخ المرجع!",
    generateNewVoucher: "إنشاء قسيمة جديدة",
    collectPhone: "إضافة رقم الجوال",
    phoneLabel: "رقم الجوال",
    phoneHelp: "أدخل رقم جوالك بالصيغة الدولية (مثال: +966501234567)",
    phoneRequired: "رقم الجوال مطلوب",
    invalidPhone: "يرجى إدخال رقم جوال صحيح بالصيغة الدولية",
    switchToArabic: "التبديل إلى العربية",
    tryDifferentMethod: "جرب طريقة دفع مختلفة",
    retryAfterDelay: "حاول مرة أخرى لاحقاً",
    submit: "إرسال",
    cancel: "إلغاء",
    processing: "جاري المعالجة...",
    purchase: "شراء",
    subscribe: "اشترك",
    chargedIn: "سيتم الدفع بعملة",
    unavailable: "غير متاح",
    taxInclusive: "شامل الضريبة",
    dayTrial: "يوم تجربة",
    providers: {
      stripe: "سترايب",
      fawry: "فوري",
      paymob: "بايموب",
      stcpay: "STC Pay",
      paytabs: "بي تابس"
    },
    errors: {
      notSupported: "طريقة الدفع هذه غير متاحة في منطقتك",
      missingPhone: "رقم الجوال مطلوب لطريقة الدفع هذه",
      missingLocale: "يرجى التبديل إلى العربية لاستخدام طريقة الدفع هذه",
      providerUnavailable: "مزود الدفع غير متاح مؤقتاً",
      rateLimited: "محاولات كثيرة جداً. يرجى الانتظار قبل المحاولة مرة أخرى",
      activeVoucherExists: "لديك قسيمة دفع نشطة. يرجى إكمالها أو الانتظار حتى انتهاء صلاحيتها قبل إنشاء قسيمة جديدة."
    },
    accessibility: {
      timerUpdate: "الدفع ينتهي خلال {time}",
      voucherExpiredAlert: "انتهت صلاحية قسيمة الدفع",
      qrCodeAlt: "رمز QR للدفع للمرجع {reference}"
    }
  },
  'ar-ae': {
    payWith: "الدفع باستخدام {provider}",
    paymentReference: "رقم المرجع",
    paymentInstructions: "تعليمات الدفع",
    timeRemaining: "الوقت المتبقي",
    voucherExpired: "انتهت صلاحية قسيمة الدفع",
    copyReference: "نسخ المرجع",
    referenceCopied: "تم نسخ المرجع!",
    generateNewVoucher: "إنشاء قسيمة جديدة",
    collectPhone: "إضافة رقم الهاتف",
    phoneLabel: "رقم الهاتف",
    phoneHelp: "أدخل رقم هاتفك بالصيغة الدولية (مثال: +971501234567)",
    phoneRequired: "رقم الهاتف مطلوب",
    invalidPhone: "يرجى إدخال رقم هاتف صحيح بالصيغة الدولية",
    switchToArabic: "التبديل إلى العربية",
    tryDifferentMethod: "جرب طريقة دفع مختلفة",
    retryAfterDelay: "حاول مرة أخرى لاحقاً",
    submit: "إرسال",
    cancel: "إلغاء",
    processing: "جاري المعالجة...",
    purchase: "شراء",
    subscribe: "اشترك",
    chargedIn: "سيتم الدفع بعملة",
    unavailable: "غير متاح",
    taxInclusive: "شامل الضريبة",
    dayTrial: "يوم تجربة",
    providers: {
      stripe: "سترايب",
      fawry: "فوري",
      paymob: "بايموب",
      stcpay: "STC Pay",
      paytabs: "بي تابس"
    },
    errors: {
      notSupported: "طريقة الدفع هذه غير متاحة في منطقتك",
      missingPhone: "رقم الهاتف مطلوب لطريقة الدفع هذه",
      missingLocale: "يرجى التبديل إلى العربية لاستخدام طريقة الدفع هذه",
      providerUnavailable: "مزود الدفع غير متاح مؤقتاً",
      rateLimited: "محاولات كثيرة جداً. يرجى الانتظار قبل المحاولة مرة أخرى",
      activeVoucherExists: "لديك قسيمة دفع نشطة. يرجى إكمالها أو الانتظار حتى انتهاء صلاحيتها قبل إنشاء قسيمة جديدة."
    },
    accessibility: {
      timerUpdate: "الدفع ينتهي خلال {time}",
      voucherExpiredAlert: "انتهت صلاحية قسيمة الدفع",
      qrCodeAlt: "رمز QR للدفع للمرجع {reference}"
    }
  },
  'fr': {
    payWith: "Payer avec {provider}",
    paymentReference: "Référence de paiement",
    paymentInstructions: "Instructions de paiement",
    timeRemaining: "Temps restant",
    voucherExpired: "Le bon de paiement a expiré",
    copyReference: "Copier la référence",
    referenceCopied: "Référence copiée!",
    generateNewVoucher: "Générer un nouveau bon",
    collectPhone: "Ajouter un numéro de téléphone",
    phoneLabel: "Numéro de téléphone",
    phoneHelp: "Entrez votre numéro de téléphone au format international (ex: +33123456789)",
    phoneRequired: "Le numéro de téléphone est requis",
    invalidPhone: "Veuillez entrer un numéro de téléphone valide au format international",
    switchToArabic: "Passer à l'arabe",
    tryDifferentMethod: "Essayer une méthode de paiement différente",
    retryAfterDelay: "Réessayer plus tard",
    submit: "Soumettre",
    cancel: "Annuler",
    processing: "Traitement...",
    purchase: "Acheter",
    subscribe: "S'abonner",
    chargedIn: "Facturé en",
    unavailable: "indisponible",
    taxInclusive: "Taxes incluses",
    dayTrial: "jours d'essai",
    providers: {
      stripe: "Stripe",
      fawry: "Fawry",
      paymob: "Paymob",
      stcpay: "STC Pay",
      paytabs: "PayTabs"
    },
    errors: {
      notSupported: "Cette méthode de paiement n'est pas disponible dans votre région",
      missingPhone: "Le numéro de téléphone est requis pour cette méthode de paiement",
      missingLocale: "Veuillez passer à l'arabe pour utiliser cette méthode de paiement",
      providerUnavailable: "Le fournisseur de paiement est temporairement indisponible",
      rateLimited: "Trop de tentatives. Veuillez attendre avant de réessayer",
      activeVoucherExists: "Vous avez un bon de paiement actif. Veuillez le compléter ou attendre qu'il expire avant de créer un nouveau bon."
    },
    accessibility: {
      timerUpdate: "Le paiement expire dans {time}",
      voucherExpiredAlert: "Le bon de paiement a expiré",
      qrCodeAlt: "Code QR de paiement pour la référence {reference}"
    }
  },
  'fr-ma': {
    payWith: "Payer avec {provider}",
    paymentReference: "Référence de paiement",
    paymentInstructions: "Instructions de paiement",
    timeRemaining: "Temps restant",
    voucherExpired: "Le bon de paiement a expiré",
    copyReference: "Copier la référence",
    referenceCopied: "Référence copiée!",
    generateNewVoucher: "Générer un nouveau bon",
    collectPhone: "Ajouter un numéro de téléphone",
    phoneLabel: "Numéro de téléphone",
    phoneHelp: "Entrez votre numéro de téléphone au format international (ex: +212601234567)",
    phoneRequired: "Le numéro de téléphone est requis",
    invalidPhone: "Veuillez entrer un numéro de téléphone valide au format international",
    switchToArabic: "Passer à l'arabe",
    tryDifferentMethod: "Essayer une méthode de paiement différente",
    retryAfterDelay: "Réessayer plus tard",
    submit: "Soumettre",
    cancel: "Annuler",
    processing: "Traitement...",
    purchase: "Acheter",
    subscribe: "S'abonner",
    chargedIn: "Facturé en",
    unavailable: "indisponible",
    taxInclusive: "Taxes incluses",
    dayTrial: "jours d'essai",
    providers: {
      stripe: "Stripe",
      fawry: "Fawry",
      paymob: "Paymob",
      stcpay: "STC Pay",
      paytabs: "PayTabs"
    },
    errors: {
      notSupported: "Cette méthode de paiement n'est pas disponible dans votre région",
      missingPhone: "Le numéro de téléphone est requis pour cette méthode de paiement",
      missingLocale: "Veuillez passer à l'arabe pour utiliser cette méthode de paiement",
      providerUnavailable: "Le fournisseur de paiement est temporairement indisponible",
      rateLimited: "Trop de tentatives. Veuillez attendre avant de réessayer",
      activeVoucherExists: "Vous avez un bon de paiement actif. Veuillez le compléter ou attendre qu'il expire avant de créer un nouveau bon."
    },
    accessibility: {
      timerUpdate: "Le paiement expire dans {time}",
      voucherExpiredAlert: "Le bon de paiement a expiré",
      qrCodeAlt: "Code QR de paiement pour la référence {reference}"
    }
  },
  'es': {
    payWith: "Pagar con {provider}",
    paymentReference: "Referencia de pago",
    paymentInstructions: "Instrucciones de pago",
    timeRemaining: "Tiempo restante",
    voucherExpired: "El vale de pago ha expirado",
    copyReference: "Copiar referencia",
    referenceCopied: "¡Referencia copiada!",
    generateNewVoucher: "Generar nuevo vale",
    collectPhone: "Agregar número de teléfono",
    phoneLabel: "Número de teléfono",
    phoneHelp: "Ingrese su número de teléfono en formato internacional (ej: +34912345678)",
    phoneRequired: "El número de teléfono es requerido",
    invalidPhone: "Por favor ingrese un número de teléfono válido en formato internacional",
    switchToArabic: "Cambiar al árabe",
    tryDifferentMethod: "Probar otro método de pago",
    retryAfterDelay: "Intentar más tarde",
    submit: "Enviar",
    cancel: "Cancelar",
    processing: "Procesando...",
    purchase: "Comprar",
    subscribe: "Suscribirse",
    chargedIn: "Cobrado en",
    unavailable: "no disponible",
    taxInclusive: "Impuestos incluidos",
    dayTrial: "días de prueba",
    providers: {
      stripe: "Stripe",
      fawry: "Fawry",
      paymob: "Paymob",
      stcpay: "STC Pay",
      paytabs: "PayTabs"
    },
    errors: {
      notSupported: "Este método de pago no está disponible en su región",
      missingPhone: "El número de teléfono es requerido para este método de pago",
      missingLocale: "Por favor cambie al árabe para usar este método de pago",
      providerUnavailable: "El proveedor de pago está temporalmente no disponible",
      rateLimited: "Demasiados intentos. Por favor espere antes de intentar de nuevo",
      activeVoucherExists: "Tiene un vale de pago activo. Por favor complételo o espere a que expire antes de crear uno nuevo."
    },
    accessibility: {
      timerUpdate: "El pago expira en {time}",
      voucherExpiredAlert: "El vale de pago ha expirado",
      qrCodeAlt: "Código QR de pago para la referencia {reference}"
    }
  },
  'de': {
    payWith: "Bezahlen mit {provider}",
    paymentReference: "Zahlungsreferenz",
    paymentInstructions: "Zahlungsanweisungen",
    timeRemaining: "Verbleibende Zeit",
    voucherExpired: "Der Zahlungsgutschein ist abgelaufen",
    copyReference: "Referenz kopieren",
    referenceCopied: "Referenz kopiert!",
    generateNewVoucher: "Neuen Gutschein erstellen",
    collectPhone: "Telefonnummer hinzufügen",
    phoneLabel: "Telefonnummer",
    phoneHelp: "Geben Sie Ihre Telefonnummer im internationalen Format ein (z.B.: +49301234567)",
    phoneRequired: "Telefonnummer ist erforderlich",
    invalidPhone: "Bitte geben Sie eine gültige Telefonnummer im internationalen Format ein",
    switchToArabic: "Auf Arabisch wechseln",
    tryDifferentMethod: "Andere Zahlungsmethode versuchen",
    retryAfterDelay: "Später erneut versuchen",
    submit: "Absenden",
    cancel: "Abbrechen",
    processing: "Wird verarbeitet...",
    purchase: "Kaufen",
    subscribe: "Abonnieren",
    chargedIn: "Berechnet in",
    unavailable: "nicht verfügbar",
    taxInclusive: "Inklusive Steuern",
    dayTrial: "Tage Testversion",
    providers: {
      stripe: "Stripe",
      fawry: "Fawry",
      paymob: "Paymob",
      stcpay: "STC Pay",
      paytabs: "PayTabs"
    },
    errors: {
      notSupported: "Diese Zahlungsmethode ist in Ihrer Region nicht verfügbar",
      missingPhone: "Telefonnummer ist für diese Zahlungsmethode erforderlich",
      missingLocale: "Bitte wechseln Sie zu Arabisch, um diese Zahlungsmethode zu verwenden",
      providerUnavailable: "Der Zahlungsanbieter ist vorübergehend nicht verfügbar",
      rateLimited: "Zu viele Versuche. Bitte warten Sie, bevor Sie es erneut versuchen",
      activeVoucherExists: "Sie haben einen aktiven Zahlungsgutschein. Bitte schließen Sie ihn ab oder warten Sie, bis er abläuft, bevor Sie einen neuen erstellen."
    },
    accessibility: {
      timerUpdate: "Zahlung läuft ab in {time}",
      voucherExpiredAlert: "Zahlungsgutschein ist abgelaufen",
      qrCodeAlt: "Zahlungs-QR-Code für Referenz {reference}"
    }
  }
};

// Files to update
const locales = ['ar-eg', 'ar-sa', 'ar-ae', 'fr', 'fr-ma', 'es', 'de'];

locales.forEach(locale => {
  const filePath = path.join(__dirname, '..', 'src', 'messages', locale, 'billing.json');
  
  try {
    // Read existing file
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);
    
    // Add new translations
    Object.keys(translations[locale]).forEach(key => {
      if (!data[key]) {
        data[key] = translations[locale][key];
      }
    });
    
    // Write back
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log(`✅ Updated ${locale}/billing.json`);
  } catch (error) {
    console.error(`❌ Error updating ${locale}/billing.json:`, error.message);
  }
});

console.log('✅ All locale files updated with multi-provider translations');