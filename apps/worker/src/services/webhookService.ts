import { Worker, Job } from 'bullmq';
import { createHmac, timingSafeEqual } from 'crypto';
import { webhookQueue } from '../queue/modularQueues';
import type { WebhookPayload } from '../types/modular';

export class WebhookService {
  private webhookWorker?: Worker;
  private webhookUrl: string;
  private webhookSecret: string;
  private webhooksEnabled: boolean;

  constructor(webhookUrl?: string, webhookSecret?: string) {
    this.webhookUrl = webhookUrl || process.env.WEBHOOK_URL || '';
    this.webhookSecret = webhookSecret || process.env.WEBHOOK_SECRET || 'default-secret';
    
    // Check if webhooks are enabled (default: false)
    this.webhooksEnabled = process.env.WEBHOOKS_ENABLED === 'true';
    
    // Only create worker if webhooks are enabled, URL is configured, and we're not in test mode
    if (this.webhooksEnabled && this.webhookUrl && process.env.NODE_ENV !== 'test') {
      this.initializeWorker();
    }
  }

  private initializeWorker() {
    // Create worker to process webhooks
    this.webhookWorker = new Worker(
      'webhooks',
      async (job: Job<WebhookPayload>) => this.processWebhook(job),
      {
        connection: {
          host: process.env.REDIS_HOST || '127.0.0.1',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          maxRetriesPerRequest: null,
        },
        concurrency: 5,
        limiter: {
          max: 10,
          duration: 1000, // Max 10 webhooks per second
        }
      }
    );

    this.webhookWorker.on('failed', (job, err) => {
      console.error(`Webhook ${job?.id} failed after ${job?.attemptsMade} attempts:`, err);
    });

    this.webhookWorker.on('completed', (job) => {
      console.log(`Webhook ${job?.id} delivered successfully`);
    });
  }

  async send(payload: Partial<WebhookPayload>): Promise<void> {
    if (!this.webhooksEnabled) {
      console.log('Webhooks disabled, skipping webhook:', payload.type);
      return;
    }
    
    if (!this.webhookUrl) {
      console.log('Webhook URL not configured, skipping webhook:', payload.type);
      return;
    }

    const fullPayload: WebhookPayload = {
      buildId: payload.buildId || 'unknown',
      timestamp: Date.now(),
      ...payload
    } as WebhookPayload;

    // Add to BullMQ queue with retry configuration
    if (webhookQueue) {
      await webhookQueue.add(
        'deliver-webhook',
        fullPayload,
        {
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000, // Start with 1 second
          },
          removeOnComplete: true,
          removeOnFail: false, // Keep failed jobs for debugging
        }
      );
    } else {
      // Direct delivery in test mode
      console.log('Test mode: Would deliver webhook:', payload.type);
    }
  }

  private async processWebhook(job: Job<WebhookPayload>): Promise<void> {
    const payload = job.data;
    await this.deliverWebhook(this.webhookUrl, payload);
  }

  private async deliverWebhook(url: string, payload: WebhookPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const signature = this.generateSignature(body);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Timestamp': payload.timestamp.toString(),
        'X-Webhook-Type': payload.type
      },
      body,
      signal: AbortSignal.timeout(30000) // 30 second timeout
    });

    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  }

  private generateSignature(body: string): string {
    return createHmac('sha256', this.webhookSecret)
      .update(body)
      .digest('hex');
  }

  // Check if webhooks are enabled
  isEnabled(): boolean {
    return this.webhooksEnabled;
  }

  // Clean up worker on shutdown
  async close() {
    if (this.webhookWorker) {
      await this.webhookWorker.close();
    }
  }
}

// Webhook verification for NextJS app
export function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string
): boolean {
  const expected = createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  return signature.length === expected.length &&
    timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
}

// Singleton instance for convenient usage
let webhookServiceInstance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!webhookServiceInstance) {
    webhookServiceInstance = new WebhookService();
  }
  return webhookServiceInstance;
}