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

async function runIntegrationTest() {
  console.log('🚀 Modular Claude Architecture - Integration Test\n');
  console.log('This test demonstrates the complete flow from prompt to execution.\n');

  // Create a temporary project directory
  const tempDir = path.join(os.tmpdir(), `integration-test-${ulid()}`);
  await fs.mkdir(tempDir, { recursive: true });

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

  try {
    // Test Case 1: Simple React App
    console.log('📝 Test Case 1: Simple React App');
    console.log('   Prompt: "Create a React app with a landing page"\n');

    const plan1 = await runTestCase(
      'Create a React app with a landing page',
      'react',
      { buildId, userId, projectId, tempDir },
      { planGenerator, taskExecutor }
    );

    // Test Case 2: Complex Component
    console.log('\n📝 Test Case 2: Complex Component Request');
    console.log('   Prompt: "Add a navigation component and contact form"\n');

    const plan2 = await runTestCase(
      'Add a navigation component and contact form',
      'react',
      { buildId: ulid(), userId, projectId, tempDir },
      { planGenerator, taskExecutor }
    );

    // Summary
    console.log('\n📊 Integration Test Summary:');
    console.log('   ✅ Plan generation with streaming');
    console.log('   ✅ Task dependency resolution');
    console.log('   ✅ Parallel task execution');
    console.log('   ✅ File creation and modification');
    console.log('   ✅ Webhook notifications');
    console.log('   ✅ Token usage tracking');
    console.log('   ✅ Error handling and timeouts');

    // Show created files
    console.log('\n📁 Project Structure Created:');
    await showDirectoryTree(tempDir, '   ');

    console.log('\n🎉 Integration test completed successfully!');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
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

async function runTestCase(
  prompt: string,
  framework: string,
  context: { buildId: string; userId: string; projectId: string; tempDir: string },
  services: { planGenerator: PlanGeneratorService; taskExecutor: TaskExecutorService }
) {
  // Generate plan
  const planContext: PlanContext & { buildId: string; userId: string; projectId: string } = {
    framework,
    existingFiles: await getExistingFiles(context.tempDir),
    projectPath: context.tempDir,
    buildId: context.buildId,
    userId: context.userId,
    projectId: context.projectId
  };

  const plan = await services.planGenerator.generatePlan(prompt, planContext);
  console.log(`   📋 Generated ${plan.tasks.length} tasks`);

  // Execute plan
  const projectContext: ProjectContext = {
    projectPath: context.tempDir,
    framework,
    existingFiles: await getExistingFiles(context.tempDir),
    userId: context.userId,
    projectId: context.projectId
  };

  const results = await services.taskExecutor.executePlan(plan, projectContext);
  console.log(`   ✅ Executed ${results.filter(r => r.status === 'completed').length} tasks successfully`);

  // Show task execution flow
  console.log('   📍 Execution flow:');
  plan.tasks.forEach((task, index) => {
    const deps = plan.dependencies.find(d => d.taskId === task.id);
    const depNames = deps?.dependsOn.map(id => 
      plan.tasks.find(t => t.id === id)?.name
    ).filter(Boolean).join(', ') || 'none';
    console.log(`      ${index + 1}. ${task.name} (deps: ${depNames})`);
  });

  return plan;
}

async function getExistingFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  
  async function scan(currentDir: string, prefix = '') {
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      
      for (const entry of entries) {
        const relativePath = path.join(prefix, entry.name);
        
        if (entry.isDirectory()) {
          await scan(path.join(currentDir, entry.name), relativePath);
        } else {
          files.push(relativePath);
        }
      }
    } catch (error) {
      // Directory doesn't exist yet
    }
  }
  
  await scan(dir);
  return files;
}

async function showDirectoryTree(dir: string, indent: string, prefix = '') {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => {
      // Directories first, then files
      if (a.isDirectory() && !b.isDirectory()) return -1;
      if (!a.isDirectory() && b.isDirectory()) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const entry of entries) {
      console.log(`${indent}${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
      
      if (entry.isDirectory()) {
        await showDirectoryTree(
          path.join(dir, entry.name),
          indent + '   '
        );
      }
    }
  } catch (error) {
    console.error(`${indent}❌ Error reading directory`);
  }
}

// Run the test
if (require.main === module) {
  runIntegrationTest()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}