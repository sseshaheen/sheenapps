const { Queue } = require('bullmq');
const Redis = require('ioredis');

async function checkQueues() {
  const connection = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });

  const streamQueue = new Queue('claude-stream', { connection });
  
  console.log('=== Stream Queue Status ===');
  
  // Get queue stats
  const counts = await streamQueue.getJobCounts();
  console.log('Job counts:', counts);
  
  // Get active jobs
  const active = await streamQueue.getActive();
  console.log('\nActive jobs:', active.length);
  active.forEach(job => {
    console.log(`- Job ${job.id}: ${job.name}`, {
      buildId: job.data.buildId,
      userId: job.data.userId,
      projectId: job.data.projectId,
      timestamp: new Date(job.timestamp).toISOString()
    });
  });
  
  // Get waiting jobs
  const waiting = await streamQueue.getWaiting();
  console.log('\nWaiting jobs:', waiting.length);
  waiting.forEach(job => {
    console.log(`- Job ${job.id}: ${job.name}`, {
      buildId: job.data.buildId,
      userId: job.data.userId,
      projectId: job.data.projectId
    });
  });
  
  // Get failed jobs
  const failed = await streamQueue.getFailed();
  console.log('\nFailed jobs:', failed.length);
  failed.forEach(job => {
    console.log(`- Job ${job.id}: ${job.name}`, {
      buildId: job.data.buildId,
      failedReason: job.failedReason
    });
  });
  
  // Get completed jobs (last 10)
  const completed = await streamQueue.getCompleted(0, 10);
  console.log('\nRecent completed jobs:', completed.length);
  completed.forEach(job => {
    console.log(`- Job ${job.id}: ${job.name}`, {
      buildId: job.data.buildId,
      finishedOn: new Date(job.finishedOn).toISOString()
    });
  });
  
  await connection.quit();
}

checkQueues().catch(console.error);