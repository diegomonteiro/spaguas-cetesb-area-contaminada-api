import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const rootDir = path.resolve(__dirname, '..');
export const uploadDir = path.join(rootDir, 'uploads');
export const dataDir = path.join(rootDir, 'data');
export const databasePath = path.join(dataDir, 'app.sqlite');
export const datasetDir = path.join(dataDir, 'datasets');
export const datasetIndexPath = path.join(datasetDir, 'index.json');
