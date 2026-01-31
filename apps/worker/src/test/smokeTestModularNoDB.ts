import { PlanGeneratorService } from '../services/planGenerator';
import { WebhookService } from '../services/webhookService';
import { MockAIProvider } from '../providers/mockProvider';
import { ulid } from 'ulid';
import type { PlanContext } from '../types/modular';

async function runSmokeTest() {
  console.log('🚀 Starting modular system smoke test (No DB)...\n');

  // Initialize services
  const webhookService = new WebhookService();
  const mockProvider = new MockAIProvider();
  const planGenerator = new PlanGeneratorService(webhookService, mockProvider);

  // Test data
  const buildId = ulid();
  const userId = 'test-user';
  const projectId = 'test-project';
  const prompt = 'Create a landing page with hero section and contact form';

  try {
    // Step 1: Test webhook service
    console.log('📡 Testing webhook service...');
    await webhookService.send({
      type: 'build_started',
      buildId,
      data: {
        userId,
        projectId,
        prompt,
        framework: 'react'
      }
    });
    console.log('✅ Webhook service functional\n');

    // Step 2: Generate plan
    console.log('🎯 Generating task plan...');
    const context: PlanContext & { buildId: string; userId: string; projectId: string } = {
      framework: 'react',
      existingFiles: [],
      projectPath: '/tmp/test-project',
      buildId,
      userId,
      projectId
    };

    const plan = await planGenerator.generatePlan(prompt, context);
    console.log(`✅ Plan generated with ${plan.tasks.length} tasks:`);
    plan.tasks.forEach((task, i) => {
      console.log(`   ${i + 1}. [${task.type}] ${task.name} (${task.estimatedDuration}s)`);
    });
    console.log(`   Total estimated duration: ${plan.estimatedDuration}s\n`);

    // Step 3: Verify task dependencies
    console.log('🔗 Task dependencies:');
    plan.dependencies.forEach(dep => {
      if (dep.dependsOn.length > 0) {
        const task = plan.tasks.find(t => t.id === dep.taskId);
        const deps = dep.dependsOn.map(id => 
          plan.tasks.find(t => t.id === id)?.name
        ).join(', ');
        console.log(`   ${task?.name} depends on: ${deps}`);
      }
    });
    console.log('✅ Dependency graph created\n');

    // Step 4: Test mock AI provider transform
    console.log('🤖 Testing AI provider transform...');
    const transformResult = await mockProvider.transform({
      type: 'code_gen',
      input: 'Create a React button component'
    });
    console.log('✅ AI provider transform functional');
    console.log(`   Generated: ${transformResult.output.substring(0, 50)}...`);
    console.log(`   Token usage: ${transformResult.usage.promptTokens} prompt, ${transformResult.usage.completionTokens} completion\n`);

    // Step 5: Test streaming plan generation
    console.log('📊 Testing streaming plan generation...');
    let streamedTasks = 0;
    for await (const partial of mockProvider.planStream(prompt, context)) {
      streamedTasks += partial.tasks.length;
      console.log(`   Received batch with ${partial.tasks.length} tasks`);
    }
    console.log(`✅ Streaming functional: ${streamedTasks} tasks total\n`);

    console.log('🎉 Smoke test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Webhook service: ✅');
    console.log('   - Plan generation: ✅');
    console.log('   - Task validation: ✅');
    console.log('   - Mock AI provider: ✅');
    console.log('   - Streaming support: ✅');
    console.log('   - Dependency graph: ✅');
    console.log('\n💡 Note: Database operations skipped (no DB configured)');

  } catch (error) {
    console.error('❌ Smoke test failed:', error);
    process.exit(1);
  } finally {
    // Clean up
    await webhookService.close();
  }
}

// Run the test
if (require.main === module) {
  runSmokeTest()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}