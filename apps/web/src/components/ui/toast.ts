// Simple toast utility that integrates with existing toast system
import { ToastData } from './toast-with-undo';

// Global toast manager (would be replaced with proper context/state management)
let toastId = 0;
let toastListeners: Array<(toast: ToastData) => void> = [];

export const toast = {
  success: (title: string, options?: { description?: string; icon?: React.ReactNode }) => {
    const toastData: ToastData = {
      id: `toast-${++toastId}`,
      type: 'success',
      title,
      description: options?.description,
      duration: 5000
    };
    
    // Notify listeners
    toastListeners.forEach(listener => listener(toastData));
    
    // Also log to console for development
    console.log('✅ Toast Success:', title, options?.description);
  },
  
  error: (title: string, options?: { description?: string; icon?: React.ReactNode }) => {
    const toastData: ToastData = {
      id: `toast-${++toastId}`,
      type: 'error',
      title,
      description: options?.description,
      duration: 7000
    };
    
    toastListeners.forEach(listener => listener(toastData));
    console.error('❌ Toast Error:', title, options?.description);
  },
  
  warning: (title: string, options?: { description?: string; icon?: React.ReactNode }) => {
    const toastData: ToastData = {
      id: `toast-${++toastId}`,
      type: 'warning',
      title,
      description: options?.description,
      duration: 6000
    };
    
    toastListeners.forEach(listener => listener(toastData));
    console.warn('⚠️ Toast Warning:', title, options?.description);
  },
  
  info: (title: string, options?: { description?: string; icon?: React.ReactNode }) => {
    const toastData: ToastData = {
      id: `toast-${++toastId}`,
      type: 'info',
      title,
      description: options?.description,
      duration: 5000
    };
    
    toastListeners.forEach(listener => listener(toastData));
    console.info('ℹ️ Toast Info:', title, options?.description);
  },
  
  // Add listener for toast notifications
  addListener: (listener: (toast: ToastData) => void) => {
    toastListeners.push(listener);
  },
  
  // Remove listener
  removeListener: (listener: (toast: ToastData) => void) => {
    toastListeners = toastListeners.filter(l => l !== listener);
  }
};