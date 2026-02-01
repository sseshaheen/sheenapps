import { useAuthStore } from '@/stores/auth';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://sheenapps.com';

interface ApiResponse<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async getHeaders(skipAuth: boolean): Promise<HeadersInit> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (!skipAuth) {
      const { accessToken } = useAuthStore.getState();
      if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
      }
    }

    return headers;
  }

  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    if (response.status === 401) {
      // Token expired, try to refresh
      const refreshed = await this.refreshToken();
      if (!refreshed) {
        // Refresh failed, clear auth state
        await useAuthStore.getState().clearAuth();
        throw new Error('Session expired. Please log in again.');
      }
      // Retry would need to be handled by the caller
      throw new Error('TOKEN_REFRESHED');
    }

    const data = await response.json();

    if (!response.ok) {
      return {
        ok: false,
        error: data.error || { code: 'UNKNOWN_ERROR', message: 'An error occurred' },
      };
    }

    return {
      ok: true,
      data: data.data || data,
    };
  }

  private async refreshToken(): Promise<boolean> {
    const { refreshToken, deviceId, setTokens } = useAuthStore.getState();

    if (!refreshToken || !deviceId) {
      return false;
    }

    try {
      const response = await fetch(`${this.baseUrl}/api/mobile/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken, deviceId }),
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      if (data.accessToken && data.refreshToken) {
        await setTokens(data.accessToken, data.refreshToken);
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  async get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const headers = await this.getHeaders(options?.skipAuth ?? false);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'GET',
      headers,
      ...options,
    });
    return this.handleResponse<T>(response);
  }

  async post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const headers = await this.getHeaders(options?.skipAuth ?? false);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
    return this.handleResponse<T>(response);
  }

  async put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    const headers = await this.getHeaders(options?.skipAuth ?? false);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      ...options,
    });
    return this.handleResponse<T>(response);
  }

  async delete<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    const headers = await this.getHeaders(options?.skipAuth ?? false);
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'DELETE',
      headers,
      ...options,
    });
    return this.handleResponse<T>(response);
  }
}

export const api = new ApiClient(API_BASE_URL);

// Auth-specific endpoints (don't go through gateway)
export const authApi = {
  requestCode: async (email: string) => {
    return api.post<{ success: boolean; expiresIn: number }>(
      '/api/mobile/auth/request-code',
      { email },
      { skipAuth: true }
    );
  },

  verifyCode: async (email: string, code: string, deviceId: string) => {
    return api.post<{
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
      user: { id: string; email: string };
    }>(
      '/api/mobile/auth/verify-code',
      { email, code, deviceId },
      { skipAuth: true }
    );
  },

  refresh: async (refreshToken: string, deviceId: string) => {
    return api.post<{ accessToken: string; refreshToken: string; expiresIn: number }>(
      '/api/mobile/auth/refresh',
      { refreshToken, deviceId },
      { skipAuth: true }
    );
  },

  logout: async () => {
    return api.post('/api/mobile/auth/logout');
  },
};

// Gateway endpoints (go through /api/gateway/*)
export const gatewayApi = {
  // Projects
  getProjects: () => api.get<{ projects: Project[] }>('/api/gateway/projects'),
  getProject: (id: string) => api.get<Project>(`/api/gateway/projects/${id}`),
  getProjectStatus: (id: string) => api.get<ProjectStatus>(`/api/gateway/projects/${id}/status`),
  getProjectKpi: (id: string) => api.get<ProjectKpi>(`/api/gateway/projects/${id}/kpi`),

  // Business events
  getBusinessEvents: (projectId: string, params?: { limit?: number; offset?: number }) => {
    const searchParams = new URLSearchParams();
    searchParams.set('projectId', projectId);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
    return api.get<{ events: BusinessEvent[] }>(`/api/gateway/business-events?${searchParams}`);
  },
};

// Type definitions
export interface Project {
  id: string;
  name: string;
  subdomain: string;
  customDomain?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectStatus {
  isLive: boolean;
  lastDeployedAt?: string;
  url: string;
  errors?: string[];
}

export interface ProjectKpi {
  revenue: { value: number; change: number; currency: string };
  leads: { value: number; change: number };
  orders: { value: number; change: number };
  visitors: { value: number; change: number };
  period: 'today' | 'week' | 'month';
}

export interface BusinessEvent {
  id: string;
  type: 'lead' | 'order' | 'signup' | 'payment';
  projectId: string;
  data: Record<string, unknown>;
  createdAt: string;
}
