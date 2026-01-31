import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fp from 'fastify-plugin';

/**
 * Security Policy Enforcer Plugin
 * Prevents "forgot auth" bugs by requiring explicit security configuration on all routes
 * Based on expert recommendation for declarative security policies
 */

export interface SecurityPolicy {
  scheme: 'hmac' | 'admin' | 'public' | 'webhook';
  scope?: string[];  // Required permissions/scopes
  publicJustification?: string;  // Required if scheme === 'public'
}

declare module 'fastify' {
  interface FastifyContextConfig {
    security?: SecurityPolicy;
  }
}

async function securityEnforcerPlugin(fastify: FastifyInstance, options: FastifyPluginOptions) {
  // Hook into route registration to enforce security policies
  fastify.addHook('onRoute', (routeOptions) => {
    const security = routeOptions.config?.security;
    const method = routeOptions.method;
    const url = routeOptions.url;
    
    // Skip enforcement for certain routes
    const skipPaths = [
      '/health',
      '/admin/queues',  // Bull Board
      '/metrics',       // Prometheus metrics
      '/_next',         // Next.js static files
      '/favicon.ico'
    ];
    
    if (skipPaths.some(path => url.startsWith(path))) {
      return;
    }
    
    // Require security policy on all other routes
    if (!security) {
      throw new Error(`❌ SECURITY POLICY REQUIRED: Route ${method} ${url} must include config.security`);
    }
    
    // Validate security policy structure
    const validSchemes = ['hmac', 'admin', 'public', 'webhook'];
    if (!validSchemes.includes(security.scheme)) {
      throw new Error(`❌ INVALID SECURITY SCHEME: ${security.scheme} for ${method} ${url}. Must be one of: ${validSchemes.join(', ')}`);
    }
    
    // Require justification for public endpoints
    if (security.scheme === 'public') {
      if (!security.publicJustification || security.publicJustification.length < 10) {
        throw new Error(`❌ PUBLIC JUSTIFICATION REQUIRED: Route ${method} ${url} with scheme 'public' must include a detailed publicJustification (min 10 chars)`);
      }
    }
    
    // Validate scope format for non-public endpoints
    if (security.scheme !== 'public' && security.scope) {
      if (!Array.isArray(security.scope)) {
        throw new Error(`❌ INVALID SCOPE FORMAT: Route ${method} ${url} scope must be an array of strings`);
      }
    }
    
    // Log security policy registration (development only)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`🔒 Security policy registered: ${method} ${url} → ${security.scheme}${security.scope ? ` [${security.scope.join(', ')}]` : ''}${security.publicJustification ? ` (${security.publicJustification})` : ''}`);
    }
  });
  
  // Add helper method to get security info for a route
  fastify.decorate('getRouteSecurity', function(method: string, url: string) {
    // This is a simplified implementation - in a real scenario you'd need to 
    // match against the registered routes more sophisticated pattern matching
    return null; // Placeholder
  });
  
  console.log('✅ Security Enforcer Plugin registered - all routes must declare security policies');
}

export default fp(securityEnforcerPlugin, {
  name: 'security-enforcer',
  fastify: '4.x'
});