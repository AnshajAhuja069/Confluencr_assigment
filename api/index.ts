// Vercel serverless entry point: the same Express app that `npm run dev` serves.
// vercel.json rewrites /api/*, /docs, /openapi.json and /health here.
import { createApp } from '../backend/src/app';

export default createApp();
