# Plan de implementación: Smart Logistics Routing API

## Resumen

API REST en NestJS que guarda grafos dirigidos en PostgreSQL y calcula rutas óptimas de forma asíncrona con BullMQ + Redis. El cálculo usa Dijkstra dependiente del tiempo: hay restricciones por vehículo, hora pico por arista y varias paradas. Swagger se genera desde el código en `/docs`. Todo corre con Docker: en dev solo la BD y Redis; en prod también la app.

Cada tarea termina en **un commit**, para que el historial que revisarán quede limpio. El plan lleva `[ ]` que se marcan al terminar cada tarea.

## Decisiones de arquitectura

| Tema | Decisión |
|---|---|
| Framework | NestJS **11** (CommonJS) + Express (`@nestjs/platform-express`, el default). Nest 12 es solo ESM y su CLI trae Vitest; el README exige Jest. Los paquetes del ecosistema se instalan en su línea compatible con Nest 11 (`@nestjs/config@4`, `@nestjs/swagger@11`, etc.), porque sus versiones 12 son solo ESM |
| Runtime | Node 24, npm |
| BD / ORM | PostgreSQL + TypeORM. Tablas normalizadas `graphs` + `edges`, `double precision`, `graphs.nodes text[]`. Migraciones (sin `synchronize` en prod) |
| Cola | `@nestjs/bullmq` + Redis. Worker en el mismo proceso (`WorkerHost`). `jobId = job-<uuid>` |
| Estado del job | Se lee de BullMQ (sin tabla de jobs). Retención: `removeOnComplete/removeOnFail = { age: 86400, count: 1000 }` |
| Caché | Cache-aside del grafo en Redis (`@nestjs/cache-manager` + `@keyv/redis`), clave `graph:<id>`, TTL 1 h. Los grafos son inmutables, así que no hay invalidación |
| Grafo | Dirigido (`from → to`). Los nodos se deducen de las aristas |
| Defaults de arista | `maxWeight` = sin límite, `noHazardous` = false, `trafficMultiplier` = 1.0 |
| Restricciones | Pasa si `weight <= maxWeight`. Se excluye si `hazardous && noHazardous` |
| Tiempo | `cost` = minutos. El reloj arranca en `departureTime` y avanza con el costo ya multiplicado. El multiplicador depende de la **hora de entrada** a la arista. Ventanas `[inicio, fin)` configurables con `PEAK_HOURS` (default `07:00-09:00,17:00-19:00`). Hora módulo 24 h. Sin esperas. El reloj sigue corriendo entre paradas |
| Campos del request | Obligatorios: `originNodeId`, `destinationNodeId`, `departureTime`. Opcionales: `waypoints` (sin paradas) y `vehicleProfile` (sin restricciones) |
| Algoritmo | Dijkstra con binary heap propio, sin librerías. Funciones puras en `src/routing/algorithm/` |
| Errores síncronos | 400 si el body o el UUID no son válidos (`ValidationPipe` global + `ParseUUIDPipe`). 404 si el grafo o el job no existen. Formato de error por defecto de Nest |
| Errores del job | `INVALID_NODE`, `NO_ROUTE`, `ROUTE_BLOCKED_BY_CONSTRAINTS`: se devuelven como resultado y no se reintentan. Errores de sistema: 3 reintentos con espera exponencial, luego `INTERNAL_ERROR`. La API expone ambos como `FAILED` |
| Estados en la API | `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` |
| Autenticación | Ninguna (el README no la pide) |
| Origen = destino | Camino `[A]`, costo 0 |

### Contrato de la API

| Método | Ruta | OK | Errores |
|---|---|---|---|
| POST | `/network/upload` | 201 `{ id }` | 400 |
| GET | `/network/nodes/:id` | 200 `{ graphId, nodes[] }` | 400, 404 |
| POST | `/route/optimize/:id` | 202 `{ jobId }` | 400, 404, 503 (Redis caído) |
| GET | `/route/status/:jobId` | 200 `{ jobId, status, result? , error? }` | 404 |
| GET | `/docs`, `/docs-json` | Swagger UI / spec | — |

