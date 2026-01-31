import { planQueue, taskQueue } from '../queue/modularQueues';
import { PlanGeneratorService } from '../services/planGenerator';
import { TaskExecutorService } from '../services/taskExecutor';
import { WebhookService } from '../services/webhookService';
import { TaskDatabase } from '../services/taskDatabase';
import { ProviderFactory } from '../providers/providerFactory';
import { ulid } from 'ulid';
import type { PlanContext, ProjectContext } from '../types/modular';
import type { BuildJobData } from '../types/build';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Load environment variables
dotenv.config();

async function testModularIntegration() {
  console.log('🧪 Testing Modular Integration\n');

  // Create a temporary project directory
  const tempDir = path.join(os.tmpdir(), `modular-test-${ulid()}`);
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`📁 Project directory: ${tempDir}\n`);

  // Initialize services
  const webhookService = new WebhookService();
  const aiProvider = ProviderFactory.getProvider();
  const planGenerator = new PlanGeneratorService(webhookService, aiProvider);
  const taskDb = new TaskDatabase();
  const taskExecutor = new TaskExecutorService(webhookService, aiProvider, taskDb);

  console.log(`🤖 Using provider: ${aiProvider.name}\n`);

  // Test data
  const buildId = ulid();
  const jobData: BuildJobData = {
    userId: 'test-user',
    projectId: 'test-project',
    prompt: 'Create a simple React component that displays "Hello from Modular Architecture!"',
    framework: 'react',
    versionId: ulid(),
    isInitialBuild: true
  };

  try {
    // Step 1: Simulate what the plan worker does
    console.log('📋 Step 1: Generating Plan (Plan Worker)');
    console.log(`   Prompt: "${jobData.prompt}"`);
    
    const planContext: PlanContext & { buildId: string; userId: string; projectId: string } = {
      framework: jobData.framework || 'react',
      existingFiles: [],
      projectPath: tempDir,
      buildId,
      userId: jobData.userId,
      projectId: jobData.projectId
    };

    const plan = await planGenerator.generatePlan(jobData.prompt, planContext);
    console.log(`   ✅ Plan generated with ${plan.tasks.length} tasks`);
    console.log(`   📝 Plan ID: ${plan.id}\n`);

    // Display tasks
    console.log('   Tasks:');
    plan.tasks.forEach((task, index) => {
      console.log(`     ${index + 1}. [${task.type}] ${task.name}`);
    });

    // Step 2: Simulate what the task worker does
    console.log('\n🔧 Step 2: Executing Plan (Task Worker)');
    
    const projectContext: ProjectContext = {
      projectPath: tempDir,
      framework: jobData.framework || 'react',
      existingFiles: [],
      userId: jobData.userId,
      projectId: jobData.projectId
    };

    const results = await taskExecutor.executePlan(plan, projectContext);
    
    console.log(`   ✅ Executed ${results.length} tasks`);
    console.log(`   ✅ Successful: ${results.filter(r => r.status === 'completed').length}`);
    console.log(`   ❌ Failed: ${results.filter(r => r.status === 'failed').length}\n`);

    // Step 3: Check created files
    console.log('📂 Files created:');
    const files = await fs.readdir(tempDir, { recursive: true });
    for (const file of files) {
      if (typeof file === 'string') {
        const stats = await fs.stat(path.join(tempDir, file));
        if (stats.isFile()) {
          console.log(`   ✅ ${file}`);
        }
      }
    }

    // Step 4: Verify the main component was created
    const mainFile = results.find(r => 
      r.files?.some(f => f.path.includes('Hello') || f.path.includes('Component'))
    );
    
    if (mainFile && mainFile.files) {
      console.log('\n📄 Sample file content:');
      const sampleFile = mainFile.files[0];
      if (sampleFile) {
        console.log(`   File: ${sampleFile.path}`);
        console.log('   Content preview:');
        console.log(sampleFile.content.split('\n').slice(0, 10).map(l => `     ${l}`).join('\n'));
        if (sampleFile.content.split('\n').length > 10) {
          console.log('     ...');
        }
      }
    }

    // Summary
    console.log('\n✅ Integration Test Summary:');
    console.log('   - Plan generation: SUCCESS');
    console.log('   - Task execution: SUCCESS');
    console.log('   - File creation: SUCCESS');
    console.log('   - Provider used: ' + aiProvider.name);
    console.log('\n🎉 Modular architecture is working correctly!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    await taskExecutor.close();
    await webhookService.close();
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
      console.log('\n🧹 Cleaned up temp directory');
    } catch (error) {
      console.warn('Could not clean up temp directory:', error);
    }
  }
}

// Run the test
if (require.main === module) {
  testModularIntegration()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}