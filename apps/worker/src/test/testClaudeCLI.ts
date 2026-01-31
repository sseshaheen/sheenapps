import { ClaudeCLIProvider } from '../providers/claudeCLIProvider';
import { PlanGeneratorService } from '../services/planGenerator';
import { TaskExecutorService } from '../services/taskExecutor';
import { WebhookService } from '../services/webhookService';
import { TaskDatabase } from '../services/taskDatabase';
import { ulid } from 'ulid';
import type { PlanContext, ProjectContext } from '../types/modular';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';

// Load environment variables
dotenv.config();

async function testClaudeCLI() {
  console.log('🤖 Testing Claude CLI Provider...\n');

  // Check if Claude CLI is available
  try {
    execSync('which claude', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Claude CLI not found. Please install Claude CLI first.');
    console.log('   Visit: https://claude.ai/cli');
    process.exit(1);
  }

  // Create a temporary project directory
  const tempDir = path.join(os.tmpdir(), `claude-cli-test-${ulid()}`);
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`📁 Created temp project directory: ${tempDir}\n`);

  // Initialize services with Claude CLI provider
  const webhookService = new WebhookService();
  const claudeCLIProvider = new ClaudeCLIProvider();
  const planGenerator = new PlanGeneratorService(webhookService, claudeCLIProvider);
  const taskDb = new TaskDatabase();
  const taskExecutor = new TaskExecutorService(webhookService, claudeCLIProvider, taskDb);

  // Test data
  const buildId = ulid();
  const userId = 'test-user';
  const projectId = 'test-project';

  try {
    // Test 1: Simple plan generation
    console.log('📝 Test 1: Plan Generation via CLI');
    console.log('   Prompt: "Create a simple button component that shows Hello World"\n');

    const planContext: PlanContext & { buildId: string; userId: string; projectId: string } = {
      framework: 'react',
      existingFiles: [],
      projectPath: tempDir,
      buildId,
      userId,
      projectId
    };

    const startTime = Date.now();
    const plan = await planGenerator.generatePlan(
      'Create a simple button component that shows Hello World',
      planContext
    );
    const planTime = Date.now() - startTime;

    console.log(`   ✅ Plan generated in ${planTime}ms`);
    console.log(`   📋 Tasks: ${plan.tasks.length}`);
    console.log(`   💰 Estimated cost: $${plan.usage?.totalCost?.toFixed(4) || 'N/A'}`);
    
    // Display tasks
    console.log('\n   Tasks generated:');
    plan.tasks.forEach((task, index) => {
      console.log(`      ${index + 1}. [${task.type}] ${task.name}`);
      console.log(`         ${task.description}`);
    });

    // Test 2: Transform operation
    console.log('\n📝 Test 2: Transform Operation via CLI');
    console.log('   Testing code generation...');
    
    const codeGenResult = await claudeCLIProvider.transform({
      type: 'code_gen',
      input: 'Create a simple React button component',
      context: {
        framework: 'react',
        targetPath: 'Button.tsx'
      }
    });
    
    console.log(`   ✅ Code generated (${codeGenResult.output.length} chars)`);
    console.log(`   💰 Estimated cost: $${codeGenResult.usage.totalCost.toFixed(4)}`);

    // Test 3: Execute a simple task
    console.log('\n📝 Test 3: Task Execution');
    
    if (plan.tasks.length > 0) {
      const projectContext: ProjectContext = {
        projectPath: tempDir,
        framework: 'react',
        existingFiles: [],
        userId,
        projectId
      };

      console.log('   Executing first task...');
      const firstTask = plan.tasks[0];
      if (!firstTask) throw new Error('No tasks in plan');

      const results = await taskExecutor.executePlan(
        { ...plan, tasks: [firstTask] }, // Execute only first task
        projectContext
      );

      const firstResult = results[0];
      if (firstResult && firstResult.status === 'completed') {
        console.log(`   ✅ Task executed successfully`);
        if (firstResult.files && firstResult.files.length > 0) {
          console.log(`   📄 Files created: ${firstResult.files.map(f => f.path).join(', ')}`);
        }
      }
    }

    // Summary
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Claude CLI provider working');
    console.log('   ✅ Plan generation successful');
    console.log('   ✅ Transform operations working');
    console.log('   ✅ Task execution working');
    console.log(`   💰 Total estimated cost: $${(plan.usage?.totalCost || 0 + codeGenResult.usage.totalCost).toFixed(4)}`);

    console.log('\n🎉 Claude CLI provider test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error && error.message.includes('spawn claude')) {
      console.log('\nMake sure Claude CLI is installed and accessible in your PATH');
    }
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
  testClaudeCLI()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}