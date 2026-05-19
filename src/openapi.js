export const openapiSpec = {
  openapi: '3.0.3',
  info: {
    title: 'SPAguas CETESB - Areas Contaminadas API',
    version: '1.0.0',
    description: 'API para publicacao de datasets GeoJSON processados a partir de shapefiles e busca de intersecoes por raio.'
  },
  servers: [
    {
      url: '/',
      description: 'Servidor atual'
    }
  ],
  tags: [
    {
      name: 'Datasets',
      description: 'Consulta de datasets publicados'
    },
    {
      name: 'Features',
      description: 'Consulta de features GeoJSON'
    },
    {
      name: 'Intersections',
      description: 'Busca espacial por coordenada e raio'
    },
    {
      name: 'Docs',
      description: 'Documentacao OpenAPI'
    }
  ],
  security: [
    {
      bearerAuth: []
    }
  ],
  paths: {
    '/api/datasets': {
      get: {
        tags: ['Datasets'],
        summary: 'Lista datasets publicados',
        responses: {
          200: {
            description: 'Lista de datasets',
            content: {
              'application/json': {
                schema: {
                  type: 'array',
                  items: {
                    $ref: '#/components/schemas/Dataset'
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/datasets/latest': {
      get: {
        tags: ['Datasets'],
        summary: 'Detalha o dataset mais recente',
        responses: {
          200: {
            description: 'Dataset mais recente',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Dataset'
                }
              }
            }
          },
          404: {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/datasets/{id}': {
      get: {
        tags: ['Datasets'],
        summary: 'Detalha um dataset',
        parameters: [
          {
            $ref: '#/components/parameters/DatasetId'
          }
        ],
        responses: {
          200: {
            description: 'Dataset encontrado',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/Dataset'
                }
              }
            }
          },
          404: {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/datasets/latest/features': {
      get: {
        tags: ['Features'],
        summary: 'Lista features do dataset mais recente',
        parameters: [
          {
            $ref: '#/components/parameters/Limit'
          },
          {
            $ref: '#/components/parameters/Offset'
          }
        ],
        responses: {
          200: {
            description: 'FeatureCollection paginada',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/FeatureCollection'
                }
              }
            }
          },
          404: {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/datasets/{id}/features': {
      get: {
        tags: ['Features'],
        summary: 'Lista features de um dataset',
        parameters: [
          {
            $ref: '#/components/parameters/DatasetId'
          },
          {
            $ref: '#/components/parameters/Limit'
          },
          {
            $ref: '#/components/parameters/Offset'
          }
        ],
        responses: {
          200: {
            description: 'FeatureCollection paginada',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/FeatureCollection'
                }
              }
            }
          },
          404: {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/datasets/latest/intersections': {
      get: {
        tags: ['Intersections'],
        summary: 'Busca intersecoes no dataset mais recente',
        parameters: [
          {
            $ref: '#/components/parameters/Lat'
          },
          {
            $ref: '#/components/parameters/Lon'
          },
          {
            $ref: '#/components/parameters/RadiusKm'
          },
          {
            $ref: '#/components/parameters/Classification'
          }
        ],
        responses: {
          200: {
            description: 'Resultado da busca espacial',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/IntersectionResponse'
                }
              }
            }
          },
          400: {
            $ref: '#/components/responses/BadRequest'
          },
          404: {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/datasets/{id}/intersections': {
      get: {
        tags: ['Intersections'],
        summary: 'Busca intersecoes em um dataset',
        parameters: [
          {
            $ref: '#/components/parameters/DatasetId'
          },
          {
            $ref: '#/components/parameters/Lat'
          },
          {
            $ref: '#/components/parameters/Lon'
          },
          {
            $ref: '#/components/parameters/RadiusKm'
          },
          {
            $ref: '#/components/parameters/Classification'
          }
        ],
        responses: {
          200: {
            description: 'Resultado da busca espacial',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/IntersectionResponse'
                }
              }
            }
          },
          400: {
            $ref: '#/components/responses/BadRequest'
          },
          404: {
            $ref: '#/components/responses/NotFound'
          }
        }
      }
    },
    '/api/openapi.json': {
      get: {
        tags: ['Docs'],
        summary: 'Documento OpenAPI',
        security: [],
        responses: {
          200: {
            description: 'Especificacao OpenAPI da API',
            content: {
              'application/json': {
                schema: {
                  type: 'object'
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'API token'
      }
    },
    parameters: {
      DatasetId: {
        name: 'id',
        in: 'path',
        required: true,
        schema: {
          type: 'string'
        },
        example: 'areas-contaminadas-cetesb'
      },
      Limit: {
        name: 'limit',
        in: 'query',
        required: false,
        schema: {
          type: 'integer',
          minimum: 0,
          maximum: 5000,
          default: 100
        }
      },
      Offset: {
        name: 'offset',
        in: 'query',
        required: false,
        schema: {
          type: 'integer',
          minimum: 0,
          default: 0
        }
      },
      Lat: {
        name: 'lat',
        in: 'query',
        required: true,
        schema: {
          type: 'number',
          minimum: -90,
          maximum: 90
        },
        example: -23.55052
      },
      Lon: {
        name: 'lon',
        in: 'query',
        required: true,
        schema: {
          type: 'number',
          minimum: -180,
          maximum: 180
        },
        example: -46.63331
      },
      RadiusKm: {
        name: 'radiusKm',
        in: 'query',
        required: false,
        description: 'Distancia maxima em quilometros entre a coordenada informada e o ponto de origem da contaminacao. Padrao: 0.5 km (500m).',
        schema: {
          type: 'number',
          minimum: 0,
          default: 0.5
        },
        example: 0.5
      },
      Classification: {
        name: 'classification',
        in: 'query',
        required: false,
        description: 'Filtro opcional por classificacao. Pode ser informado multiplas vezes.',
        schema: {
          type: 'array',
          items: {
            type: 'string',
            enum: [
              'Área Reabilitada para o Uso Declarado (AR)',
              'Área em processo de remediação (ACRe)',
              'Área em processo de monitoramento para encerramento (AME)',
              'Área contaminada sob investigação (ACI)',
              'Área contaminada em processo de reutilização (ACRu)',
              'Área Contaminada com Risco Confirmado (ACRi)'
            ]
          }
        },
        style: 'form',
        explode: true
      }
    },
    responses: {
      BadRequest: {
        description: 'Parametro invalido',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      },
      NotFound: {
        description: 'Recurso nao encontrado',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/Error'
            }
          }
        }
      }
    },
    schemas: {
      Dataset: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          name: {
            type: 'string'
          },
          fileName: {
            type: 'string'
          },
          originalName: {
            type: 'string'
          },
          uploadedAt: {
            type: 'string',
            format: 'date-time'
          },
          sourceProjection: {
            type: 'string'
          },
          outputProjection: {
            type: 'string'
          },
          featureCount: {
            type: 'integer'
          }
        }
      },
      DatasetSummary: {
        type: 'object',
        properties: {
          id: {
            type: 'string'
          },
          name: {
            type: 'string'
          },
          fileName: {
            type: 'string'
          },
          sourceProjection: {
            type: 'string'
          },
          outputProjection: {
            type: 'string'
          }
        }
      },
      GeoJsonGeometry: {
        type: 'object',
        properties: {
          type: {
            type: 'string'
          },
          coordinates: {}
        }
      },
      GeoJsonFeature: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            example: 'Feature'
          },
          properties: {
            type: 'object',
            additionalProperties: true
          },
          geometry: {
            $ref: '#/components/schemas/GeoJsonGeometry'
          }
        }
      },
      FeatureCollection: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            example: 'FeatureCollection'
          },
          metadata: {
            type: 'object',
            properties: {
              dataset: {
                $ref: '#/components/schemas/DatasetSummary'
              },
              total: {
                type: 'integer'
              },
              limit: {
                type: 'integer'
              },
              offset: {
                type: 'integer'
              },
              returned: {
                type: 'integer'
              }
            }
          },
          features: {
            type: 'array',
            items: {
              $ref: '#/components/schemas/GeoJsonFeature'
            }
          }
        }
      },
      IntersectionResponse: {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              dataset: {
                $ref: '#/components/schemas/DatasetSummary'
              },
              center: {
                $ref: '#/components/schemas/Coordinate'
              },
              radiusKm: {
                type: 'number'
              },
              radiusOrigin: {
                type: 'string',
                example: 'contamination'
              },
              classifications: {
                type: 'array',
                items: {
                  type: 'string'
                }
              },
              touchedContaminatedArea: {
                type: 'boolean'
              },
              count: {
                type: 'integer'
              }
            }
          },
          count: {
            type: 'integer'
          },
          touchedContaminatedArea: {
            type: 'boolean'
          },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                distanceKm: {
                  type: 'number'
                },
                nearestPoint: {
                  $ref: '#/components/schemas/Coordinate'
                },
                contaminationPoint: {
                  $ref: '#/components/schemas/Coordinate'
                },
                feature: {
                  $ref: '#/components/schemas/GeoJsonFeature'
                }
              }
            }
          }
        }
      },
      Coordinate: {
        type: 'object',
        properties: {
          lat: {
            type: 'number'
          },
          lon: {
            type: 'number'
          }
        }
      },
      Error: {
        type: 'object',
        properties: {
          error: {
            type: 'string'
          }
        }
      }
    }
  }
};
