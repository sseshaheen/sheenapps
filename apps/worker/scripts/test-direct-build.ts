import { executeBuildDirect } from '../src/services/directBuildService';
import { BuildJobData } from '../src/types/build';

async function testDirectBuild() {
  console.log('Testing direct build...\n');
  
  const buildData: BuildJobData = {
    userId: 'user123',
    projectId: 'project456',
    prompt: 'One-line haiku about the ocean',
    isInitialBuild: true,
  };

  try {
    console.log('Starting build with data:', buildData);
    const result = await executeBuildDirect(buildData);
    console.log('\nBuild result:', JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('Build failed:', error);
  }
}

testDirectBuild().catch(console.error);