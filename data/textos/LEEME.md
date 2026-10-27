# Deja aquí tus textos

Cualquier archivo `.txt` o `.md` que pongas en esta carpeta se indexará
automáticamente al ejecutar `npm run cargar`.

**Mientras esta carpeta solo tenga este LEEME**, el proyecto usa el ejemplo de
`data/documentos.js` (el manual de la empresa ficticia Nébula Labs). En cuanto
añadas un archivo tuyo, pasa a usar los tuyos y deja de usar el ejemplo.

## Convención

```
data/textos/
├── mis-apuntes.md            → categoría "general"
├── rrhh/
│   ├── vacaciones.md         → categoría "rrhh"
│   └── contratos.txt         → categoría "rrhh"
└── legal/
    └── privacidad.md         → categoría "legal"
```

- **La subcarpeta define la categoría.** Sirve para filtrar en las búsquedas:
  `npm run buscar -- "una pregunta" --categoria=legal`
- **El título** sale del primer `# Encabezado` del archivo. Si no hay ninguno,
  se usa el nombre del archivo.
- **Separa los párrafos con una línea en blanco.** El troceado corta por
  párrafos, así que un archivo sin líneas en blanco se parte peor.

## Al recargar

Los identificadores se derivan de la ruta del archivo, así que volver a
ejecutar `npm run cargar` **sobrescribe** en lugar de duplicar.

Si borras o renombras archivos, o si un documento pasa a tener menos
fragmentos que antes, quedan restos antiguos en el índice. Para evitarlo:

```bash
npm run cargar -- --limpiar     # borra el namespace y lo reconstruye
```

## Formatos

Solo texto plano y markdown. Para PDF o Word, conviértelos antes:

```bash
# macOS, con textutil (ya instalado)
textutil -convert txt -output data/textos/documento.txt documento.docx

# PDF: con pdftotext (brew install poppler)
pdftotext documento.pdf data/textos/documento.txt
```
