import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import AdmZip from 'adm-zip';
import shapefile from 'shapefile';
import slugify from 'slugify';
import { datasetExists, saveDatasetGeoJson } from './storage.js';
import {
  isSupportedOutputProjection,
  isSupportedProjection,
  transformGeometry
} from './projections.js';

function slug(value) {
  return slugify(value, {
    lower: true,
    strict: true
  });
}

function normalizeUploadOptions(file, options = {}) {
  const displayName = String(options.name || '').trim() || path.parse(file.originalname).name;
  const requestedFileName = String(options.fileName || '').trim();
  const rawFileName = requestedFileName
    ? path.parse(requestedFileName).name
    : displayName;
  const fileName = slug(rawFileName);
  const sourceProjection = String(options.sourceProjection || 'original');
  const outputProjection = String(options.outputProjection || 'original');

  if (!fileName) {
    throw new Error('Informe um nome de arquivo valido.');
  }

  if (!isSupportedProjection(sourceProjection)) {
    throw new Error('Projecao de origem nao suportada.');
  }

  if (!isSupportedOutputProjection(outputProjection)) {
    throw new Error('Projecao de saida nao suportada.');
  }

  if (sourceProjection === 'original' && outputProjection !== 'original') {
    throw new Error('Para converter a projecao, selecione a projecao de origem do shapefile.');
  }

  return {
    displayName,
    fileName,
    sourceProjection,
    outputProjection
  };
}

async function extractZip(zipPath) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'shapefile-'));
  const zip = new AdmZip(zipPath);
  zip.extractAllTo(tempDir, true);
  return tempDir;
}

async function findFirstFile(dir, extension) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const current = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = await findFirstFile(current, extension);
      if (found) return found;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(extension)) {
      return current;
    }
  }

  return null;
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findDbfForShp(shpPath) {
  const parsed = path.parse(shpPath);
  const dbfPath = path.join(parsed.dir, `${parsed.name}.dbf`);
  const upperDbfPath = path.join(parsed.dir, `${parsed.name}.DBF`);

  if (await pathExists(dbfPath)) return dbfPath;
  if (await pathExists(upperDbfPath)) return upperDbfPath;
  return null;
}

async function collectFeatures(shpPath, options) {
  const dbfPath = await findDbfForShp(shpPath);
  const source = dbfPath
    ? await shapefile.open(shpPath, dbfPath)
    : await shapefile.open(shpPath);
  const features = [];

  while (true) {
    const result = await source.read();
    if (result.done) break;
    features.push({
      ...result.value,
      geometry: transformGeometry(
        result.value.geometry,
        options.sourceProjection,
        options.outputProjection
      )
    });
  }

  return {
    type: 'FeatureCollection',
    features
  };
}

export async function processShapefileUpload(file, options = {}) {
  if (!file) {
    throw new Error('Arquivo de upload nao enviado.');
  }

  const normalized = normalizeUploadOptions(file, options);
  const id = normalized.fileName;
  let extractedDir = null;

  try {
    if (path.extname(file.originalname).toLowerCase() !== '.zip') {
      throw new Error('Envie um arquivo .zip contendo os arquivos do shapefile.');
    }

    if (await datasetExists(id)) {
      throw new Error('Ja existe um dataset salvo com esse nome de arquivo.');
    }

    extractedDir = await extractZip(file.path);
    const shpPath = await findFirstFile(extractedDir, '.shp');
    if (!shpPath) {
      throw new Error('O ZIP nao contem arquivo .shp.');
    }

    const geojson = await collectFeatures(shpPath, normalized);
    await saveDatasetGeoJson(id, geojson);

    return {
      id,
      name: normalized.displayName,
      fileName: `${normalized.fileName}.geojson`,
      originalName: file.originalname,
      uploadedAt: new Date().toISOString(),
      sourceProjection: normalized.sourceProjection,
      outputProjection: normalized.outputProjection,
      featureCount: geojson.features.length
    };
  } finally {
    if (extractedDir) {
      await fs.rm(extractedDir, { recursive: true, force: true });
    }
    await fs.rm(file.path, { force: true });
  }
}
