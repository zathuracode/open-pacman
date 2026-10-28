// game.js
// Estado y reglas. Depende de globals de maze.js: MAZE, TUNNEL_ROW,
// PACMAN_START, GHOST_STARTS.

const DIRS = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};
const OPPOSITE = { left: 'right', right: 'left', up: 'down', down: 'up' };

const PACMAN_SPEED = 0.125; // 1/8 celda/frame -> alinea cada 8 frames
const GHOST_SPEED = 0.1;    // 1/10 celda/frame

// Definiciones por kind: esquina de dispersion.
const GHOST_DEFS = {
  blinky: { scatter: { x: 26, y: 1  } },
  pinky:  { scatter: { x: 1,  y: 1  } },
  inky:   { scatter: { x: 26, y: 29 } },
  clyde:  { scatter: { x: 1,  y: 29 } },
};
const RELEASE_MAX_FRAMES = 120; // 2 s de espera maxima

// Retardo de salida: entero en [0, RELEASE_MAX_FRAMES].
function releaseDelay() {
  return Math.floor( Math.random() * ( RELEASE_MAX_FRAMES + 1 ) );
}
const SCATTER_FRAMES = 420;  // 7 s
const CHASE_FRAMES   = 1200; // 20 s
const FRIGHTENED_FRAMES = 360; // 6 s
const BLINK_FRAMES      = 120; // ultimos 2 s
const FRIGHTENED_SPEED  = 0.06; // 0.6 x GHOST_SPEED
const EYES_SPEED        = 0.15; // 1.5 x GHOST_SPEED

// Fantasma recien creado o reseteado: arranque de GHOST_STARTS, modo inicial
// (el que arranca por encima de la puerta ya esta fuera de la casa) y frame
// absoluto de salida de la casa (aleatorio 0-120 para los de la casa).
function makeGhost( i, frame ) {
  const start = GHOST_STARTS[ i ];
  const inHouse = start.y >= 13;
  return {
    x: start.x,
    y: start.y,
    dir: start.dir,
    speed: GHOST_SPEED,
    kind: start.kind,
    mode: inHouse ? 'house' : 'normal',
    frightened: false,
    releaseAt: inHouse ? frame + releaseDelay() : frame,
  };
}

// Crea una partida nueva. Copia MAZE (pristino) a game.grid para poder comer
// dots sin destruir el original, y reiniciar.
function createGame() {
  const grid = MAZE.map( ( row ) => row.slice() );
  // La celda de inicio de Pacman arranca sin dot.
  grid[ PACMAN_START.y ][ PACMAN_START.x ] = 0;

  let dots = 0;
  // Dots (2) y energizantes (4) cuentan para ganar la partida.
  for ( const row of grid ) for ( const v of row ) if ( v === 2 || v === 4 ) dots++;

  return {
    state: 'start',
    score: 0,
    lives: 3,
    frame: 0,                   // avanza 1 por update()
    ghostMode: 'scatter',       // 'scatter' | 'chase'
    modeTimer: SCATTER_FRAMES,  // frames restantes de la fase
    frightTimer: 0,             // 0 = sin miedo activo
    ghostsEaten: 0,             // cadena 200/400/800/1600
    dotsRemaining: dots,
    grid,
    pacman: {
      x: PACMAN_START.x,
      y: PACMAN_START.y,
      dir: 'left',
      nextDir: null,
      speed: PACMAN_SPEED,
    },
    ghosts: GHOST_STARTS.map( ( _, i ) => makeGhost( i, 0 ) ),
  };
}

function aligned( v ) {
  return Math.abs( v - Math.round( v ) ) < 1e-3;
}

// Una celda es muro para el actor dado?
//   pacman: bloqueado por pared (1) y puerta (3)
//   ghost:  bloqueado por pared (1) y puerta (3): la casa es de un solo
//           sentido y un fantasma normal no puede volver a entrar
//   eyes:   bloqueado solo por pared (1); cruza la puerta para volver
function isWall( grid, x, y, actor ) {
  if ( y < 0 || y >= grid.length ) return true;
  if ( x < 0 || x >= grid[ 0 ].length ) return true;
  const v = grid[ y ][ x ];
  if ( v === 1 ) return true;
  if ( v === 3 ) return actor !== 'eyes';
  return false;
}

