#!/usr/bin/env ts-node

import { Queue } from 'bullmq';
import Redis from 'ioredis';

const connection = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
};

// Define all queues
const queues = {
  plans: new Queue('plans', { connection }),
  tasks: new Queue('ai-tasks', { connection }),
  deployments: new Queue('deployments', { connection }),
  webhooks: new Queue('webhooks', { connection }),
  builds: new Queue('builds', { connection }),
  errorRecovery: new Queue('error-recovery', { connection }),
  myQueueName: new Queue('my-queue-name', { connection }),
};

async function showQueueStats() {
  console.log('\n📊 Queue Statistics:\n');
  
  for (const [name, queue] of Object.entries(queues)) {
    const counts = await queue.getJobCounts();
    const isPaused = await queue.isPaused();
    
    console.log(`📦 ${name.toUpperCase()} Queue:`);
    console.log(`   Status: ${isPaused ? '⏸️  PAUSED' : '✅ ACTIVE'}`);
    console.log(`   Waiting: ${counts.waiting}`);
    console.log(`   Active: ${counts.active}`);
    console.log(`   Completed: ${counts.completed}`);
    console.log(`   Failed: ${counts.failed}`);
    console.log(`   Delayed: ${counts.delayed}`);
    console.log(`   Total: ${Object.values(counts).reduce((a, b) => a + b, 0)}`);
    console.log('');
  }
}

async function clearQueue(queueName: string, jobStatus?: string) {
  const queue = queues[queueName as keyof typeof queues];
  if (!queue) {
    console.error(`❌ Queue "${queueName}" not found`);
    return;
  }

  if (jobStatus) {
    // Clear specific job status
    const jobs = await queue.getJobs([jobStatus as any]);
    for (const job of jobs) {
      await job.remove();
    }
    console.log(`✅ Cleared ${jobs.length} ${jobStatus} jobs from ${queueName}`);
  } else {
    // Clear entire queue
    await queue.obliterate({ force: true });
    console.log(`✅ Cleared entire ${queueName} queue`);
  }
}

async function showFailedJobs(queueName: string) {
  const queue = queues[queueName as keyof typeof queues];
  if (!queue) {
    console.error(`❌ Queue "${queueName}" not found`);
    return;
  }

  const failedJobs = await queue.getFailed();
  console.log(`\n❌ Failed jobs in ${queueName}:\n`);
  
  for (const job of failedJobs) {
    console.log(`Job ID: ${job.id}`);
    console.log(`Name: ${job.name}`);
    console.log(`Data: ${JSON.stringify(job.data, null, 2)}`);
    console.log(`Failed reason: ${job.failedReason}`);
    console.log(`Stack trace: ${job.stacktrace?.slice(0, 200)}...`);
    console.log('---');
  }
}

async function retryFailedJobs(queueName: string) {
  const queue = queues[queueName as keyof typeof queues];
  if (!queue) {
    console.error(`❌ Queue "${queueName}" not found`);
    return;
  }

  const failedJobs = await queue.getFailed();
  let count = 0;
  
  for (const job of failedJobs) {
    await job.retry();
    count++;
  }
  
  console.log(`✅ Retried ${count} failed jobs in ${queueName}`);
}

// CLI Interface
const command = process.argv[2];
const queueName = process.argv[3];
const jobStatus = process.argv[4];

async function main() {
  try {
    switch (command) {
      case 'stats':
        await showQueueStats();
        break;
        
      case 'clear':
        if (!queueName) {
          console.error('Usage: npm run queues clear <queue-name> [job-status]');
          console.error('Queues: plans, tasks, deployments, webhooks, builds, errorRecovery, myQueueName');
          console.error('Job status: waiting, active, completed, failed');
          break;
        }
        await clearQueue(queueName, jobStatus);
        break;
        
      case 'failed':
        if (!queueName) {
          console.error('Usage: npm run queues failed <queue-name>');
          break;
        }
        await showFailedJobs(queueName);
        break;
        
      case 'retry':
        if (!queueName) {
          console.error('Usage: npm run queues retry <queue-name>');
          break;
        }
        await retryFailedJobs(queueName);
        break;
        
      case 'clear-all':
        console.log('⚠️  This will clear ALL queues. Press Ctrl+C to cancel...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        for (const name of Object.keys(queues)) {
          await clearQueue(name);
        }
        break;
        
      default:
        console.log(`
🎯 BullMQ Queue Manager

Commands:
  stats              Show statistics for all queues
  clear <queue>      Clear a specific queue
  clear <queue> <status>  Clear jobs with specific status
  failed <queue>     Show failed jobs in a queue
  retry <queue>      Retry all failed jobs in a queue
  clear-all          Clear ALL queues (use with caution!)

Queues: plans, tasks, deployments, webhooks, builds, errorRecovery, myQueueName
Status: waiting, active, completed, failed, delayed

Examples:
  npm run queues stats
  npm run queues clear plans
  npm run queues clear tasks failed
  npm run queues failed tasks
  npm run queues retry tasks
        `);
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Close connections
    for (const queue of Object.values(queues)) {
      await queue.close();
    }
    process.exit(0);
  }
}

main();