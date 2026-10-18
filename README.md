# H6 Live Pass: demo para el reto GED Sports

Prototipo web, sin backend, para seguir un Hyatlón H6 como espectador. Todo está en `web/`:

| Archivo | Para qué |
|---|---|
| `web/presentar.html` | Vista para el PC o el proyector (en Vercel: `/presentar`): escenarios de la historia, reloj de la carrera, el móvil incrustado y el QR |
| `web/index.html` | La app del espectador (móvil): Seguir, Clasificación, Tandas y Guía. Sale por defecto en `/`; `m.html` redirige aquí para los QR antiguos |
| `web/js/data.js` | Motor de simulación: categorías, tandas, chips y clasificaciones |
| `web/js/scenarios.js` | Los 8 momentos de la historia de la demo |
| `investigacion/RESUMEN.md` | Qué es real (fuente oficial), qué es supuesto y qué se ha descartado |

## Cómo funciona sin servidor
La carrera se calcula a partir de una **hora simulada**. El QR lleva esa hora y el reloj del PC, así que cada móvil que lo escanea ve **la misma carrera, sincronizada**, sin backend.

## Presentar (3 minutos)
Pulsa **▶ Presentar** (o la tecla `P`) en la vista de PC:

1. **El problema**: pantalla fija. Pasa a la siguiente con `→`.
2. **Demo guiada** (unos 115 s): 8 pasos automáticos, con subtítulos y resaltado en el móvil. El último muestra la foto para redes y el sticker. Para usar una foto real, elígela antes en «Foto del paso 8»: se guarda solo en el navegador de ese portátil y no se sube a ningún sitio. `espacio` la pausa, `←` y `→` mueven entre pasos.
3. **¿Es viable?**: datos, recursos y coste (cifras estimadas) y la prueba piloto.
4. **Resumen** con el QR para que el jurado lo pruebe.

`Esc` sale del modo Presentar.

## Exploración libre
- Abre `presentar.html` en el PC (en Vercel, `/presentar`).
  - `←` y `→` pasan de un escenario a otro.
  - `espacio` pausa el reloj.
  - Los botones ×10 y ×60 aceleran la carrera.
  - `F` pone la pantalla completa y `R` abre el resumen final, con el QR.
- El jurado escanea el QR y explora la app en su móvil.
- Quien abre la app desde el QR va sincronizado con el PC y no ve el botón Demo. Si abres la app directamente, el botón **⚙︎ Demo** (también al final de la Guía) permite mover el reloj o saltar a un escenario.

## Publicar en Vercel
Como sitio estático, con la carpeta `web` como raíz:

```bash
npx vercel deploy web --prod
```

Otra opción es arrastrar la carpeta `web` a https://app.netlify.com/drop.

## Probar en el móvil con la wifi local
```bash
python -m http.server 5173 --bind 0.0.0.0 --directory web
```

Después abre `http://<IP-del-PC>:5173/` y escribe esa misma URL en «¿El QR apunta a localhost?».