`result = { graphId, totalCost, path[], durationMs, departureTime, arrivalTime }`. `durationMs` es el tiempo de cómputo. `departureTime` y `arrivalTime` (`HH:mm`) muestran el reloj de la hora pico y siempre vienen en el resultado.

## Grafo de dependencias

```
T1 Base del proyecto
 └─ T2 Config + Docker dev + conexiones + Swagger
      ├─ T3 Heap + Dijkstra estático ─ T4 Restricciones ─ T5 Hora pico ─ T6 Multi-parada   (puro, sin BD)
      └─ T7 Upload ─ T8 GET nodes ─ T9 Caché
                                      └─ T10 Optimize ─ T11 Worker (usa T6) ─ T12 Status
                                                                                └─ T13 Docker prod
                                                                                     └─ T14 Swagger ─ T15 E2E ─ T16 README
```

El algoritmo (T3–T6) va primero porque es la parte con más riesgo y la que más se evalúa. No depende de la BD, así que se puede probar solo con Jest.

**Comandos de verificación** (se usan en todas las tareas):
- `npm run lint`
- `npm run build`
- `npm test`
- `npm run test:e2e` (a partir de T15)

---

## Fase 1: Base

### [x] T1: Base del proyecto

**Qué se construye:**
- Proyecto Nest 11 generado con `nest new` (npm) en la raíz del repo, sin perder `README.md`, `docs/` ni `.gitignore`.
- TypeScript estricto (`strict: true`).
- ESLint + Prettier.
- Jest con `reflect-metadata` en `setupFiles`.
- Se borran el controller y el service de ejemplo.
- `ConfigModule` global que valida las variables de entorno con `class-validator` al arrancar: `PORT`, `DATABASE_URL`, `REDIS_URL`. Las demás variables se agregan en la tarea que las usa.
- `.env.example`.
- `ValidationPipe` global con `whitelist`, `forbidNonWhitelisted` y `transform`.
- `docker-compose.dev.yml` con Postgres 18 y Redis 8, volúmenes y healthchecks.

**Criterios de aceptación:**
- `tsconfig.json` tiene `strict: true` y compila sin errores.
- `npm run lint`, `npm run build` y `npm test` pasan.
- `docker compose -f docker-compose.dev.yml up -d --wait` deja Postgres y Redis en estado healthy.
- La app arranca en el puerto 3000. Si falta una variable obligatoria, no arranca y el mensaje dice cuál falta.

**Pruebas:**
- `env.validation.spec.ts`:
  - Una configuración válida pasa y `PORT` vale 3000 por defecto.
  - `PORT` se convierte de string a número.
  - Si falta `DATABASE_URL`, falla.
  - Un protocolo de BD incorrecto falla.
  - Un `PORT` fuera de rango falla.

**Dependencias:** ninguna.
**Archivos:** `package.json`, `tsconfig.json`, `nest-cli.json`, `eslint.config.mjs`, `src/main.ts`, `src/app.module.ts`, `src/config/env.validation.ts`, `docker-compose.dev.yml`, `.env.example`.
**Tamaño:** M.

### [x] T2: Conexiones a Postgres y Redis, y Swagger

**Qué se construye:**
- `TypeOrmModule.forRootAsync` (`@nestjs/typeorm@11` + `typeorm@1`): `autoLoadEntities`, sin `synchronize` y con `migrationsRun: true`. Las opciones base se comparten con el CLI en `src/database/database.options.ts`.
- `BullModule.forRoot` (`@nestjs/bullmq@11` + `bullmq@6` + `ioredis`, que en BullMQ 6 es opcional) con `connection: { url: REDIS_URL }`.
- Se adelanta desde T10 el registro de la cola `route` en `RoutingModule`: sin una cola, BullMQ no abre ninguna conexión. Al arrancar se espera `queue.waitUntilReady()` con un límite de 5 s; si no responde, la app no arranca y el error es `Redis is unreachable (check REDIS_URL)`.
- Límite del body (`BODY_LIMIT`, 2 MB por defecto) en `main.ts`, con la variable validada en `env.validation.ts`.
- Swagger (`@nestjs/swagger@11`) con `SwaggerModule.setup('docs', …)` y el plugin del CLI en `nest-cli.json`.
- Script para generar y ejecutar migraciones con el CLI de TypeORM.

