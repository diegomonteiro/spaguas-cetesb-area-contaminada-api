# SPÁguas CETESB - Áreas Contaminadas API

API Node.js para publicar datasets GeoJSON gerados a partir de shapefiles da CETESB, consultar features e executar busca espacial por coordenada e raio. O projeto também inclui uma área administrativa protegida por login para upload de shapefiles, gestão de datasets, emissão de tokens de API e acompanhamento de logs.

## Requisitos

- Node.js 18+
- npm
- Shapefile compactado em `.zip` contendo pelo menos o arquivo `.shp`
- Para importar atributos, inclua também o `.dbf` correspondente ao `.shp`

## Instalação e execução

```bash
cp .env.example .env
npm install
npm start
```

Em desenvolvimento, use:

```bash
npm run dev
```

O `nodemon` observa `src` e `public`, com extensões `js`, `json`, `css` e `html`, ignorando `data`, `uploads` e `node_modules`.

## Configuração

As variáveis de ambiente ficam em `.env`:

```env
PORT=3000
APP_PORT=3000
SESSION_SECRET=troque-este-segredo
ADMIN_USER=admin
ADMIN_PASSWORD=admin123
MAX_UPLOAD_MB=100
```

Variáveis obrigatórias:

- `SESSION_SECRET`: segredo usado pela sessão administrativa.
- `ADMIN_USER`: usuário da área administrativa.
- `ADMIN_PASSWORD`: senha da área administrativa.

Variáveis opcionais:

- `PORT`: porta HTTP usada pela aplicação fora do Docker. Padrão: `3000`.
- `APP_PORT`: porta exposta no host pelo Docker Compose. Padrão: `3000`.
- `MAX_UPLOAD_MB`: tamanho máximo do ZIP enviado. Padrão: `100`.

## Docker

O projeto inclui `Dockerfile`, `.dockerignore` e `docker-compose.yml`.

Para subir a aplicação com Docker Compose:

```bash
cp .env.example .env
docker compose up -d --build
```

Por padrão, a aplicação fica disponível em:

- <http://localhost:3000/admin>
- <http://localhost:3000/intersection-test.html>
- <http://localhost:3000/api-docs>

Para usar outra porta no host, ajuste `APP_PORT` no `.env`:

```env
APP_PORT=8080
```

O container sempre executa a aplicação internamente na porta `3000`; o Compose faz o mapeamento `${APP_PORT:-3000}:3000`.

Comandos úteis:

```bash
docker compose logs -f api
docker compose restart api
docker compose down
```

Os dados persistem em volumes nomeados:

- `app_data`: SQLite, índice de datasets e GeoJSON processados.
- `app_uploads`: arquivos temporários de upload.

Para remover também os volumes de dados:

```bash
docker compose down -v
```

## Acessos

Com o servidor iniciado:

- Área administrativa: <http://localhost:3000/admin>
- Teste visual de interseção: <http://localhost:3000/intersection-test.html>
- Swagger/OpenAPI: <http://localhost:3000/api-docs>
- Alias da documentação: <http://localhost:3000/docs>
- OpenAPI JSON: <http://localhost:3000/api/openapi.json>

`/` redireciona para `/admin`. `/api-docs` e `/docs` redirecionam para `/swagger.html`.

## Área administrativa

A área administrativa permite:

- Enviar shapefile compactado em `.zip`.
- Definir nome público do dataset.
- Definir nome do arquivo GeoJSON, usado também como `id` do dataset na API.
- Informar projeção de origem do shapefile.
- Manter coordenadas originais ou converter a saída para `EPSG:4326`.
- Editar nome, arquivo/id e metadados de projeção de datasets publicados.
- Excluir datasets e seus arquivos GeoJSON.
- Criar, ativar/desativar e remover tokens de API.
- Configurar expiração em dias, limite de requests por segundo e cooldown mínimo por token.
- Visualizar logs de chamadas da API com paginação, ordenação e atualização automática.

O token completo aparece somente no momento da criação. Depois disso, apenas o hash SHA-256 e uma prévia do token ficam armazenados no SQLite local.

## Upload e projeções

Envie um `.zip` com os arquivos do shapefile (`.shp`, `.dbf`, `.shx`, `.prj`, etc.). O sistema extrai o ZIP, localiza o primeiro `.shp`, lê o `.dbf` de mesmo nome quando existir, converte para GeoJSON e salva em `data/datasets/<id>.geojson`.

Projeções aceitas como origem:

- Coordenadas originais
- `EPSG:4326` - WGS 84 latitude/longitude
- `EPSG:4674` - SIRGAS 2000 latitude/longitude
- `EPSG:31982` - SIRGAS 2000 / UTM zona 22S
- `EPSG:31983` - SIRGAS 2000 / UTM zona 23S
- `EPSG:3857` - Web Mercator

Projeções aceitas como saída:

- Coordenadas da origem
- `EPSG:4326`

Para converter a saída para `EPSG:4326`, a projeção de origem precisa ser selecionada explicitamente. A busca por interseção exige dataset em latitude/longitude, ou seja, saída `EPSG:4326` ou origem `EPSG:4326`/`EPSG:4674`. Datasets antigos sem metadados de projeção são tratados como latitude/longitude por compatibilidade.

