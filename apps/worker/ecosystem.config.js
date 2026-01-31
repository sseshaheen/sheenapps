// PM2 Configuration - Enhanced with dotenv preloading
// IMPORTANT: This config now loads .env automatically via dotenv
module.exports = {
  apps: [{
    name: 'sheenapps-claude-worker',
    script: './dist/server.js',
    cwd: '/home/worker/sheenapps-claude-worker',

    // Process management (keeping your existing settings)
    exec_mode: 'fork',  // Use fork mode to avoid OTEL reinitialization issues
    // exec_mode: 'cluster',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    // interpreter: '/home/worker/.nvm/versions/node/v22.18.0/bin/node',

    // NEW: Preload dotenv BEFORE app starts - ensures .env is loaded
    node_args: '-r dotenv/config',

    // Environment configuration
    env: {
      NODE_ENV: 'production',
      // NEW: Tell dotenv where to find .env file
      DOTENV_CONFIG_PATH: '/home/worker/sheenapps-claude-worker/.env'
    },
    env_development: {
      NODE_ENV: 'development',
      DOTENV_CONFIG_PATH: '.env'
    },

    // Logging (keeping your existing paths)
    error_file: '/home/worker/sheenapps-claude-worker/logs/pm2-error.log',
    out_file: '/home/worker/sheenapps-claude-worker/logs/pm2-out.log',
    log_file: '/home/worker/sheenapps-claude-worker/logs/pm2-combined.log',
    time: true,

    // NEW: Enhanced log formatting
    log_date_format: 'YYYY-MM-DDTHH:mm:ss',

    // NEW: Graceful shutdown settings
    kill_timeout: 10000,
    listen_timeout: 5000
  }]
};
