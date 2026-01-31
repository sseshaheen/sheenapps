/**
 * OpenTelemetry Initialization
 * This file MUST be imported before any other application code
 * 
 * Uses cluster-safe initialization to handle both fork and cluster modes
 */

// Use cluster-safe initialization
import { initializeClusterSafeTelemetry } from './cluster-safe';

// Start telemetry with cluster-safe handling
initializeClusterSafeTelemetry();

// Export for use in other parts of the application
export * from './index';
export { initializeClusterSafeTelemetry, shutdownClusterSafeTelemetry } from './cluster-safe';