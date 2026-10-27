# SPEC 01 — Los cuatro fantasmas con personalidad propia

> **Estado:** Implementado
> **Depende de:** Ninguna
> **Fecha:** 2026-10-27
> **Objetivo:** Añadir los cuatro fantasmas clásicos del arcade, cada uno con su
> personalidad de caza propia, junto con energizantes que los vuelven asustadizos
> y comestibles.

## Por qué existe este spec

Hoy hay solo 2 fantasmas con IA trivial (`hunter` persigue directo, `random` va
al azar). La gracia del Pac-Man original está en que los cuatro fantasmas cazan
de forma distinta y coordinada: eso obliga al jugador a trazar rutas en lugar de
huir en línea recta.

## Scope

**In:**

- Cuatro fantasmas con kinds propios en `GHOST_STARTS` (`src/js/maze.js`):
  `blinky`, `pinky`, `inky`, `clyde`. Reemplazan a `hunter` y `random`.
- Personalidades clásicas de caza (ver modelo de datos).
- Ciclo global dispersión/caza con tiempos fijos e inversión de dirección al
  cambiar de fase.
- Salida escalonada de la casa por tiempo, con Blinky ya fuera desde el inicio.
- 4 energizantes en el laberinto (nuevo tile 4) que activan el modo asustado.
- Modo asustado: 6 s, parpadeo final, movimiento al azar y velocidad reducida.
- Comer fantasmas asustados: cadena 200/400/800/1600 y ojos que regresan a la
  casa, reviven y vuelven a salir.
- Colores por fantasma y dibujos de fantasma asustado y de ojos en
  `src/js/render.js`.

**Out of scope (para futuros specs):**

- Fruta/bonus y niveles múltiples.
- Vidas extra por puntaje.
- Aceleración de Blinky al final del nivel (Cruise Elroy).
- Sonido.
- Delta-time para pantallas de alta frecuencia (el juego ya es frame-based hoy).

## Modelo de datos

Archivos que cambian: `src/js/maze.js`, `src/js/game.js`, `src/js/render.js`.
`main.js` y `css/style.css` no cambian.

`src/js/maze.js`:

```js
// Tile nuevo: 'o' = energizante (valor 4), transitable (no es muro).
// Posiciones: (1,3), (26,3), (1,23), (26,23) — esquinas de filas 3 y 23.

const GHOST_STARTS = [
  { x: 13, y: 11, kind: 'blinky', dir: 'left' }, // fuera de la casa
  { x: 13, y: 14, kind: 'pinky',  dir: 'up'   }, // centro de la casa
  { x: 11, y: 14, kind: 'inky',   dir: 'up'   },
  { x: 16, y: 14, kind: 'clyde',  dir: 'up'   },
];
```

`src/js/game.js`:

```js
const GHOST_DEFS = {
  blinky: { scatter: { x: 26, y: 1  }, releaseFrames: 0   },
  pinky:  { scatter: { x: 1,  y: 1  }, releaseFrames: 180 },
  inky:   { scatter: { x: 26, y: 29 }, releaseFrames: 360 },
  clyde:  { scatter: { x: 1,  y: 29 }, releaseFrames: 540 },
};
const SCATTER_FRAMES    = 420;  // 7 s
const CHASE_FRAMES      = 1200; // 20 s
const FRIGHTENED_FRAMES = 360;  // 6 s
const BLINK_FRAMES      = 120;  // últimos 2 s
const FRIGHTENED_SPEED  = 0.06; // 0.6 × GHOST_SPEED
const EYES_SPEED        = 0.15; // 1.5 × GHOST_SPEED
```

Fantasma (`game.ghosts[i]`):

```js
{
  x, y, dir, kind, speed,
  mode: 'house' | 'leaving' | 'normal' | 'eyes',
  frightened: false, // aplica en house/leaving/normal; nunca en eyes
  releaseAt: 0,      // frame del juego en que sale de la casa
}
```

Estado global añadido en `createGame()`:

