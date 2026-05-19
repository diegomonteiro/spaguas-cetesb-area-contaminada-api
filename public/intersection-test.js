const map = L.map('map').setView([-23.55052, -46.63331], 10);
const state = {
  datasets: [],
  marker: null,
  contaminationRadiusLayer: null,
  resultLayer: null,
  resultLayers: new Map(),
  resultDistances: new Map(),
  resultNearestPoints: new Map(),
  resultContaminationPoints: new Map(),
  resultItems: [],
  distanceLayer: null,
  activeLayer: null,
  activeResult: null,
  isSearching: false,
  pendingSearch: false
};

const classificationColors = new Map([
  ['area reabilitada para o uso declarado ar', '#7dd3fc'],
  ['area em processo de remediacao acre', '#16a34a'],
  ['area em processo de monitoramento para encerramento ame', '#86efac'],
  ['area contaminada sob investigacao aci', '#facc15'],
  ['area contaminada em processo de reutilizacao acru', '#f97316'],
  ['area contaminada com risco confirmado acri', '#dc2626']
]);

const fallbackColor = '#64748b';

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

const form = document.querySelector('#searchForm');
const datasetSelect = document.querySelector('#dataset');
const apiTokenInput = document.querySelector('#apiToken');
const latInput = document.querySelector('#lat');
const lonInput = document.querySelector('#lon');
const radiusInput = document.querySelector('#radiusKm');
const countNode = document.querySelector('#count');
const radiusLabel = document.querySelector('#radiusLabel');
const touchAlert = document.querySelector('#touchAlert');
const resultsNode = document.querySelector('#results');
const classificationInputs = [...document.querySelectorAll('input[name="classification"]')];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function featureTitle(feature, index) {
  const properties = feature.properties || {};
  return properties.Nome
    || properties.nome
    || properties.name
    || properties.Razao_Soci
    || properties.Municipio
    || `Feature ${index + 1}`;
}

function featureMeta(feature) {
  const properties = feature.properties || {};
  const values = [
    properties.Classifica,
    properties.Atividade,
    properties.Endereco,
    properties.Municipio
  ].filter(Boolean);

  return values.slice(0, 3).join(' | ');
}

function classificationValue(feature) {
  return feature.properties?.Classifica || feature.properties?.classifica || '';
}

