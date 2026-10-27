/**
 * PASO 0 — La teoría, sin API key y sin internet.
 *
 * Construimos una base de datos vectorial de juguete en ~60 líneas para
 * ver el mecanismo por dentro. Pinecone hace exactamente esto, pero con
 * miles de millones de vectores y con índices que evitan comparar contra
 * todos ellos.
 *
 *   node scripts/0-teoria.js
 */
import { c, titulo } from '../src/config.js';

// ───────────────────────────────────────────────────────────────────────
// 1. Un embedding es una lista de números que sitúa un concepto en un mapa
// ───────────────────────────────────────────────────────────────────────
titulo('1. ¿Qué es un embedding?');

console.log(`Un ${c.bold}embedding${c.reset} es la traducción de un texto a una lista de números.
Cada número mide "cuánto tiene" el texto de una característica.

Aquí lo hacemos a mano con solo 3 características para poder verlo:

    [ ${c.yellow}animal${c.reset} , ${c.magenta}tecnología${c.reset} , ${c.green}comida${c.reset} ]
`);

const vocabulario = {
  perro:      [0.95, 0.02, 0.10],
  gato:       [0.93, 0.01, 0.08],
  hámster:    [0.90, 0.00, 0.05],
  ordenador:  [0.01, 0.97, 0.02],
  servidor:   [0.02, 0.95, 0.01],
  teclado:    [0.00, 0.88, 0.03],
  manzana:    [0.05, 0.03, 0.94],
  pizza:      [0.02, 0.01, 0.96],
};

for (const [palabra, vector] of Object.entries(vocabulario)) {
  const nums = vector.map((n) => n.toFixed(2).padStart(5)).join(', ');
  console.log(`  ${palabra.padEnd(12)} → [${nums} ]`);
}

console.log(`
${c.dim}Fíjate: "perro" y "gato" tienen números casi idénticos. No porque se
escriban parecido (no se parecen nada) sino porque ${c.reset}${c.dim}significan${c.reset}${c.dim} cosas
parecidas. Eso es lo único que hace especial a una base vectorial.${c.reset}`);

// ───────────────────────────────────────────────────────────────────────
// 2. Medir el parecido: similitud coseno
// ───────────────────────────────────────────────────────────────────────
titulo('2. Medir el parecido: similitud coseno');

/**
 * Similitud coseno = el ángulo entre dos vectores.
 *   1  → apuntan en la misma dirección  (significan lo mismo)
 *   0  → perpendiculares                (no tienen nada que ver)
 *  -1  → opuestos
 *
 * Se usa el ángulo y no la distancia porque nos interesa la DIRECCIÓN
 * (el tema del que habla el texto), no la magnitud (cuán largo es).
 */
function similitudCoseno(a, b) {
  let producto = 0;
  let normaA = 0;
  let normaB = 0;

  for (let i = 0; i < a.length; i++) {
    producto += a[i] * b[i]; // producto escalar
    normaA += a[i] * a[i];
    normaB += b[i] * b[i];
  }

  return producto / (Math.sqrt(normaA) * Math.sqrt(normaB));
}

const parejas = [
  ['perro', 'gato'],
  ['perro', 'hámster'],
  ['ordenador', 'servidor'],
  ['perro', 'ordenador'],
  ['pizza', 'teclado'],
];

console.log(`  ${''.padEnd(26)} ${'similitud'.padEnd(26)} ángulo\n`);
for (const [a, b] of parejas) {
  const s = similitudCoseno(vocabulario[a], vocabulario[b]);
  const grados = ((Math.acos(Math.min(1, s)) * 180) / Math.PI).toFixed(0);
  console.log(`  ${(a + ' ↔ ' + b).padEnd(26)} ${barra(s)} ${s.toFixed(3)}   ${String(grados).padStart(2)}°`);
}

console.log(`
${c.dim}La fórmula completa es solo esto:

    coseno(A,B) = (A·B) / (|A| × |B|)

...un producto escalar dividido entre el producto de las longitudes.
Toda la "magia" de la búsqueda semántica es esta operación repetida.

Fíjate en la columna de grados: los pares relacionados apuntan casi en la
misma dirección (0-10°) y los no relacionados son casi perpendiculares (~88°).
Que los scores altos se amontonen cerca de 1 es normal, también con modelos
reales: lo que importa no es el número absoluto sino el ${c.reset}${c.dim}orden${c.reset}${c.dim}.${c.reset}`);