```js
{
  frame: 0,                   // avanza 1 por update()
  ghostMode: 'scatter',       // 'scatter' | 'chase'
  modeTimer: SCATTER_FRAMES,  // frames restantes de la fase
  frightTimer: 0,             // 0 = sin efecto activo
  ghostsEaten: 0,             // cadena 200/400/800/1600
}
```

Objetivos por fantasma (solo se usan para comparar distancias, nunca se
validan como celda):

| Fantasma | Fase caza | Fase dispersión |
| -------- | --------- | --------------- |
| blinky   | celda actual de Pacman | (26,1) |
| pinky    | 4 celdas delante de Pacman según su `dir` | (1,1) |
| inky     | punto 2 celdas delante de Pacman; vector desde Blinky hasta ese punto, extendido al doble: `2·punto − Blinky` (Blinky es `game.ghosts[0]`) | (26,29) |
| clyde    | celda de Pacman si su distancia Manhattan a Pacman es > 8; si ≤ 8, su esquina | (1,29) |

Reglas de decisión en cruces (`decideGhost`):

- Entre las direcciones válidas sin retroceder, la que minimiza la distancia
  euclidiana al objetivo. Desempate en orden: up, left, down, right.
- Callejón sin salida: giro de 180 (ya existente).
- En modo asustado: elección al azar entre las direcciones válidas sin
  retroceder.

Casa y salidas:

- En `house` el fantasma sube y baja en su columna entre y=13 e y=15,
  invirtiendo `dir` al topear. No usa `decideGhost`.
- Cuando `game.frame >= releaseAt` pasa a `leaving`: primero se alinea en
  horizontal a x=13 por la fila 14, luego sube por la puerta (13,12) hasta la
  fila 11 y pasa a `normal` con `dir = 'left'`.
- Tras revivir, un fantasma vuelve a `house` en (13,14) y sale 2 s después
  (120 frames), siempre en modo normal.

Energizante (tile 4, al comerlo):

- +50 puntos y `dotsRemaining--` (los energizantes también cuentan para ganar).
- `frightTimer = FRIGHTENED_FRAMES`, `ghostsEaten = 0`.
- Quedan `frightened` todos los fantasmas que no sean ojos, incluidos los de la
  casa. Solo los de modo `normal` invierten dirección al instante.
- El temporizador dispersión/caza se pausa mientras `frightTimer > 0`.
- Un energizante nuevo durante un miedo activo reinicia el contador y la cadena.

Colisiones en `update()`:

- `normal` sin miedo toca a Pacman: se pierde una vida (flujo actual).
- `frightened` toca a Pacman: `score += 200 * 2^ghostsEaten`, `ghostsEaten++`,
  el fantasma pasa a `eyes` con `EYES_SPEED`.
- `eyes` atraviesa a Pacman sin efecto. `house`/`leaving` no pueden tocar a
  Pacman (la puerta le bloquea el paso).

`src/js/render.js`:

- Color por kind (mapa propio en render.js) en vez de `GHOST_COLORS` por índice.
- Fantasma asustado: cuerpo azul `#2121de`; durante `BLINK_FRAMES` alterna
  azul/blanco cada ~16 frames.
- `eyes`: solo los dos ojos, sin cuerpo.
- Tile 4: dot de radio 6 parpadeante (visible/oculto cada ~15 frames).

## Plan de implementación

1. **Energizantes en el laberinto.** En `maze.js`: 'o' en `MAZE_STR` (filas 3 y
   23, cols 1 y 26) y `parseTile('o') === 4`. En `game.js`: `createGame` cuenta
   2 y 4 en `dotsRemaining`; `movePacman` come el 4 y suma 50. En `render.js`:
   `drawDots` dibuja el tile 4 como dot grande parpadeante. Prueba manual: comer
   un energizante suma 50 y lo hace desaparecer.