function classificationKey(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function classificationColor(feature) {
  return classificationColors.get(classificationKey(classificationValue(feature))) || fallbackColor;
}

function strengthenColor(hexColor) {
  const normalized = hexColor.replace('#', '');
  if (normalized.length !== 6) return hexColor;

  const red = parseInt(normalized.slice(0, 2), 16);
  const green = parseInt(normalized.slice(2, 4), 16);
  const blue = parseInt(normalized.slice(4, 6), 16);
  const factor = 0.72;

  return `#${[red, green, blue].map((channel) => (
    Math.max(0, Math.round(channel * factor)).toString(16).padStart(2, '0')
  )).join('')}`;
}

function featurePointStyle(feature) {
  const color = classificationColor(feature);

  return {
    radius: 7,
    color: '#1f2937',
    fillColor: color,
    fillOpacity: 1,
    weight: 1.5
  };
}

function featureShapeStyle(feature) {
  const color = classificationColor(feature);

  return {
    color,
    fillColor: color,
    fillOpacity: 0.28,
    weight: 3
  };
}

function normalizeFieldName(key) {
  const fieldNames = {
    OBJECTID: 'ID',
    Razao_Soci: 'Razao social',
    Classifica: 'Classificacao',
    Data_Class: 'Data da classificacao',
    Grupo_Cont: 'Grupo contaminante',
    Contaminan: 'Contaminante',
    Data_Atual: 'Data de atualizacao',
    Meios_Impa: 'Meios impactados',
    Localizaca: 'Localizacao',
    Complement: 'Complemento'
  };

  return fieldNames[key] || key
    .replaceAll('_', ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function normalizeFieldValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'string' && value.trim() === '') return '-';
  return String(value);
}

function featurePopupHtml(feature, index, distanceKm) {
  const properties = feature.properties || {};
  const title = featureTitle(feature, index);
  const classification = normalizeFieldValue(classificationValue(feature));
  const color = classificationColor(feature);
  const rows = Object.entries(properties)
    .slice(0, 12)
    .map(([key, value]) => `
      <tr>
        <th>${escapeHtml(normalizeFieldName(key))}</th>
        <td>${escapeHtml(normalizeFieldValue(value))}</td>
      </tr>
    `)
    .join('');

  return `
    <section class="feature-popup">
      <header>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(formatDistanceKm(distanceKm))}</span>
        <small>
          <i style="background:${escapeHtml(color)}"></i>
          ${escapeHtml(classification)}
        </small>
      </header>
      <div class="feature-popup-body">
        <table>
          <tbody>
            ${rows || '<tr><td colspan="2">-</td></tr>'}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function resetLayerStyle(layer) {
  if (!layer) return;

  if (typeof layer.eachLayer === 'function' && typeof layer.setLatLng !== 'function') {
    layer.eachLayer((childLayer) => resetLayerStyle(childLayer));
    return;
  }

  if (layer instanceof L.CircleMarker) {
    const baseStyle = layer.options.baseStyle || featurePointStyle(layer.feature || {});
    layer.setRadius(baseStyle.radius);
    layer.setStyle(baseStyle);
    return;
  }

  if (typeof layer.setStyle === 'function') {
    layer.setStyle(layer.options.baseStyle || featureShapeStyle(layer.feature || {}));
  }
}

function applyHighlightStyle(layer) {
  if (!layer) return;

  if (typeof layer.eachLayer === 'function' && typeof layer.setLatLng !== 'function') {
    layer.eachLayer((childLayer) => applyHighlightStyle(childLayer));
    return;
  }

  if (layer instanceof L.CircleMarker) {
    const baseStyle = layer.options.baseStyle || featurePointStyle(layer.feature || {});
    const strongerColor = strengthenColor(baseStyle.fillColor || baseStyle.color || fallbackColor);
    layer.setRadius(baseStyle.radius);
    layer.setStyle({
      ...baseStyle,
      color: strengthenColor(baseStyle.color || strongerColor),
      fillColor: strongerColor,
      fillOpacity: baseStyle.fillOpacity,
      opacity: baseStyle.opacity,
      weight: Math.max((baseStyle.weight || 1.5) + 2.5, 4)
    });
  } else if (typeof layer.setStyle === 'function') {
    const baseStyle = layer.options.baseStyle || featureShapeStyle(layer.feature || {});
    const strongerColor = strengthenColor(baseStyle.color || baseStyle.fillColor || fallbackColor);
    layer.setStyle({
      ...baseStyle,
      color: strongerColor,
      fillColor: strengthenColor(baseStyle.fillColor || strongerColor),
      fillOpacity: baseStyle.fillOpacity,
      opacity: baseStyle.opacity,
      weight: Math.max((baseStyle.weight || 3) + 2, 5)
    });
  }

  if (typeof layer.bringToFront === 'function') {
    layer.bringToFront();
  }
}

function clearActiveResult() {
  resetLayerStyle(state.activeLayer);

  if (state.distanceLayer) {
    state.distanceLayer.remove();
    state.distanceLayer = null;
  }

  if (state.activeResult) {
    state.activeResult.classList.remove('active');
  }

  state.activeLayer = null;
  state.activeResult = null;
}

function getLayerBounds(layer) {
  if (!layer) return null;
  if (typeof layer.getBounds === 'function') return layer.getBounds();
  if (typeof layer.getLatLng === 'function') return L.latLngBounds([layer.getLatLng()]);
  if (typeof layer.eachLayer === 'function') {
    const bounds = L.latLngBounds([]);
    layer.eachLayer((childLayer) => {
      const childBounds = getLayerBounds(childLayer);
      if (childBounds?.isValid()) {
        bounds.extend(childBounds);
      }
    });
    return bounds;
  }
  return null;
}

function boundsFromLayers(layers) {
  const bounds = L.latLngBounds([]);

  layers.filter(Boolean).forEach((layer) => {
    const layerBounds = getLayerBounds(layer);
    if (layerBounds?.isValid()) {
      bounds.extend(layerBounds);
    }
  });

  return bounds;
}

function originLatLng() {
  if (state.marker) return state.marker.getLatLng();

  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);
  return L.latLng(lat, lon);
}

function layerCenterLatLng(layer) {
  if (!layer) return null;
  if (typeof layer.getLatLng === 'function') return layer.getLatLng();

  const bounds = getLayerBounds(layer);
  if (bounds?.isValid()) return bounds.getCenter();

  return null;
}

function formatDistanceKm(distanceKm) {
  if (!Number.isFinite(distanceKm)) return '';
  return `${distanceKm.toLocaleString('pt-BR', {
    minimumFractionDigits: distanceKm < 10 ? 3 : 2,
    maximumFractionDigits: distanceKm < 10 ? 3 : 2
  })} km`;
}

function nearestPointLatLng(point) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) {
    return null;
  }

  return L.latLng(point.lat, point.lon);
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function distanceKmBetweenLatLng(a, b) {
  const earthRadiusKm = 6371.0088;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLng = toRadians(b.lng - a.lng);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinLng ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function coordinateLatLng(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;

  const lng = Number(coordinate[0]);
  const lat = Number(coordinate[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return L.latLng(lat, lng);
}

function collectGeometryLatLngs(coordinates, points = []) {
  if (!Array.isArray(coordinates)) return points;

  const point = coordinateLatLng(coordinates);
  if (point) {
    points.push(point);
    return points;
  }

  coordinates.forEach((item) => collectGeometryLatLngs(item, points));
  return points;
}

function isPointGeometry(geometry) {
  return geometry?.type === 'Point' || geometry?.type === 'MultiPoint';
}

function approximateGeometryRadiusKm(feature, center) {
  const points = collectGeometryLatLngs(feature.geometry?.coordinates || []);
  if (!points.length || !center) return 0;

  return points.reduce((maxDistance, point) => (
    Math.max(maxDistance, distanceKmBetweenLatLng(center, point))
  ), 0);
}

function shouldDrawCalculatedBuffer(item, center, radiusKm) {
  if (isPointGeometry(item.feature?.geometry)) return true;

  const geometryRadiusKm = approximateGeometryRadiusKm(item.feature, center);
  const toleranceKm = 0.02;
  return radiusKm > geometryRadiusKm + toleranceKm;
}

function drawDistanceLine(layer, distanceKm, targetPoint) {
  const origin = originLatLng();
  const destination = nearestPointLatLng(targetPoint) || layerCenterLatLng(layer);

  if (!origin || !destination) return null;

  if (state.distanceLayer) {
    state.distanceLayer.remove();
  }

  const line = L.polyline([origin, destination], {
    color: '#15803d',
    dashArray: '8 8',
    opacity: 0.95,
    weight: 2
  });
  const label = L.marker(
    L.latLng((origin.lat + destination.lat) / 2, (origin.lng + destination.lng) / 2),
    {
      icon: L.divIcon({
        className: 'distance-label',
        html: escapeHtml(formatDistanceKm(distanceKm)),
        iconSize: null
      }),
      interactive: false
    }
  );

  state.distanceLayer = L.layerGroup([line, label]).addTo(map);
  return L.latLngBounds([origin, destination]);
}

function flyToLayerWithOrigin(layer, distanceBounds) {
  const featureBounds = getLayerBounds(layer);
  const origin = originLatLng();
  const bounds = L.latLngBounds([origin]);

  if (featureBounds?.isValid()) {
    bounds.extend(featureBounds);
  }

  if (distanceBounds?.isValid()) {
    bounds.extend(distanceBounds);
  }

  if (!bounds.isValid()) {
    return;
  }

  map.flyToBounds(bounds.pad(0.35), {
    animate: true,
    duration: 0.7,
    maxZoom: 17
  });
}

function highlightResult(index, shouldFly = true) {
  const layer = state.resultLayers.get(index);
  const result = resultsNode.querySelector(`[data-result-index="${index}"]`);

  if (!layer || !result) return;

  clearActiveResult();

  state.activeLayer = layer;
  state.activeResult = result;
  result.classList.add('active');

  applyHighlightStyle(layer);
  const distanceKm = state.resultDistances.get(index);
  const contaminationPoint = state.resultContaminationPoints.get(index);
  const distanceBounds = drawDistanceLine(layer, distanceKm, contaminationPoint);

  if (shouldFly) {
    flyToLayerWithOrigin(layer, distanceBounds);
  }

  if (typeof layer.openPopup === 'function') {
    layer.openPopup();
  }
}

function updateSearchGeometry(lat, lon) {
  const center = [lat, lon];

  if (!state.marker) {
    state.marker = L.marker(center, { draggable: true }).addTo(map);
    state.marker.on('dragend', () => {
      const position = state.marker.getLatLng();
      latInput.value = position.lat.toFixed(7);
      lonInput.value = position.lng.toFixed(7);
      updateSearchGeometry(position.lat, position.lng);
      runSearchFromCurrentInputs();
    });
  } else {
    state.marker.setLatLng(center);
  }
}

function currentSearchValues() {
  return {
    datasetId: datasetSelect.value,
    lat: Number(latInput.value),
    lon: Number(lonInput.value),
    radiusKm: Number(radiusInput.value),
    classifications: selectedClassifications()
  };
}

function selectedClassifications() {
  return classificationInputs
    .filter((input) => input.checked)
    .map((input) => input.value);
}

function canRunSearch({ datasetId, lat, lon, radiusKm }) {
  return Boolean(datasetId)
    && Number.isFinite(lat)
    && Number.isFinite(lon)
    && Number.isFinite(radiusKm)
    && radiusKm >= 0;
}

function apiHeaders() {
  const token = apiTokenInput.value.trim();

  if (token) {
    localStorage.setItem('intersectionApiToken', token);
  }

  return token ? { Authorization: `Bearer ${token}` } : {};
}

function renderResults(items) {
  resultsNode.innerHTML = items.map((item, index) => {
    const title = featureTitle(item.feature, index);
    const meta = featureMeta(item.feature);

    return `
      <li data-result-index="${index}" tabindex="0" role="button" aria-label="Localizar ${escapeHtml(title)} no mapa">
        <span class="result-title">${escapeHtml(title)}</span>
        <span class="result-meta">${item.distanceKm} km${meta ? ` | ${escapeHtml(meta)}` : ''}</span>
      </li>
    `;
  }).join('') || '<li>Nenhuma feature localizada.</li>';
}

function renderContaminationRadiusCircles(items, radiusKm) {
  if (state.contaminationRadiusLayer) {
    state.contaminationRadiusLayer.remove();
  }

  const layers = items
    .map((item) => ({
      item,
      latlng: nearestPointLatLng(item.contaminationPoint || item.nearestPoint)
    }))
    .filter(({ latlng }) => latlng)
    .flatMap(({ item, latlng }) => {
      const color = classificationColor(item.feature || {});
      const centerMarker = L.circleMarker(latlng, {
        radius: 5,
        color: strengthenColor(color),
        fillColor: color,
        fillOpacity: 1,
        interactive: false,
        opacity: 1,
        weight: 2
      });

      if (!shouldDrawCalculatedBuffer(item, latlng, radiusKm)) {
        return [centerMarker];
      }

      return [
        L.circle(latlng, {
          radius: radiusKm * 1000,
          color: '#15803d',
          fillColor: '#15803d',
          fillOpacity: 0.08,
          dashArray: '6 6',
          interactive: false,
          weight: 2
        }),
        centerMarker
      ];
    });

  state.contaminationRadiusLayer = L.featureGroup(layers).addTo(map);
}

function renderTouchAlert(touched) {
  touchAlert.classList.toggle('hit', touched);
  touchAlert.classList.toggle('clear', !touched);
  touchAlert.querySelector('strong').textContent = touched
    ? 'Sim'
    : 'Não';
}

function renderMapResults(items, radiusKm) {
  clearActiveResult();
  state.resultLayers.clear();
  state.resultDistances.clear();
  state.resultNearestPoints.clear();
  state.resultContaminationPoints.clear();
  state.resultItems = items;

  if (state.resultLayer) {
    state.resultLayer.remove();
  }

  const features = items.map((item, index) => ({
    ...item.feature,
    _resultIndex: index
  }));

  state.resultLayer = L.geoJSON(features, {
    pointToLayer: (feature, latlng) => {
      const baseStyle = featurePointStyle(feature);
      return L.circleMarker(latlng, {
        ...baseStyle,
        baseStyle
      });
    },
    style: (feature) => {
      const baseStyle = featureShapeStyle(feature);
      return {
        ...baseStyle,
        baseStyle
      };
    },
    onEachFeature: (feature, layer) => {
      const index = feature._resultIndex;
      const distanceKm = items[index].distanceKm;
      layer.options.baseStyle = layer instanceof L.CircleMarker
        ? featurePointStyle(feature)
        : featureShapeStyle(feature);
      layer.bindPopup(featurePopupHtml(feature, index, distanceKm), {
        className: 'feature-popup-shell',
        maxWidth: 360,
        minWidth: 280
      });
      state.resultLayers.set(index, layer);
      state.resultDistances.set(index, distanceKm);
      state.resultNearestPoints.set(index, items[index].nearestPoint);
      state.resultContaminationPoints.set(index, items[index].contaminationPoint || items[index].nearestPoint);
      layer.on('click', (event) => {
        L.DomEvent.stopPropagation(event);
        highlightResult(index, false);
      });
    }
  }).addTo(map);

  renderContaminationRadiusCircles(items, radiusKm);

  const bounds = boundsFromLayers([
    state.marker,
    state.contaminationRadiusLayer,
    state.resultLayer
  ]);

  if (bounds.isValid()) {
    map.fitBounds(bounds.pad(0.18));
  }
}

resultsNode.addEventListener('click', (event) => {
  const item = event.target.closest('[data-result-index]');
  if (!item) return;
  item.focus();
  highlightResult(Number(item.dataset.resultIndex));
});

resultsNode.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;

  const item = event.target.closest('[data-result-index]');
  if (!item) return;

  event.preventDefault();
  highlightResult(Number(item.dataset.resultIndex));
});

resultsNode.addEventListener('focusout', (event) => {
  if (resultsNode.contains(event.relatedTarget)) return;
  clearActiveResult();
});

async function loadDatasets() {
  const response = await fetch('/api/datasets', {
    headers: apiHeaders()
  });
  if (!response.ok) throw new Error('Nao foi possivel carregar datasets.');

  state.datasets = await response.json();
  datasetSelect.innerHTML = state.datasets.map((dataset) => {
    const name = dataset.name || dataset.originalName || dataset.id;
    return `<option value="${escapeHtml(dataset.id)}">${escapeHtml(name)}</option>`;
  }).join('');

  if (state.datasets.length === 0) {
    datasetSelect.innerHTML = '<option value="">Nenhum dataset publicado</option>';
    form.querySelector('button').disabled = true;
  }
}

async function runSearchFromCurrentInputs() {
  const values = currentSearchValues();

  if (!apiTokenInput.value.trim()) {
    resultsNode.innerHTML = '<li>Informe um token da API.</li>';
    return;
  }

  if (!values.datasetId) {
    try {
      await loadDatasets();
    } catch (error) {
      resultsNode.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
      return;
    }
    values.datasetId = datasetSelect.value;
  }

  if (!canRunSearch(values)) {
    if (!values.datasetId) {
      resultsNode.innerHTML = '<li>Nenhum dataset selecionado.</li>';
    }
    return;
  }

  if (state.isSearching) {
    state.pendingSearch = true;
    return;
  }

  const { datasetId, lat, lon, radiusKm, classifications } = values;

  updateSearchGeometry(lat, lon);
  radiusLabel.textContent = `${radiusKm} km`;
  form.querySelector('button').disabled = true;
  state.isSearching = true;

  try {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lon),
      radiusKm: String(radiusKm)
    });
    const appliedClassifications = classifications.length > 0 ? classifications : ['__none__'];
    appliedClassifications.forEach((classification) => {
      params.append('classification', classification);
    });
    const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/intersections?${params}`, {
      headers: apiHeaders()
    });
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.error || 'Erro ao executar teste.');
    }

    countNode.textContent = payload.count;
    renderTouchAlert(payload.touchedContaminatedArea);
    renderResults(payload.items);
    renderMapResults(payload.items, radiusKm);
  } catch (error) {
    countNode.textContent = '0';
    renderTouchAlert(false);
    resultsNode.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  } finally {
    state.isSearching = false;
    form.querySelector('button').disabled = false;

    if (state.pendingSearch) {
      state.pendingSearch = false;
      runSearchFromCurrentInputs();
    }
  }
}

