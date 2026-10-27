import { migrate } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './testDbUrl';

export default async function setup() {
  await migrate(TEST_DATABASE_URL, () => undefined);
}
