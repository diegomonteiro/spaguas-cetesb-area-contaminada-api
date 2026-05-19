import fs from 'node:fs/promises';
import path from 'node:path';
import slugify from 'slugify';
import { datasetDir, datasetIndexPath, uploadDir } from './paths.js';

export async function ensureStorage() {
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(datasetDir, { recursive: true });

  try {
    await fs.access(datasetIndexPath);
  } catch {
    await fs.writeFile(datasetIndexPath, JSON.stringify([], null, 2));
  }
}

export async function readDatasetIndex() {
  await ensureStorage();
  const raw = await fs.readFile(datasetIndexPath, 'utf8');
  return JSON.parse(raw);
}

export async function writeDatasetIndex(datasets) {
  await fs.writeFile(datasetIndexPath, JSON.stringify(datasets, null, 2));
}

export function datasetFilePath(id) {
  return path.join(datasetDir, `${id}.geojson`);
}

export function normalizeDatasetId(value) {
  return slugify(path.parse(String(value || '').trim()).name, {
    lower: true,
    strict: true
  });
}

export async function datasetExists(id) {
  try {
    await fs.access(datasetFilePath(id));
    return true;
  } catch {
    return false;
  }
}

export async function readDatasetGeoJson(id) {
  const raw = await fs.readFile(datasetFilePath(id), 'utf8');
  return JSON.parse(raw);
}

export async function saveDatasetGeoJson(id, geojson) {
  await fs.writeFile(datasetFilePath(id), JSON.stringify(geojson));
}

export async function addDatasetMetadata(metadata) {
  const datasets = await readDatasetIndex();
  const next = [metadata, ...datasets];
  await writeDatasetIndex(next);
  return metadata;
}

export async function updateDatasetMetadata(id, fields) {
  const datasets = await readDatasetIndex();
  const index = datasets.findIndex((dataset) => dataset.id === id);

  if (index === -1) {
    throw new Error('Dataset nao encontrado.');
  }

  const current = datasets[index];
  const nextId = normalizeDatasetId(fields.fileName || current.fileName || current.id);

  if (!nextId) {
    throw new Error('Informe um nome de arquivo valido.');
  }

  if (nextId !== id && await datasetExists(nextId)) {
    throw new Error('Ja existe um dataset salvo com esse nome de arquivo.');
  }

  if (nextId !== id) {
    await fs.rename(datasetFilePath(id), datasetFilePath(nextId));
  }

  datasets[index] = {
    ...current,
    id: nextId,
    name: String(fields.name || current.name || current.originalName || '').trim(),
    fileName: `${nextId}.geojson`,
    sourceProjection: String(fields.sourceProjection || current.sourceProjection || 'original'),
    outputProjection: String(fields.outputProjection || current.outputProjection || 'original')
  };

  await writeDatasetIndex(datasets);
  return datasets[index];
}

export async function deleteDataset(id) {
  const datasets = await readDatasetIndex();
  const next = datasets.filter((dataset) => dataset.id !== id);

  if (next.length === datasets.length) {
    throw new Error('Dataset nao encontrado.');
  }

  await fs.rm(datasetFilePath(id), { force: true });
  await writeDatasetIndex(next);
}

export async function findDataset(id) {
  const datasets = await readDatasetIndex();
  return datasets.find((dataset) => dataset.id === id);
}

export async function latestDataset() {
  const datasets = await readDatasetIndex();
  return datasets[0] || null;
}