## Autenticação da API

Todos os endpoints em `/api`, exceto `GET /api/openapi.json`, exigem token de API.

Formatos aceitos:

```http
Authorization: Bearer seu-token
```

```http
X-API-Token: seu-token
```

Também é aceito `?token=seu-token` na query string. Esse parâmetro é removido dos caminhos gravados nos logs.

Possíveis respostas de segurança:

- `401`: token ausente, inválido ou expirado.
- `403`: token inativo.
- `429`: limite por segundo ou cooldown excedido. A resposta inclui `Retry-After`.

## Endpoints

### Documentação OpenAPI

```http
GET /api/openapi.json
```

Este endpoint é público.

### Listar datasets

```http
GET /api/datasets
```

Retorna a lista de datasets publicados. O dataset mais recente fica no início da lista.

### Detalhar dataset

```http
GET /api/datasets/:id
GET /api/datasets/latest
```

Retorna os metadados do dataset:

- `id`
- `name`
- `fileName`
- `originalName`
- `uploadedAt`
- `sourceProjection`
- `outputProjection`
- `featureCount`

### Listar features

```http
GET /api/datasets/:id/features?limit=100&offset=0
GET /api/datasets/latest/features?limit=100&offset=0
```

Parâmetros:

- `limit`: quantidade de features retornadas. Padrão: `100`; máximo: `5000`.
- `offset`: deslocamento inicial. Padrão: `0`.

A resposta é uma `FeatureCollection` GeoJSON com `metadata` contendo dataset, total, limite, offset e quantidade retornada.

### Buscar interseções por coordenada e raio

```http
GET /api/datasets/:id/intersections?lat=-23.55052&lon=-46.63331&radiusKm=0.5
GET /api/datasets/latest/intersections?lat=-23.55052&lon=-46.63331&radiusKm=0.5
```

Parâmetros:

- `lat`: latitude do ponto central, entre `-90` e `90`.
- `lon`: longitude do ponto central, entre `-180` e `180`. O alias `lng` também é aceito.
- `radiusKm`: raio em quilômetros. Padrão: `0.5`. O alias `radius` também é aceito.
- `classification`: filtro opcional por classificação. Pode ser repetido.
- `classifications`: alternativa com múltiplas classificações separadas por vírgula.
- `classifica`: alias aceito para filtros de classificação.

Exemplo com múltiplas classificações:

```http
GET /api/datasets/latest/intersections?lat=-23.55052&lon=-46.63331&radiusKm=0.5&classification=Área%20contaminada%20sob%20investigação%20(ACI)&classification=Área%20Contaminada%20com%20Risco%20Confirmado%20(ACRi)
```

A resposta inclui:

- `metadata.dataset`: resumo do dataset pesquisado.
- `metadata.center`: coordenada pesquisada.
- `metadata.radiusKm`: raio aplicado.
- `metadata.radiusOrigin`: atualmente `contamination`.
- `metadata.classifications`: filtros aplicados.
- `touchedContaminatedArea`: `true` quando há pelo menos uma contaminação dentro do raio.
- `count`: quantidade de itens encontrados.
- `items`: lista ordenada por distância.

Cada item contém:

- `distanceKm`: distância em quilômetros.
- `nearestPoint`: ponto usado para compatibilidade com respostas anteriores.
- `contaminationPoint`: ponto de origem/representativo da contaminação.
- `feature`: feature GeoJSON completa.

A busca calcula a distância até o ponto de origem/representativo da geometria. Para pontos e multipontos, usa as coordenadas da própria geometria. Para linhas e polígonos, usa um ponto representativo derivado das coordenadas.

## Interface de teste de interseção

A página `/intersection-test.html` oferece um mapa com Leaflet/OpenStreetMap para testar a busca por raio. Informe um token de API, escolha o dataset, latitude, longitude, raio e filtros de classificação. O resultado destaca as features encontradas no mapa e lista os detalhes principais.

## Armazenamento

Diretórios e arquivos criados em runtime:

- `uploads/`: arquivos enviados temporariamente pelo `multer`.
- `data/app.sqlite`: banco SQLite com tokens e logs da API.
- `data/app.sqlite-wal` e `data/app.sqlite-shm`: arquivos auxiliares do SQLite em modo WAL.
- `data/datasets/index.json`: metadados dos datasets publicados.
- `data/datasets/<id>.geojson`: datasets processados em GeoJSON.

Esses diretórios ficam fora do versionamento e são criados automaticamente quando a aplicação inicia.

## Scripts

- `npm start`: inicia `node src/server.js`.
- `npm run dev`: inicia o servidor com `nodemon`.

## Observações operacionais

- O nome do arquivo informado no upload é normalizado com `slugify` e vira o `id` do dataset.
- Não é permitido publicar dois datasets com o mesmo `id`.
- Ao editar o nome do arquivo/id, o arquivo GeoJSON correspondente é renomeado.
- Ao excluir um dataset, o metadado e o arquivo GeoJSON associado são removidos.
- Os logs registram método, rota, status, duração, IP, user agent, cliente/token quando identificado e mensagem de erro operacional quando aplicável.