**Criterios de aceptación:**
- La app arranca y se conecta a Postgres y Redis. Si alguno está caído, falla con un error claro.
- `GET /docs` muestra Swagger UI y `GET /docs-json` devuelve la spec.

**Pruebas:**
- `env.validation.spec.ts`: `BODY_LIMIT` válido e inválido, y su valor por defecto.
- `routing.module.spec.ts`: Redis listo; Redis no responde en 5 s; conexión rechazada.
- Verificación manual: Postgres caído, la app reintenta unos 26 s y luego muestra `Unable to connect to the database`. Redis caído, falla en unos 5 s.

**Dependencias:** T1.
**Archivos:** `src/app.module.ts`, `src/main.ts`, `src/config/env.validation.ts`, `src/database/database.options.ts`, `src/database/data-source.ts`, `src/routing/routing.module.ts`, `nest-cli.json`, `package.json`, `.env.example`.
**Tamaño:** S.

### Checkpoint 1: Base
- [x] Lint, build y tests en verde (16/16).
- [x] La BD y Redis corren en Docker; la app se conecta y muestra `/docs`.
- [x] Revisión contigo antes de seguir (PR de la fase 1).

---

## Fase 2: Algoritmo (funciones puras)

### [x] T3: Tipos de dominio, binary heap y Dijkstra de un tramo

**Qué se construye:**
- `types.ts` con las interfaces `Node`, `Edge`, `VehicleProfile`, `RouteRequest`, `RouteResult` y `RouteError`.
- `min-heap.ts`: binary heap genérico con `push`, `pop` y `size`.
- `dijkstra.ts`: un tramo `origen → destino` sobre un grafo dirigido, con costo estático. Devuelve el camino y su costo, o "sin camino".

**Criterios de aceptación:**
- Con el grafo del README, A→E da `A→C→D→E` con costo 30.
- Respeta la dirección: si solo existe `A→B`, desde B no se llega a A.
- Origen igual a destino devuelve `[A]` con costo 0.

**Pruebas:**
- `min-heap.spec.ts`: `pop` devuelve los elementos en orden aunque se inserten desordenados o repetidos, y con el heap vacío no falla.
- `dijkstra.spec.ts`:
  - Caso 1 del README.
  - Grafo de la imagen (nodos 1–6): debe dar 1→2→4→5→6 con costo 18, como en la tabla de la imagen.
  - Nodo inalcanzable.
  - Origen igual a destino.
  - Arista en sentido contrario no se usa.

**Dependencias:** T2. Solo para tener el proyecto listo; el código no usa nada de T2.
**Archivos:** `src/routing/algorithm/types.ts`, `min-heap.ts`, `dijkstra.ts` y sus `.spec.ts`.
**Tamaño:** S.

### [x] T4: Restricciones de vehículo y códigos de error

**Qué se construye:**
- Defaults de las aristas (`maxWeight` sin límite, `noHazardous` false, `trafficMultiplier` 1.0).
- Filtro de aristas por `weight` y `hazardous`.
- Errores:
  - `INVALID_NODE` si el origen o el destino no existe.
  - `NO_ROUTE` si no hay camino.
  - `ROUTE_BLOCKED_BY_CONSTRAINTS`: si no hay camino con el filtro pero sí sin él. La segunda pasada sin filtro solo se ejecuta cuando la primera falla.

**Criterios de aceptación:**
- Los casos 2 (camión de 6000) y 3 (carga peligrosa) del README dan `A→B→D→E`.
- Si `weight == maxWeight`, la arista se puede usar.
- Cada tipo de error devuelve su código correcto.

**Pruebas:**
- Casos 2 y 3 del README.
- Peso exactamente igual al límite.
- Una arista sin campos opcionales permite cualquier vehículo.
- Sin `vehicleProfile` no se filtra nada.
- Los tres códigos de error, uno por test.

**Dependencias:** T3.
**Archivos:** `src/routing/algorithm/constraints.ts`, `find-route.ts` y sus `.spec.ts`.
**Tamaño:** S.

