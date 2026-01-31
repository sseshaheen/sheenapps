const fs = require('fs')
const path = require('path')

// Proper translations for all error codes
const translations = {
  'ar-eg': {
    "AI_LIMIT_REACHED": "خدمة الذكاء الاصطناعي بتشتغل بكامل طاقتها دلوقتي. جرب تاني بعد {minutes} دقيقة.",
    "NETWORK_TIMEOUT": "انتهت مهلة الاتصال. اتأكد من الإنترنت بتاعك وجرب تاني.",
    "RATE_LIMITED": "طلبات كتير أوي. استنى شوية وجرب تاني.",
    "AUTH_FAILED": "لازم تسجل دخول عشان تكمل.",
    "PROVIDER_UNAVAILABLE": "خدمة الذكاء الاصطناعي مش شغالة دلوقتي. هنرجعها بسرعة.",
    "INTERNAL_ERROR": "حصل خطأ مش متوقع. جرب تاني.",
    "AUTH_EXPIRED": "انتهت صلاحية الجلسة. سجل دخول تاني.",
    "INSUFFICIENT_BALANCE": "الرصيد مش كفاية. اشحن حسابك.",
    "BUILD_TIMEOUT": "انتهت مهلة البناء. جرب تاني.",
    "BUILD_FAILED": "البناء فشل. جرب تاني.",
    "INVALID_INPUT": "البيانات مش صح. راجعها تاني.",
    "VALIDATION_FAILED": "فشل التحقق. راجع البيانات.",
    titles: {
      "AI_LIMIT_REACHED": "الذكاء الاصطناعي مشغول",
      "NETWORK_TIMEOUT": "مشكلة في الاتصال",
      "RATE_LIMITED": "استنى شوية",
      "AUTH_FAILED": "سجل دخول",
      "PROVIDER_UNAVAILABLE": "الخدمة مش شغالة",
      "INTERNAL_ERROR": "حصلت مشكلة",
      "AUTH_EXPIRED": "الجلسة انتهت",
      "INSUFFICIENT_BALANCE": "الرصيد مش كافي",
      "BUILD_TIMEOUT": "انتهت المهلة",
      "BUILD_FAILED": "البناء فشل",
      "INVALID_INPUT": "بيانات غلط",
      "VALIDATION_FAILED": "فشل التحقق"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "جرب دلوقتي",
      "NETWORK_TIMEOUT": "جرب تاني",
      "RATE_LIMITED": "جرب تاني",
      "AUTH_FAILED": "سجل دخول",
      "PROVIDER_UNAVAILABLE": "جرب تاني",
      "INTERNAL_ERROR": "جرب تاني",
      "AUTH_EXPIRED": "سجل دخول",
      "INSUFFICIENT_BALANCE": "اشحن الرصيد",
      "BUILD_TIMEOUT": "جرب تاني",
      "BUILD_FAILED": "جرب تاني",
      "INVALID_INPUT": "صحح البيانات",
      "VALIDATION_FAILED": "راجع البيانات"
    },
    countdown: {
      "availableIn": "هيكون متاح في {time}",
      "availableNow": "متاح دلوقتي",
      "minute": "دقيقة",
      "minutes": "دقايق",
      "second": "ثانية",
      "seconds": "ثواني"
    }
  },
  'ar-sa': {
    "AI_LIMIT_REACHED": "خدمة الذكاء الاصطناعي تعمل بكامل طاقتها حالياً. الرجاء المحاولة بعد {minutes} دقيقة.",
    "NETWORK_TIMEOUT": "انتهت مهلة الاتصال. الرجاء التحقق من الإنترنت والمحاولة مجدداً.",
    "RATE_LIMITED": "طلبات كثيرة جداً. الرجاء الانتظار قليلاً.",
    "AUTH_FAILED": "يجب تسجيل الدخول للمتابعة.",
    "PROVIDER_UNAVAILABLE": "خدمة الذكاء الاصطناعي غير متاحة حالياً. نعمل على إعادتها.",
    "INTERNAL_ERROR": "حدث خطأ غير متوقع. الرجاء المحاولة مجدداً.",
    "AUTH_EXPIRED": "انتهت صلاحية الجلسة. الرجاء تسجيل الدخول مجدداً.",
    "INSUFFICIENT_BALANCE": "الرصيد غير كافي. الرجاء شحن الحساب.",
    "BUILD_TIMEOUT": "انتهت مهلة البناء. الرجاء المحاولة مجدداً.",
    "BUILD_FAILED": "فشل البناء. الرجاء المحاولة مجدداً.",
    "INVALID_INPUT": "المدخلات غير صحيحة. الرجاء التحقق.",
    "VALIDATION_FAILED": "فشل التحقق. الرجاء مراجعة البيانات.",
    titles: {
      "AI_LIMIT_REACHED": "الذكاء الاصطناعي بكامل الطاقة",
      "NETWORK_TIMEOUT": "مشكلة في الاتصال",
      "RATE_LIMITED": "الرجاء الانتظار",
      "AUTH_FAILED": "يلزم تسجيل الدخول",
      "PROVIDER_UNAVAILABLE": "الخدمة غير متاحة",
      "INTERNAL_ERROR": "حدث خطأ",
      "AUTH_EXPIRED": "انتهت الجلسة",
      "INSUFFICIENT_BALANCE": "رصيد غير كافي",
      "BUILD_TIMEOUT": "انتهت المهلة",
      "BUILD_FAILED": "فشل البناء",
      "INVALID_INPUT": "مدخلات خاطئة",
      "VALIDATION_FAILED": "فشل التحقق"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "المحاولة الآن",
      "NETWORK_TIMEOUT": "المحاولة مجدداً",
      "RATE_LIMITED": "المحاولة مجدداً",
      "AUTH_FAILED": "تسجيل الدخول",
      "PROVIDER_UNAVAILABLE": "المحاولة مجدداً",
      "INTERNAL_ERROR": "المحاولة مجدداً",
      "AUTH_EXPIRED": "تسجيل الدخول",
      "INSUFFICIENT_BALANCE": "شحن الرصيد",
      "BUILD_TIMEOUT": "المحاولة مجدداً",
      "BUILD_FAILED": "المحاولة مجدداً",
      "INVALID_INPUT": "تصحيح البيانات",
      "VALIDATION_FAILED": "مراجعة البيانات"
    },
    countdown: {
      "availableIn": "متاح خلال {time}",
      "availableNow": "متاح الآن",
      "minute": "دقيقة",
      "minutes": "دقائق",
      "second": "ثانية",
      "seconds": "ثواني"
    }
  },
  'ar-ae': {
    "AI_LIMIT_REACHED": "خدمة الذكاء الاصطناعي مشغولة حالياً. حاول بعد {minutes} دقيقة.",
    "NETWORK_TIMEOUT": "انتهت مهلة الاتصال. تأكد من الإنترنت وحاول مرة ثانية.",
    "RATE_LIMITED": "طلبات كثيرة. انتظر قليلاً من فضلك.",
    "AUTH_FAILED": "يجب تسجيل الدخول للاستمرار.",
    "PROVIDER_UNAVAILABLE": "خدمة الذكاء الاصطناعي غير متوفرة حالياً.",
    "INTERNAL_ERROR": "حدث خطأ. حاول مرة ثانية.",
    "AUTH_EXPIRED": "انتهت الجلسة. سجل دخول مرة ثانية.",
    "INSUFFICIENT_BALANCE": "الرصيد غير كافي. اشحن حسابك.",
    "BUILD_TIMEOUT": "انتهت مهلة البناء. حاول مرة ثانية.",
    "BUILD_FAILED": "فشل البناء. حاول مرة ثانية.",
    "INVALID_INPUT": "البيانات غير صحيحة.",
    "VALIDATION_FAILED": "فشل التحقق من البيانات.",
    titles: {
      "AI_LIMIT_REACHED": "الذكاء الاصطناعي مشغول",
      "NETWORK_TIMEOUT": "مشكلة اتصال",
      "RATE_LIMITED": "انتظر من فضلك",
      "AUTH_FAILED": "تسجيل دخول مطلوب",
      "PROVIDER_UNAVAILABLE": "الخدمة غير متوفرة",
      "INTERNAL_ERROR": "حدث خطأ",
      "AUTH_EXPIRED": "انتهت الجلسة",
      "INSUFFICIENT_BALANCE": "رصيد غير كافي",
      "BUILD_TIMEOUT": "انتهت المهلة",
      "BUILD_FAILED": "فشل البناء",
      "INVALID_INPUT": "بيانات خاطئة",
      "VALIDATION_FAILED": "فشل التحقق"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "حاول الآن",
      "NETWORK_TIMEOUT": "حاول مرة ثانية",
      "RATE_LIMITED": "حاول مرة ثانية",
      "AUTH_FAILED": "سجل دخول",
      "PROVIDER_UNAVAILABLE": "حاول مرة ثانية",
      "INTERNAL_ERROR": "حاول مرة ثانية",
      "AUTH_EXPIRED": "سجل دخول",
      "INSUFFICIENT_BALANCE": "اشحن الرصيد",
      "BUILD_TIMEOUT": "حاول مرة ثانية",
      "BUILD_FAILED": "حاول مرة ثانية",
      "INVALID_INPUT": "صحح البيانات",
      "VALIDATION_FAILED": "راجع البيانات"
    },
    countdown: {
      "availableIn": "متوفر خلال {time}",
      "availableNow": "متوفر الآن",
      "minute": "دقيقة",
      "minutes": "دقائق",
      "second": "ثانية",
      "seconds": "ثواني"
    }
  },
  'fr': {
    "AI_LIMIT_REACHED": "Notre service IA est temporairement à pleine capacité. Veuillez réessayer dans {minutes} minutes.",
    "NETWORK_TIMEOUT": "Délai de connexion dépassé. Vérifiez votre connexion internet et réessayez.",
    "RATE_LIMITED": "Trop de requêtes. Veuillez patienter un moment.",
    "AUTH_FAILED": "Authentification requise. Veuillez vous connecter pour continuer.",
    "PROVIDER_UNAVAILABLE": "Notre service IA est temporairement indisponible. Nous travaillons à le restaurer rapidement.",
    "INTERNAL_ERROR": "Une erreur inattendue s'est produite. Veuillez réessayer.",
    "AUTH_EXPIRED": "Votre session a expiré. Veuillez vous reconnecter.",
    "INSUFFICIENT_BALANCE": "Solde insuffisant. Veuillez recharger votre compte.",
    "BUILD_TIMEOUT": "Le délai de construction a expiré. Veuillez réessayer.",
    "BUILD_FAILED": "La construction a échoué. Veuillez réessayer.",
    "INVALID_INPUT": "Entrée invalide. Veuillez vérifier les données.",
    "VALIDATION_FAILED": "La validation a échoué. Veuillez vérifier les données.",
    titles: {
      "AI_LIMIT_REACHED": "Service IA à pleine capacité",
      "NETWORK_TIMEOUT": "Problème de connexion",
      "RATE_LIMITED": "Veuillez patienter",
      "AUTH_FAILED": "Authentification requise",
      "PROVIDER_UNAVAILABLE": "Service temporairement indisponible",
      "INTERNAL_ERROR": "Une erreur s'est produite",
      "AUTH_EXPIRED": "Session expirée",
      "INSUFFICIENT_BALANCE": "Solde insuffisant",
      "BUILD_TIMEOUT": "Délai expiré",
      "BUILD_FAILED": "Échec de construction",
      "INVALID_INPUT": "Entrée invalide",
      "VALIDATION_FAILED": "Échec de validation"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "Réessayer maintenant",
      "NETWORK_TIMEOUT": "Réessayer",
      "RATE_LIMITED": "Réessayer",
      "AUTH_FAILED": "Se connecter",
      "PROVIDER_UNAVAILABLE": "Réessayer",
      "INTERNAL_ERROR": "Réessayer",
      "AUTH_EXPIRED": "Se reconnecter",
      "INSUFFICIENT_BALANCE": "Recharger",
      "BUILD_TIMEOUT": "Réessayer",
      "BUILD_FAILED": "Réessayer",
      "INVALID_INPUT": "Corriger",
      "VALIDATION_FAILED": "Vérifier"
    },
    countdown: {
      "availableIn": "Disponible dans {time}",
      "availableNow": "Disponible maintenant",
      "minute": "minute",
      "minutes": "minutes",
      "second": "seconde",
      "seconds": "secondes"
    }
  },
  'fr-ma': {
    "AI_LIMIT_REACHED": "Le service IA est complet pour le moment. Essayez dans {minutes} minutes.",
    "NETWORK_TIMEOUT": "Connexion expirée. Vérifiez votre internet et réessayez.",
    "RATE_LIMITED": "Trop de demandes. Attendez un peu s'il vous plaît.",
    "AUTH_FAILED": "Connectez-vous pour continuer.",
    "PROVIDER_UNAVAILABLE": "Le service IA n'est pas disponible maintenant.",
    "INTERNAL_ERROR": "Une erreur s'est produite. Réessayez.",
    "AUTH_EXPIRED": "Session expirée. Reconnectez-vous.",
    "INSUFFICIENT_BALANCE": "Crédit insuffisant. Rechargez votre compte.",
    "BUILD_TIMEOUT": "Délai de construction dépassé.",
    "BUILD_FAILED": "Construction échouée. Réessayez.",
    "INVALID_INPUT": "Données incorrectes.",
    "VALIDATION_FAILED": "Vérification échouée.",
    titles: {
      "AI_LIMIT_REACHED": "IA occupée",
      "NETWORK_TIMEOUT": "Problème réseau",
      "RATE_LIMITED": "Patientez",
      "AUTH_FAILED": "Connexion requise",
      "PROVIDER_UNAVAILABLE": "Service indisponible",
      "INTERNAL_ERROR": "Erreur",
      "AUTH_EXPIRED": "Session finie",
      "INSUFFICIENT_BALANCE": "Crédit insuffisant",
      "BUILD_TIMEOUT": "Délai dépassé",
      "BUILD_FAILED": "Échec",
      "INVALID_INPUT": "Données incorrectes",
      "VALIDATION_FAILED": "Vérification échouée"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "Réessayer",
      "NETWORK_TIMEOUT": "Réessayer",
      "RATE_LIMITED": "Réessayer",
      "AUTH_FAILED": "Connexion",
      "PROVIDER_UNAVAILABLE": "Réessayer",
      "INTERNAL_ERROR": "Réessayer",
      "AUTH_EXPIRED": "Connexion",
      "INSUFFICIENT_BALANCE": "Recharger",
      "BUILD_TIMEOUT": "Réessayer",
      "BUILD_FAILED": "Réessayer",
      "INVALID_INPUT": "Corriger",
      "VALIDATION_FAILED": "Vérifier"
    },
    countdown: {
      "availableIn": "Disponible dans {time}",
      "availableNow": "Disponible maintenant",
      "minute": "minute",
      "minutes": "minutes",
      "second": "seconde",
      "seconds": "secondes"
    }
  },
  'es': {
    "AI_LIMIT_REACHED": "Nuestro servicio de IA está temporalmente a plena capacidad. Por favor, intente de nuevo en {minutes} minutos.",
    "NETWORK_TIMEOUT": "Se agotó el tiempo de conexión. Verifique su conexión a internet e intente de nuevo.",
    "RATE_LIMITED": "Demasiadas solicitudes. Por favor, espere un momento.",
    "AUTH_FAILED": "Se requiere autenticación. Por favor, inicie sesión para continuar.",
    "PROVIDER_UNAVAILABLE": "Nuestro servicio de IA no está disponible temporalmente. Estamos trabajando para restaurarlo rápidamente.",
    "INTERNAL_ERROR": "Ocurrió un error inesperado. Por favor, intente de nuevo.",
    "AUTH_EXPIRED": "Su sesión ha expirado. Por favor, inicie sesión nuevamente.",
    "INSUFFICIENT_BALANCE": "Saldo insuficiente. Por favor, recargue su cuenta.",
    "BUILD_TIMEOUT": "Se agotó el tiempo de construcción. Por favor, intente de nuevo.",
    "BUILD_FAILED": "La construcción falló. Por favor, intente de nuevo.",
    "INVALID_INPUT": "Entrada inválida. Por favor, verifique los datos.",
    "VALIDATION_FAILED": "La validación falló. Por favor, revise los datos.",
    titles: {
      "AI_LIMIT_REACHED": "Servicio IA a capacidad máxima",
      "NETWORK_TIMEOUT": "Problema de conexión",
      "RATE_LIMITED": "Por favor espere",
      "AUTH_FAILED": "Autenticación requerida",
      "PROVIDER_UNAVAILABLE": "Servicio temporalmente no disponible",
      "INTERNAL_ERROR": "Ocurrió un error",
      "AUTH_EXPIRED": "Sesión expirada",
      "INSUFFICIENT_BALANCE": "Saldo insuficiente",
      "BUILD_TIMEOUT": "Tiempo agotado",
      "BUILD_FAILED": "Construcción fallida",
      "INVALID_INPUT": "Entrada inválida",
      "VALIDATION_FAILED": "Validación fallida"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "Reintentar ahora",
      "NETWORK_TIMEOUT": "Reintentar",
      "RATE_LIMITED": "Intentar de nuevo",
      "AUTH_FAILED": "Iniciar sesión",
      "PROVIDER_UNAVAILABLE": "Reintentar",
      "INTERNAL_ERROR": "Reintentar",
      "AUTH_EXPIRED": "Iniciar sesión",
      "INSUFFICIENT_BALANCE": "Recargar",
      "BUILD_TIMEOUT": "Reintentar",
      "BUILD_FAILED": "Reintentar",
      "INVALID_INPUT": "Corregir",
      "VALIDATION_FAILED": "Revisar"
    },
    countdown: {
      "availableIn": "Disponible en {time}",
      "availableNow": "Disponible ahora",
      "minute": "minuto",
      "minutes": "minutos",
      "second": "segundo",
      "seconds": "segundos"
    }
  },
  'de': {
    "AI_LIMIT_REACHED": "Unser KI-Dienst ist vorübergehend ausgelastet. Bitte versuchen Sie es in {minutes} Minuten erneut.",
    "NETWORK_TIMEOUT": "Verbindung abgelaufen. Bitte überprüfen Sie Ihre Internetverbindung und versuchen Sie es erneut.",
    "RATE_LIMITED": "Zu viele Anfragen. Bitte warten Sie einen Moment.",
    "AUTH_FAILED": "Authentifizierung erforderlich. Bitte melden Sie sich an, um fortzufahren.",
    "PROVIDER_UNAVAILABLE": "Unser KI-Dienst ist vorübergehend nicht verfügbar. Wir arbeiten daran, ihn schnell wiederherzustellen.",
    "INTERNAL_ERROR": "Ein unerwarteter Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
    "AUTH_EXPIRED": "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
    "INSUFFICIENT_BALANCE": "Unzureichendes Guthaben. Bitte laden Sie Ihr Konto auf.",
    "BUILD_TIMEOUT": "Build-Zeitüberschreitung. Bitte versuchen Sie es erneut.",
    "BUILD_FAILED": "Build fehlgeschlagen. Bitte versuchen Sie es erneut.",
    "INVALID_INPUT": "Ungültige Eingabe. Bitte überprüfen Sie die Daten.",
    "VALIDATION_FAILED": "Validierung fehlgeschlagen. Bitte überprüfen Sie die Daten.",
    titles: {
      "AI_LIMIT_REACHED": "KI-Dienst ausgelastet",
      "NETWORK_TIMEOUT": "Verbindungsproblem",
      "RATE_LIMITED": "Bitte warten",
      "AUTH_FAILED": "Authentifizierung erforderlich",
      "PROVIDER_UNAVAILABLE": "Dienst vorübergehend nicht verfügbar",
      "INTERNAL_ERROR": "Ein Fehler ist aufgetreten",
      "AUTH_EXPIRED": "Sitzung abgelaufen",
      "INSUFFICIENT_BALANCE": "Unzureichendes Guthaben",
      "BUILD_TIMEOUT": "Zeitüberschreitung",
      "BUILD_FAILED": "Build fehlgeschlagen",
      "INVALID_INPUT": "Ungültige Eingabe",
      "VALIDATION_FAILED": "Validierung fehlgeschlagen"
    },
    retryButtons: {
      "AI_LIMIT_REACHED": "Jetzt erneut versuchen",
      "NETWORK_TIMEOUT": "Erneut versuchen",
      "RATE_LIMITED": "Erneut versuchen",
      "AUTH_FAILED": "Anmelden",
      "PROVIDER_UNAVAILABLE": "Erneut versuchen",
      "INTERNAL_ERROR": "Erneut versuchen",
      "AUTH_EXPIRED": "Anmelden",
      "INSUFFICIENT_BALANCE": "Aufladen",
      "BUILD_TIMEOUT": "Erneut versuchen",
      "BUILD_FAILED": "Erneut versuchen",
      "INVALID_INPUT": "Korrigieren",
      "VALIDATION_FAILED": "Überprüfen"
    },
    countdown: {
      "availableIn": "Verfügbar in {time}",
      "availableNow": "Jetzt verfügbar",
      "minute": "Minute",
      "minutes": "Minuten",
      "second": "Sekunde",
      "seconds": "Sekunden"
    }
  }
}

// Apply translations to each locale
Object.entries(translations).forEach(([locale, errorTranslations]) => {
  const filePath = path.join(__dirname, `../src/messages/${locale}/errors.json`)
  
  if (fs.existsSync(filePath)) {
    const current = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    
    // Update error code messages
    Object.entries(errorTranslations).forEach(([key, value]) => {
      if (typeof value === 'string') {
        current[key] = value
      } else if (typeof value === 'object') {
        current[key] = { ...current[key], ...value }
      }
    })
    
    fs.writeFileSync(filePath, JSON.stringify(current, null, 2))
    console.log(`✅ Fixed ${locale} error translations`)
  }
})

console.log('\n✅ All error translations fixed!')