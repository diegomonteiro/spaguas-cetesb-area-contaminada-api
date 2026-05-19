const EARTH_RADIUS_KM = 6371.0088;

function toRadians(value) {
  return value * Math.PI / 180;
}

function haversineDistanceKm(a, b) {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = toRadians(b.lat - a.lat);
  const deltaLon = toRadians(b.lon - a.lon);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLon = Math.sin(deltaLon / 2);
  const h = sinLat ** 2 + Math.cos(lat1) * Math.cos(lat2) * sinLon ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function coordinateToPoint(coordinate) {
  if (!Array.isArray(coordinate) || coordinate.length < 2) return null;
  return {
    lon: Number(coordinate[0]),
    lat: Number(coordinate[1])
  };
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

function featureMatchesClassifications(feature, classificationKeys) {
  if (!classificationKeys?.size) return true;
  return classificationKeys.has(classificationKey(classificationValue(feature)));
}

function pointToLocalKm(point, origin) {
  const latKm = 110.574;
  const lonKm = 111.320 * Math.cos(toRadians(origin.lat));

  return {
    x: (point.lon - origin.lon) * lonKm,
    y: (point.lat - origin.lat) * latKm
  };
}

function localKmToPoint(localPoint, origin) {
  const latKm = 110.574;
  const lonKm = 111.320 * Math.cos(toRadians(origin.lat));

  return {
    lon: origin.lon + localPoint.x / lonKm,
    lat: origin.lat + localPoint.y / latKm
  };
}

function localSegmentResult(origin, start, end) {
  const a = pointToLocalKm(start, origin);
  const b = pointToLocalKm(end, origin);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const denominator = abx ** 2 + aby ** 2;

  if (denominator === 0) {
    return {
      distanceKm: haversineDistanceKm(origin, start),
      nearestPoint: start,
      contaminationPoint: start
    };
  }

  const t = Math.max(0, Math.min(1, -((a.x * abx + a.y * aby) / denominator)));
  const closest = {
    x: a.x + t * abx,
    y: a.y + t * aby
  };

  return {
    distanceKm: Math.sqrt(closest.x ** 2 + closest.y ** 2),
    nearestPoint: localKmToPoint(closest, origin),
    contaminationPoint: localKmToPoint(closest, origin)
  };
}

function emptyDistanceResult() {
  return {
    distanceKm: Number.POSITIVE_INFINITY,
    nearestPoint: null,
    contaminationPoint: null
  };
}

function closerResult(current, candidate) {
  return candidate.distanceKm < current.distanceKm ? candidate : current;
}

function pointInRing(point, ring) {
  let inside = false;

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const current = coordinateToPoint(ring[i]);
    const previous = coordinateToPoint(ring[j]);
    if (!current || !previous) continue;

    const intersects = ((current.lat > point.lat) !== (previous.lat > point.lat))
      && (point.lon < (previous.lon - current.lon) * (point.lat - current.lat) / (previous.lat - current.lat) + current.lon);

    if (intersects) inside = !inside;
  }

  return inside;
}

function pointInPolygon(point, polygon) {
  if (!Array.isArray(polygon) || polygon.length === 0) return false;
  if (!pointInRing(point, polygon[0])) return false;

  for (const hole of polygon.slice(1)) {
    if (pointInRing(point, hole)) return false;
  }

  return true;
}

function collectGeometryPoints(coordinates, points = []) {
  if (!Array.isArray(coordinates)) return points;

  const point = coordinateToPoint(coordinates);
  if (point && Number.isFinite(point.lat) && Number.isFinite(point.lon)) {
    points.push(point);
    return points;
  }

  coordinates.forEach((item) => collectGeometryPoints(item, points));
  return points;
}

function representativePointFromCoordinates(coordinates) {
  const points = collectGeometryPoints(coordinates);
  if (points.length === 0) return null;

  const total = points.reduce((sum, point) => ({
    lat: sum.lat + point.lat,
    lon: sum.lon + point.lon
  }), { lat: 0, lon: 0 });

  return {
    lat: total.lat / points.length,
    lon: total.lon / points.length
  };
}

function lineDistanceResult(origin, coordinates) {
  let result = emptyDistanceResult();

  for (let index = 0; index < coordinates.length; index += 1) {
    const point = coordinateToPoint(coordinates[index]);
    if (!point) continue;

    result = closerResult(result, {
      distanceKm: haversineDistanceKm(origin, point),
      nearestPoint: point,
      contaminationPoint: point
    });

    if (index > 0) {
      const previous = coordinateToPoint(coordinates[index - 1]);
      if (previous) {
        result = closerResult(result, localSegmentResult(origin, previous, point));
      }
    }
  }

  return result;
}

function multiPointDistanceResult(origin, coordinates) {
  return coordinates.reduce((result, coordinate) => {
    const point = coordinateToPoint(coordinate);
    if (!point) return result;

    return closerResult(result, {
      distanceKm: haversineDistanceKm(origin, point),
      nearestPoint: point,
      contaminationPoint: point
    });
  }, emptyDistanceResult());
}

function polygonDistanceResult(origin, polygon) {
  if (pointInPolygon(origin, polygon)) {
    return {
      distanceKm: 0,
      nearestPoint: origin,
      contaminationPoint: representativePointFromCoordinates(polygon)
    };
  }

  return polygon.reduce((result, ring) => {
    if (!Array.isArray(ring)) return result;
    return closerResult(result, lineDistanceResult(origin, ring));
  }, emptyDistanceResult());
}

function geometryDistanceResult(origin, geometry) {
  if (!geometry) return emptyDistanceResult();

  switch (geometry.type) {
    case 'Point': {
      const point = coordinateToPoint(geometry.coordinates);
      return point
        ? { distanceKm: haversineDistanceKm(origin, point), nearestPoint: point, contaminationPoint: point }
        : emptyDistanceResult();
    }
    case 'MultiPoint':
      return multiPointDistanceResult(origin, geometry.coordinates);
    case 'LineString':
      return lineDistanceResult(origin, geometry.coordinates);
    case 'MultiLineString':
      return geometry.coordinates.reduce(
        (result, line) => closerResult(result, lineDistanceResult(origin, line)),
        emptyDistanceResult()
      );
    case 'Polygon':
      return polygonDistanceResult(origin, geometry.coordinates);
    case 'MultiPolygon':
      return geometry.coordinates.reduce(
        (result, polygon) => closerResult(result, polygonDistanceResult(origin, polygon)),
        emptyDistanceResult()
      );
    case 'GeometryCollection':
      return (geometry.geometries || []).reduce(
        (result, item) => closerResult(result, geometryDistanceResult(origin, item)),
        emptyDistanceResult()
      );
    default:
      return emptyDistanceResult();
  }
}

function validPoint(point) {
  return point && Number.isFinite(point.lat) && Number.isFinite(point.lon);
}

function geometryOriginCandidates(geometry) {
  if (!geometry) return [];

  switch (geometry.type) {
    case 'Point': {
      const point = coordinateToPoint(geometry.coordinates);
      return validPoint(point) ? [point] : [];
    }
    case 'MultiPoint':
      return (geometry.coordinates || [])
        .map(coordinateToPoint)
        .filter(validPoint);
    case 'LineString': {
      const point = representativePointFromCoordinates(geometry.coordinates);
      return validPoint(point) ? [point] : [];
    }
    case 'MultiLineString':
      return (geometry.coordinates || [])
        .map(representativePointFromCoordinates)
        .filter(validPoint);
    case 'Polygon': {
      const point = representativePointFromCoordinates(geometry.coordinates);
      return validPoint(point) ? [point] : [];
    }
    case 'MultiPolygon':
      return (geometry.coordinates || [])
        .map(representativePointFromCoordinates)
        .filter(validPoint);
    case 'GeometryCollection':
      return (geometry.geometries || []).flatMap(geometryOriginCandidates);
    default:
      return [];
  }
}

function contaminationOriginDistanceResult(origin, geometry) {
  return geometryOriginCandidates(geometry).reduce((result, contaminationPoint) => (
    closerResult(result, {
      distanceKm: haversineDistanceKm(origin, contaminationPoint),
      nearestPoint: contaminationPoint,
      contaminationPoint
    })
  ), emptyDistanceResult());
}

export function parseRadiusSearchQuery(query) {
  const lat = Number(query.lat);
  const lon = Number(query.lon ?? query.lng);
  const radiusKm = Number(query.radiusKm ?? query.radius ?? 0.5);
  const rawClassifications = [
    query.classification,
    query.classifications,
    query.classifica
  ]
    .flat()
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new Error('Parametro lat invalido.');
  }

  if (!Number.isFinite(lon) || lon < -180 || lon > 180) {
    throw new Error('Parametro lon invalido.');
  }

  if (!Number.isFinite(radiusKm) || radiusKm < 0) {
    throw new Error('Parametro radiusKm invalido.');
  }

  return {
    center: { lat, lon },
    radiusKm,
    classifications: rawClassifications
  };
}

export function findIntersectingFeatures(geojson, center, radiusKm, classifications = []) {
  const matches = [];
  const classificationKeys = new Set(classifications.map(classificationKey));

  for (const feature of geojson.features || []) {
    if (!featureMatchesClassifications(feature, classificationKeys)) {
      continue;
    }

    const result = contaminationOriginDistanceResult(center, feature.geometry);

    if (result.distanceKm < radiusKm) {
      matches.push({
        distanceKm: Number(result.distanceKm.toFixed(6)),
        nearestPoint: result.nearestPoint,
        contaminationPoint: result.contaminationPoint || result.nearestPoint,
        feature
      });
    }
  }

  matches.sort((a, b) => a.distanceKm - b.distanceKm);
  return matches;
}