### [x] T5: Hora pico y peso dependiente del tiempo

**Qué se construye:**
- `peak-hours.ts`:
  - Parsea `PEAK_HOURS` a ventanas en minutos del día.
  - `isPeak(minuto)` con ventanas `[inicio, fin)` y la hora módulo 1440 (24 h).
- Dijkstra calcula el peso de cada arista según la **hora de entrada**: `cost × (isPeak(entrada) ? trafficMultiplier : 1)`. El orden del heap usa la hora de llegada.

**Criterios de aceptación:**
- Ejemplo acordado: salida 06:50 por A→C→D→E. A→C (15, fuera de pico) llega a las 07:05. C→D (5 × 1.0) llega a las 07:10. D→E (10 × 1.2 = 12) llega a las 07:22. Costo total 32.
- 09:00 exacto no es pico; 08:59 sí.
- Un viaje que pasa la medianoche sigue calculando bien la hora.

**Pruebas:**
- `peak-hours.spec.ts`:
  - Parseo válido.
  - Parseo inválido lanza error.
  - Bordes 07:00, 08:59, 09:00, 17:00 y 19:00.
  - Módulo 24 h.
- `find-route.spec.ts`:
  - Ejemplo de las 06:50.
  - Una salida en pico que cambia la ruta elegida, con un grafo armado para el test. En el grafo del README la ruta no cambia: a las 08:00, A→C→D→E cuesta 39.5 y la ruta por B cuesta 46.
  - Los casos 1–3 del README siguen pasando a las 12:00.

**Dependencias:** T4.
**Archivos:** `src/routing/algorithm/peak-hours.ts`, `dijkstra.ts`, `find-route.ts` y sus `.spec.ts`.
**Tamaño:** S.

### [x] T6: Ruta con varias paradas

**Qué se construye:**
- `findRoute` recorre los tramos `origen → parada 1 → … → destino`.
- El reloj de cada tramo empieza a la hora de llegada del anterior.
- Los caminos se unen sin repetir el nodo de conexión.
- Calcula `totalCost` y `arrivalTime`.
- Si un tramo falla, devuelve el error de ese tramo.
- Valida que todas las paradas existan (`INVALID_NODE`).

**Criterios de aceptación:**
- Con `waypoints: ["B"]` y A→E en el grafo del README, el camino es `A→B→D→E` aunque A→C→D→E sea más barato.
- El reloj se mantiene entre tramos: llegar a una parada ya en hora pico encarece el siguiente tramo.
- Una parada inexistente da `INVALID_NODE`; una parada inalcanzable da `NO_ROUTE`.

**Pruebas:**
- Paradas en el orden dado.
- Parada repetida.
- Reloj que cruza al pico entre tramos.
- Errores por tramo.
- Sin `waypoints`, igual que T5.

**Dependencias:** T5.
**Archivos:** `src/routing/algorithm/find-route.ts`, `find-route.spec.ts`.
**Tamaño:** S.

### Checkpoint 2: Algoritmo
- [x] Todos los tests del algoritmo en verde, incluidos los 3 casos del README y el grafo de la imagen (67/67 del algoritmo).
- [x] **Explicación del algoritmo**: recorrido paso a paso con el grafo del README, el heap y el reloj de la hora pico, para que lo entiendas y lo puedas defender.
- [x] Revisión contigo (PR de la fase 2).

---

## Fase 3: Redes (Postgres + caché)

### [x] T7: Entidades, migración y `POST /network/upload`

**Ajustes al implementar:**
- Las entidades se llaman `GraphEntity` y `EdgeEntity`, para no chocar con la interfaz `Edge` del algoritmo. La migración vive en `src/database/migrations/` (carpeta de T2).
- Con 10 000 aristas, un solo `save` con cascade excedía el límite de Postgres de 65 535 parámetros por consulta (`500`). Ahora se usa una transacción explícita: se guarda el grafo y las aristas se insertan en lotes de 1000. Verificado con la base real: 10 000 aristas en ~1.6 s, y un fallo en el segundo lote deshace todo.
- Un nombre de nodo con el carácter NUL (`\u0000`) daba `500`, porque Postgres lo rechaza en `text`. Ahora el DTO lo rechaza con `400` (`@NotContains`).
- `nodes` se guarda en orden de primera aparición.

