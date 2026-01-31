# Chat Streaming with i18n - Frontend Implementation Example

## Overview
The chat streaming API sends real-time events from Claude's execution, including text responses, tool usage, and progress updates. All user-facing messages use template keys for localization.

## Stream Event Types (Based on Actual Claude Output)

```typescript
// Real event types from Claude CLI stream analysis
type StreamEventType = 
  | 'connection'       // Session initialized with Claude
  | 'assistant_text'   // Claude's text responses (can be multiple)
  | 'tool_use'        // Claude using tools (Read, Grep, etc.)
  | 'tool_result'     // Results from tool execution
  | 'usage_update'    // Token usage and cost updates
  | 'complete'        // Final result with full response
  | 'error';          // Error events

interface StreamEvent {
  event: StreamEventType;
  data: any;
  timestamp: string;
}
```

## Frontend i18n Messages

### English (`/locales/en/chat.json`)
```json
{
  "CHAT_CONNECTION_ESTABLISHED": "Connected to AI assistant",
  "CHAT_SESSION_RESUMED": "Resuming previous conversation from {sessionId}",
  
  "CHAT_TOOL_READ_FILE": "Reading {file}...",
  "CHAT_TOOL_SEARCH_CODE": "Searching for '{pattern}'...",
  "CHAT_TOOL_FIND_FILES": "Finding files matching '{pattern}'...",
  "CHAT_TOOL_WRITE_FILE": "Writing to {file}...",
  "CHAT_TOOL_EDIT_FILE": "Editing {file}...",
  "CHAT_TOOL_GENERIC": "Using {tool}...",
  
  "CHAT_TOOL_RESULT_RECEIVED": "Received results",
  "CHAT_TOOL_RESULT_LARGE": "Received {size} bytes of data",
  
  "CHAT_ANALYZING": "Analyzing your request...",
  "CHAT_PROCESSING": "Processing...",
  "CHAT_FINALIZING": "Finalizing response...",
  
  "CHAT_ERROR_INSUFFICIENT_BALANCE": "Insufficient AI time balance. Need {required} minutes, have {available}.",
  "CHAT_ERROR_TIMEOUT": "Request timed out. Please try again.",
  "CHAT_ERROR_GENERAL": "An error occurred: {message}",
  
  "CHAT_COMPLETE_SUCCESS": "Response complete"
}
```

### Arabic (`/locales/ar/chat.json`)
```json
{
  "CHAT_CONNECTION_ESTABLISHED": "تم الاتصال بالمساعد الذكي",
  "CHAT_SESSION_RESUMED": "استئناف المحادثة السابقة من {sessionId}",
  
  "CHAT_TOOL_READ_FILE": "قراءة {file}...",
  "CHAT_TOOL_SEARCH_CODE": "البحث عن '{pattern}'...",
  "CHAT_TOOL_FIND_FILES": "البحث عن الملفات المطابقة لـ '{pattern}'...",
  "CHAT_TOOL_WRITE_FILE": "الكتابة إلى {file}...",
  "CHAT_TOOL_EDIT_FILE": "تحرير {file}...",
  "CHAT_TOOL_GENERIC": "استخدام {tool}...",
  
  "CHAT_TOOL_RESULT_RECEIVED": "تم استلام النتائج",
  "CHAT_TOOL_RESULT_LARGE": "تم استلام {size} بايت من البيانات",
  
  "CHAT_ANALYZING": "تحليل طلبك...",
  "CHAT_PROCESSING": "معالجة...",
  "CHAT_FINALIZING": "وضع اللمسات الأخيرة...",
  
  "CHAT_ERROR_INSUFFICIENT_BALANCE": "رصيد وقت الذكاء الاصطناعي غير كافٍ. تحتاج {required} دقيقة، لديك {available}.",
  "CHAT_ERROR_TIMEOUT": "انتهت مهلة الطلب. يرجى المحاولة مرة أخرى.",
  "CHAT_ERROR_GENERAL": "حدث خطأ: {message}",
  
  "CHAT_COMPLETE_SUCCESS": "اكتمل الرد"
}
```

### Spanish (`/locales/es/chat.json`)
```json
{
  "CHAT_CONNECTION_ESTABLISHED": "Conectado al asistente de IA",
  "CHAT_SESSION_RESUMED": "Reanudando conversación anterior desde {sessionId}",
  
  "CHAT_TOOL_READ_FILE": "Leyendo {file}...",
  "CHAT_TOOL_SEARCH_CODE": "Buscando '{pattern}'...",
  "CHAT_TOOL_FIND_FILES": "Buscando archivos que coincidan con '{pattern}'...",
  "CHAT_TOOL_WRITE_FILE": "Escribiendo en {file}...",
  "CHAT_TOOL_EDIT_FILE": "Editando {file}...",
  "CHAT_TOOL_GENERIC": "Usando {tool}...",
  
  "CHAT_TOOL_RESULT_RECEIVED": "Resultados recibidos",
  "CHAT_TOOL_RESULT_LARGE": "Recibidos {size} bytes de datos",
  
  "CHAT_ANALYZING": "Analizando tu solicitud...",
  "CHAT_PROCESSING": "Procesando...",
  "CHAT_FINALIZING": "Finalizando respuesta...",
  
  "CHAT_ERROR_INSUFFICIENT_BALANCE": "Saldo insuficiente de tiempo de IA. Necesitas {required} minutos, tienes {available}.",
  "CHAT_ERROR_TIMEOUT": "La solicitud ha expirado. Por favor, inténtalo de nuevo.",
  "CHAT_ERROR_GENERAL": "Ocurrió un error: {message}",
  
  "CHAT_COMPLETE_SUCCESS": "Respuesta completa"
}
```

