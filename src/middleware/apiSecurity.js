import {
  getApiClientByToken,
  insertRequestLog,
  touchApiClient
} from '../tokenService.js';

const buckets = new Map();

function tokenFromRequest(req) {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(/\s+/);

  if (scheme?.toLowerCase() === 'bearer' && token) {
    return token;
  }

  return req.get('x-api-token') || req.query.token || '';
}

function sanitizedPath(req) {
  const url = new URL(req.originalUrl, 'http://local');
  url.searchParams.delete('token');
  return `${url.pathname}${url.search}`;
}

function rateState(client) {
  const key = String(client.id);
  const now = Date.now();
  const state = buckets.get(key) || {
    windowStart: now,
    count: 0,
    lastRequestAt: 0
  };

  if (now - state.windowStart >= 1000) {
    state.windowStart = now;
    state.count = 0;
  }

  return { key, now, state };
}

function checkRateLimit(client) {
  const { key, now, state } = rateState(client);
  const cooldownMs = Number(client.cooldownMs) || 0;
  const rateLimitPerSecond = Number(client.rateLimitPerSecond) || 1;

  if (cooldownMs > 0 && now - state.lastRequestAt < cooldownMs) {
    buckets.set(key, state);
    return {
      allowed: false,
      status: 429,
      retryAfterSeconds: Math.ceil((cooldownMs - (now - state.lastRequestAt)) / 1000),
      message: 'Cooldown ativo para este token.'
    };
  }

  if (state.count >= rateLimitPerSecond) {
    buckets.set(key, state);
    return {
      allowed: false,
      status: 429,
      retryAfterSeconds: 1,
      message: 'Limite de requisicoes por segundo excedido.'
    };
  }

  state.count += 1;
  state.lastRequestAt = now;
  buckets.set(key, state);

  return { allowed: true };
}

export function requestLogger(req, res, next) {
  const startedAt = Date.now();

  res.on('finish', () => {
    insertRequestLog({
      clientId: req.apiClient?.id,
      clientName: req.apiClient?.name,
      method: req.method,
      path: sanitizedPath(req),
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.ip,
      userAgent: req.get('user-agent'),
      message: res.locals.logMessage
    });
  });

  next();
}

export function requireApiToken(req, res, next) {
  const token = tokenFromRequest(req);

  if (!token) {
    res.locals.logMessage = 'Token ausente.';
    return res.status(401).json({ error: 'Token de API ausente.' });
  }

  const client = getApiClientByToken(token);

  if (!client) {
    res.locals.logMessage = 'Token invalido.';
    return res.status(401).json({ error: 'Token de API invalido.' });
  }

  if (!client.isActive) {
    req.apiClient = client;
    res.locals.logMessage = 'Token inativo.';
    return res.status(403).json({ error: 'Token de API inativo.' });
  }

  if (new Date(client.expiresAt).getTime() <= Date.now()) {
    req.apiClient = client;
    res.locals.logMessage = 'Token expirado.';
    return res.status(401).json({ error: 'Token de API expirado.' });
  }

  const rateLimit = checkRateLimit(client);
  if (!rateLimit.allowed) {
    req.apiClient = client;
    res.set('Retry-After', String(rateLimit.retryAfterSeconds));
    res.locals.logMessage = rateLimit.message;
    return res.status(rateLimit.status).json({ error: rateLimit.message });
  }

  req.apiClient = client;
  touchApiClient(client.id);
  return next();
}
