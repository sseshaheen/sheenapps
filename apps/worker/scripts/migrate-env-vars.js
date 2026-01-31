#!/usr/bin/env node
// Script to help migrate from deprecated environment variables
const fs = require('fs');
const path = require('path');

const envPath = path.join(process.cwd(), '.env');

if (!fs.existsSync(envPath)) {
  console.log('No .env file found');
  process.exit(0);
}

console.log('🔄 Checking for deprecated environment variables...\n');

const envContent = fs.readFileSync(envPath, 'utf8');
const lines = envContent.split('\n');

const migrations = [
  { old: 'CLOUDFLARE_ACCOUNT_ID', new: 'CF_ACCOUNT_ID' },
  { old: 'CLOUDFLARE_API_TOKEN', new: 'CF_API_TOKEN_WORKERS' }
];

let modified = false;
const migratedVars = [];
const alreadyMigrated = [];

// First pass: check what needs migration
lines.forEach(line => {
  if (line.trim() && !line.startsWith('#')) {
    const [key] = line.split('=');
    if (key) {
      const trimmedKey = key.trim();
      migrations.forEach(({ old, new: newVar }) => {
        if (trimmedKey === old) {
          // Check if new variable already exists
          const newVarExists = lines.some(l => {
            if (!l.startsWith('#') && l.includes('=')) {
              const [k] = l.split('=');
              return k && k.trim() === newVar;
            }
            return false;
          });
          
          if (newVarExists) {
            alreadyMigrated.push({ old, new: newVar });
          } else {
            migratedVars.push({ old, new: newVar });
          }
        }
      });
    }
  }
});

// Report status
if (alreadyMigrated.length > 0) {
  console.log('✅ Already migrated (both old and new variables exist):');
  alreadyMigrated.forEach(({ old, new: newVar }) => {
    console.log(`   ${old} → ${newVar}`);
  });
  console.log('   You can safely remove the deprecated variables.\n');
}

if (migratedVars.length === 0 && alreadyMigrated.length === 0) {
  console.log('✅ No deprecated variables found');
  console.log('   Your .env file is using the recommended variable names.');
  process.exit(0);
}

// Second pass: perform migration
if (migratedVars.length > 0) {
  const newLines = lines.map(line => {
    for (const { old, new: newVar } of migratedVars) {
      if (line.startsWith(`${old}=`)) {
        const value = line.substring(old.length + 1);
        console.log(`📝 Migrating: ${old} → ${newVar}`);
        modified = true;
        // Comment out old line and add new one
        return `# DEPRECATED - Migrated to ${newVar}\n# ${line}\n${newVar}=${value}`;
      }
    }
    return line;
  });

  if (modified) {
    // Backup original file
    const backupPath = `${envPath}.backup.${Date.now()}`;
    fs.writeFileSync(backupPath, envContent);
    console.log(`\n📁 Backup created: ${backupPath}`);
    
    // Write updated content
    fs.writeFileSync(envPath, newLines.join('\n'));
    console.log('✅ Environment variables migrated successfully');
    console.log('\n⚠️  Please review the changes and test your application');
  }
}

// Suggest cleanup for already migrated variables
if (alreadyMigrated.length > 0) {
  console.log('\n🧹 To clean up deprecated variables, you can:');
  console.log('   1. Edit .env and remove the deprecated lines');
  console.log('   2. Or run this command to remove them automatically:');
  alreadyMigrated.forEach(({ old }) => {
    console.log(`      sed -i.bak '/${old}=/d' .env`);
  });
}