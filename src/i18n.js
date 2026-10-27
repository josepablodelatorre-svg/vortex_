// VORTEX - Spanish for the menus, HUD and results.
// Plain script, loaded in order by index.html; shares globals with the others.

// ---------- Interface language ----------
// The game writes its interface in English. When the language is Spanish,
// every piece of text that appears on the page goes through T(): an exact
// match in UI_ES, else one of the UI_ES_PATTERNS (texts with numbers or
// names in them), else the parts either side of a ' - ' or a run of spaces
// are translated on their own. A MutationObserver applies it to whatever
// the code puts on screen, so the code itself stays in English; switching
// back restores the original text. (Commander lines have their own EN/ES.)
// Spanish here is written in the arcade style the commander uses: capitals
// without accents (the pixel font's capitals have none), Ñ, ¡ and ¿ kept.
const UI_ES = {
  // HUD
  'LVL': 'NIV', 'SCORE': 'PUNTOS', 'KILLS': 'BAJAS', 'CORES': 'NUCLEOS', 'TIME': 'TIEMPO', 'DEPTH': 'PROF',
  'HULL': 'CASCO', 'PLSM': 'PLSM', 'PWR': 'PODER', 'BOSS': 'JEFE', 'BOMB': 'BOMBA', 'LOCK': 'FIJAR',
  // title + menu
  'INFINITE SPACE. INFINITE WAR.': 'ESPACIO INFINITO. GUERRA INFINITA.',
  'PRESS START': 'PRESIONA START', 'TAP TO START': 'TOCA PARA EMPEZAR',
  'MAIN MENU': 'MENU PRINCIPAL', 'CONTINUE': 'CONTINUAR', 'PLAY': 'JUGAR',
  'ENTER THE RIFT': 'ENTRA A LA GRIETA', 'MULTIPLAYER >': 'MULTIJUGADOR >', 'HANGAR >': 'HANGAR >',
  'MISSIONS >': 'MISIONES >', 'LEADERBOARD >': 'CLASIFICACION >', 'UPGRADES >': 'MEJORAS >', 'SETTINGS >': 'AJUSTES >',
  '< BACK': '< ATRAS',
  // hangar
  'HANGAR': 'HANGAR', 'COLOR': 'COLOR', 'JACK IN': 'CONECTATE', '[ph]YOUR NAME': 'TU NOMBRE',
  'JACK IN SCANS YOU WITH YOUR CAMERA - IT NEVER LEAVES THIS DEVICE': 'CONECTATE TE ESCANEA CON TU CAMARA - NUNCA SALE DE ESTE DISPOSITIVO',
  'BALANCED ALL-ROUNDER': 'EQUILIBRADA', 'HOLD TO AUTO-FIRE': 'MANTEN PARA DISPARO AUTOMATICO', 'FAST SHOTS': 'DISPAROS RAPIDOS',
  'LIGHT HULL': 'CASCO LIGERO', 'HEAVY HULL': 'CASCO PESADO', 'SLOW SHOTS': 'DISPAROS LENTOS',
  'TRIPLE LASER AT EVERY LEVEL START': 'LASER TRIPLE AL EMPEZAR CADA NIVEL',
  // multiplayer
  'MULTIPLAYER': 'MULTIJUGADOR', 'CO-OP: ADD PLAYERS': 'COOPERATIVO: AGREGA JUGADORES',
  'PHONES JOIN AS EXTRA GUNNERS ON THIS SCREEN': 'LOS CELULARES SE UNEN COMO ARTILLEROS EN ESTA PANTALLA',
  'VERSUS: CHALLENGE A FRIEND': 'VERSUS: RETA A UN AMIGO', 'TWO SCREENS, TWO TUNNELS. LAST ONE FLYING WINS': 'DOS PANTALLAS, DOS TUNELES. GANA EL ULTIMO EN VUELO',
  'DAEMONS': 'DAEMONS', "RACE ON THE BUS. LEAVE WALLS, DON'T SEGFAULT": 'CORRE EN EL BUS. DEJA MUROS, NO HAGAS SEGFAULT',
  'CO-OP LINK': 'ENLACE COOPERATIVO', 'VERSUS LINK': 'ENLACE VERSUS', 'VERSUS CHALLENGE': 'RETO VERSUS',
  'SCAN WITH A PHONE TO JOIN AS AN EXTRA GUNNER (UP TO 3)': 'ESCANEA CON UN CELULAR PARA UNIRTE COMO ARTILLERO (HASTA 3)',
  'SCAN WITH ANOTHER DEVICE TO CHALLENGE IT. EACH SCREEN FLIES ITS OWN TUNNEL - LAST ONE FLYING WINS': 'ESCANEA CON OTRO DISPOSITIVO PARA RETARLO. CADA PANTALLA VUELA SU TUNEL - GANA EL ULTIMO EN VUELO',
  'SOMEONE CHALLENGED YOU! TYPE YOUR NAME ON THE TITLE SCREEN OR JUST ACCEPT': '¡ALGUIEN TE RETO! ESCRIBE TU NOMBRE EN EL TITULO O SOLO ACEPTA',
  'RACE AS A DAEMON ON THE BUS. START NOW AGAINST SYSTEM DAEMONS, OR SCAN WITH ANOTHER DEVICE TO RACE A FRIEND': 'CORRE COMO DAEMON EN EL BUS. EMPIEZA YA CONTRA DAEMONS DEL SISTEMA, O ESCANEA CON OTRO DISPOSITIVO PARA RETAR A UN AMIGO',
  'YOU WERE INVITED ONTO THE BUS. JOIN, THEN WAIT FOR THE HOST TO START THE ROUND': 'TE INVITARON AL BUS. UNETE Y ESPERA A QUE EL ANFITRION EMPIECE LA RONDA',
  'STARTING LINK...': 'INICIANDO ENLACE...', 'ACCEPT CHALLENGE': 'ACEPTAR RETO', 'JOIN THE BUS': 'SUBIR AL BUS',
  'START ROUND': 'EMPEZAR RONDA', 'DONE': 'LISTO', 'CONNECTING...': 'CONECTANDO...', 'LINK ERROR': 'ERROR DE ENLACE',
  'LINK UNAVAILABLE': 'ENLACE NO DISPONIBLE', 'WAITING FOR A CHALLENGER...': 'ESPERANDO UN RETADOR...',
  'NO FRIEND YET - SYSTEM DAEMONS WILL RACE': 'AUN SIN AMIGOS - CORRERAN DAEMONS DEL SISTEMA',
  'ON THE BUS. WAITING FOR THE HOST TO START...': 'EN EL BUS. ESPERANDO AL ANFITRION...',
  'RECONNECTING TO THE LINK SERVER...': 'RECONECTANDO AL SERVIDOR DE ENLACE...',
  'CHALLENGE NOT FOUND - IS THE OTHER SCREEN STILL OPEN?': 'RETO NO ENCONTRADO - ¿SIGUE ABIERTA LA OTRA PANTALLA?',
  'BUS NOT FOUND - IS THE OTHER SCREEN STILL OPEN?': 'BUS NO ENCONTRADO - ¿SIGUE ABIERTA LA OTRA PANTALLA?',
  // missions, upgrades, leaderboard
  'MISSIONS': 'MISIONES', 'FINISH ALL THREE TO RAISE YOUR SCORE MULTIPLIER FOR GOOD': 'TERMINA LAS TRES PARA SUBIR TU MULTIPLICADOR PARA SIEMPRE',
  'PLAY TODAY TO START A STREAK': 'JUEGA HOY PARA EMPEZAR UNA RACHA',
  'UPGRADES': 'MEJORAS', 'COINS ARE EARNED BY PLAYING: FLY OVER THEM, BEAT BOSSES, CLEAR LEVELS': 'LAS MONEDAS SE GANAN JUGANDO: VUELA SOBRE ELLAS, VENCE JEFES, SUPERA NIVELES',
  'PLASMA CELLS': 'CELDAS DE PLASMA', 'LONG CHARGE': 'CARGA LARGA', 'COIN MAGNET': 'IMAN DE MONEDAS', 'EXTRA BOMB': 'BOMBA EXTRA', 'POWER CORE': 'NUCLEO DE PODER',
  '+15% PLASMA SHIELD PER LEVEL': '+15% ESCUDO DE PLASMA POR NIVEL', 'POWER-UPS LAST 12% LONGER PER LEVEL': 'LOS PODERES DURAN 12% MAS POR NIVEL',
  'COLLECT COINS FROM A WIDER LANE': 'RECOGE MONEDAS DE UN CARRIL MAS ANCHO', '+1 BOMB PER LEVEL': '+1 BOMBA POR NIVEL',
  'LOCK-IN CHARGES 15% FASTER PER LEVEL': 'EL MODO FIJAR CARGA 15% MAS RAPIDO POR NIVEL', 'MAX': 'MAX',
  'LEADERBOARD': 'CLASIFICACION', 'THIS DEVICE': 'ESTE DISPOSITIVO', 'WORLD': 'MUNDIAL', 'CAMPAIGN': 'CAMPAÑA', 'RIFT': 'GRIETA', 'DAILY': 'DIARIO',
  'TOP 10 ON THIS DEVICE': 'TOP 10 EN ESTE DISPOSITIVO', 'TOP 10 IN THE WORLD': 'TOP 10 MUNDIAL',
  'NO RUNS YET. GO SET ONE!': 'AUN NO HAY PARTIDAS. ¡HAZ UNA!', "NO RUNS ON TODAY'S TUNNEL YET": 'AUN NO HAY PARTIDAS EN EL TUNEL DE HOY',
  'WORLD BOARD UNREACHABLE. CHECK YOUR CONNECTION.': 'TABLA MUNDIAL SIN CONEXION. REVISA TU INTERNET.',
  'NEW #1 ON THE LEADERBOARD!': '¡NUEVO #1 EN LA CLASIFICACION!',
  // settings
  'SETTINGS': 'AJUSTES', 'EASY': 'FACIL', 'NORMAL': 'NORMAL', 'HARD': 'DIFICIL', 'PLAY TUTORIAL': 'JUGAR TUTORIAL',
  'MUSIC': 'MUSICA', 'SFX': 'EFECTOS', 'SAVE BACKUP >': 'RESPALDO >', 'CREDITS >': 'CREDITOS >',
  'ON': 'SI', 'OFF': 'NO', 'AUTO': 'AUTO', 'FULL': 'NORMAL', 'REDUCED': 'REDUCIDOS', 'CHASE': 'EXTERIOR', 'COCKPIT': 'CABINA',
  'CRT': 'CRT', 'VIEW': 'VISTA', 'GLOW': 'BRILLO', 'VIBRATION': 'VIBRACION', 'FLASHING': 'DESTELLOS', 'LANGUAGE': 'IDIOMA',
  // backup + credits
  'SAVE BACKUP': 'RESPALDO',
  'YOUR PROGRESS LIVES IN THIS BROWSER ONLY. COPY THIS CODE (OR SAVE THE FILE) TO KEEP IT OR MOVE IT TO ANOTHER DEVICE.': 'TU PROGRESO VIVE SOLO EN ESTE NAVEGADOR. COPIA ESTE CODIGO (O GUARDA EL ARCHIVO) PARA CONSERVARLO O LLEVARLO A OTRO DISPOSITIVO.',
  'COPY CODE': 'COPIAR CODIGO', 'SAVE FILE': 'GUARDAR ARCHIVO', 'LOAD CODE': 'CARGAR CODIGO', 'OPEN FILE': 'ABRIR ARCHIVO',
  'TO LOAD A BACKUP, PASTE ITS CODE HERE OR OPEN THE FILE:': 'PARA CARGAR UN RESPALDO, PEGA SU CODIGO AQUI O ABRE EL ARCHIVO:',
  '[ph]PASTE A VTX1: CODE': 'PEGA UN CODIGO VTX1:', 'TAP AGAIN TO REPLACE': 'TOCA DE NUEVO PARA REEMPLAZAR',
  'THIS REPLACES ALL PROGRESS ON THIS DEVICE.': 'ESTO REEMPLAZA TODO EL PROGRESO EN ESTE DISPOSITIVO.',
  "THAT DOESN'T LOOK LIKE A VORTEX BACKUP.": 'ESO NO PARECE UN RESPALDO DE VORTEX.',
  'BACKUP LOADED. RESTARTING...': 'RESPALDO CARGADO. REINICIANDO...', 'CODE COPIED. KEEP IT SOMEWHERE SAFE.': 'CODIGO COPIADO. GUARDALO EN UN LUGAR SEGURO.',
  'BACKUP FILE SAVED.': 'ARCHIVO DE RESPALDO GUARDADO.',
  'CREDITS': 'CREDITOS', 'GAME + ORIGINAL SOUNDTRACK': 'JUEGO + MUSICA ORIGINAL', 'BUILT WITH': 'HECHO CON',
  'CLAUDE BY ANTHROPIC, STARTED AT THE PLATZI MEXICO CLAUDE FOR GAMES BUILD DAY': 'CLAUDE DE ANTHROPIC, EMPEZADO EN EL BUILD DAY CLAUDE FOR GAMES DE PLATZI MEXICO',
  'OPEN SOURCE': 'CODIGO ABIERTO', 'LICENSES': 'LICENCIAS', 'FONT LICENSE': 'LICENCIA DE LA FUENTE', 'PRIVACY POLICY': 'AVISO DE PRIVACIDAD',
  // flashing notice (its body text is already in both languages)
  'PHOTOSENSITIVITY WARNING': 'AVISO DE FOTOSENSIBILIDAD', 'REDUCED FLASHING': 'DESTELLOS REDUCIDOS',
  'YOU CAN CHANGE THIS ANY TIME IN SETTINGS.': 'PUEDES CAMBIARLO CUANDO QUIERAS EN AJUSTES.',
  // play
  'PAUSED': 'PAUSA', 'RESUME': 'SEGUIR', 'MENU': 'MENU', 'P / ESC TO RESUME': 'P / ESC PARA SEGUIR', 'SKIP TUTORIAL': 'SALTAR TUTORIAL',
  '> COMMAND': '> COMANDO', 'INCOMING': 'SE ACERCA', 'WARNING': 'ALERTA', 'WARP': 'SALTO', 'CLEAR': 'DESPEJADO',
  'TUNNEL': 'TUNEL', 'TRENCH RUN': 'LA ZANJA', 'ASTEROID FIELD': 'CAMPO DE ASTEROIDES', 'OPEN SPACE': 'ESPACIO ABIERTO', 'PLANET SURFACE': 'SUPERFICIE PLANETARIA',
  'THE RIFT': 'LA GRIETA', 'VERSUS': 'VERSUS', 'FINAL WARNING': 'ALERTA FINAL',
  // results
  'SIGNAL LOST': 'SEÑAL PERDIDA', 'SIGNAL SECURED': 'SEÑAL ASEGURADA', 'CLICK TO RETRY': 'TOCA PARA REINTENTAR',
  'CLICK TO PUSH DEEPER': 'TOCA PARA IR MAS PROFUNDO', 'CLICK FOR A REMATCH': 'TOCA PARA LA REVANCHA',
  'CONTINUE FROM CHECKPOINT': 'CONTINUAR DESDE EL PUNTO DE CONTROL', 'OR ENTER THE RIFT': 'O ENTRA A LA GRIETA',
  'SAVE CLIP': 'GUARDAR CLIP', 'SHARE': 'COMPARTIR', 'SAVING...': 'GUARDANDO...', 'SAVED!': '¡GUARDADO!', 'COPIED!': '¡COPIADO!',
  'FAILED': 'FALLO', 'DEFEATED': 'DERROTA', 'VICTORY': 'VICTORIA', '(HARDER)': '(MAS DIFICIL)',
  // pickups and callouts
  'DODGED!': '¡ESQUIVADO!', 'OVERCHARGE!': '¡SOBRECARGA!', '+1 BOMB': '+1 BOMBA', 'TRIPLE LASER!': '¡LASER TRIPLE!',
  'ECHO!': '¡ECO!', 'LAMBDA DISC!': '¡DISCO LAMBDA!', 'NICE!': '¡BIEN!', 'OBJECTIVE COMPLETE': 'OBJETIVO CUMPLIDO',
  'LOCK-IN READY': 'MODO FIJAR LISTO', 'LOCK-IN READY [L]': 'MODO FIJAR LISTO [L]', 'SLOW-MO': 'CAMARA LENTA', 'BOOST': 'TURBO',
  // cockpit dashboard
  'LOCK ON': 'FIJADO', 'SCAN': 'BUSCANDO', 'LOCK-IN': 'FIJAR', 'SPD': 'VEL', 'HP': 'VIDA', 'FLIGHT': 'VUELO', 'ORBIT': 'ORBITA', 'COMBAT': 'COMBATE',
  // burst labels
  'HIT!': '¡IMPACTO!', 'NOVA!': '¡NOVA!', '+HULL': '+CASCO', 'DISC!': '¡DISCO!', 'SHIELD!': '¡ESCUDO!', 'RADAR': 'RADAR',
  'BLOCKED': 'BLOQUEADO', 'TARGET DOWN. NICE WORK!': 'BLANCO ABATIDO. ¡BIEN HECHO!',
  // controllers
  'CONTROLLER CONNECTED': 'CONTROL CONECTADO'
};

