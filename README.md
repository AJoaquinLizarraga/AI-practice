# Cómo funciona una base de datos vectorial

Proyecto didáctico en Node.js. Cinco pasos, cada uno ejecutable por separado,
que van de la teoría (sin API key, sin internet) a un chat RAG completo con
un LLM corriendo en tu propia máquina.

```
        TUS TEXTOS                      TU PREGUNTA
            │                                │
     ① trocear (chunking)                    │
            │                                │
            ▼                                ▼
     ┌──────────────┐                 ┌──────────────┐
     │  embeddings  │◄────  mismo  ───►│  embeddings  │
     │   (modelo)   │      modelo      │   (modelo)   │
     └──────┬───────┘                 └──────┬───────┘
            │ [0.12, -0.44, ...]             │ [0.11, -0.41, ...]
            ▼                                ▼
     ┌────────────────────────────────────────────────┐
     │  PINECONE — busca los vectores más cercanos    │
     └────────────────────┬───────────────────────────┘
                          │ los 4 fragmentos relevantes
                          ▼
                 ┌─────────────────┐
                 │  OLLAMA (local) │  ──►  respuesta con fuentes
                 └─────────────────┘
```

---

## La idea en un párrafo

Una base de datos normal busca **coincidencias exactas**: `WHERE titulo LIKE '%vacaciones%'`.
Si el documento dice "días libres" y tú buscas "vacaciones", no encuentra nada.

Una base de datos vectorial busca **por significado**. Convierte cada texto en
una lista de ~1000 números (un *embedding*) que representa de qué habla ese
texto. Textos con significado parecido acaban con números parecidos, aunque no
compartan ni una palabra. Buscar = encontrar los números más cercanos.

---

## Instalación

```bash
npm install
cp .env.example .env      # y pega tu API key de Pinecone
```