// Puede el actor avanzar desde (x,y) en la direccion dir?
function canMove( grid, x, y, dir, actor ) {
  const d = DIRS[ dir ];
  if ( !d ) return false;
  const tx = x + d.x;
  const ty = y + d.y;
  // Tunel: salir por un borde en la fila del tunel siempre es valido.
  if ( ty === TUNNEL_ROW && ( tx < 0 || tx >= grid[ 0 ].length ) ) return true;
  return !isWall( grid, tx, ty, actor );
}

function wrapTunnel( a, width ) {
  if ( Math.round( a.y ) === TUNNEL_ROW ) {
    if ( a.x < 0 ) a.x += width;
    else if ( a.x >= width ) a.x -= width;
  }
}

// Energizante: activa el miedo. Reinicia temporizador y cadena, quedan
// asustados todos los fantasmas salvo los ojos, y solo los normales
// invierten direccion al instante.
function activateFright( game ) {
  game.frightTimer = FRIGHTENED_FRAMES;
  game.ghostsEaten = 0;
  game.ghosts.forEach( ( g ) => {
    if ( g.mode === 'eyes' ) return;
    g.frightened = true;
    if ( g.mode === 'normal' ) g.dir = OPPOSITE[ g.dir ];
  } );
}

function movePacman( game ) {
  const p = game.pacman;
  const grid = game.grid;
  const width = grid[ 0 ].length;

  if ( aligned( p.x ) && aligned( p.y ) ) {
    p.x = Math.round( p.x );
    p.y = Math.round( p.y );

    // Aplicar giro pendiente si es posible.
    if ( p.nextDir && canMove( grid, p.x, p.y, p.nextDir, 'pacman' ) ) {
      p.dir = p.nextDir;
      p.nextDir = null;
    }
    // Comer dot (10) o energizante (50); ambos cuentan para ganar.
    const cell = grid[ p.y ][ p.x ];
    if ( cell === 2 || cell === 4 ) {
      grid[ p.y ][ p.x ] = 0;
      game.dotsRemaining--;
      game.score += cell === 4 ? 50 : 10;
      if ( cell === 4 ) activateFright( game );
    }
    // Si no puede seguir, se detiene en la celda.
    if ( !canMove( grid, p.x, p.y, p.dir, 'pacman' ) ) return;
  }

  const d = DIRS[ p.dir ];
  p.x += d.x * p.speed;
  p.y += d.y * p.speed;
  wrapTunnel( p, width );
}

// Prioridad de desempate en cruces: up, left, down, right (como el arcade).
const DIR_PRIORITY = [ 'up', 'left', 'down', 'right' ];

// Objetivo del fantasma segun la fase global y su personalidad. Solo sirve
// para comparar distancias; nunca se valida como celda alcanzable.
function ghostTarget( game, g ) {
  // Ojos: objetivo la puerta para entrar a la casa y revivir.
  if ( g.mode === 'eyes' ) return { x: 13, y: 12 };
  if ( game.ghostMode === 'scatter' ) return GHOST_DEFS[ g.kind ].scatter;

  const p = game.pacman;
  const d = DIRS[ p.dir ];
  const px = Math.round( p.x );
  const py = Math.round( p.y );

  switch ( g.kind ) {
    case 'blinky':
      // El agresivo: persigue directo la celda de Pacman.
      return { x: px, y: py };
    case 'pinky':
      // Embosca 4 celdas por delante de la direccion de Pacman (vector puro,
      // sin reproducir el bug historico de mirar arriba).
      return { x: px + d.x * 4, y: py + d.y * 4 };
    case 'inky': {
      // Punto 2 celdas delante de Pacman; extiende al doble el vector desde
      // Blinky hasta ese punto: 2*punto - Blinky (Blinky es ghosts[0]).
      const blinky = game.ghosts[ 0 ];
      const ax = px + d.x * 2;
      const ay = py + d.y * 2;
      return { x: 2 * ax - Math.round( blinky.x ), y: 2 * ay - Math.round( blinky.y ) };
    }
    case 'clyde': {
      // Persigue a distancia; a 8 celdas Manhattan o menos se retira a su
      // esquina.
      const dist = Math.abs( Math.round( g.x ) - px ) + Math.abs( Math.round( g.y ) - py );
      return dist > 8 ? { x: px, y: py } : GHOST_DEFS[ g.kind ].scatter;
    }
    default:
      return { x: px, y: py };
  }
}

