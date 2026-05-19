import express from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { uploadDir } from '../paths.js';
import { authenticateAdmin, requireAdmin } from '../middleware/auth.js';
import {
  addDatasetMetadata,
  deleteDataset,
  normalizeDatasetId,
  readDatasetIndex,
  updateDatasetMetadata
} from '../storage.js';
import { processShapefileUpload } from '../shapefileProcessor.js';
import { escapeHtml } from '../html.js';
import { outputProjectionOptions, projectionOptions } from '../projections.js';
import {
  createApiClient,
  deleteApiClient,
  listApiClients,
  listRequestLogs,
  setApiClientActive
} from '../tokenService.js';

export const adminRouter = express.Router();

const upload = multer({
  dest: uploadDir,
  limits: {
    fileSize: config.maxUploadMb * 1024 * 1024
  }
});

function page(title, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <main class="shell">
    ${body}
  </main>
</body>
</html>`;
}

function optionsHtml(options, selectedValue = 'original') {
  return options.map((option) => `
    <option value="${escapeHtml(option.code)}"${option.code === selectedValue ? ' selected' : ''}>
      ${escapeHtml(option.label)}
    </option>
  `).join('');
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '-';
}

function renderTokenCreatedMessage(token) {
  if (!token) return '';

  return `
    <p class="success">
      Token criado. Copie agora, ele nao sera exibido novamente:
      <code>${escapeHtml(token)}</code>
    </p>
  `;
}

function feedbackMessage(query) {
  if (query.success) return '<p class="success">Shapefile processado com sucesso.</p>';
  if (query.updated) return '<p class="success">Dataset atualizado com sucesso.</p>';
  if (query.deleted) return '<p class="success">Dataset excluido com sucesso.</p>';
  return '';
}

adminRouter.get('/', requireAdmin, async (req, res, next) => {
  try {
    const datasets = await readDatasetIndex();
    const clients = listApiClients();
    const token = req.session.createdApiToken;
    delete req.session.createdApiToken;
    const rows = datasets.map((dataset) => {
      const datasetName = dataset.name || dataset.originalName;
      const fileName = dataset.fileName || `${dataset.id}.geojson`;
      const projection = dataset.outputProjection || dataset.sourceProjection || 'original';
      const datasetId = encodeURIComponent(dataset.id);

      return `
        <tr>
          <td>
            <strong>${escapeHtml(datasetName)}</strong>
            <span>${escapeHtml(fileName)}</span>
          </td>
          <td>${escapeHtml(projection)}</td>
          <td>${dataset.featureCount}</td>
          <td>${new Date(dataset.uploadedAt).toLocaleString('pt-BR')}</td>
          <td><a href="/api/datasets/${datasetId}">metadata</a></td>
          <td><a href="/api/datasets/${datasetId}/features">features</a></td>
        </tr>
      `;
    }).join('');
    const datasetEditors = datasets.map((dataset) => {
      const datasetName = dataset.name || dataset.originalName || '';
      const fileName = normalizeDatasetId(dataset.fileName || dataset.id) || dataset.id;
      const sourceProjection = dataset.sourceProjection || 'original';
      const outputProjection = dataset.outputProjection || 'original';
      const datasetId = encodeURIComponent(dataset.id);

      return `
        <div class="dataset-editor">
          <form action="/admin/datasets/${datasetId}/edit" method="post">
            <div class="grid four">
              <div>
                <label for="dataset-name-${escapeHtml(dataset.id)}">Nome</label>
                <input id="dataset-name-${escapeHtml(dataset.id)}" name="name" type="text" value="${escapeHtml(datasetName)}" required>
              </div>
              <div>
                <label for="dataset-file-${escapeHtml(dataset.id)}">Nome do arquivo</label>
                <input id="dataset-file-${escapeHtml(dataset.id)}" name="fileName" type="text" value="${escapeHtml(fileName)}" required>
              </div>
              <div>
                <label for="dataset-source-${escapeHtml(dataset.id)}">Projecao de origem</label>
                <select id="dataset-source-${escapeHtml(dataset.id)}" name="sourceProjection">
                  ${optionsHtml(projectionOptions, sourceProjection)}
                </select>
              </div>
              <div>
                <label for="dataset-output-${escapeHtml(dataset.id)}">Projecao de saida</label>
                <select id="dataset-output-${escapeHtml(dataset.id)}" name="outputProjection">
                  ${optionsHtml(outputProjectionOptions, outputProjection)}
                </select>
              </div>
            </div>
            <div class="editor-actions">
              <button type="submit">Salvar</button>
              <span>${escapeHtml(String(dataset.featureCount || 0))} feicoes</span>
            </div>
          </form>
          <form action="/admin/datasets/${datasetId}/delete" method="post" class="delete-dataset-form" onsubmit="return confirm('Excluir este dataset e o arquivo GeoJSON associado?')">
            <button type="submit" class="danger">Excluir dataset</button>
          </form>
        </div>
      `;
    }).join('');
    const clientRows = clients.map((client) => `
      <tr>
        <td>
          <strong>${escapeHtml(client.name)}</strong>
          <span>${escapeHtml(client.owner || '-')}</span>
        </td>
        <td><code>${escapeHtml(client.tokenPreview)}</code></td>
        <td>${escapeHtml(String(client.rateLimitPerSecond))}/s</td>
        <td>${escapeHtml(String(client.cooldownMs))} ms</td>
        <td>${formatDateTime(client.expiresAt)}</td>
        <td>${client.isActive ? 'Ativo' : 'Inativo'}</td>
        <td>
          <form action="/admin/api-clients/${client.id}/toggle" method="post" class="inline-form">
            <button type="submit" class="secondary">${client.isActive ? 'Desativar' : 'Ativar'}</button>
          </form>
          <form action="/admin/api-clients/${client.id}/delete" method="post" class="inline-form">
            <button type="submit" class="danger">Remover</button>
          </form>
        </td>
      </tr>
    `).join('');
    res.send(page('Administracao', `
      <section class="panel">
        <div class="topbar">
          <h1>Area administrativa</h1>
          <div class="actions">
            <a class="button-link" href="/intersection-test.html">Teste de intersecao</a>
            <a class="button-link" href="/api-docs">Swagger</a>
            <form action="/admin/logout" method="post">
              <button type="submit" class="secondary">Sair</button>
            </form>
          </div>
        </div>

        ${feedbackMessage(req.query)}
        ${req.query.error ? `<p class="error">${escapeHtml(req.query.error)}</p>` : ''}
        ${renderTokenCreatedMessage(token)}

        <form action="/admin/upload" method="post" enctype="multipart/form-data" class="upload-form">
          <div class="grid two">
            <div>
              <label for="name">Nome do dataset</label>
              <input id="name" name="name" type="text" placeholder="Areas contaminadas CETESB" required>
            </div>
            <div>
              <label for="fileName">Nome do arquivo GeoJSON</label>
              <input id="fileName" name="fileName" type="text" placeholder="areas-contaminadas-cetesb" required>
            </div>
          </div>

          <div class="grid two">
            <div>
              <label for="sourceProjection">Projecao de origem</label>
              <select id="sourceProjection" name="sourceProjection">
                ${optionsHtml(projectionOptions, 'original')}
              </select>
            </div>
            <div>
              <label for="outputProjection">Projecao de saida</label>
              <select id="outputProjection" name="outputProjection">
                ${optionsHtml(outputProjectionOptions, 'original')}
              </select>
            </div>
          </div>

          <label for="shapefile">Shapefile compactado (.zip)</label>
          <input id="shapefile" name="shapefile" type="file" accept=".zip" required>
          <button type="submit">Enviar e processar</button>
        </form>
      </section>

      <section class="panel">
        <h2>Datasets publicados</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Arquivo</th>
                <th>Projecao</th>
                <th>Feicoes</th>
                <th>Upload</th>
                <th colspan="2">API</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="6">Nenhum dataset publicado.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <h2>Editar datasets</h2>
        <div class="dataset-editor-list">
          ${datasetEditors || '<p>Nenhum dataset publicado.</p>'}
        </div>
      </section>

      <section class="panel">
        <h2>Aplicacoes e tokens</h2>
        <form action="/admin/api-clients" method="post" class="upload-form">
          <div class="grid two">
            <div>
              <label for="clientName">Nome da aplicacao/usuario</label>
              <input id="clientName" name="name" type="text" placeholder="Sistema consumidor" required>
            </div>
            <div>
              <label for="clientOwner">Responsavel</label>
              <input id="clientOwner" name="owner" type="text" placeholder="Equipe ou email">
            </div>
          </div>
          <div class="grid three">
            <div>
              <label for="expiresInDays">Timeout do token (dias)</label>
              <input id="expiresInDays" name="expiresInDays" type="number" min="1" value="90" required>
            </div>
            <div>
              <label for="rateLimitPerSecond">Requests por segundo</label>
              <input id="rateLimitPerSecond" name="rateLimitPerSecond" type="number" min="1" value="5" required>
            </div>
            <div>
              <label for="cooldownMs">Cooldown (ms)</label>
              <input id="cooldownMs" name="cooldownMs" type="number" min="0" value="0" required>
            </div>
          </div>
          <button type="submit">Criar token</button>
        </form>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Aplicacao</th>
                <th>Token</th>
                <th>Limite</th>
                <th>Cooldown</th>
                <th>Expira em</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              ${clientRows || '<tr><td colspan="7">Nenhuma aplicacao cadastrada.</td></tr>'}
            </tbody>
          </table>
        </div>
      </section>

      <section class="panel">
        <div class="topbar">
          <h2>Logs da API</h2>
          <label class="toggle">
            <input id="followLogs" type="checkbox" checked>
            Seguir atualizacao
          </label>
        </div>
        <div class="log-controls">
          <label for="logPageSize">Itens por pagina</label>
          <select id="logPageSize">
            <option value="10">10</option>
            <option value="25" selected>25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <button id="refreshLogs" type="button" class="secondary">Atualizar</button>
        </div>
        <div class="table-wrap">
          <table id="logsTable">
            <thead>
              <tr>
                <th><button type="button" data-sort="createdAt">Data</button></th>
                <th><button type="button" data-sort="clientName">Aplicacao</button></th>
                <th><button type="button" data-sort="method">Metodo</button></th>
                <th><button type="button" data-sort="path">Rota</button></th>
                <th><button type="button" data-sort="statusCode">Status</button></th>
                <th><button type="button" data-sort="durationMs">Duracao</button></th>
                <th><button type="button" data-sort="ip">IP</button></th>
                <th><button type="button" data-sort="message">Mensagem</button></th>
              </tr>
            </thead>
            <tbody id="logsBody">
              <tr><td colspan="8">Carregando logs...</td></tr>
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button id="prevLogsPage" type="button" class="secondary">Anterior</button>
          <span id="logsPageInfo">Pagina 1</span>
          <button id="nextLogsPage" type="button" class="secondary">Proxima</button>
        </div>
      </section>
      <script src="/admin-logs.js" type="module"></script>
    `));
  } catch (error) {
    next(error);
  }
});

adminRouter.get('/logs.json', requireAdmin, (req, res) => {
  res.json(listRequestLogs(req.query));
});

adminRouter.get('/login', (req, res) => {
  res.send(page('Login administrativo', `
    <section class="panel login">
      <h1>Area administrativa</h1>
      ${req.query.error ? '<p class="error">Usuario ou senha invalidos.</p>' : ''}
      <form action="/admin/login" method="post">
        <label for="username">Usuario</label>
        <input id="username" name="username" type="text" autocomplete="username" required>
        <label for="password">Senha</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <button type="submit">Entrar</button>
      </form>
    </section>
  `));
});

adminRouter.post('/login', express.urlencoded({ extended: false }), (req, res) => {
  const { username, password } = req.body;

  if (!authenticateAdmin(username, password)) {
    return res.redirect('/admin/login?error=1');
  }

  req.session.isAdmin = true;
  return res.redirect('/admin');
});

adminRouter.post('/logout', requireAdmin, (req, res, next) => {
  req.session.destroy((error) => {
    if (error) return next(error);
    res.redirect('/admin/login');
  });
});

adminRouter.post('/datasets/:id/edit', requireAdmin, express.urlencoded({ extended: false }), async (req, res) => {
  try {
    await updateDatasetMetadata(req.params.id, req.body);
    res.redirect('/admin?updated=1');
  } catch (error) {
    res.redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }
});

adminRouter.post('/datasets/:id/delete', requireAdmin, async (req, res) => {
  try {
    await deleteDataset(req.params.id);
    res.redirect('/admin?deleted=1');
  } catch (error) {
    res.redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }
});

adminRouter.post('/api-clients', requireAdmin, express.urlencoded({ extended: false }), (req, res) => {
  try {
    const result = createApiClient(req.body);
    req.session.createdApiToken = result.token;
    res.redirect('/admin');
  } catch (error) {
    res.redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }
});

adminRouter.post('/api-clients/:id/toggle', requireAdmin, (req, res) => {
  const clients = listApiClients();
  const client = clients.find((item) => item.id === Number(req.params.id));

  if (client) {
    setApiClientActive(client.id, !client.isActive);
  }

  res.redirect('/admin');
});

adminRouter.post('/api-clients/:id/delete', requireAdmin, (req, res) => {
  deleteApiClient(Number(req.params.id));
  res.redirect('/admin');
});

adminRouter.post('/upload', requireAdmin, upload.single('shapefile'), async (req, res) => {
  try {
    const metadata = await processShapefileUpload(req.file, req.body);
    await addDatasetMetadata(metadata);
    res.redirect('/admin?success=1');
  } catch (error) {
    res.redirect(`/admin?error=${encodeURIComponent(error.message)}`);
  }
});
