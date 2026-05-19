import express from 'express';
import {
  findDataset,
  latestDataset,
  readDatasetGeoJson,
  readDatasetIndex
} from '../storage.js';
import {
  findIntersectingFeatures,
  parseRadiusSearchQuery
} from '../geoSearch.js';
import { openapiSpec } from '../openapi.js';
import { requestLogger, requireApiToken } from '../middleware/apiSecurity.js';

export const apiRouter = express.Router();

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function datasetApiMetadata(dataset) {
  return {
    id: dataset.id,
    name: dataset.name || dataset.originalName,
    fileName: dataset.fileName || `${dataset.id}.geojson`,
    sourceProjection: dataset.sourceProjection || 'original',
    outputProjection: dataset.outputProjection || 'original'
  };
}

function paginateFeatures(dataset, geojson, query) {
  const offset = toNumber(query.offset, 0);
  const limit = Math.min(toNumber(query.limit, 100), 5000);
  const total = geojson.features.length;
  const features = geojson.features.slice(offset, offset + limit);

  return {
    type: 'FeatureCollection',
    metadata: {
      dataset: datasetApiMetadata(dataset),
      total,
      limit,
      offset,
      returned: features.length
    },
    features
  };
}

function datasetUsesLatitudeLongitude(dataset) {
  if (!dataset.sourceProjection && !dataset.outputProjection) {
    return true;
  }

  const projection = dataset.outputProjection || dataset.sourceProjection || 'original';
  return projection === 'EPSG:4326' || projection === 'EPSG:4674';
}

function intersectionResponse(dataset, geojson, query) {
  if (!datasetUsesLatitudeLongitude(dataset)) {
    return {
      status: 400,
      body: {
        error: 'Busca por raio exige dataset em latitude/longitude. Publique o shapefile convertido para EPSG:4326 ou com origem EPSG:4326/EPSG:4674.'
      }
    };
  }

  const { center, radiusKm, classifications } = parseRadiusSearchQuery(query);
  const matches = findIntersectingFeatures(geojson, center, radiusKm, classifications);

  return {
    status: 200,
    body: {
      metadata: {
        dataset: datasetApiMetadata(dataset),
        center,
        radiusKm,
        radiusOrigin: 'contamination',
        classifications,
        touchedContaminatedArea: matches.length > 0,
        count: matches.length
      },
      touchedContaminatedArea: matches.length > 0,
      count: matches.length,
      items: matches
    }
  };
}

apiRouter.get('/openapi.json', (req, res) => {
  res.json(openapiSpec);
});

apiRouter.use(requestLogger);
apiRouter.use(requireApiToken);

apiRouter.get('/datasets', async (req, res, next) => {
  try {
    res.json(await readDatasetIndex());
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/datasets/latest', async (req, res, next) => {
  try {
    const dataset = await latestDataset();

    if (!dataset) {
      return res.status(404).json({ error: 'Nenhum dataset publicado.' });
    }

    res.json(dataset);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/datasets/latest/features', async (req, res, next) => {
  try {
    const dataset = await latestDataset();

    if (!dataset) {
      return res.status(404).json({ error: 'Nenhum dataset publicado.' });
    }

    const geojson = await readDatasetGeoJson(dataset.id);
    res.json(paginateFeatures(dataset, geojson, req.query));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/datasets/latest/intersections', async (req, res, next) => {
  try {
    const dataset = await latestDataset();

    if (!dataset) {
      return res.status(404).json({ error: 'Nenhum dataset publicado.' });
    }

    const geojson = await readDatasetGeoJson(dataset.id);
    const result = intersectionResponse(dataset, geojson, req.query);
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error.message?.startsWith('Parametro ')) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});

apiRouter.get('/datasets/:id', async (req, res, next) => {
  try {
    const dataset = await findDataset(req.params.id);

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset nao encontrado.' });
    }

    res.json(dataset);
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/datasets/:id/features', async (req, res, next) => {
  try {
    const dataset = await findDataset(req.params.id);

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset nao encontrado.' });
    }

    const geojson = await readDatasetGeoJson(dataset.id);
    res.json(paginateFeatures(dataset, geojson, req.query));
  } catch (error) {
    next(error);
  }
});

apiRouter.get('/datasets/:id/intersections', async (req, res, next) => {
  try {
    const dataset = await findDataset(req.params.id);

    if (!dataset) {
      return res.status(404).json({ error: 'Dataset nao encontrado.' });
    }

    const geojson = await readDatasetGeoJson(dataset.id);
    const result = intersectionResponse(dataset, geojson, req.query);
    return res.status(result.status).json(result.body);
  } catch (error) {
    if (error.message?.startsWith('Parametro ')) {
      return res.status(400).json({ error: error.message });
    }

    return next(error);
  }
});
