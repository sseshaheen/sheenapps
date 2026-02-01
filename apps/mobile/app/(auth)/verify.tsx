import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { SafeAreaView } from 'react-native-safe-area-context';
import { authApi } from '@/lib/api/client';
import { useAuthStore } from '@/stores/auth';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const { setTokens, setUser, getDeviceId } = useAuthStore();

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (text: string) => {
    // Only allow digits
    const cleaned = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(cleaned);

    // Auto-submit when complete
    if (cleaned.length === CODE_LENGTH) {
      handleVerify(cleaned);
    }
  };

  const handleVerify = async (codeToVerify?: string) => {
    const finalCode = codeToVerify || code;
    if (finalCode.length !== CODE_LENGTH || !email) return;

    setIsLoading(true);
    try {
      const deviceId = await getDeviceId();
      const response = await authApi.verifyCode(email, finalCode, deviceId);

      if (response.ok && response.data) {
        await setTokens(response.data.accessToken, response.data.refreshToken);
        setUser(response.data.user);
        router.replace('/(tabs)');
      } else {
        const errorCode = response.error?.code;
        if (errorCode === 'CODE_EXPIRED') {
          Alert.alert(t('auth.verify.codeExpired'), '', [
            { text: 'OK', onPress: () => setCode('') },
          ]);
        } else {
          Alert.alert(t('auth.verify.wrongCode'), '', [
            { text: 'OK', onPress: () => setCode('') },
          ]);
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to verify code. Please try again.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || !email) return;

    try {
      await authApi.requestCode(email);
      setResendCooldown(RESEND_COOLDOWN);
      setCode('');
      Alert.alert('Code Sent', 'A new code has been sent to your email.');
    } catch {
      Alert.alert('Error', 'Failed to resend code.');
    }
  };

  const handleBack = () => {
    router.back();
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <View style={styles.content}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>

          <View style={styles.header}>
            <Text style={styles.title}>{t('auth.verify.title')}</Text>
            <Text style={styles.subtitle}>
              {t('auth.verify.subtitle', { email })}
            </Text>
          </View>

          <View style={styles.codeContainer}>
            {/* Hidden input for keyboard */}
            <TextInput
              ref={inputRef}
              style={styles.hiddenInput}
              value={code}
              onChangeText={handleCodeChange}
              keyboardType="number-pad"
              maxLength={CODE_LENGTH}
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              editable={!isLoading}
            />

            {/* Visual code boxes */}
            <View style={styles.codeBoxes}>
              {Array.from({ length: CODE_LENGTH }).map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.codeBox,
                    code.length === index && styles.codeBoxActive,
                    code[index] && styles.codeBoxFilled,
                  ]}
                  onPress={() => inputRef.current?.focus()}
                >
                  <Text style={styles.codeDigit}>{code[index] || ''}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {isLoading && (
            <View style={styles.loadingContainer}>
              <ActivityIndicator color="#4F46E5" />
              <Text style={styles.loadingText}>{t('auth.verify.verifying')}</Text>
            </View>
          )}

          <View style={styles.resendContainer}>
            {resendCooldown > 0 ? (
              <Text style={styles.resendCooldown}>
                {t('auth.verify.resendIn', { seconds: resendCooldown })}
              </Text>
            ) : (
              <TouchableOpacity onPress={handleResend}>
                <Text style={styles.resendButton}>{t('auth.verify.resend')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  keyboardView: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  backButton: {
    marginBottom: 20,
  },
  backText: {
    fontSize: 16,
    color: '#4F46E5',
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
  },
  codeContainer: {
    marginBottom: 24,
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 0,
    width: 0,
  },
  codeBoxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  codeBox: {
    flex: 1,
    height: 56,
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  codeBoxActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#FFFFFF',
  },
  codeBoxFilled: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  codeDigit: {
    fontSize: 24,
    fontWeight: '600',
    color: '#111827',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 24,
  },
  loadingText: {
    fontSize: 14,
    color: '#6B7280',
  },
  resendContainer: {
    alignItems: 'center',
  },
  resendCooldown: {
    fontSize: 14,
    color: '#9CA3AF',
  },
  resendButton: {
    fontSize: 14,
    color: '#4F46E5',
    fontWeight: '600',
  },
});