**Qué se construye:**
- Entidades `Graph` y `Edge` (relación 1-N con `ON DELETE CASCADE` e índice en `graph_id`).
- Migración inicial.
- `UploadNetworkDto` / `EdgeDto` con validación anidada (`@ValidateNested` + `@Type`):
  - Entre 1 y 10 000 aristas.
  - `from` y `to` no vacíos.
  - `cost >= 0`.
  - `maxWeight > 0` y `trafficMultiplier > 0`, opcionales.
- `NetworkService.create` guarda el grafo y sus aristas en una sola transacción y calcula `nodes` sin repetidos.
- El controller responde 201 `{ id }`.

**Criterios de aceptación:**
- Subir el grafo del README responde 201 con un UUID, y las filas quedan en `graphs` y `edges`.
- Responde 400 si: hay un costo negativo, `edges` está vacío, sobra algún campo, o falta `from`.
- Si falla el insert de las aristas, no queda un grafo a medias.

**Pruebas:**
- `upload-network.dto.spec.ts`: validación con `class-validator`, un caso válido y cada caso inválido.
- `network.service.spec.ts` con el repositorio simulado (`getRepositoryToken`): los nodos salen sin repetir y en orden, y se mapean los defaults.

**Dependencias:** T2.
**Archivos:** `src/network/entities/graph.entity.ts`, `edge.entity.ts`, `src/network/dto/upload-network.dto.ts`, `network.service.ts`, `network.controller.ts`, `network.module.ts`, `src/migrations/*`.
**Tamaño:** M.

### [x] T8: `GET /network/nodes/:id`

**Ajuste al implementar:** cargar las aristas con `relations` (un JOIN) repetía el arreglo `nodes` del grafo en cada fila de arista. Con 10 000 aristas, la app se quedó sin memoria (más de 2 GB) y se cayó. `relationLoadStrategy: 'query'` no admite ordenar la relación en TypeORM 1.1 (error de SQL). `getGraph` hace ahora dos consultas simples: el grafo con `findOneBy` y sus aristas con `find` por `graph_id`, ordenadas por `id`. Verificado: 10 000 aristas en ~90 ms; `GET /network/nodes` responde en ~0.09 s.

**Qué se construye:**
- `NetworkService.getGraph(id)` carga el grafo con sus aristas.
- Endpoint con `ParseUUIDPipe`; responde 200 `{ graphId, nodes }` o 404.

**Criterios de aceptación:**
- Después de subir el grafo del README, devuelve `["A","B","C","D","E"]`.
- Un UUID que no existe da 404; un id que no es UUID da 400.

**Pruebas:**
- `network.service.spec.ts`: encontrado y no encontrado (404).

**Dependencias:** T7.
**Archivos:** `network.controller.ts`, `network.service.ts`, `dto/network-nodes.response.dto.ts`, spec.
**Tamaño:** XS.

### [x] T9: Caché del grafo en Redis

**Ajustes al implementar:**
- Versiones: `@nestjs/cache-manager@3` (última para Nest 11), `cache-manager@7`, y **`keyv@5` + `@keyv/redis@5`**. Con Keyv 6, Nest no reconoce el store (busca la propiedad `opts`, que Keyv 6 ya no tiene). Lo envolvía en un segundo Keyv sin listener de errores, y la app **se caía al apagar Redis**.
- El store vive en `src/network/graph-cache.store.ts`. Tiene un listener de `error` que solo deja una advertencia, y `disableOfflineQueue: true`, para que con Redis caído los comandos fallen de inmediato en vez de esperar la reconexión.
- Verificado con la app real: con Postgres apagado, un grafo en caché responde 200 en ~3 ms. Con Redis apagado, la API sigue respondiendo desde Postgres sin esperas y Redis se reconecta solo.

**Qué se construye:**
- `CacheModule.registerAsync` con el store `@keyv/redis`.
- `getGraph` con cache-aside: clave `graph:<id>`, TTL de 1 h (en milisegundos).

