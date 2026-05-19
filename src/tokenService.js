import crypto from 'node:crypto';
import { getDb } from './database.js';

function nowIso() {
  return new Date().toISOString();
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createTokenValue() {
  return `sac_${crypto.randomBytes(32).toString('base64url')}`;
}

export function tokenPreview(token) {
  return `${token.slice(0, 8)}...${token.slice(-6)}`;
}

export function createApiClient({
  name,
  owner,
  expiresInDays = 90,
  rateLimitPerSecond = 5,
  cooldownMs = 0
}) {
  const normalizedName = String(name || '').trim();
  const normalizedExpiresInDays = Number(expiresInDays);
  const normalizedRateLimit = Number(rateLimitPerSecond);
  const normalizedCooldown = Number(cooldownMs);

  if (!normalizedName) {
    throw new Error('Informe o nome da aplicacao/usuario.');
  }

  if (!Number.isFinite(normalizedExpiresInDays) || normalizedExpiresInDays < 1) {
    throw new Error('Timeout do token deve ser maior ou igual a 1 dia.');
  }

  if (!Number.isFinite(normalizedRateLimit) || normalizedRateLimit < 1) {
    throw new Error('Limite de requests por segundo deve ser maior ou igual a 1.');
  }

  if (!Number.isFinite(normalizedCooldown) || normalizedCooldown < 0) {
    throw new Error('Cooldown deve ser maior ou igual a 0.');
  }

  const token = createTokenValue();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + normalizedExpiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const database = getDb();

  const result = database.prepare(`
    INSERT INTO api_clients (
      name,
      owner,
      token_hash,
      token_preview,
      expires_at,
      rate_limit_per_second,
      cooldown_ms,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    normalizedName,
    String(owner || '').trim() || null,
    hashToken(token),
    tokenPreview(token),
    expiresAt,
    Math.floor(normalizedRateLimit),
    Math.floor(normalizedCooldown),
    createdAt
  );

  return {
    token,
    client: getApiClientById(result.lastInsertRowid)
  };
}

export function listApiClients() {
  return getDb().prepare(`
    SELECT
      id,
      name,
      owner,
      token_preview AS tokenPreview,
      expires_at AS expiresAt,
      rate_limit_per_second AS rateLimitPerSecond,
      cooldown_ms AS cooldownMs,
      is_active AS isActive,
      created_at AS createdAt,
      last_used_at AS lastUsedAt
    FROM api_clients
    ORDER BY created_at DESC
  `).all();
}

export function getApiClientById(id) {
  return getDb().prepare(`
    SELECT
      id,
      name,
      owner,
      token_hash AS tokenHash,
      token_preview AS tokenPreview,
      expires_at AS expiresAt,
      rate_limit_per_second AS rateLimitPerSecond,
      cooldown_ms AS cooldownMs,
      is_active AS isActive,
      created_at AS createdAt,
      last_used_at AS lastUsedAt
    FROM api_clients
    WHERE id = ?
  `).get(id);
}

export function getApiClientByToken(token) {
  return getDb().prepare(`
    SELECT
      id,
      name,
      owner,
      token_hash AS tokenHash,
      token_preview AS tokenPreview,
      expires_at AS expiresAt,
      rate_limit_per_second AS rateLimitPerSecond,
      cooldown_ms AS cooldownMs,
      is_active AS isActive,
      created_at AS createdAt,
      last_used_at AS lastUsedAt
    FROM api_clients
    WHERE token_hash = ?
  `).get(hashToken(token));
}

export function setApiClientActive(id, isActive) {
  getDb().prepare('UPDATE api_clients SET is_active = ? WHERE id = ?')
    .run(isActive ? 1 : 0, id);
}

export function deleteApiClient(id) {
  getDb().prepare('DELETE FROM api_clients WHERE id = ?').run(id);
}

export function touchApiClient(id) {
  getDb().prepare('UPDATE api_clients SET last_used_at = ? WHERE id = ?')
    .run(nowIso(), id);
}

export function insertRequestLog({
  clientId,
  clientName,
  method,
  path,
  statusCode,
  durationMs,
  ip,
  userAgent,
  message
}) {
  getDb().prepare(`
    INSERT INTO request_logs (
      client_id,
      client_name,
      method,
      path,
      status_code,
      duration_ms,
      ip,
      user_agent,
      message,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    clientId || null,
    clientName || null,
    method,
    path,
    statusCode,
    durationMs,
    ip || null,
    userAgent || null,
    message || null,
    nowIso()
  );
}

const logSortColumns = {
  createdAt: 'created_at',
  clientName: 'client_name',
  method: 'method',
  path: 'path',
  statusCode: 'status_code',
  durationMs: 'duration_ms',
  ip: 'ip',
  message: 'message'
};

export function listRequestLogs({
  page = 1,
  pageSize = 25,
  sort = 'createdAt',
  direction = 'desc'
} = {}) {
  const normalizedPage = Math.max(Number(page) || 1, 1);
  const normalizedPageSize = Math.min(Math.max(Number(pageSize) || 25, 1), 200);
  const sortColumn = logSortColumns[sort] || logSortColumns.createdAt;
  const sortDirection = String(direction).toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const offset = (normalizedPage - 1) * normalizedPageSize;
  const database = getDb();
  const total = database.prepare('SELECT COUNT(*) AS count FROM request_logs').get().count;
  const items = database.prepare(`
    SELECT
      id,
      client_id AS clientId,
      client_name AS clientName,
      method,
      path,
      status_code AS statusCode,
      duration_ms AS durationMs,
      ip,
      user_agent AS userAgent,
      message,
      created_at AS createdAt
    FROM request_logs
    ORDER BY ${sortColumn} ${sortDirection}, id ${sortDirection}
    LIMIT ? OFFSET ?
  `).all(normalizedPageSize, offset);

  return {
    items,
    page: normalizedPage,
    pageSize: normalizedPageSize,
    total,
    totalPages: Math.max(Math.ceil(total / normalizedPageSize), 1),
    sort,
    direction: sortDirection.toLowerCase()
  };
}
