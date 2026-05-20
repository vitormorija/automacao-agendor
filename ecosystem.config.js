module.exports = {
  apps: [
    {
      name: 'agendor-backend',
      script: './backend/src/index.js',
      cwd: '/opt/agendor',           // ajuste para o caminho no servidor
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      // Reinicia automaticamente se cair
      restart_delay: 5000,
      max_restarts: 10,

      // Logs
      error_file: '/opt/agendor/logs/pm2-error.log',
      out_file: '/opt/agendor/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
    },
  ],
};
