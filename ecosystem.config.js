module.exports = {
  apps: [{
    name: '9drive-backend',
    cwd: './backend',
    script: './dist/server.js',
    env: {
      NODE_ENV: 'production'
    }
  }]
}