**Criterios de aceptación:**
- La segunda lectura del mismo grafo no consulta Postgres.
- Si Redis no tiene la clave, se lee de Postgres y se guarda en Redis.
- Un grafo que no existe no se guarda en la caché.

**Pruebas:**
- `network.service.spec.ts` con `CACHE_MANAGER` simulado:
  - Si está en caché, no se llama al repositorio.
  - Si no está, se llama al repositorio y luego se guarda en la caché.
  - Un 404 no se guarda.

**Dependencias:** T8.
**Archivos:** `app.module.ts` (o `network.module.ts`), `network.service.ts`, spec.
**Tamaño:** S.

### Checkpoint 3: Redes
- [x] Desde Swagger: subir el grafo del README y leer sus nodos (201 y luego 200 con `["A","B","C","D","E"]`).
- [x] Con `redis-cli KEYS graph:*` se ve la clave después de leer el grafo.
- [x] Revisión contigo (PR de la fase 3).

---

## Fase 4: Rutas asíncronas

### [x] T10: `POST /route/optimize/:id`

**Ajustes al implementar:**
- Con Redis caído responde **503** en milisegundos (patrón oficial de BullMQ: `enableOfflineQueue: false` en la conexión de la cola). Sin eso, `queue.add` se habría quedado esperando. Verificado: 503 en 7–26 ms, y 202 otra vez al volver Redis.
- `waypoints` admite como máximo 100 paradas (cada una es un Dijkstra en el worker). `JOB_RETENTION_SECONDS` (24 h por defecto) se valida al arrancar.
- `ROUTE_QUEUE` vive en `routing.constants.ts` para evitar un import circular entre el módulo y el servicio.

**Qué se construye:**
- `OptimizeRouteDto`:
  - `originNodeId` y `destinationNodeId` obligatorios.
  - `waypoints` opcional, lista de strings.
  - `vehicleProfile` opcional y anidado: `type` string, `weight >= 0`, `hazardous` booleano.
  - `departureTime` obligatorio, formato `HH:mm` entre 00:00 y 23:59.
- La cola `route` ya está registrada desde T2, en `RoutingModule`.
- El servicio comprueba que el grafo exista (404) y encola `{ graphId, request }` con:
  - `jobId: job-<uuid>`.
  - `attempts: 3` con espera exponencial.
  - `removeOnComplete` / `removeOnFail` según `JOB_RETENTION_SECONDS`.
- Responde 202 `{ jobId }`.

**Criterios de aceptación:**
- Responde 202 con un `jobId` que empieza con `job-`, y el job aparece en Redis.
- Responde 400 si `departureTime` es `"25:00"` o falta, si `weight` es negativo o si falta `originNodeId`.
- Responde 404 si el grafo no existe y, en ese caso, no se encola nada.

**Pruebas:**
- `optimize-route.dto.spec.ts`: un caso válido y cada caso inválido.
- `routing.service.spec.ts` con la cola simulada: se llama a `add` con las opciones correctas; con un 404, `add` no se llama.

**Dependencias:** T9, por `getGraph`.
**Archivos:** `src/routing/dto/optimize-route.dto.ts`, `routing.controller.ts`, `routing.service.ts`, `routing.module.ts`, spec.
**Tamaño:** M.

### [ ] T11: Worker `RouteProcessor`

**Qué se construye:**
- `@Processor('route')` que extiende `WorkerHost`, con concurrencia `WORKER_CONCURRENCY`.
- `process(job)`:
  1. `getGraph`.
  2. `findRoute` con las ventanas de `PEAK_HOURS`.
  3. Mide `durationMs`.
  4. Devuelve `{ result }` o `{ error }`.
- Los errores de negocio se **devuelven**; los errores de sistema se **lanzan** para que BullMQ los reintente.

**Criterios de aceptación:**
- Un job válido termina con `returnvalue.result` igual al del caso 1 del README.
- Un nodo que no existe termina con `returnvalue.error.code = INVALID_NODE` sin reintentos (`attemptsMade = 1`).
- Si `getGraph` lanza un error, el job se reintenta y al final queda `failed`.