2. **Cuatro fantasmas en el tablero.** `GHOST_STARTS` con los 4 kinds y dirs. En
   `render.js`: color por kind. Los kinds aún sin IA propia caen en la rama
   aleatoria existente. Prueba: 4 fantasmas en rojo/rosa/cian/naranja, juego
   jugable.
3. **Ciclo dispersión/caza.** Estado global (`frame`, `ghostMode`, `modeTimer`)
   avanzando en `update()`; al agotarse la fase se alterna y los fantasmas
   `normal` invierten dir. En `decideGhost`, objetivo = esquina de dispersión o
   celda de Pacman según la fase. Prueba: los fantasmas se retiran a las
   esquinas unos segundos y vuelven a la caza.
4. **Personalidades.** Objetivo por kind según la tabla del modelo de datos,
   con distancia euclidiana y desempate up/left/down/right. Prueba: Pinky corta
   el paso por delante de Pacman; Clyde se retira al acercarse.
5. **Salida escalonada de la casa.** Modos `house`/`leaving`/`normal` con el
   vaivén y la ruta de salida descritos. `resetPositions` restaura la escalera
   de salidas. Prueba: tras iniciar o perder una vida, salen uno cada ~3 s y
   Blinky ya está fuera.
6. **Modo asustado.** `frightTimer`, marca `frightened`, reversión única al
   activarse, decisión al azar y `FRIGHTENED_SPEED`. Pausa del ciclo. Prueba:
   energizante → azules, lentos y erráticos; a los ~4 s parpadean y a los ~6 s
   vuelven a la normalidad.
7. **Comer fantasmas y ojos.** Cadena 200/400/800/1600; modo `eyes` con objetivo
   la puerta (13,12); al llegar a (13,14) revivir según lo descrito. Prueba:
   comer dos fantasmas en el mismo energizante suma 200+400 y ambos regresan a
   la casa y vuelven a salir.

## Criterios de aceptación

- [x] El juego carga sin errores de consola.
- [x] Se ven 4 fantasmas con colores distintos: rojo, rosa, cian y naranja.
- [x] Blinky traza directo hacia Pacman durante la caza (el agresivo).
- [x] Pinky apunta 4 celdas por delante de la dirección de Pacman.
- [x] El rumbo de Inky depende de la posición de Blinky.
- [x] Clyde persigue a distancia y se retira a su esquina al acercarse.
- [x] Los fantasmas alternan ~7 s de dispersión y ~20 s de caza, e invierten
      dirección al cambiar de fase.
- [x] Blinky empieza fuera; Pinky, Inky y Clyde salen escalonados cada ~3 s.
- [x] Los 4 energizantes se dibujan como dots grandes parpadeantes.
- [x] Comer un energizante suma 50 y los fantasmas se vuelven azules, lentos y
      erráticos.
- [x] El efecto dura ~6 s y los últimos ~2 s parpadean azul/blanco.
- [x] Comer fantasmas asustados suma 200/400/800/1600 en cadena.
- [x] El fantasma comido se dibuja como ojos, regresa a la casa, revive y vuelve
      a salir.
- [x] Un fantasma en modo ojos atraviesa a Pacman sin efecto.
- [x] Perder una vida resetea los 4 fantasmas, el goteo de salidas y el ciclo
      dispersión/caza.
- [x] Comer todos los dots y energizantes gana la partida.

## Decisiones

- **Sí:** personalidades clásicas del arcade. Probadas durante décadas y bien
  documentadas.
- **No:** comportamientos inventados. Nadie ha balanceado esa alternativa.
- **Sí:** ciclo fijo repetido de 7 s/20 s. Predecible y verificable a simple
  vista.
- **No:** la tabla auténtica de 8 fases del nivel 1 (7-20-7-20-5-20-5-∞).
  Complejidad extra sin diferencia perceptible en un juego de un solo nivel.
