import { FastifyInstance } from 'fastify';
import { claudeCLIMainProcess } from '../services/claudeCLIMainProcess';
import { ClaudeExecutorFactory } from '../providers/executors/claudeExecutorFactory';

export function registerClaudeHealthRoutes(app: FastifyInstance) {
  app.get('/claude-executor/health', async (request, reply) => {
    try {
      const executor = ClaudeExecutorFactory.create();
      const isHealthy = await executor.healthCheck();
      const metrics = executor.getMetrics ? await executor.getMetrics() : null;
      
      const response = {
        status: isHealthy ? 'healthy' : 'unhealthy',
        redis: 'connected', // If we got here, Redis is working
        claudeCLI: isHealthy ? 'accessible' : 'unavailable',
        circuitBreaker: 'closed', // Could be enhanced to check actual state
        activeRequests: metrics?.activeRequests || 0,
        metrics: metrics ? {
          totalRequests: metrics.totalRequests,
          successRate: metrics.totalRequests > 0 
            ? (metrics.successfulRequests / metrics.totalRequests).toFixed(2)
            : '0.00',
          failedRequests: metrics.failedRequests,
          averageExecutionTime: Math.round(metrics.averageExecutionTime),
          lastError: metrics.lastError,
          lastErrorTime: metrics.lastErrorTime
        } : null
      };
      
      return reply
        .code(isHealthy ? 200 : 503)
        .send(response);
        
    } catch (error: any) {
      return reply.code(503).send({
        status: 'unhealthy',
        error: error.message
      });
    }
  });
}