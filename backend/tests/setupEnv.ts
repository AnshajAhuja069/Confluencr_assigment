import { TEST_DATABASE_URL } from './testDbUrl';

// Runs before any app module is imported, so the pool connects to the test DB.
process.env.DATABASE_URL = TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
