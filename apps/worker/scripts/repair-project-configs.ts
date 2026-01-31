import { config } from 'dotenv';
import { repairProjectConfigs } from '../src/services/projectConfigService';

// Load environment variables
config();

async function runRepair() {
  console.log('🔧 Starting Project Config Repair...');
  console.log('=====================================');
  
  try {
    const result = await repairProjectConfigs();
    
    console.log('\n✅ Repair completed successfully!');
    console.log(`📊 Results: ${result.updated} updated, ${result.errors} errors`);
    
    if (result.errors > 0) {
      console.log('\n⚠️  Some projects had errors during repair. Check logs above for details.');
      process.exit(1);
    }
    
    console.log('\n🎉 All project configs have been synchronized with latest build data!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Repair failed:', error);
    process.exit(1);
  }
}

console.log('Starting repair of stale project configurations...');
console.log('This will update project build columns with latest build information from project_versions and project_build_metrics.');
console.log('');

runRepair();