map.on('click', (event) => {
  if (event.originalEvent?.target?.closest('.leaflet-interactive')) {
    return;
  }

  clearActiveResult();
  latInput.value = event.latlng.lat.toFixed(7);
  lonInput.value = event.latlng.lng.toFixed(7);
  updateSearchGeometry(event.latlng.lat, event.latlng.lng);
  runSearchFromCurrentInputs();
});

radiusInput.addEventListener('input', () => {
  const lat = Number(latInput.value);
  const lon = Number(lonInput.value);
  const radiusKm = Number(radiusInput.value);
  if (Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(radiusKm)) {
    renderContaminationRadiusCircles(
      state.resultItems,
      radiusKm
    );
    radiusLabel.textContent = `${radiusKm} km`;
  }
});

radiusInput.addEventListener('change', () => {
  runSearchFromCurrentInputs();
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearchFromCurrentInputs();
});

classificationInputs.forEach((input) => {
  input.addEventListener('change', () => {
    runSearchFromCurrentInputs();
  });
});

apiTokenInput.addEventListener('change', () => {
  if (!apiTokenInput.value.trim()) return;

  loadDatasets().catch((error) => {
    resultsNode.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  });
});

latInput.value = '-23.55052';
lonInput.value = '-46.63331';
apiTokenInput.value = localStorage.getItem('intersectionApiToken') || '';
updateSearchGeometry(Number(latInput.value), Number(lonInput.value));

if (apiTokenInput.value) {
  loadDatasets().catch((error) => {
    resultsNode.innerHTML = `<li>${escapeHtml(error.message)}</li>`;
  });
} else {
  resultsNode.innerHTML = '<li>Informe um token da API e execute a busca.</li>';
}
