// server.js (enxuto e alinhado)
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const socketIo = require('socket.io');
const routes = require('./routes');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const dotenvFlow = require('dotenv-flow');

dotenvFlow.config();

const PROXY_COUNT = Number(process.env.PROXY_COUNT ?? 0); // 0 por padrão em dev
const app = express();
app.set('trust proxy', PROXY_COUNT);

const server = http.createServer(app);

/* -------------------------- CORS compartilhado -------------------------- */

// Origens fixas (fronts) — mantenha estas envs apontando para o FRONTEND
const allowedOrigins = [
  process.env.FRONTEND_URL_DEV,      // ex.: http://localhost:3000
  process.env.FRONTEND_URL_DEV_NET,  // ex.: http://192.168.15.91:3000
  process.env.FRONTEND_URL_PROD,     // ex.: https://cristaos-frontend.vercel.app
  // 'http://127.0.0.1:3000',        // opcional
].filter(Boolean);

// (opcional) liberar previews *.vercel.app via env
const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS === '1';
const isVercelPreview = (origin) => {
  try {
    const { hostname, protocol } = new URL(origin);
    return protocol === 'https:' && hostname.endsWith('.vercel.app');
  } catch {
    return false;
  }
};

// única função de validação: HTTP e WS usam a mesma
const originCheck = (origin, cb) => {
  if (!origin) return cb(null, true); // curl/healthchecks / React Native
  if (allowedOrigins.includes(origin)) return cb(null, true);
  if (allowVercelPreviews && isVercelPreview(origin)) return cb(null, true);
  console.warn('🚫 CORS bloqueado para:', origin);
  return cb(new Error('Not allowed by CORS'));
};

/* ------------------------------ Socket.IO ------------------------------- */

const io = socketIo(server, {
  cors: {
    origin: originCheck,
    methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'], // ⬅️ add
  },
});

app.set('io', io);
require('./socket')(io);

/* ----------------------------- Middlewares ------------------------------ */

// CORS para requisições “normais”

// Preflight (OPTIONS) e CORS global para as respostas reais:
app.options('*', cors({
  origin: originCheck,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cors({
  origin: originCheck,
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  // allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(cookieParser());
app.use(express.json());

// healthcheck simples
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

// rotas da API
app.use('/api', routes);

// 404 explícito (antes do handler de erro)
app.use((req, res, next) => {
  if (res.headersSent) return next();
  res.status(404).json({ message: 'Not found' });
});

/* --------------------------- Tratador de erros -------------------------- */

app.use((err, _req, res, _next) => {
  console.error('❌ Global error:', err);
  const status = err.status || 500;
  res.status(status).json({
    message: status === 500 ? 'An unexpected error occurred.' : err.message,
  });
});

/* ------------------------------ MongoDB -------------------------------- */

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ Missing MONGO_URI in env');
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

/* ------------------------------- Startup -------------------------------- */

const PORT = Number(process.env.PORT || 5001);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HTTP+WS listening on :${PORT}`);
  console.log('   Allowed origins:', allowedOrigins.length ? allowedOrigins : '(none)');
  if (allowVercelPreviews) console.log('   + *.vercel.app previews allowed');
});

/* -------------------------- Shutdown gracioso --------------------------- */

const shutdown = async (signal) => {
  console.log(`\n${signal} recebido. Encerrando...`);
  server.close(() => console.log('HTTP fechado'));
  try {
    await mongoose.connection.close();
    console.log('MongoDB fechado');
  } catch (e) {
    console.error('Erro ao fechar MongoDB:', e);
  }
  process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
