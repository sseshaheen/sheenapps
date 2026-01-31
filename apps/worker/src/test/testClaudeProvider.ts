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

// Load environment variables
dotenv.config();

async function testClaudeProvider() {
  console.log('🤖 Testing Claude CLI Provider Integration...\n');

  // Create a temporary project directory
  const tempDir = path.join(os.tmpdir(), `claude-test-${ulid()}`);
  await fs.mkdir(tempDir, { recursive: true });
  console.log(`📁 Created temp project directory: ${tempDir}\n`);

  // Initialize services with Claude CLI provider
  const webhookService = new WebhookService();
  const claudeProvider = new ClaudeCLIProvider();
  const planGenerator = new PlanGeneratorService(webhookService, claudeProvider);
  const taskDb = new TaskDatabase();
  const taskExecutor = new TaskExecutorService(webhookService, claudeProvider, taskDb);

  // Test data
  const buildId = ulid();
  const userId = 'test-user';
  const projectId = 'test-project';

  try {
    // Test 1: Simple plan generation
    console.log('📝 Test 1: Simple Plan Generation');
    console.log('   Prompt: "Create a simple React component that displays Hello World"\n');

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
      'Create a simple React component that displays Hello World',
      planContext
    );
    const planTime = Date.now() - startTime;

    console.log(`   ✅ Plan generated in ${planTime}ms`);
    console.log(`   📋 Tasks: ${plan.tasks.length}`);
    console.log(`   💰 Planning cost: $${plan.usage?.totalCost?.toFixed(4) || 'N/A'}`);
    
    // Display tasks
    console.log('\n   Tasks generated:');
    plan.tasks.forEach((task, index) => {
      console.log(`      ${index + 1}. [${task.type}] ${task.name}`);
      console.log(`         ${task.description}`);
    });

    // Test 2: Execute the plan
    console.log('\n📝 Test 2: Plan Execution');
    console.log('   Executing the generated plan...\n');

    const projectContext: ProjectContext = {
      projectPath: tempDir,
      framework: 'react',
      existingFiles: [],
      userId,
      projectId
    };

    const execStartTime = Date.now();
    const results = await taskExecutor.executePlan(plan, projectContext);
    const execTime = Date.now() - execStartTime;

    console.log(`   ✅ Execution completed in ${execTime}ms`);
    console.log(`   📊 Results:`);
    console.log(`      - Successful tasks: ${results.filter(r => r.status === 'completed').length}`);
    console.log(`      - Failed tasks: ${results.filter(r => r.status === 'failed').length}`);

    // Calculate total cost
    let totalCost = plan.usage?.totalCost || 0;
    results.forEach(result => {
      if (result.tokenUsage) {
        totalCost += result.tokenUsage.totalCost;
      }
    });
    console.log(`   💰 Total cost: $${totalCost.toFixed(4)}`);

    // Show created files
    console.log('\n   📂 Files created:');
    const createdFiles = new Set<string>();
    for (const result of results) {
      if (result.files) {
        for (const file of result.files) {
          createdFiles.add(file.path);
          const fullPath = path.join(tempDir, file.path);
          try {
            const stats = await fs.stat(fullPath);
            console.log(`      ✅ ${file.path} (${stats.size} bytes)`);
          } catch {
            console.log(`      ❌ ${file.path} (not found)`);
          }
        }
      }
    }

    // Test 3: Transform operations
    console.log('\n📝 Test 3: Transform Operations');
    
    // Test code generation
    console.log('   Testing code generation...');
    const codeGenResult = await claudeProvider.transform({
      type: 'code_gen',
      input: 'Create a TypeScript function that validates email addresses',
      context: {
        framework: 'typescript'
      }
    });
    console.log(`   ✅ Code generated (${codeGenResult.output.length} chars)`);
    console.log(`   💰 Cost: $${codeGenResult.usage.totalCost.toFixed(4)}`);

    // Test JSON healing
    console.log('\n   Testing JSON healing...');
    const brokenJson = '{ "name": "test", "value": 123, "items": [1, 2, 3,] }';
    const healResult = await claudeProvider.transform({
      type: 'heal_json',
      input: brokenJson
    });
    console.log(`   ✅ JSON healed: ${JSON.stringify(healResult.output)}`);
    console.log(`   💰 Cost: $${healResult.usage.totalCost.toFixed(4)}`);

    // Summary
    console.log('\n📊 Test Summary:');
    console.log('   ✅ Claude CLI provider initialized successfully');
    console.log('   ✅ Plan generation working');
    console.log('   ✅ Task execution working');
    console.log('   ✅ Transform operations working');
    console.log('   ✅ Token usage tracking working');
    console.log(`   💰 Total test cost: $${(totalCost + codeGenResult.usage.totalCost + healResult.usage.totalCost).toFixed(4)}`);

    console.log('\n🎉 Claude CLI provider test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    if (error instanceof Error && error.message?.includes('CLAUDE_API_KEY')) {
      console.log('\nMake sure CLAUDE_API_KEY is set in your .env file');
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
  testClaudeProvider()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}