// texts with numbers or names in them: [English pattern, Spanish template]
const UI_ES_PATTERNS = [
  [/^DAILY TUNNEL (.+)$/, 'TUNEL DIARIO $1'],
  [/^DAILY STREAK: (\d+) DAYS?$/, (m, n) => 'RACHA DIARIA: ' + n + (n === '1' ? ' DIA' : ' DIAS')],
  [/^ACHIEVEMENTS (\d+)\/(\d+)$/, 'LOGROS $1/$2'],
  [/^MISSIONS \((\d+)\/(\d+)\) >$/, 'MISIONES ($1/$2) >'],
  [/^UPGRADES \((\d+) C\) >$/, 'MEJORAS ($1 M) >'],
  [/^LEVEL (\d+)$/, 'NIVEL $1'],
  [/^DEPTH (\d+)$/, 'PROFUNDIDAD $1'],
  [/^RUN (\d+)$/, 'RONDA $1'],
  [/^CHECKPOINT - LEVEL (\d+)$/, 'PUNTO DE CONTROL - NIVEL $1'],
  [/^CONTINUE: (.+)$/, (m, a) => 'CONTINUAR: ' + T(a)],
  [/^CONTINUE FROM (.+)$/, (m, a) => 'CONTINUAR DESDE ' + T(a)],
  [/^LEADERBOARD #(\d+)$/, 'CLASIFICACION #$1'],
  [/^WORLD #(\d+)$/, 'MUNDIAL #$1'],
  [/^BOMB x(\d+)( \[SPACE\])?$/, (m, n, k) => 'BOMBA x' + n + (k ? ' [ESPACIO]' : '')],
  [/^COINS (\d+)$/, 'MONEDAS $1'],
  [/^\+(\d+) COINS$/, '+$1 MONEDAS'],
  [/^\+(\d+) COINS \((\d+) TOTAL\)$/, '+$1 MONEDAS ($2 EN TOTAL)'],
  [/^SCORE: (\d+)$/, 'PUNTOS: $1'],
  [/^HULL (\d+)$/, 'CASCO $1'],
  [/^DESTROY (\d+) ENEMIES$/, 'DESTRUYE $1 ENEMIGOS'],
  [/^DODGE (\d+) ENEMIES$/, 'ESQUIVA $1 ENEMIGOS'],
  [/^COLLECT (\d+) COINS$/, 'RECOGE $1 MONEDAS'],
  [/^DEFEAT (\d+) BOSSES$/, 'VENCE A $1 JEFES'],
  [/^USE (\d+) PORTALS$/, 'USA $1 PORTALES'],
  [/^HIT (\d+) ARROW PADS$/, 'PISA $1 FLECHAS'],
  [/^FLY THROUGH (\d+) HOOPS$/, 'CRUZA $1 AROS'],
  [/^USE LOCK-IN (\d+) TIMES$/, 'USA EL MODO FIJAR $1 VECES'],
  [/^HIT (\d+) TARGETS WITH DISCS$/, 'GOLPEA $1 BLANCOS CON DISCOS'],
  [/^BREAK (\d+) ASTEROIDS$/, 'ROMPE $1 ASTEROIDES'],
  [/^HIT (\d+) TRENCH VENTS$/, 'ACIERTA $1 CONDUCTOS DE LA ZANJA'],
  [/^REACH LEVEL (\d+)$/, 'LLEGA AL NIVEL $1'],
  [/^LINKED WITH (.+)\. GET READY\.\.\.$/, 'ENLAZADO CON $1. PREPARATE...'],
  [/^LINK SERVER BUSY, RETRYING \((\d+)\/(\d+)\)\.\.\.$/, 'SERVIDOR OCUPADO, REINTENTANDO ($1/$2)...'],
  [/^COULD NOT REACH THE LINK SERVER \((.+)\)$/, 'NO SE PUDO CONECTAR AL SERVIDOR ($1)'],
  [/^CONNECTION FAILED \((.+)\)$/, 'FALLO LA CONEXION ($1)'],
  [/^(.+) OUTLASTED YOU\.$/, '$1 DURO MAS QUE TU.'],
  [/^NEXT: RUN (\d+) \(HARDER\)$/, 'SIGUIENTE: RONDA $1 (MAS DIFICIL)'],
  [/^BEST (\d+)$/, 'RECORD $1'],
  [/^FURTHEST: RUN (\d+)$/, 'MAS LEJOS: RONDA $1'],
  [/^RIFT: DEPTH (\d+)$/, 'GRIETA: PROF $1'],
  [/^TRIPLE LASER (.+)s$/, 'LASER TRIPLE $1s'],
  [/^ECHO (.+)s$/, 'ECO $1s'],
  [/^DISC x(\d+)$/, 'DISCO x$1'],
  [/^BOOST (.+)s$/, 'TURBO $1s'],
  [/^SLOW-MO (.+)s$/, 'CAMARA LENTA $1s'],
  [/^(CRT|VIEW|GLOW|VIBRATION|FLASHING|LANGUAGE): (.+)$/, (m, k, v) => T(k) + ': ' + T(v)],
  [/^ACHIEVEMENT: (.+)$/, 'LOGRO: $1'],
  [/^NEW SHIP COLOR: (.+)$/, 'NUEVO COLOR DE NAVE: $1'],
  [/^\+(\d+) HULL$/, '+$1 CASCO'],
  [/^-(\d+) HULL$/, '-$1 CASCO'],
  [/^PLASMA -(\d+)$/, 'PLASMA -$1'],
  [/^LOCKED - (.+)$/, (m, a) => 'BLOQUEADO - ' + T(a)],
  [/^(\d+) STREAK!$/, '¡RACHA DE $1!'],
  [/^DAY (\d+) STREAK!$/, (m, n) => '¡RACHA DE ' + n + (n === '1' ? ' DIA!' : ' DIAS!')],
  [/^ACCURACY (\d+)%$/, 'PUNTERIA $1%'],
  [/^DAMAGE TAKEN (\d+)$/, 'DAÑO RECIBIDO $1'],
  [/^(KILLS|CORES|TIME): (.+)$/, (m, k, v) => T(k) + ': ' + v],
  [/^DEPTH: (\d+)$/, 'PROFUNDIDAD: $1']
];

function uiLang() {
  return typeof lang !== 'undefined' ? lang : 'en';
}

function T(text) {
  if (uiLang() !== 'es' || !text) return text;
  if (Object.prototype.hasOwnProperty.call(UI_ES, text)) return UI_ES[text];
  for (const [re, to] of UI_ES_PATTERNS) {
    if (re.test(text)) return text.replace(re, to);
  }
  // several lines, or pieces joined by ' - ' or wide gaps: translate each
  if (text.includes('\n')) return text.split('\n').map(T).join('\n');
  const gap = /( {2,}| - )/;
  if (gap.test(text)) return text.split(gap).map(part => gap.test(part) ? part : T(part)).join('');
  return text;
}

// ---- applying it to the page ----
const uiOriginal = new WeakMap();   // text node -> its English text
const uiShown = new WeakMap();      // text node -> what we last wrote
function translateNode(node) {
  const shown = uiShown.get(node);
  if (shown !== undefined && node.nodeValue === shown) return; // our own write
  const raw = node.nodeValue;
  const trimmed = raw.trim();
  if (!trimmed || !/[A-Z]/.test(trimmed)) return;
  uiOriginal.set(node, raw);
  const out = raw.replace(trimmed, T(trimmed));
  uiShown.set(node, out);
  if (out !== raw) node.nodeValue = out;
}
function translateTree(root) {
  if (root.nodeType === 3) { if (!uiSkip(root)) translateNode(root); return; }
  if (root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE' || root.tagName === 'TEXTAREA') return;
  if (uiSkip(root)) return;
  if (root.placeholder) {
    if (!root.dataset.phEn) root.dataset.phEn = root.placeholder;
    root.placeholder = UI_ES['[ph]' + root.dataset.phEn] || root.dataset.phEn;
  }
  for (const c of root.childNodes) translateTree(c);
}
// the commander box (already in either language) and typed text aren't
// interface text
const UI_SKIP = '#commstext, #briefing, #pilotname, #backupcode, #restorecode, #flashwarn p';
function uiSkip(node) {
  const el = node.nodeType === 1 ? node : node.parentElement;
  return !el || !!el.closest(UI_SKIP);
}
const uiObserver = new MutationObserver((records) => {
  for (const r of records) {
    if (r.type === 'characterData') { if (!uiSkip(r.target)) translateNode(r.target); continue; }
    for (const n of r.addedNodes) if (!uiSkip(n)) translateTree(n);
  }
});

function applyUiLang() {
  uiObserver.disconnect();
  if (uiLang() === 'es') {
    translateTree(document.body);
    uiObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    // back to English: restore every text we changed
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const en = uiOriginal.get(n);
      if (en !== undefined && n.nodeValue === uiShown.get(n)) n.nodeValue = en;
      uiShown.delete(n);
    }
    for (const el of document.querySelectorAll('[data-ph-en]')) el.placeholder = el.dataset.phEn;
  }
  document.documentElement.lang = uiLang();
}