### French (`/locales/fr/chat.json`)
```json
{
  "CHAT_CONNECTION_ESTABLISHED": "Connecté à l'assistant IA",
  "CHAT_SESSION_RESUMED": "Reprise de la conversation précédente depuis {sessionId}",
  
  "CHAT_TOOL_READ_FILE": "Lecture de {file}...",
  "CHAT_TOOL_SEARCH_CODE": "Recherche de '{pattern}'...",
  "CHAT_TOOL_FIND_FILES": "Recherche de fichiers correspondant à '{pattern}'...",
  "CHAT_TOOL_WRITE_FILE": "Écriture dans {file}...",
  "CHAT_TOOL_EDIT_FILE": "Modification de {file}...",
  "CHAT_TOOL_GENERIC": "Utilisation de {tool}...",
  
  "CHAT_TOOL_RESULT_RECEIVED": "Résultats reçus",
  "CHAT_TOOL_RESULT_LARGE": "Reçu {size} octets de données",
  
  "CHAT_ANALYZING": "Analyse de votre demande...",
  "CHAT_PROCESSING": "Traitement...",
  "CHAT_FINALIZING": "Finalisation de la réponse...",
  
  "CHAT_ERROR_INSUFFICIENT_BALANCE": "Solde de temps IA insuffisant. Besoin de {required} minutes, vous avez {available}.",
  "CHAT_ERROR_TIMEOUT": "La demande a expiré. Veuillez réessayer.",
  "CHAT_ERROR_GENERAL": "Une erreur s'est produite : {message}",
  
  "CHAT_COMPLETE_SUCCESS": "Réponse terminée"
}
```

## Frontend Implementation (NextJS)

```typescript
import { useTranslation } from 'next-i18next';
import { EventSourcePolyfill } from 'event-source-polyfill';

interface ChatStreamEvent {
  event: string;
  data: {
    templateKey?: string;
    params?: Record<string, any>;
    text?: string;
    // ... other fields
  };
}

export function useChatStream() {
  const { t, i18n } = useTranslation('chat');
  const [messages, setMessages] = useState<string[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingMessage, setThinkingMessage] = useState('');
  
  const streamChat = async (message: string, locale: string) => {
    const eventSource = new EventSourcePolyfill('/api/v1/chat-plan', {
      method: 'POST',
      headers: {
        'Accept': 'text/event-stream',
        'Content-Type': 'application/json',
        'Accept-Language': locale, // Send user's locale
        'X-HMAC-Signature': await generateHmac(...)
      },
      body: JSON.stringify({
        message,
        locale // Include locale in request
      })
    });
    
    eventSource.addEventListener('thinking', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      
      // Use template key to get localized message
      if (data.templateKey) {
        const localizedMessage = t(data.templateKey, data.params);
        setThinkingMessage(localizedMessage);
        setIsThinking(true);
      }
    });
    
    eventSource.addEventListener('chunk', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setIsThinking(false);
      
      // Append text chunk (already in user's language from Claude)
      if (data.text) {
        setMessages(prev => [...prev, data.text]);
      }
    });
    
    eventSource.addEventListener('error', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      
      // Get localized error message
      if (data.code) {
        const errorMessage = t(data.code, data.params);
        toast.error(errorMessage);
      }
    });
    
    eventSource.addEventListener('complete', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      
      // Handle completion
      if (data.fullResponse?.response?.references) {
        const referencesMessage = t('CHAT_COMPLETE_WITH_REFERENCES', {
          count: data.fullResponse.response.references.length
        });
        toast.success(referencesMessage);
      }
      
      eventSource.close();
    });
  };
  
  return { streamChat, messages, isThinking, thinkingMessage };
}
```

## React Component Example

```tsx
export function ChatInterface() {
  const { locale } = useRouter();
  const { streamChat, messages, isThinking, thinkingMessage } = useChatStream();
  const isRTL = ['ar', 'he', 'fa'].includes(locale);
  
  return (
    <div className={isRTL ? 'rtl' : 'ltr'}>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <ChatMessage key={i} text={msg} />
        ))}
        
        {isThinking && (
          <div className="thinking-indicator">
            <Spinner />
            <span>{thinkingMessage}</span>
          </div>
        )}
      </div>
      
      <ChatInput
        onSubmit={(message) => streamChat(message, locale)}
        disabled={isThinking}
      />
    </div>
  );
}
```

## Benefits of This Approach

1. **True Localization**: Messages are rendered in the user's locale, not the server's
2. **Consistency**: Same pattern as build events system
3. **Flexibility**: Frontend can customize messages without backend changes
4. **Performance**: No server-side i18n overhead
5. **Maintainability**: All translations in one place (frontend)
6. **RTL Support**: Frontend handles text direction based on locale

## Adding New Locales

To add a new locale:

1. Create `/locales/[locale]/chat.json` with all template keys
2. Translate each message maintaining the parameter placeholders
3. No backend changes required!

## Parameter Formatting

The backend sends raw values only:

```typescript
// Backend sends:
{
  templateKey: 'CHAT_ERROR_INSUFFICIENT_BALANCE',
  params: {
    required: 120,  // Raw seconds
    available: 30   // Raw seconds
  }
}

// Frontend formats:
const formatted = t('CHAT_ERROR_INSUFFICIENT_BALANCE', {
  required: formatDuration(params.required),  // "2 minutes"
  available: formatDuration(params.available) // "30 seconds"
});
```

This ensures proper number/date formatting for each locale.