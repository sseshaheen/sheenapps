import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Deployment Lane Monitoring Script
 * 
 * Query and analyze deployment lane selection patterns from the logging system
 */

interface DeploymentLaneLog {
  timestamp: string;
  projectPath: string;
  target: string;
  reasons: string[];
  origin: 'manual' | 'detection';
  switched?: boolean;
  switchReason?: string;
}

async function queryDeploymentLogs(): Promise<DeploymentLaneLog[]> {
  // This would integrate with your actual logging system
  // For now, return mock data to demonstrate the concept
  return [
    {
      timestamp: '2025-08-20T18:02:31.100Z',
      projectPath: '/projects/ecommerce-app',
      target: 'workers-node',
      reasons: ['Supabase server-side patterns require Workers for service-role key security'],
      origin: 'detection'
    },
    {
      timestamp: '2025-08-20T17:45:12.850Z',
      projectPath: '/projects/blog-site',
      target: 'pages-static',
      reasons: ['Static export detected'],
      origin: 'detection'
    },
    {
      timestamp: '2025-08-20T17:30:45.200Z',
      projectPath: '/projects/dashboard-app',
      target: 'workers-node',
      reasons: ['Next 15 routed to Workers by policy'],
      origin: 'detection'
    },
    {
      timestamp: '2025-08-20T17:15:22.400Z',
      projectPath: '/projects/marketing-site',
      target: 'pages-edge',
      reasons: ['User override'],
      origin: 'manual'
    },
    {
      timestamp: '2025-08-20T16:58:15.600Z',
      projectPath: '/projects/api-heavy-app',
      target: 'workers-node',
      reasons: ['SSR/API without Edge runtime flag'],
      origin: 'detection',
      switched: true,
      switchReason: 'Build log detected Edge-incompatible code'
    }
  ];
}

function generateDeploymentReport(logs: DeploymentLaneLog[]) {
  const total = logs.length;
  const targetCounts = logs.reduce((acc, log) => {
    acc[log.target] = (acc[log.target] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const switchedCount = logs.filter(log => log.switched).length;
  const manualOverrides = logs.filter(log => log.origin === 'manual').length;

  console.log('📊 Deployment Lane Analysis Report\n');
  console.log(`📈 Total Deployments: ${total}`);
  console.log(`📅 Time Range: ${logs[logs.length - 1]?.timestamp} to ${logs[0]?.timestamp}\n`);

  console.log('🎯 Deployment Target Distribution:');
  Object.entries(targetCounts).forEach(([target, count]) => {
    const percentage = ((count / total) * 100).toFixed(1);
    const emoji = target === 'workers-node' ? '🔧' : target === 'pages-edge' ? '⚡' : '📄';
    console.log(`   ${emoji} ${target}: ${count} (${percentage}%)`);
  });

  console.log(`\n🔄 Target Switches: ${switchedCount} (${((switchedCount / total) * 100).toFixed(1)}%)`);
  console.log(`👤 Manual Overrides: ${manualOverrides} (${((manualOverrides / total) * 100).toFixed(1)}%)`);

  console.log('\n📋 Recent Deployments:');
  logs.slice(0, 5).forEach((log, index) => {
    const emoji = log.target === 'workers-node' ? '🔧' : log.target === 'pages-edge' ? '⚡' : '📄';
    const override = log.origin === 'manual' ? '👤' : '';
    const switched = log.switched ? '🔄' : '';
    console.log(`   ${index + 1}. ${emoji}${override}${switched} ${log.target} - ${log.reasons[0]} (${new Date(log.timestamp).toLocaleString()})`);
  });

  console.log('\n💡 Detection Reasons:');
  const reasons = logs.flatMap(log => log.reasons);
  const reasonCounts = reasons.reduce((acc, reason) => {
    acc[reason] = (acc[reason] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(reasonCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .forEach(([reason, count]) => {
      console.log(`   • ${reason}: ${count} times`);
    });
}

// Real-time monitoring function
async function monitorDeploymentLanes() {
  console.log('🔍 Cloudflare Deployment Lane Monitor\n');
  
  try {
    const logs = await queryDeploymentLogs();
    generateDeploymentReport(logs);
    
    console.log('\n📋 How to View Deployment Lanes:');
    console.log('   1. Check manifest file: cat /project/.sheenapps/deploy-target.json');
    console.log('   2. API detection: POST /v1/cloudflare/detect-target');
    console.log('   3. Deployment response: POST /v1/cloudflare/deploy');
    console.log('   4. Console logs during deployment');
    console.log('   5. Database logs: SELECT * FROM server_logs WHERE event_type = \'deployment_target_selected\'');
    
  } catch (error) {
    console.error('❌ Failed to fetch deployment logs:', error);
  }
}

// Database integration example
async function queryDeploymentLogsFromDB(): Promise<DeploymentLaneLog[]> {
  // Example SQL query for your logging system
  const query = `
    SELECT 
      created_at as timestamp,
      metadata->>'projectPath' as project_path,
      metadata->>'deploymentLane' as target,
      metadata->>'reasons' as reasons,
      metadata->>'origin' as origin,
      metadata->>'deploymentSwitched' as switched,
      metadata->>'switchReason' as switch_reason
    FROM server_logs 
    WHERE event_type = 'deployment_target_selected'
    ORDER BY created_at DESC 
    LIMIT 100
  `;
  
  console.log('📝 Example SQL Query for Deployment Lane Monitoring:');
  console.log(query);
  console.log('\n🔍 Log Event Types to Monitor:');
  console.log('   • deployment_target_selected - Initial target detection');
  console.log('   • deployment_completed - Final deployment outcome');
  console.log('   • cloudflare_deployment_api_failed - Deployment failures');
  
  // Return empty for demo - would connect to actual DB
  return [];
}

// Export for use in other monitoring tools
export { queryDeploymentLogs, generateDeploymentReport, monitorDeploymentLanes };

// Run monitoring if called directly
if (require.main === module) {
  monitorDeploymentLanes().catch(console.error);
}