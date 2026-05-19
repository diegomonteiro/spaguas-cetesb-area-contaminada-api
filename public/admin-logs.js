const state = {
  page: 1,
  pageSize: 25,
  sort: 'createdAt',
  direction: 'desc',
  totalPages: 1,
  timer: null
};

const body = document.querySelector('#logsBody');
const pageInfo = document.querySelector('#logsPageInfo');
const pageSize = document.querySelector('#logPageSize');
const follow = document.querySelector('#followLogs');
const refresh = document.querySelector('#refreshLogs');
const prev = document.querySelector('#prevLogsPage');
const next = document.querySelector('#nextLogsPage');
const table = document.querySelector('#logsTable');

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDateTime(value) {
  return value ? new Date(value).toLocaleString('pt-BR') : '-';
}

function renderRows(items) {
  body.innerHTML = items.map((log) => `
    <tr>
      <td>${formatDateTime(log.createdAt)}</td>
      <td>${escapeHtml(log.clientName || '-')}</td>
      <td>${escapeHtml(log.method)}</td>
      <td><span>${escapeHtml(log.path)}</span></td>
      <td>${log.statusCode}</td>
      <td>${log.durationMs} ms</td>
      <td>${escapeHtml(log.ip || '-')}</td>
      <td>${escapeHtml(log.message || '-')}</td>
    </tr>
  `).join('') || '<tr><td colspan="8">Nenhum log registrado.</td></tr>';
}

function updateSortIndicators() {
  table.querySelectorAll('[data-sort]').forEach((button) => {
    const active = button.dataset.sort === state.sort;
    button.textContent = button.textContent.replace(/\s[▲▼]$/, '');
    if (active) {
      button.textContent = `${button.textContent} ${state.direction === 'asc' ? '▲' : '▼'}`;
    }
  });
}

async function loadLogs() {
  const params = new URLSearchParams({
    page: String(state.page),
    pageSize: String(state.pageSize),
    sort: state.sort,
    direction: state.direction
  });
  const response = await fetch(`/admin/logs.json?${params}`);

  if (!response.ok) {
    body.innerHTML = '<tr><td colspan="8">Nao foi possivel carregar logs.</td></tr>';
    return;
  }

  const payload = await response.json();
  state.page = payload.page;
  state.pageSize = payload.pageSize;
  state.totalPages = payload.totalPages;
  renderRows(payload.items);
  pageInfo.textContent = `Pagina ${payload.page} de ${payload.totalPages} (${payload.total} logs)`;
  prev.disabled = payload.page <= 1;
  next.disabled = payload.page >= payload.totalPages;
  updateSortIndicators();
}

function scheduleFollow() {
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  if (follow.checked) {
    state.page = 1;
    state.sort = 'createdAt';
    state.direction = 'desc';
    state.timer = setInterval(loadLogs, 5000);
  }

  loadLogs();
}

table.addEventListener('click', (event) => {
  const button = event.target.closest('[data-sort]');
  if (!button) return;

  if (state.sort === button.dataset.sort) {
    state.direction = state.direction === 'asc' ? 'desc' : 'asc';
  } else {
    state.sort = button.dataset.sort;
    state.direction = 'desc';
  }

  state.page = 1;
  if (follow.checked && state.sort !== 'createdAt') {
    follow.checked = false;
    scheduleFollow();
    return;
  }

  loadLogs();
});

pageSize.addEventListener('change', () => {
  state.pageSize = Number(pageSize.value);
  state.page = 1;
  loadLogs();
});

refresh.addEventListener('click', loadLogs);

prev.addEventListener('click', () => {
  if (state.page <= 1) return;
  state.page -= 1;
  follow.checked = false;
  scheduleFollow();
});

next.addEventListener('click', () => {
  if (state.page >= state.totalPages) return;
  state.page += 1;
  follow.checked = false;
  scheduleFollow();
});

follow.addEventListener('change', scheduleFollow);

scheduleFollow();