- **Sí:** salidas escalonadas por tiempo (0/3/6/9 s).
- **No:** goteo por dots comidos (0/5/30/60). Difícil de calibrar y verificar.
- **Sí:** en la salida de la casa, la pata horizontal hacia x=13 ocurre a la
  altura en que el vaivén dejó al fantasma (banda y 13–15) y luego sube
  directo por la puerta; no se fuerza el paso por la fila 14 exacta.
  Decisión de implementación del paso 5: el vaivén libera a cada fantasma a
  una `y` arbitraria y el spec no definía cómo llegar a la fila 14.
- **Sí:** puerta de un solo sentido: la casa (tile 3) es muro para Pacman y
  para los fantasmas normales y asustados; solo los ojos la cruzan al volver.
  Decisión de implementación del paso 5: con la puerta abierta, un fantasma
  cuyo objetivo quedara debajo de la casa re-entraba y quedaba atrapado
  dentro (590/600 frames en la simulación).
- **Sí:** aterrizar en el centro de la celda cruzada cuando la velocidad no
  es 1/n (0.06 y 0.15). Con las constantes exactas del spec el actor cruza
  los centros entre frames y nunca se alinea para decidir; con el
  aterrizaje, el motor de decisiones por celda sigue funcionando. Decisión
  de implementación de los pasos 6–7.
- **Sí:** la bajada final de los ojos desde la puerta (13,12) hasta la celda
  de revivir (13,14) es fija (scriptada). El greedy hacia la puerta no
  desciende dentro de la casa: en (13,13) las salidas laterales quedan a
  distancia 2 y (13,14) a 4, así que los ojos orbitarían el interior sin
  revivir jamás. Decisión de implementación del paso 7.
- **Sí:** energizantes y modo asustado dentro de este spec (decisión explícita
  del usuario).
- **Sí:** movimiento asustado al azar en cruces, como el arcade.
- **No:** huir maximizando distancia. Fácil de acorralar en un rincón.
- **Sí:** ojos que regresan a la casa y reviven tras ~2 s.
- **No:** reaparición por temporizador ni respawn inmediato.
- **Sí:** 6 s de miedo con parpadeo los últimos 2 s; cadena 200/400/800/1600.
- **Sí:** misma velocidad base para los cuatro; asustados a 0.6× y ojos a 1.5×.
- **No:** Cruise Elroy. Riesgo de desbalance y de fantasma inalcanzable.
- **No:** reproducir el bug histórico de desplazamiento de Pinky/Inky mirando
  arriba. Se implementan los vectores puros.
- **Sí:** pausar el ciclo dispersión/caza durante el miedo, como el arcade.
- **Sí:** los revividos salen en modo normal aunque quede tiempo de miedo.
- **Sí:** distancia euclidiana con desempate up/left/down/right. Es lo que hace
  el arcade; el `hunter` actual usaba Manhattan.
- **Sí:** los energizantes cuentan para `dotsRemaining`.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Los ojos podrían orbitar si la elección greedy no converge a la puerta | El objetivo (13,12) es alcanzable desde el pasillo de la fila 11; verificar el retorno a simple vista. Si orbita, permitir reversa solo en modo ojos. |
| Con 4 fantasmas la dificultad puede dispararse | La dispersión cada 20 s y el miedo de 6 s dan respiros; los tiempos viven en constantes de `game.js` y se ajustan sin tocar lógica. |
| `requestAnimationFrame` no corre exactamente a 60 fps (p. ej. pantallas de 120 Hz) | Riesgo preexistente del juego (todo es frame-based); fuera de alcance. Los tiempos del spec se entienden "a 60 fps". |
| Pinky/Inky apuntan a celdas fuera del laberinto | Los objetivos solo se usan para comparar distancias, nunca para moverse; no requieren validación. |

## Lo que **no** está en este spec

- Fruta/bonus y niveles múltiples.
- Vidas extra por puntaje.
- Cruise Elroy.
- Sonido.
- Bug histórico de desplazamiento de Pinky/Inky mirando arriba.
- Delta-time para pantallas de alta frecuencia.

Cada uno de estos, si llega, va en su propio spec.
