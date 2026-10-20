/** Jest runs only the HTTP/integration suite; unit tests stay on `node --test`. */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/api/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/api/setup.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/api/afterEnv.js'],
  testTimeout: 20000,
  verbose: true,
}
