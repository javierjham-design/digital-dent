// Env mínima para los tests de integración (se ejecuta dentro de cada worker).
process.env.NODE_ENV = 'test'
process.env.JWT_SECRET = 'integration-test-secret'
process.env.ENCRYPTION_KEY = 'integration-test-encryption-key-1234567890'
process.env.JWT_EXPIRES_IN = '12h'