function decideGhost( game, g ) {
  const grid = game.grid;

  // Direcciones validas sin retroceder, ya en orden de desempate. Los ojos
  // usan el actor 'eyes': solo ellos pueden cruzar la puerta.
  const actor = g.mode === 'eyes' ? 'eyes' : 'ghost';
  const options = DIR_PRIORITY.filter(
    ( dir ) => dir !== OPPOSITE[ g.dir ] && canMove( grid, g.x, g.y, dir, actor )
  );
  // Sin salida (callejon): permitir el giro de 180.
  const choices = options.length ? options : [ OPPOSITE[ g.dir ] ];

  // Asustado: eleccion al azar entre las direcciones validas.
  if ( g.frightened ) {
    g.dir = choices[ Math.floor( Math.random() * choices.length ) ];
    return;
  }

  const target = ghostTarget( game, g );
  // Direccion que minimiza la distancia euclidiana al objetivo; el orden de
  // `choices` desempata up > left > down > right.
  let best = choices[ 0 ];
  let bestDist = Infinity;
  for ( const dir of choices ) {
    const d = DIRS[ dir ];
    const dx = g.x + d.x - target.x;
    const dy = g.y + d.y - target.y;
    const dist = dx * dx + dy * dy; // al cuadrado: conserva el orden euclidiano
    if ( dist < bestDist ) {
      bestDist = dist;
      best = dir;
    }
  }
  g.dir = best;
}

// Avanza `value` hacia `target` a razon de `step` sin pasarse.
function stepToward( value, target, step ) {
  if ( value < target ) return Math.min( target, value + step );
  if ( value > target ) return Math.max( target, value - step );
  return value;
}

// En la casa: vaiven vertical en su columna entre y=13 e y=15, invirtiendo
// dir al topear. No usa decideGhost.
function moveHouseGhost( g ) {
  g.y += DIRS[ g.dir ].y * g.speed;
  if ( g.y <= 13 ) {
    g.y = 13;
    g.dir = 'down';
  } else if ( g.y >= 15 ) {
    g.y = 15;
    g.dir = 'up';
  }
}

// Saliendo de la casa: primero se alinea en horizontal a x=13, a la altura
// en que lo dejo el vaiven (banda y 13-15), y luego sube por la puerta
// (13,12) hasta la fila 11, donde pasa a normal con dir 'left'.
function moveLeavingGhost( g ) {
  if ( Math.abs( g.x - 13 ) > 1e-3 ) {
    g.dir = g.x < 13 ? 'right' : 'left';
    g.x = stepToward( g.x, 13, g.speed );
    return;
  }
  g.x = 13;
  g.dir = 'up';
  g.y = stepToward( g.y, 11, g.speed );
  if ( Math.abs( g.y - 11 ) <= 1e-3 ) {
    g.y = 11;
    g.mode = 'normal';
    g.dir = 'left';
  }
}

// Revive al fantasma comido: al centro de la casa, sin miedo, y vuelve a
// salir 120 frames despues (2 s).
function reviveGhost( game, g ) {
  g.x = 13;
  g.y = 14;
  g.dir = 'up';
  g.mode = 'house';
  g.frightened = false;
  g.releaseAt = game.frame + 120;
}