// ───────────────────────────────────────────────────────────────────────
// 3. Una base de datos vectorial de juguete
// ───────────────────────────────────────────────────────────────────────
titulo('3. Una base vectorial en 15 líneas');

class MiniBaseVectorial {
  constructor() {
    this.registros = [];
  }

  /** Guardar. Equivale al `upsert` de Pinecone. */
  upsert(id, vector, metadata = {}) {
    this.registros.push({ id, vector, metadata });
  }

  /** Buscar los k más parecidos. Equivale al `query` de Pinecone. */
  query(vectorConsulta, topK = 3, filtro = null) {
    return this.registros
      .filter((r) => !filtro || filtro(r.metadata))
      .map((r) => ({ ...r, score: similitudCoseno(vectorConsulta, r.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }
}

const db = new MiniBaseVectorial();
for (const [palabra, vector] of Object.entries(vocabulario)) {
  const tipo = vector[0] > 0.5 ? 'animal' : vector[1] > 0.5 ? 'tecnología' : 'comida';
  db.upsert(palabra, vector, { palabra, tipo });
}

// Buscamos "mascota": una palabra que NO está en la base de datos.
const consulta = [0.92, 0.03, 0.12];
console.log(`Consulta: ${c.bold}"mascota"${c.reset} → [ 0.92,  0.03,  0.12 ]`);
console.log(`${c.dim}(la palabra "mascota" no está guardada en ninguna parte)${c.reset}\n`);

for (const r of db.query(consulta, 4)) {
  console.log(`  ${r.id.padEnd(12)} ${barra(r.score)} ${r.score.toFixed(3)}`);
}

console.log(`
${c.green}${c.bold}✓${c.reset} Encuentra perro, gato y hámster aunque la palabra "mascota" no aparezca
  en ningún registro. Un ${c.bold}LIKE '%mascota%'${c.reset} de SQL habría devuelto cero filas.`);

// ───────────────────────────────────────────────────────────────────────
// 4. Filtros por metadata
// ───────────────────────────────────────────────────────────────────────
titulo('4. Filtrar por metadata');

console.log(`Misma consulta, pero limitada a ${c.bold}tipo = "comida"${c.reset}:\n`);
for (const r of db.query(consulta, 3, (m) => m.tipo === 'comida')) {
  console.log(`  ${r.id.padEnd(12)} ${barra(r.score)} ${r.score.toFixed(3)}`);
}

console.log(`
${c.dim}Junto a cada vector puedes guardar datos normales (categoría, fecha,
autor, idioma) y filtrar por ellos. Es lo que hace útil a una base
vectorial en producción: "lo más parecido a X, pero solo de 2024".${c.reset}`);

// ───────────────────────────────────────────────────────────────────────
// 5. El salto a la realidad
// ───────────────────────────────────────────────────────────────────────
titulo('5. De este juguete a Pinecone');

console.log(`Lo que cambia en el mundo real:

  ${c.yellow}1.${c.reset} ${c.bold}Las dimensiones no las eliges tú.${c.reset}
     Aquí inventamos 3 características. Un modelo de embeddings real usa
     ${c.bold}1024${c.reset} (multilingual-e5-large) y las aprende solo durante su
     entrenamiento. Nadie sabe qué significa la dimensión 417: son
     conceptos abstractos que el modelo descubrió leyendo millones de textos.

  ${c.yellow}2.${c.reset} ${c.bold}No comparas contra todos.${c.reset}
     Nuestro query recorre TODOS los registros. Con 50 millones de vectores
     eso es inviable, así que Pinecone usa índices aproximados (ANN) que
     descartan el 99% de candidatos sin mirarlos. Pierdes un pelín de
     precisión y ganas varios órdenes de magnitud de velocidad.

  ${c.yellow}3.${c.reset} ${c.bold}No tienes que generar los vectores tú.${c.reset}
     Pinecone puede alojar el modelo de embeddings: le mandas TEXTO y él
     lo convierte. Eso es lo que usaremos y por eso no necesitas OpenAI.

${c.bold}${c.green}Siguiente paso:${c.reset} crea tu cuenta en https://app.pinecone.io,
copia la API key al archivo .env y ejecuta:  ${c.yellow}npm run crear${c.reset}
`);

/** Barrita visual para leer los scores de un vistazo. */
function barra(score) {
  const ancho = 24;
  const llenos = Math.max(0, Math.round(score * ancho));
  const color = score > 0.8 ? c.green : score > 0.4 ? c.yellow : c.dim;
  return `${color}${'█'.repeat(llenos)}${c.dim}${'·'.repeat(ancho - llenos)}${c.reset}`;
}