**Pruebas:**
- `route.processor.spec.ts` con `NetworkService` simulado:
  - Caso exitoso.
  - Error de negocio devuelto, no lanzado.
  - Error de sistema lanzado.
  - `durationMs` es un número mayor o igual a 0.

**Dependencias:** T6, T10.
**Archivos:** `src/routing/route.processor.ts`, spec, `routing.module.ts`.
**Tamaño:** S.

### [ ] T12: `GET /route/status/:jobId`

**Qué se construye:**
- `queue.getJob(jobId)` + `job.getState()`, con este mapeo:

  | Estado en BullMQ | Estado en la API |
  |---|---|
  | `waiting`, `delayed`, `prioritized`, `waiting-children` | `PENDING` |
  | `active` | `PROCESSING` |
  | `completed` con `result` | `COMPLETED` |
  | `completed` con `error` | `FAILED` (con su código) |
  | `failed` | `FAILED` (`INTERNAL_ERROR`) |

- Responde 404 si el job no existe o ya expiró.
- Incluye el DTO de respuesta para Swagger.

**Criterios de aceptación:**
- Flujo completo con la app real: upload → optimize → consultar status hasta ver `COMPLETED` con `path` igual a `A→C→D→E`.
- Cada estado de BullMQ se traduce como dice la tabla.
- Un `jobId` desconocido da 404.

**Pruebas:**
- `job-status.mapper.spec.ts`: un caso por cada fila de la tabla.
- `routing.service.spec.ts`: el job no existe (404).

**Dependencias:** T11.
**Archivos:** `routing.controller.ts`, `routing.service.ts`, `job-status.mapper.ts`, `dto/job-status.response.dto.ts`, spec.
**Tamaño:** S.

### Checkpoint 4: Funcionalidad completa
- [ ] Desde Swagger salen los 3 casos del README de punta a punta, más un caso con error (`FAILED` con su código).
- [ ] Todos los tests unitarios en verde.
- [ ] Revisión contigo.

---

## Fase 5: Producción, documentación y entrega

### [ ] T13: Docker de producción

**Qué se construye:**
- `Dockerfile` multi-stage (`node:24-alpine`): una etapa compila, otra solo trae las dependencias de producción, y la imagen final corre con un usuario no root.
- `docker-compose.yml` con `app`, `postgres` y `redis --appendonly yes`, volúmenes, healthchecks y `depends_on` con `condition: service_healthy`.
- `.dockerignore`.

**Criterios de aceptación:**
- `docker compose up --build` levanta todo; las migraciones corren solas y `/docs` responde.
- Después de `docker compose restart`, los grafos y los jobs siguen ahí.
- La imagen no corre como root.

**Pruebas:**
- Verificación manual con el flujo completo dentro de Docker.
- `docker compose exec app whoami` no devuelve `root`.

**Dependencias:** T12.
**Archivos:** `Dockerfile`, `.dockerignore`, `docker-compose.yml`.
**Tamaño:** S.

### [ ] T14: Swagger completo

**Qué se construye:**
- `@ApiTags` y `@ApiResponse` para 201, 202, 400 y 404 en cada endpoint.
- Ejemplos en los DTOs, usando el grafo del README.
- Una descripción general con las decisiones clave: `cost` = minutos y la regla de la hora pico.

**Criterios de aceptación:**
- `/docs` muestra los 4 endpoints con sus esquemas de request y response, ejemplos y códigos de error.
- `/docs-json` es una spec OpenAPI válida.

**Pruebas:**
- Un test e2e que lee `/docs-json` y comprueba que las 4 rutas y sus esquemas están ahí. Es la "prueba" que pide el README.

**Dependencias:** T12.
**Archivos:** controllers y DTOs de ambos módulos, `main.ts`.
**Tamaño:** M.

### [ ] T15: Tests e2e

**Qué se construye:**
- `test/app.e2e-spec.ts` con supertest, contra Postgres y Redis reales del compose de dev (y una BD de test aparte).
- Una función que consulta el status repetidamente, con un tiempo límite, hasta que el job termina.

