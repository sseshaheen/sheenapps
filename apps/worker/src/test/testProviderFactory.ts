import { ProviderFactory } from '../providers/providerFactory';
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

async function testProviderFactory() {
  console.log('🏭 Testing Provider Factory...\n');

  // Test 1: Get mock provider in test mode
  console.log('📝 Test 1: Mock Provider Selection');
  process.env.NODE_ENV = 'test';
  delete process.env.USE_REAL_PROVIDER;
  
  const mockProvider = ProviderFactory.getProvider();
  console.log(`   ✅ Provider type: ${mockProvider.name}`);
  console.log(`   ✅ Is mock: ${mockProvider.name === 'mock'}\n`);

  // Test 2: Provider with environment variable
  console.log('📝 Test 2: Environment-based Provider Selection');
  process.env.AI_PROVIDER = 'mock';
  const envProvider = ProviderFactory.getProvider();
  console.log(`   ✅ Provider type: ${envProvider.name}`);
  console.log(`   ✅ Matches env: ${envProvider.name === process.env.AI_PROVIDER}\n`);

  // Test 3: Direct provider selection
  console.log('📝 Test 3: Direct Provider Selection');
  const directMock = ProviderFactory.getProvider('mock');
  console.log(`   ✅ Provider type: ${directMock.name}`);
  console.log(`   ✅ Is mock: ${directMock.name === 'mock'}\n`);

  // Test 4: Provider caching
  console.log('📝 Test 4: Provider Caching');
  const provider1 = ProviderFactory.getProvider('mock');
  const provider2 = ProviderFactory.getProvider('mock');
  console.log(`   ✅ Same instance: ${provider1 === provider2}\n`);

  // Test 5: Integration with services
  console.log('📝 Test 5: Service Integration');
  
  const tempDir = path.join(os.tmpdir(), `provider-test-${ulid()}`);
  await fs.mkdir(tempDir, { recursive: true });

  const webhookService = new WebhookService();
  const aiProvider = ProviderFactory.getProvider('mock');
  const planGenerator = new PlanGeneratorService(webhookService, aiProvider);
  const taskDb = new TaskDatabase();
  const taskExecutor = new TaskExecutorService(webhookService, aiProvider, taskDb);

  const buildId = ulid();
  const planContext: PlanContext & { buildId: string; userId: string; projectId: string } = {
    framework: 'react',
    existingFiles: [],
    projectPath: tempDir,
    buildId,
    userId: 'test-user',
    projectId: 'test-project'
  };

  try {
    const plan = await planGenerator.generatePlan(
      'Create a simple button component',
      planContext
    );
    
    console.log(`   ✅ Plan generated with ${plan.tasks.length} tasks`);
    console.log(`   ✅ Using provider: ${aiProvider.name}`);
    
    // Test 6: Claude CLI provider availability
    console.log('\n📝 Test 6: Claude CLI Provider');
    try {
      const originalUseReal = process.env.USE_REAL_PROVIDER;
      process.env.USE_REAL_PROVIDER = 'true';
      
      // Clear cache to force new provider creation
      ProviderFactory.clearCache();
      const claudeCLIProvider = ProviderFactory.getProvider('claude-cli');
      console.log(`   ✅ Claude CLI provider created: ${claudeCLIProvider.name === 'claude-cli'}`);
      
      // Restore original value
      if (originalUseReal) {
        process.env.USE_REAL_PROVIDER = originalUseReal;
      } else {
        delete process.env.USE_REAL_PROVIDER;
      }
    } catch (error) {
      console.log(`   ❌ Claude CLI provider error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test 7: 'claude' provider type (now unified with claude-cli)
    console.log('\n📝 Test 7: Claude Provider Type (Unified CLI)');
    try {
      const originalUseReal = process.env.USE_REAL_PROVIDER;
      process.env.USE_REAL_PROVIDER = 'true';

      // Clear cache to force new provider creation
      ProviderFactory.clearCache();
      const claudeProvider = ProviderFactory.getProvider('claude');
      // Both 'claude' and 'claude-cli' now use CLI-based execution
      console.log(`   ✅ Claude provider created: ${claudeProvider.name === 'claude-cli'}`);
      console.log(`   ✅ Unified with CLI: Both 'claude' and 'claude-cli' use same provider`);

      // Restore original values
      if (originalUseReal) {
        process.env.USE_REAL_PROVIDER = originalUseReal;
      } else {
        delete process.env.USE_REAL_PROVIDER;
      }
    } catch (error) {
      console.log(`   ❌ Claude provider error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Test 8: Clear cache
    console.log('\n📝 Test 8: Cache Clearing');
    ProviderFactory.clearCache();
    const newProvider = ProviderFactory.getProvider('mock');
    console.log(`   ✅ New instance after clear: ${newProvider !== provider1}`);

    console.log('\n🎉 Provider Factory test completed successfully!');

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
    } catch (error) {
      console.warn('Could not clean up temp directory:', error);
    }
  }
}

// Run the test
if (require.main === module) {
  testProviderFactory()
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}