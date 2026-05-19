# SPÁguas CETESB - Áreas Contaminadas API

Projeto Node.js com área administrativa protegida por usuário e senha via `.env` para upload de shapefile compactado em `.zip`, processamento para GeoJSON e exposição dos dados por API HTTP.

## Requisitos

- Node.js 18+
- Um shapefile em `.zip` contendo pelo menos o arquivo `.shp`. Para atributos, inclua também o `.dbf`.

## Configuração

```bash
cp .env.example .env
npm install
npm start
```

Em desenvolvimento, use nodemon:

```bash
npm run dev
```

Acesse:

- [Área administrativa](http://localhost:3000/admin)
- [Interface gráfica de teste de interseção](http://localhost:3000/intersection-test.html)
- [Swagger/OpenAPI](http://localhost:3000/api-docs)
- [Swagger/OpenAPI alias](http://localhost:3000/docs)
- [OpenAPI JSON](http://localhost:3000/api/openapi.json)

As credenciais vêm de:

- `ADMIN_USER`
- `ADMIN_PASSWORD`

## Upload

Na área administrativa, envie um arquivo `.zip` contendo os arquivos do shapefile (`.shp`, `.dbf`, `.shx`, `.prj`, etc.). O sistema converte o shapefile para GeoJSON e salva o dataset em `data/datasets`.

Durante o upload é possível customizar:

- `Nome do dataset`: nome público exibido na administração e retornado pela API.
- `Nome do arquivo GeoJSON`: nome usado para salvar o arquivo em `data/datasets/<nome>.geojson`; ele também vira o `id` do dataset na API.
- `Projeção de origem`: sistema de coordenadas do shapefile enviado.
- `Projeção de saída`: manter as coordenadas originais ou converter para `EPSG:4326`.

Depois de publicado, o dataset pode ser editado ou excluído pela área administrativa. A edição permite alterar nome, nome do arquivo/id e metadados de projeção; a exclusão remove o metadado e o arquivo GeoJSON associado.

Projeções suportadas no formulário:

- Coordenadas originais
- `EPSG:4326`
- `EPSG:4674`
- `EPSG:31982`
- `EPSG:31983`
- `EPSG:3857`

## API

Os endpoints da API exigem token Bearer, exceto `GET /api/openapi.json`.

```http
Authorization: Bearer seu-token
```

Também é aceito o header `X-API-Token`.

Os tokens são cadastrados na área administrativa, com timeout/expiração em dias, limite de requests por segundo, cooldown mínimo entre chamadas, ativação/desativação e logs de uso. O token completo aparece somente no momento da criação; depois o sistema armazena apenas o hash no SQLite local (`data/app.sqlite`).

### Listar datasets

```http
GET /api/datasets
```

### Detalhar dataset

```http
GET /api/datasets/:id
```

### Detalhar dataset mais recente

```http
GET /api/datasets/latest
```

### Listar features de um dataset

```http
GET /api/datasets/:id/features?limit=100&offset=0
```

### Listar features do dataset mais recente

```http
GET /api/datasets/latest/features?limit=100&offset=0
```

### Buscar interseções por coordenada e raio

```http
GET /api/datasets/:id/intersections?lat=-23.55052&lon=-46.63331&radiusKm=0.5
```

Também é possível buscar no dataset mais recente:

```http
GET /api/datasets/latest/intersections?lat=-23.55052&lon=-46.63331&radiusKm=0.5
```

Parâmetros:

- `lat`: latitude do ponto central.
- `lon`: longitude do ponto central. `lng` também é aceito.
- `radiusKm`: distância máxima em quilômetros entre a coordenada informada e o ponto de origem da contaminação. `radius` também é aceito. Quando omitido, o padrão é `0.5` km (500m).
- `classification`: filtro opcional por classificação. Pode ser repetido para múltiplas classificações.
- `classifications`: alternativa opcional com múltiplas classificações separadas por vírgula.

Exemplo com filtro múltiplo:

```http
GET /api/datasets/:id/intersections?lat=-23.55052&lon=-46.63331&radiusKm=0.5&classification=Área%20contaminada%20sob%20investigação%20(ACI)&classification=Área%20Contaminada%20com%20Risco%20Confirmado%20(ACRi)
```

A resposta retorna `touchedContaminatedArea`, `count` e `items`. A flag `touchedContaminatedArea` fica `true` quando a coordenada informada está a menos do que o raio configurado do ponto de origem de pelo menos uma contaminação. Cada item contém `distanceKm`, `nearestPoint`, `contaminationPoint` e a `feature` GeoJSON completa localizada. O campo `distanceKm` é calculado entre a coordenada informada e `contaminationPoint`; `nearestPoint` é mantido compatível com esse mesmo ponto.

Essa busca exige dados em latitude/longitude. Ao publicar o shapefile, use saída `EPSG:4326`, ou mantenha origem `EPSG:4326`/`EPSG:4674`. Datasets antigos sem metadados de projeção são tratados como latitude/longitude para manter compatibilidade.

As respostas de features usam `FeatureCollection` GeoJSON.

## Estrutura de armazenamento

- `uploads/`: arquivos enviados temporariamente.
- `data/datasets/index.json`: metadados dos datasets processados.
- `data/datasets/<id>.geojson`: dados processados em GeoJSON.

Esses diretórios são criados automaticamente em runtime e ficam fora do versionamento.
