const WGS84_A = 6378137;
const WGS84_ECC_SQUARED = 0.0066943799901413165;
const UTM_K0 = 0.9996;

export const projectionOptions = [
  { code: 'original', label: 'Manter coordenadas originais' },
  { code: 'EPSG:4326', label: 'WGS 84 - latitude/longitude (EPSG:4326)' },
  { code: 'EPSG:4674', label: 'SIRGAS 2000 - latitude/longitude (EPSG:4674)' },
  { code: 'EPSG:31982', label: 'SIRGAS 2000 / UTM zona 22S (EPSG:31982)' },
  { code: 'EPSG:31983', label: 'SIRGAS 2000 / UTM zona 23S (EPSG:31983)' },
  { code: 'EPSG:3857', label: 'Web Mercator (EPSG:3857)' }
];

export const outputProjectionOptions = [
  { code: 'original', label: 'Manter coordenadas da origem' },
  { code: 'EPSG:4326', label: 'Converter para WGS 84 (EPSG:4326)' }
];

export function isSupportedProjection(code) {
  return projectionOptions.some((projection) => projection.code === code);
}

export function isSupportedOutputProjection(code) {
  return outputProjectionOptions.some((projection) => projection.code === code);
}

function utmZoneFromProjection(code) {
  if (code === 'EPSG:31982') return 22;
  if (code === 'EPSG:31983') return 23;
  return null;
}

function inverseWebMercator([x, y]) {
  const lon = (x / WGS84_A) * 180 / Math.PI;
  const lat = (2 * Math.atan(Math.exp(y / WGS84_A)) - Math.PI / 2) * 180 / Math.PI;
  return [lon, lat];
}

function inverseUtmSouth([easting, northing], zone) {
  const x = easting - 500000;
  const y = northing - 10000000;
  const eccPrimeSquared = WGS84_ECC_SQUARED / (1 - WGS84_ECC_SQUARED);
  const longOrigin = (zone - 1) * 6 - 180 + 3;
  const m = y / UTM_K0;
  const mu = m / (WGS84_A * (1 - WGS84_ECC_SQUARED / 4 - 3 * WGS84_ECC_SQUARED ** 2 / 64 - 5 * WGS84_ECC_SQUARED ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - WGS84_ECC_SQUARED)) / (1 + Math.sqrt(1 - WGS84_ECC_SQUARED));
  const j1 = 3 * e1 / 2 - 27 * e1 ** 3 / 32;
  const j2 = 21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32;
  const j3 = 151 * e1 ** 3 / 96;
  const j4 = 1097 * e1 ** 4 / 512;
  const fp = mu
    + j1 * Math.sin(2 * mu)
    + j2 * Math.sin(4 * mu)
    + j3 * Math.sin(6 * mu)
    + j4 * Math.sin(8 * mu);
  const sinFp = Math.sin(fp);
  const cosFp = Math.cos(fp);
  const tanFp = Math.tan(fp);
  const c1 = eccPrimeSquared * cosFp ** 2;
  const t1 = tanFp ** 2;
  const n1 = WGS84_A / Math.sqrt(1 - WGS84_ECC_SQUARED * sinFp ** 2);
  const r1 = WGS84_A * (1 - WGS84_ECC_SQUARED) / (1 - WGS84_ECC_SQUARED * sinFp ** 2) ** 1.5;
  const d = x / (n1 * UTM_K0);

  const lat = fp - (n1 * tanFp / r1) * (
    d ** 2 / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * eccPrimeSquared) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * eccPrimeSquared - 3 * c1 ** 2) * d ** 6 / 720
  );
  const lon = (d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * eccPrimeSquared + 24 * t1 ** 2) * d ** 5 / 120) / cosFp;

  return [
    longOrigin + lon * 180 / Math.PI,
    lat * 180 / Math.PI
  ];
}

function coordinateToWgs84(coordinate, sourceProjection) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return coordinate;

  if (sourceProjection === 'EPSG:4326' || sourceProjection === 'EPSG:4674') {
    return coordinate;
  }

  if (sourceProjection === 'EPSG:3857') {
    return [...inverseWebMercator(coordinate), ...coordinate.slice(2)];
  }

  const utmZone = utmZoneFromProjection(sourceProjection);
  if (utmZone) {
    return [...inverseUtmSouth(coordinate, utmZone), ...coordinate.slice(2)];
  }

  return coordinate;
}

function transformCoordinates(coordinates, transformCoordinate) {
  if (!Array.isArray(coordinates)) return coordinates;
  if (typeof coordinates[0] === 'number') return transformCoordinate(coordinates);
  return coordinates.map((item) => transformCoordinates(item, transformCoordinate));
}

export function transformGeometry(geometry, sourceProjection, outputProjection) {
  if (!geometry || outputProjection === 'original' || sourceProjection === outputProjection) {
    return geometry;
  }

  if (outputProjection !== 'EPSG:4326') {
    throw new Error('Projecao de saida nao suportada.');
  }

  if (geometry.type === 'GeometryCollection') {
    return {
      ...geometry,
      geometries: geometry.geometries.map((item) => transformGeometry(item, sourceProjection, outputProjection))
    };
  }

  return {
    ...geometry,
    coordinates: transformCoordinates(
      geometry.coordinates,
      (coordinate) => coordinateToWgs84(coordinate, sourceProjection)
    )
  };
}
