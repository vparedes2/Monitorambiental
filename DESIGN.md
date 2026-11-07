# Sistema visual · Monitor ambiental Vaca Muerta

Mundo: **sala de telemetría**. Pantallas de trabajo (modo Operate): precisión y calma, la marca vive en los detalles.

## Color: dos temas propios (tokens en `src/index.css`)
La consola sigue al tema del teléfono (`auto`) y se puede cambiar a mano (riel lateral o menú del mapa). **Las ventanas de mapa son siempre Lutita** (`.tema-noche`): las capas de datos están pensadas sobre imagen satelital.

| Token | Lutita (noche) | Carta de campo (día) | Rol |
| --- | --- | --- | --- |
| noche | #12100E | #F1ECE2 | Fondo |
| panel | #1C1915 | #FBF8F2 | Consola |
| linea | #3A332B | #D6CCBB | Bordes |
| hielo | #E6C27A arena | #8C5A12 ocre | Acción principal, selección, foco |
| llama | #FF7A33 | #B8430F | Calor, focos, alertas |
| lutita | #A9B79C jarilla | #4F6146 | Secundario |
| texto / tenue | #EEE7DB / #A89C8C | #1E1A15 / #665B4F | Texto |
| agua | #7FCBD6 | #1E6A78 | Solo datos de agua y satélites ópticos |

Fondos: estratos horizontales irregulares (laminación de la lutita) de noche; curvas de nivel sobre papel de día (`public/curvas-nivel.svg`). El cian queda reservado a datos, nunca como color de marca.

Estados del cruce con el registro provincial (sobre el mapa): verde #7BD88F vigente, ámbar #FFC857 permiso vencido, naranja #FF8A3D sin permiso registrado, rojo #FF4D6D lejos de instalaciones, gris #8BA0B6 fuera de Neuquén. En la consola de día se usan `ok` y `aviso`, más oscuros.

## Tipografía (autoalojada con @fontsource)
- Saira Condensed 500/600: títulos (`.titulo`).
- IBM Plex Sans 400–700: interfaz y texto.
- IBM Plex Mono 400/500: solo datos, coordenadas y cifras (`.num`, números tabulares). Nunca como disfraz "técnico" en botones o etiquetas.

## Movimiento
- Curvas: `--ease-out` cubic-bezier(.23,1,.32,1) para entradas y respuestas; `--ease-in-out` cubic-bezier(.77,0,.175,1) para recorridos. Nunca `ease-in`.
- Duraciones: presión 120 ms, hover 160 ms, paneles 220 ms. Todo lo de uso frecuente por debajo de 300 ms.
- Presión: todo botón o enlace escala a 0.97 al presionar (excepto marcadores del mapa).
- Cambio de pantalla: el contenido aparece en 180 ms sin esperar a la salida; una línea de barrido recorre el borde superior (firma de la sala).
- Momento de autor: el vuelo de la Tierra a la cuenca en Inicio (solo una vez por visita).
- Hover con transformaciones solo con puntero fino. Con movimiento reducido: sin desplazamientos, se mantienen los cambios de color y opacidad.

## Firma
- Paneles `.instrumento` con esquinas de registro en el color de acento.
- Lectura de coordenadas bajo el cursor en todos los mapas (clic para copiar `lat, lon`).
- Selección de texto en llama, scrollbars finas en línea, foco con anillo hielo que se asienta.

## Prohibido
Rótulos encima de los títulos, texto con degradado, emojis como íconos, mayúsculas forzadas en etiquetas, halos de color como sombra, tipografías del sistema como voz de títulos.