**Criterios de aceptación:**
- Los 3 casos del README dan `COMPLETED` con la ruta esperada.
- Hay casos 400 (body inválido) y 404 (grafo inexistente, job inexistente).
- Un caso `FAILED` por cada código de negocio.
- Un caso con hora pico y otro con varias paradas.

**Pruebas:**
- `npm run test:e2e` en verde.

**Dependencias:** T14.
**Archivos:** `test/app.e2e-spec.ts`, `test/jest-e2e.json`, `.env.test`.
**Tamaño:** M.

### [ ] T16: README de entrega

**Qué se construye:**
- Una sección nueva en el README (sin borrar el enunciado original) con:
  - Requisitos previos.
  - Cómo correrlo en dev y en prod.
  - Variables de entorno.
  - Cómo correr los tests.
  - Ejemplos con curl.
  - **Decisiones de diseño y supuestos**: grafo dirigido, `cost` = minutos, hora de entrada, `[inicio, fin)`, módulo 24 h, sin esperas, retención de jobs, sin autenticación.
  - Qué cambiaría si el proyecto creciera.

**Criterios de aceptación:**
- Una persona sin contexto puede clonar el repo, seguir el README y ver `/docs` funcionando.
- Cada ambigüedad que resolvimos tiene su supuesto escrito.

**Pruebas:**
- Verificación manual: seguir el README desde un clon limpio.

**Dependencias:** T15.
**Archivos:** `README.md`.
**Tamaño:** S.

### Checkpoint final: Entrega (checklist del README)
- [ ] Código completo de la API.
- [ ] Dijkstra en una capa de servicio.
- [ ] Interfaces TypeScript para `Node`, `Edge` y los DTOs.
- [ ] Tests de Jest del algoritmo.
- [ ] Swagger accesible y completo.
- [ ] Repositorio privado, revisor invitado como colaborador y aviso enviado. **Falta el correo del revisor.**

---

## Opcional (solo si sobra tiempo después del checkpoint final)

- [ ] **T17: `GET /health`** con `@nestjs/terminus`, que revise Postgres y Redis. El healthcheck de la app en Docker lo usaría.
- [ ] **T18: `PUT /network/:id` y `DELETE /network/:id`**. Al cambiar un grafo hay que borrar su clave en la caché (`graph:<id>`) y decidir qué pasa con los jobs que ya están en cola.

## Riesgos

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Al terminar la hora pico, salir más tarde puede hacerte llegar antes. Con eso, Dijkstra sin esperas puede no dar el óptimo en casos de borde | Medio | Documentarlo como limitación conocida y agregar un test que fije el comportamiento elegido |
| Instalar sin versión un paquete `@nestjs/*` trae la v12 (solo ESM) y rompe Jest en CommonJS | Alto | Instalar siempre la línea de Nest 11 (`npm view <pkg>@<major> type` debe estar vacío) |
| Los workers de BullMQ necesitan `maxRetriesPerRequest: null` en la conexión de Redis | Bajo | Verificado en la documentación de BullMQ: solo hace falta si se pasa una instancia de ioredis propia. Como pasamos opciones (`{ url }`), BullMQ lo configura solo. Confirmarlo en T11 |
| ~~Si Redis se cae en ejecución, `queue.add` puede quedarse esperando~~ | — | **Resuelto en T10:** `enableOfflineQueue: false` en la cola; responde 503 al instante |
| El repo está en una ruta de OneDrive (el usuario confirma que no sincroniza) | Bajo | Si `npm install` se vuelve lento o da errores de archivos bloqueados (`EPERM`/`EBUSY`), revisar OneDrive primero |
| Los tests e2e son inestables por el polling asíncrono | Bajo | Polling con tiempo límite y BD y cola aisladas para test |
| `nest new` en un repo que ya tiene archivos | Bajo | Generar en una carpeta temporal y mover, o usar `--skip-git` con cuidado de no sobrescribir `README.md` ni `.gitignore` |

## Preguntas abiertas

1. Correo del revisor (para la entrega).

Resueltas: `departureTime` y `arrivalTime` se incluyen en el `result`; T17 y T18 quedan como opcionales si sobra tiempo.
