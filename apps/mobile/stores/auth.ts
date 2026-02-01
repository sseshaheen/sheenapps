import { create } from 'zustand';
import * as SecureStore from 'expo-secure-store';
import { randomUUID } from 'expo-crypto';

const TOKEN_KEY = 'sheenapps_access_token';
const REFRESH_KEY = 'sheenapps_refresh_token';
const DEVICE_ID_KEY = 'sheenapps_device_id';

interface AuthState {
  isInitialized: boolean;
  isAuthenticated: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  deviceId: string | null;
  user: { id: string; email: string } | null;

  // Actions
  initialize: () => Promise<void>;
  setTokens: (accessToken: string, refreshToken: string) => Promise<void>;
  setUser: (user: { id: string; email: string }) => void;
  getDeviceId: () => Promise<string>;
  logout: () => Promise<void>;
  clearAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  isInitialized: false,
  isAuthenticated: false,
  accessToken: null,
  refreshToken: null,
  deviceId: null,
  user: null,

  initialize: async () => {
    try {
      const [accessToken, refreshToken, deviceId] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_KEY),
        SecureStore.getItemAsync(DEVICE_ID_KEY),
      ]);

      // Generate device ID if not exists
      let finalDeviceId = deviceId;
      if (!finalDeviceId) {
        finalDeviceId = randomUUID();
        await SecureStore.setItemAsync(DEVICE_ID_KEY, finalDeviceId);
      }

      set({
        isInitialized: true,
        isAuthenticated: !!accessToken,
        accessToken,
        refreshToken,
        deviceId: finalDeviceId,
      });
    } catch (error) {
      console.error('Failed to initialize auth store:', error);
      set({ isInitialized: true });
    }
  },

  setTokens: async (accessToken: string, refreshToken: string) => {
    try {
      await Promise.all([
        SecureStore.setItemAsync(TOKEN_KEY, accessToken),
        SecureStore.setItemAsync(REFRESH_KEY, refreshToken),
      ]);
      set({
        isAuthenticated: true,
        accessToken,
        refreshToken,
      });
    } catch (error) {
      console.error('Failed to store tokens:', error);
      throw error;
    }
  },

  setUser: (user) => {
    set({ user });
  },

  getDeviceId: async () => {
    let { deviceId } = get();
    if (!deviceId) {
      deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
      if (!deviceId) {
        deviceId = randomUUID();
        await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
      }
      set({ deviceId });
    }
    return deviceId;
  },

  logout: async () => {
    const { accessToken, deviceId } = get();

    // Call logout API if we have a token
    if (accessToken) {
      try {
        // TODO: Call /api/mobile/auth/logout
      } catch (error) {
        console.error('Logout API call failed:', error);
      }
    }

    // Clear local state
    await get().clearAuth();
  },

  clearAuth: async () => {
    try {
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
      ]);
      set({
        isAuthenticated: false,
        accessToken: null,
        refreshToken: null,
        user: null,
      });
    } catch (error) {
      console.error('Failed to clear auth:', error);
    }
  },
}));
