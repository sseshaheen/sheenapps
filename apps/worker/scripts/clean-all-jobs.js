const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function cleanAllJobs() {
  const connection = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  // Clean all queues
  const queues = [
    { name: 'claude-stream', label: 'stream queue' },
    { name: 'webhooks', label: 'webhook queue' },
    { name: 'build-queue', label: 'build queue' },
    { name: 'plan-queue', label: 'plan queue' },
    { name: 'task-queue', label: 'task queue' },
    { name: 'deploy-queue', label: 'deploy queue' },
    { name: 'error-recovery', label: 'error recovery queue' }
  ];

  for (const { name, label } of queues) {
    try {
      const queue = new Queue(name, { connection });
      await queue.obliterate({ force: true });
      console.log(`Cleared all jobs from ${label}`);
    } catch (err) {
      console.log(`Skipped ${label}: ${err.message}`);
    }
  }

  await connection.quit();
}

cleanAllJobs().catch(console.error);
