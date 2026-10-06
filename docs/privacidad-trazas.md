# Privacidad de trazas y logs (Edge Function `analyze`)

A Gemini siempre se le envía el prompt real, sin redactar: lo necesita para
analizar. Lo que se controla es qué queda guardado **fuera** de esa llamada:
en Langfuse (trazas) y en los logs de Supabase.

## Qué se envía a Langfuse

Lo decide el secreto `TRACE_CONTENT`. Si falta o trae un valor desconocido,
se usa `redacted`. El modo usado viaja siempre en la metadata `contenido`.

| Modo | Entrada (prompt) | Salida (respuesta) | Metadatos |
|---|---|---|---|
| `redacted` (por defecto) | El mismo prompt, armado con el payload redactado | Redactada con `redactText` | Sí |
| `full` | El prompt real | La respuesta real | Sí |
| `off` | No se envía | No se envía | Sí |

Metadatos: tipo, tono, modelo, parámetros, intentos, status HTTP,
finishReason, tokens, duración y, si falló, el motivo.

Redacción en modo `redacted` (`supabase/functions/_shared/redact.ts`):

- Nombres de deudas → `Deuda 1`, `Deuda 2`… en orden, en todo el payload y en
  la respuesta. Montos, tasas y demás números no se tocan.
- Textos libres (propósito, comentario del día, comentarios de la semana,
  metas y avances, ideas, propuestas, análisis anteriores) →
  `[texto personal: N caracteres]`.
- Cualquier otro texto (hábitos, tareas, categorías…): correos → `[correo]`,
  teléfonos → `[teléfono]`, URLs → `[url]`, 9 o más dígitos seguidos →
  `[número]`.

## Límites conocidos de `redacted`

- La respuesta del modelo puede **parafrasear** textos que en la entrada salen
  enmascarados (propósito, comentarios, metas, ideas). Las máscaras de la
  salida solo atrapan correos, teléfonos, URLs, números largos y nombres de
  deudas, no ideas contadas con otras palabras.
- El tipo `resumen` no recibe `dinero`, así que **no tiene mapa de
  seudónimos**: si un análisis anterior nombraba una deuda, la salida del
  resumen puede nombrarla con su nombre real.

Para privacidad estricta, el modo es `off`.

## Qué nunca se escribe en los logs de Supabase

Ni el cuerpo de la petición, ni el prompt, ni la respuesta de Gemini (cruda o
final), ni el cuerpo de un error de Gemini o de un rechazo de Langfuse. Solo
metadatos: tipo, modelo, status, finishReason, intentos, tokens y
milisegundos (y, en un fallo de red, el nombre del error).

## Secretos

Viven en los secretos del proyecto de Supabase, nunca en el repositorio ni en
un `.env` versionado:

```sh
supabase secrets set GEMINI_API_KEY=...
supabase secrets set LANGFUSE_PUBLIC_KEY=pk-lf-...
supabase secrets set LANGFUSE_SECRET_KEY=sk-lf-...
supabase secrets set LANGFUSE_BASE_URL=https://us.cloud.langfuse.com
supabase secrets set TRACE_CONTENT=redacted   # opcional: redacted | full | off
```

Si falta cualquiera de los tres de Langfuse, no se traza y la función sigue
igual. Los logs nombran qué secreto falta, nunca su valor. Las llaves solo se
usan en las cabeceras de las llamadas (`x-goog-api-key` y `Authorization`).
