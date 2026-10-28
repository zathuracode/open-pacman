# SPEC 02 — Salida aleatoria de los fantasmas de la casa

> **Estado:** Implementado
> **Depende de:** SPEC 01
> **Fecha:** 2026-10-28
> **Objetivo:** Que al iniciar la partida y tras cada vida perdida, Pinky, Inky y
> Clyde salgan de la casa en orden y momento aleatorios, con una espera máxima
> de 2 s.

## Por qué existe este spec

Al iniciar la partida, tres de los cuatro fantasmas se quedan dando vueltas en el
cuadro durante 3, 6 y 9 segundos (escalera fija `releaseFrames` 0/180/360/540).
Además, `resetPositions()` recalcula esa escalera desde el frame actual en
**cada muerte**, así que cada vida perdida vuelve a encerrarlos 3/6/9 s.
Simulación con Pacman quieto: 5000 frames → 332 muertes y solo 3 salidas por
fantasma. El jugador lo percibe como fantasmas encerrados permanentemente.

## Scope

**In:**

- Retardo de salida aleatorio e independiente por fantasma, en `[0, 120]` frames
  (0–2 s), para Pinky, Inky y Clyde.
- El sorteo se repite al iniciar partida y en cada `resetPositions()` (vida
  perdida).
- Eliminar `GHOST_DEFS.releaseFrames` (queda sin uso).
- Mantener sin cambios la ruta de salida por la puerta central (13,12) → (13,11)
  y a Blinky fuera desde el inicio.

**Out of scope:**

- Cambiar la geometría de la casa, la puerta o la ruta de salida.
- Posiciones iniciales aleatorias dentro del cuadro.
- Cambiar el retardo fijo de 120 frames de los fantasmas revividos.
- Velocidades, personalidades, ciclo dispersión/caza, miedo o cadena.
- Delta-time / pantallas de alta frecuencia.

## Modelo de datos

Archivo que cambia: `src/js/game.js`. `maze.js`, `render.js`, `main.js` y CSS no
cambian.

```js
const RELEASE_MAX_FRAMES = 120; // 2 s de espera maxima

// GHOST_DEFS pierde releaseFrames; queda solo la esquina de dispersion.
const GHOST_DEFS = {
  blinky: { scatter: { x: 26, y: 1  } },
  pinky:  { scatter: { x: 1,  y: 1  } },
  inky:   { scatter: { x: 26, y: 29 } },
  clyde:  { scatter: { x: 1,  y: 29 } },
};

// Retardo de salida: entero en [0, RELEASE_MAX_FRAMES].
function releaseDelay() {
  return Math.floor( Math.random() * ( RELEASE_MAX_FRAMES + 1 ) );
}
```

`makeGhost(i, frame)` conserva el campo `releaseAt` (frame absoluto de salida) y
su semántica actual, pero para los que arrancan dentro de la casa lo calcula con
`frame + releaseDelay()`; Blinky (arranca fuera) mantiene `releaseAt: frame`.

`resetPositions()` no cambia: ya reconstruye cada fantasma con
`makeGhost(i, game.frame)`, por lo que hereda el re-sorteo. `reviveGhost()`
conserva `releaseAt = game.frame + 120`.

## Plan de implementación

1. **Constante y helper.** Añadir `RELEASE_MAX_FRAMES` y `releaseDelay()`; quitar
   `releaseFrames` de los cuatro `GHOST_DEFS`. `node --check` sigue pasando.
2. **Retardo aleatorio en `makeGhost`.** Asignar `frame + releaseDelay()` solo a
   los fantasmas que arrancan en la casa. Prueba: iniciar partida y ver que los
   tres salen en ≤2 s en orden variable.
3. **Verificación de resets y no regresiones.** Simulaciones en Node con
   `Math.random` stubbeado (varias semillas), comprobación de que cada muerte
   re-sortea, y repaso de los criterios del spec 01. Prueba visual final en
   navegador.

## Criterios de aceptación

- [x] Al iniciar, Pinky, Inky y Clyde tienen `releaseAt` en `[0, 120]`.
- [x] Los tres salen de la casa dentro de los ~2 s de espera más el recorrido por
      la puerta.
- [x] El orden de salida varía entre partidas; no siempre es
      Pinky → Inky → Clyde.
- [x] Al perder una vida se vuelven a sortear retardos ≤120 y ninguno queda
      encerrado más de 2 s.
- [x] Blinky sigue fuera de la casa desde el inicio.
- [x] La salida sigue siendo por la puerta central y termina en (13,11) con
      `dir: 'left'`.
- [x] Los fantasmas revividos siguen saliendo a los 120 frames.
- [x] No hay regresiones del spec 01 (personalidades, ciclo, miedo, cadena, ojos).
- [x] El juego carga sin errores de consola.

## Decisiones

- **Sí:** retardo aleatorio independiente por fantasma; orden y momento
  impredecibles.
- **No:** solo aleatorizar el orden manteniendo la escalera 0/3/6/9 s: siguen
  existiendo esperas largas.
- **Sí:** rango 0–120 frames (2 s), decisión explícita del usuario.
- **Sí:** re-sortear en cada reset; el bug se agravaba porque cada muerte
  re-armaba la escalera completa.
- **Sí:** mantener la salida por la puerta central. "De la mitad" = por el centro
  del cuadro; ya es la única boca y no se toca.
- **No:** posiciones iniciales aleatorias dentro del cuadro.
- **Sí:** los revividos mantienen 120 frames fijos del spec 01; fuera del alcance
  del bug.
- **No:** PRNG con semilla. `Math.random()` basta; las pruebas lo stubbean.
- **No:** garantizar retardos únicos. Con 121 valores y 3 fantasmas los empates
  son raros y solo implican salir casi juntos.

## Riesgos

| Riesgo | Mitigación |
| ------ | ---------- |
| Dos o tres fantasmas salen casi a la vez si los retardos coinciden | Aceptable: salen en fila por la misma puerta. Si molesta, separación mínima en otro spec. |
| El azar hace las pruebas no deterministas | Stub de `Math.random` en las simulaciones de Node. |
| Quitar `GHOST_DEFS.releaseFrames` rompe otro uso | `grep` confirma que solo lo usa `makeGhost`; validar con `node --check` y simulación. |
| Tiempos medidos "a 60 fps" | Igual que el spec 01; el motor es frame-based por diseño. |

## Lo que **no** está en este spec

- Cambios de ruta, puerta o geometría de la casa.
- Posiciones iniciales aleatorias.
- Cambios en revividos, velocidades o IA.
- Delta-time.

Cada uno de estos, si llega, va en su propio spec.
