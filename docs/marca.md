# Marca Eos — archivos y dónde va cada uno

> **Versión 2.** El hueco de la `o` se cerró en el logotipo y en el ícono. Reemplaza los once archivos de la versión anterior; los nombres son los mismos.

## Logotipo (la palabra)

| Archivo | Cuándo se usa |
|---|---|
| `eos-logotipo.svg` | Versión principal. Sobre fondo claro. |
| `eos-logotipo-fondo-oscuro.svg` | Misma marca, tonos un punto más claros. Sobre superficies oscuras. |
| `eos-logotipo-mono.svg` | Una sola tinta. Hereda el color del texto con `currentColor`. Para sellos, una tinta o fondos difíciles. |

Los tres van en `src/assets/`. Se importan como componente o con `<img>`.

**Tamaño mínimo: 120 px de ancho.** Por debajo, las contraformas de la `s` empiezan a cerrarse.

**Contraste.** Los tonos son cristalinos a propósito, así que sobre el fondo casi blanco de la app tienen poco contraste. Úsalo grande, o sobre una superficie más oscura. No lo pongas pequeño sobre blanco.

## Ícono de la app

| Archivo | Dónde |
|---|---|
| `eos-icono.svg` | Maestro vectorial, esquinas redondeadas. |
| `eos-icono-512.png` | `public/` — manifiesto, 512×512 |
| `eos-icono-192.png` | `public/` — manifiesto, 192×192 |
| `eos-apple-touch-icon-180.png` | `public/` — iOS, 180×180 |
| `eos-icono-maskable.svg` / `eos-icono-maskable-512.png` | Versión recortable de Android. Fondo a sangre y marca más pequeña, para que sobreviva al recorte en círculo del launcher. |

## Notificaciones

`eos-notificacion.svg` y `eos-notificacion-96.png`. Silueta blanca sobre transparente.

Android aplasta el ícono de notificación a un solo color usando el canal alfa. Si le pasas el ícono a color, se ve como un cuadro gris. Este archivo es el que hay que declarar en la notificación push.

## Fragmento del manifiesto

```json
"name": "Eos",
"short_name": "Eos",
"icons": [
  { "src": "/eos-icono-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
  { "src": "/eos-icono-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
  { "src": "/eos-icono-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
]
```

Y en el `index.html`:

```html
<link rel="apple-touch-icon" href="/eos-apple-touch-icon-180.png">
```

## Colores de la marca

Arcos del logotipo, degradado radial desde el hueco hacia afuera:
`#FFE08A` → `#FFA45C` → `#FF6FA5` → `#A98BFF` → `#5BD3E8`

Arcos del ícono, versión reforzada:
`#F7A83C` → `#F2617E` → `#D64BC4` → `#7B5AF0` → `#2DB8D9`

Letras: la `e` de `#F49BC8` a `#A78BF0`, la `s` de `#5EC8E5` a `#4FD1B5`.

Horizonte: `#FF8F5C` a la izquierda y `#FF7FA8` a la derecha, cada uno desvaneciéndose hacia la transparencia en el extremo exterior.

Fondo cristalino: base `#F4FBFF`, con manchas difuminadas de `#BFF0E8`, `#DDD3FB`, `#D3F5DE` y `#FBD3E6`, y blanco en el centro.

## Pendiente antes de tocar la paleta de la app

El violeta de la marca y el violeta que hoy significa "esto lo toca la IA" en la app son el mismo color con dos significados distintos. Hay que decidir cuál cede antes de fijar los tokens.

## Geometría, por si hay que redibujar

Todo sale de una sola construcción: radio del arco `r`, separación entre los dos arcos `0,7 r`, grosor del trazo `r/2`, remates redondos, e inclinación de 8 grados hacia adelante. El logotipo usa `r = 14`. El ícono escala esa misma razón.

El radio del degradado de los arcos va atado a la separación: si se cambia el hueco, hay que reescalar el degradado o los arcos pierden el violeta y el azul del extremo.
