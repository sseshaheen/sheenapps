const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function clearFailedJobs() {
  const connection = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  const streamQueue = new Queue('claude-stream', { connection });
  
  // Clean failed jobs
  await streamQueue.clean(0, 1000, 'failed');
  console.log('Cleared failed jobs');
  
  // Optional: Clear all jobs and start fresh
  // await streamQueue.obliterate({ force: true });
  // console.log('Cleared all jobs');
  
  await connection.quit();
}

clearFailedJobs().catch(console.error);