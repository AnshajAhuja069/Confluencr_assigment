import { Pool, types } from 'pg';
import { config } from '../config';

// NUMERIC (oid 1700) comes back as a string by default to avoid precision loss.
// Amounts are capped at 2 decimal places and 16 integer digits, which a JS number
// represents exactly enough for display, so parse them here once.
types.setTypeParser(1700, (value) => Number(value));
// BIGINT (oid 20) is only used for counts / sequence numbers.
types.setTypeParser(20, (value) => Number(value));

export const pool = new Pool({ connectionString: config.databaseUrl, max: 20 });
