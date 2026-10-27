import fs from 'node:fs';
import path from 'node:path';
import express, { type RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import { errorHandler, methodNotAllowed, notFound } from './middleware/errorHandler';
import { getSummary } from './modules/accounts/accounts.service';
import { accountsRouter } from './modules/accounts/accounts.routes';
import { accountTransactionsRouter, transactionsRouter } from './modules/transactions/transactions.routes';
import { transfersRouter } from './modules/transfers/transfers.routes';

const OPENAPI_PATH = path.join(__dirname, '..', 'openapi.yaml');

// Lets the API be called from a frontend served on another origin.
const cors: RequestHandler = (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
};

const requestLog: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
  });
  next();
};

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (process.env.NODE_ENV !== 'test') app.use(requestLog);
  app.use(cors);
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const spec = YAML.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));
  app.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec, { customSiteTitle: 'Ledger API docs' }));

  const api = express.Router();
  api.use('/accounts/:accountId/transactions', accountTransactionsRouter);
  api.use('/accounts', accountsRouter);
  api.use('/transactions', transactionsRouter);
  api.use('/transfers', transfersRouter);
  api
    .route('/summary')
    .get(async (_req, res) => {
      res.json({ data: await getSummary() });
    })
    .all(methodNotAllowed(['GET']));
  app.use('/api', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
