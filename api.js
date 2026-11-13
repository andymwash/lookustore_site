// Netlify serverless function: the whole Looku Store API (orders, tracking, feedback, M-Pesa)
const serverless = require('serverless-http');
const app = require('../../server/app');
exports.handler = serverless(app);