**Pinecone** — cuenta gratis en [app.pinecone.io](https://app.pinecone.io) → *API Keys*.
El plan gratuito incluye el índice y **también el modelo de embeddings**, así que
no necesitas OpenAI ni ninguna otra API de pago.

**Ollama** — para el paso 4. Comprueba que tienes el modelo:

```bash
ollama pull gemma4:12b     # o cambia OLLAMA_MODEL en .env por el que uses
```

---

## Los 5 pasos

### Paso 0 · La teoría, sin API key

```bash
npm run teoria
```

Construye una base vectorial de juguete en JS puro. Verás:

- qué es un embedding, con vectores de solo 3 dimensiones que puedes leer a ojo
- la fórmula de la **similitud coseno** implementada y ejecutada
- una base vectorial completa (`upsert` + `query`) en 15 líneas
- por qué buscar "mascota" devuelve *perro*, *gato* y *hámster* aunque esa
  palabra no esté guardada en ninguna parte

No necesita internet ni cuenta. Empieza por aquí.

### Paso 1 · Crear el índice

```bash
npm run crear
```

Crea el índice en Pinecone con **integrated embedding**: Pinecone aloja el
modelo `multilingual-e5-large` y vectoriza el texto por ti.

```js
await pc.createIndexForModel({
  name: 'demo-rag',
  cloud: 'aws',
  region: 'us-east-1',
  embed: {
    model: 'multilingual-e5-large',
    fieldMap: { text: 'texto' },   // ← el campo que se convertirá en vector
  },
});
```

### Paso 2 · Trocear y cargar

```bash
npm run cargar
```

**Para indexar tus propios textos**, deja archivos `.txt` o `.md` en
[data/textos/](data/textos/) y ejecuta `npm run cargar`. Mientras esa carpeta
esté vacía se usan los documentos de ejemplo de
[data/documentos.js](data/documentos.js).

```
data/textos/
├── mis-apuntes.md          → categoría "general"
├── rrhh/vacaciones.md      → categoría "rrhh"   (la subcarpeta manda)
└── legal/privacidad.md     → categoría "legal"
```

El título sale del primer `# Encabezado` del archivo, o del nombre del archivo
si no lo hay. La categoría sirve para filtrar: `--categoria=legal`.
Detalles en [data/textos/LEEME.md](data/textos/LEEME.md).

Si borras o renombras archivos, reconstruye desde cero para que no queden
fragmentos huérfanos en el índice:

```bash
npm run cargar -- --limpiar
```

El script parte cada documento en fragmentos de ~700 caracteres y los sube.
**Se manda texto plano, no vectores** — Pinecone los genera al vuelo:

```js
await ns.upsertRecords([
  { _id: 'rrhh-vacaciones#0', texto: '...', titulo: '...', categoria: 'rrhh' },
]);
```

Todo lo que no sea el campo `texto` se guarda como **metadata**: sirve para
filtrar en la búsqueda y para citar la fuente en la respuesta.

> **Por qué trocear:** un embedding es *un* vector para *todo* el texto que le
> pases. Si metes 10 páginas en un solo vector, ese vector es el promedio de 10
> temas y no se parece bien a ninguna pregunta concreta.

### Paso 3 · Buscar

```bash
npm run buscar -- "cuántos días de vacaciones tengo"
npm run buscar -- "me han robado el portátil"
npm run buscar -- "reuniones" --categoria=procesos
npm run buscar -- "gastos de comida" --rerank
```

Cada búsqueda muestra **las dos cosas a la vez**: lo que habría devuelto un
`LIKE` de SQL y lo que devuelve la búsqueda vectorial, con su score de
similitud. La diferencia se ve mejor con preguntas cuyas palabras no aparecen
literalmente en los documentos.

| Flag | Qué hace |
|---|---|
| `--categoria=rrhh` | filtra por metadata antes de buscar |
| `--rerank` | reordena con un segundo modelo, más preciso que el coseno |
| `--topk=8` | cuántos resultados devolver |

### Paso 4 · RAG

```bash
npm run rag -- "cuánto me pagan por una semana de guardia"
```

Enseña las tres fases por separado y con el prompt real a la vista:

1. **Retrieval** — Pinecone devuelve los 4 fragmentos más relevantes
2. **Augmented** — se pegan dentro del prompt como contexto numerado
3. **Generation** — Ollama responde en local, citando `[1]`, `[2]`

### Y el chat

```bash
npm run chat
```

Lo mismo en bucle, en modo conversación. Es [main.js](main.js).

---

## Consultar desde Claude Code (servidor MCP)

[mcp/servidor.js](mcp/servidor.js) expone el índice como herramientas MCP, para
poder preguntar por tus documentos desde Claude Code, Cline o cualquier cliente
MCP — sin pasar por `npm run chat`.

| Herramienta | Qué hace |
|---|---|
| `buscar_documentos` | Búsqueda semántica, con filtro por categoría y reranking |
| `listar_documentos` | Qué hay indexado, qué categorías existen, cuántos vectores |
| `indexar_texto` | Añade un texto nuevo al índice sobre la marcha |

Ya está registrado en [.mcp.json](.mcp.json). Reinicia Claude Code y aprueba el
servidor cuando lo pida. Para otros clientes:

```bash
claude mcp add pinecone -- node /ruta/al/proyecto/mcp/servidor.js
```

La API key **no va en `.mcp.json`**: el servidor lee el `.env` por su cuenta
([src/cargarEnv.js](src/cargarEnv.js)), así que `.mcp.json` se puede commitear
sin filtrar nada.

> **La app de escritorio de Ollama no sirve para esto.** No es cliente MCP: sus
> herramientas están compiladas en el binario (`web_search` y `web_fetch`) y no
> admite añadir otras. Si quieres chat + modelo local + tus documentos, usa un
> cliente MCP con `ollama launch cline` o `ollama launch claude`, que apuntan
> esas herramientas a tus modelos locales.

---

## Un aviso sobre los scores

Con **reranking activado** (por defecto en el RAG y en el MCP), el `_score` que
devuelve Pinecone **ya no es la similitud coseno**: es la puntuación del
reranker, en una escala propia y mucho más baja. Solo sirve para ordenar los
resultados de esa misma búsqueda entre sí — no lo compares entre consultas ni
lo interpretes como "un 0.04 es un mal resultado".

Para ver el coseno de verdad, busca sin la bandera:

```bash
npm run buscar -- "tu pregunta"            # score = similitud coseno
npm run buscar -- "tu pregunta" --rerank   # score = relevancia del reranker
```

---

## Por qué la empresa del ejemplo es inventada

"Nébula Labs" no existe. Ningún LLM ha podido leer su manual durante el
entrenamiento, así que **si el modelo acierta las respuestas es porque la base
vectorial le pasó el fragmento correcto**, no porque se lo supiera. Es la forma
más limpia de demostrar que el sistema funciona.

Pregúntale algo que no esté en el manual —`npm run rag -- "política de mascotas"`—
y debería decir que no lo encuentra en vez de inventárselo. Esa es la otra mitad
del valor de RAG: acotar el modelo a una fuente conocida.

---

## Usar tus propios textos

**La forma fácil:** deja archivos `.txt` o `.md` en [data/textos/](data/textos/)
y ejecuta `npm run cargar`. Las subcarpetas se convierten en categorías.

Para PDF o Word, conviértelos antes a texto plano:

```bash
pdftotext documento.pdf data/textos/documento.txt          # brew install poppler
textutil -convert txt -output data/textos/doc.txt doc.docx # macOS, ya instalado
```

**La forma programática:** edita el array de
[data/documentos.js](data/documentos.js) (se usa solo si `data/textos/` está
vacía). Cada documento necesita `id`, `titulo`, `categoria` y `texto`.

En ambos casos el `_id` de cada fragmento es determinista (`mi-doc#0`,
`mi-doc#1`…), así que recargar **sobrescribe** en lugar de duplicar. Si borras
o renombras archivos, usa `npm run cargar -- --limpiar` para reconstruir.

---

## Los conceptos, en una tabla

| Concepto | Qué es |
|---|---|
| **Embedding** | Un texto convertido en ~1000 números que representan su significado |
| **Dimensión** | Cada uno de esos números. `multilingual-e5-large` usa 1024 |
| **Similitud coseno** | El ángulo entre dos vectores. 1 = mismo significado, 0 = nada que ver |
| **Índice** | El contenedor de vectores. Equivale a una tabla |
| **Namespace** | Una partición lógica dentro del índice. Ideal para separar clientes o versiones |
| **Upsert** | Insertar o actualizar. Si el `_id` ya existe, se sobrescribe |
| **Metadata** | Campos normales junto al vector, para filtrar y para citar |
| **Chunking** | Partir documentos largos en fragmentos antes de vectorizar |
| **top-K** | Cuántos vecinos más cercanos devolver |
| **ANN** | *Approximate Nearest Neighbor*: el truco que evita comparar contra todos |
| **Reranking** | Un segundo modelo que reordena los candidatos con más criterio |
| **RAG** | Buscar contexto y metérselo al LLM en el prompt |

---

## Estructura

```
main.js                     chat RAG interactivo (el producto final)
mcp/servidor.js             servidor MCP: Pinecone como herramienta para Claude Code
.mcp.json                   registro del servidor MCP (sin secretos)
data/textos/                ← deja aquí tus .txt y .md
data/documentos.js          base de conocimiento de ejemplo (si data/textos/ está vacía)
src/config.js               cliente de Pinecone y variables de entorno
src/cargarDocumentos.js     lee data/textos/ o cae al ejemplo
src/chunking.js             partir documentos en fragmentos
src/rag.js                  retrieval + construcción del prompt
src/ollama.js               cliente HTTP para el LLM local
scripts/0-teoria.js         base vectorial de juguete, sin API key
scripts/1-crear-indice.js   createIndexForModel
scripts/2-cargar-datos.js   chunking + upsertRecords
scripts/3-buscar.js         searchRecords, filtros y rerank
scripts/4-rag.js            las 3 fases de RAG, explicadas
scripts/9-borrar-indice.js  limpieza
```
