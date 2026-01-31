import { PlanGeneratorService } from '../services/planGenerator';
import { TaskExecutorService } from '../services/taskExecutor';
import { WebhookService } from '../services/webhookService';
import { MockAIProvider } from '../providers/mockProvider';
import { TaskDatabase } from '../services/taskDatabase';
import { ulid } from 'ulid';
import type { PlanContext, ProjectContext } from '../types/modular';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Load environment variables
dotenv.config();

async function runTaskExecutorTest() {
  console.log('🚀 Testing Task Executor Service...\n');

  // Create a temporary project directory
  const tempDir = path.join(os.tmpdir(), `test-project-${ulid()}`);
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`📁 Created temp project directory: ${tempDir}\n`);

  // Initialize services
  const webhookService = new WebhookService();
  const mockProvider = new MockAIProvider();
  const planGenerator = new PlanGeneratorService(webhookService, mockProvider);
  const taskDb = new TaskDatabase();
  const taskExecutor = new TaskExecutorService(webhookService, mockProvider, taskDb);

  // Test data
  const buildId = ulid();
  const userId = 'test-user';
  const projectId = 'test-project';
  const prompt = 'Create a React landing page with a hero section and contact form';

  try {
    // Step 1: Generate a plan
    console.log('📋 Generating task plan...');
    const planContext: PlanContext & { buildId: string; userId: string; projectId: string } = {
      framework: 'react',
      existingFiles: [],
      projectPath: tempDir,
      buildId,
      userId,
      projectId
    };

    const plan = await planGenerator.generatePlan(prompt, planContext);
    console.log(`✅ Plan generated with ${plan.tasks.length} tasks\n`);

    // Step 2: Execute the plan
    console.log('🔧 Executing tasks...\n');
    const projectContext: ProjectContext = {
      projectPath: tempDir,
      framework: 'react',
      existingFiles: [],
      userId,
      projectId
    };

    const results = await taskExecutor.executePlan(plan, projectContext);

    // Step 3: Verify results
    console.log('📊 Execution Results:');
    console.log(`   Total tasks executed: ${results.length}`);
    console.log(`   Successful tasks: ${results.filter(r => r.status === 'completed').length}`);
    console.log(`   Failed tasks: ${results.filter(r => r.status === 'failed').length}\n`);

    // Step 4: Check created files
    console.log('📂 Files created:');
    const createdFiles = new Set<string>();
    for (const result of results) {
      if (result.files) {
        for (const file of result.files) {
          createdFiles.add(file.path);
          console.log(`   ✅ ${file.path}`);
        }
      }
    }
    console.log(`   Total files: ${createdFiles.size}\n`);

    // Step 5: Verify file contents
    console.log('🔍 Verifying file contents...');
    for (const filePath of createdFiles) {
      const fullPath = path.join(tempDir, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf8');
        console.log(`   ✅ ${filePath} (${content.length} bytes)`);
      } catch (error) {
        console.log(`   ❌ ${filePath} - File not found`);
      }
    }

    // Step 6: Test dependency execution order
    console.log('\n🔗 Task execution order:');
    const executionOrder = results.map(r => {
      const task = plan.tasks.find(t => t.id === r.taskId);
      return task?.name || 'Unknown';
    });
    executionOrder.forEach((name, index) => {
      console.log(`   ${index + 1}. ${name}`);
    });

    // Step 7: Token usage summary
    console.log('\n💰 Token Usage Summary:');
    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalCost = 0;

    results.forEach(result => {
      if (result.tokenUsage) {
        totalPromptTokens += result.tokenUsage.promptTokens;
        totalCompletionTokens += result.tokenUsage.completionTokens;
        totalCost += result.tokenUsage.totalCost;
      }
    });

    console.log(`   Prompt tokens: ${totalPromptTokens}`);
    console.log(`   Completion tokens: ${totalCompletionTokens}`);
    console.log(`   Total cost: $${totalCost.toFixed(4)}`);

    console.log('\n🎉 Task Executor test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    await taskExecutor.close();
    await webhookService.close();
    
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true });
      console.log(`\n🧹 Cleaned up temp directory`);
    } catch (error) {
      console.warn('Could not clean up temp directory:', error);
    }
  }
}

// Run the test
if (require.main === module) {
  runTaskExecutorTest()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}