function moveGhost( game, g ) {
  const grid = game.grid;
  const width = grid[ 0 ].length;

  // Velocidad segun estado: ojos 1.5x, asustado 0.6x, resto normal.
  g.speed =
    g.mode === 'eyes' ? EYES_SPEED : g.frightened ? FRIGHTENED_SPEED : GHOST_SPEED;

  // En la casa: vaiven hasta que llega su frame de salida.
  if ( g.mode === 'house' ) {
    if ( game.frame >= g.releaseAt ) g.mode = 'leaving';
    else {
      moveHouseGhost( g );
      return;
    }
  }
  // Saliendo: ruta fija por la puerta, sin decideGhost.
  if ( g.mode === 'leaving' ) {
    moveLeavingGhost( g );
    return;
  }
  // Ojos en el tramo puerta-centro (13, y 12-14): bajada fija hasta (13,14)
  // para revivir. Fuera de ese tramo siguen con el greedy hacia la puerta.
  if ( g.mode === 'eyes' && g.x === 13 && g.y >= 12 && g.y <= 14 ) {
    g.dir = 'down';
    g.y = stepToward( g.y, 14, g.speed );
    if ( g.y === 14 ) reviveGhost( game, g );
    return;
  }

  if ( aligned( g.x ) && aligned( g.y ) ) {
    g.x = Math.round( g.x );
    g.y = Math.round( g.y );
    decideGhost( game, g );
    if ( !canMove( grid, g.x, g.y, g.dir, g.mode === 'eyes' ? 'eyes' : 'ghost' ) ) return;
  }

  const d = DIRS[ g.dir ];
  let nx = g.x + d.x * g.speed;
  let ny = g.y + d.y * g.speed;
  // Con velocidades no 1/n (0.06, 0.15) el centro de la celda se cruza entre
  // frames: aterrizar en el centro cruzado para volver a decidir alineado.
  if ( d.x > 0 && nx >= Math.floor( g.x ) + 1 ) nx = Math.floor( g.x ) + 1;
  else if ( d.x < 0 && nx <= Math.ceil( g.x ) - 1 ) nx = Math.ceil( g.x ) - 1;
  if ( d.y > 0 && ny >= Math.floor( g.y ) + 1 ) ny = Math.floor( g.y ) + 1;
  else if ( d.y < 0 && ny <= Math.ceil( g.y ) - 1 ) ny = Math.ceil( g.y ) - 1;
  g.x = nx;
  g.y = ny;
  wrapTunnel( g, width );
}

function resetPositions( game ) {
  const p = game.pacman;
  p.x = PACMAN_START.x;
  p.y = PACMAN_START.y;
  p.dir = 'left';
  p.nextDir = null;
  // Se restauran el ciclo dispersion/caza, el miedo y la escalera de
  // salidas, recalculada desde el frame actual de la partida.
  game.ghostMode = 'scatter';
  game.modeTimer = SCATTER_FRAMES;
  game.frightTimer = 0;
  game.ghostsEaten = 0;
  game.ghosts.forEach( ( g, i ) => Object.assign( g, makeGhost( i, game.frame ) ) );
}

function collides( a, b ) {
  return Math.abs( a.x - b.x ) < 0.5 && Math.abs( a.y - b.y ) < 0.5;
}

// Inversion de direccion al cambiar de fase; solo fantasmas en modo normal.
function reverseGhosts( game ) {
  game.ghosts.forEach( ( g ) => {
    if ( g.mode !== 'normal' ) return;
    g.dir = OPPOSITE[ g.dir ];
  } );
}

// Ciclo global dispersion/caza: avanza el frame, agota el temporizador de
// la fase, alterna scatter/chase e invierte a los fantasmas al cambiar.
// Mientras dura el miedo, el temporizador de fase queda en pausa.
function advanceCycle( game ) {
  game.frame++;
  if ( game.frightTimer > 0 ) {
    game.frightTimer--;
    if ( game.frightTimer === 0 ) {
      // Fin del miedo: todos los fantasmas vuelven a la normalidad.
      game.ghosts.forEach( ( g ) => {
        g.frightened = false;
      } );
    }
    return;
  }
  game.modeTimer--;
  if ( game.modeTimer > 0 ) return;
  game.ghostMode = game.ghostMode === 'scatter' ? 'chase' : 'scatter';
  game.modeTimer = game.ghostMode === 'scatter' ? SCATTER_FRAMES : CHASE_FRAMES;
  reverseGhosts( game );
}

function update( game ) {
  advanceCycle( game );
  movePacman( game );
  game.ghosts.forEach( ( g ) => moveGhost( game, g ) );

  for ( const g of game.ghosts ) {
    // Solo un fantasma 'normal' puede tocar a Pacman; los de la casa o
    // saliendo estan tras la puerta, y los ojos lo atraviesan sin efecto.
    if ( g.mode !== 'normal' ) continue;
    if ( collides( game.pacman, g ) ) {
      if ( g.frightened ) {
        // Fantasma asustado comido: cadena 200/400/800/1600; pasa a ojos.
        game.score += 200 * Math.pow( 2, game.ghostsEaten );
        game.ghostsEaten++;
        g.frightened = false;
        g.mode = 'eyes';
        continue;
      }
      game.lives--;
      if ( game.lives <= 0 ) {
        game.state = 'lost';
        return;
      }
      resetPositions( game );
      break;
    }
  }

  if ( game.dotsRemaining <= 0 ) game.state = 'won';
}

window.createGame = createGame;
window.update = update;
window.DIRS = DIRS;
window.BLINK_FRAMES = BLINK_FRAMES;
