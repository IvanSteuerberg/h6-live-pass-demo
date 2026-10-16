# H6 Live Pass: demo para el reto GED Sports

Prototipo web, sin backend, para seguir un Hyatlón H6 como espectador. Todo está en `web/`:

| Archivo | Para qué |
|---|---|
| `web/index.html` | Vista para el PC o el proyector: escenarios de la historia, reloj de la carrera, el móvil incrustado y el QR |
| `web/m.html` | La app del espectador (móvil): Seguir, Clasificación, Tandas y Guía |
| `web/js/data.js` | Motor de simulación: categorías, tandas, chips y clasificaciones |
| `web/js/scenarios.js` | Los 8 momentos de la historia de la demo |
| `investigacion/RESUMEN.md` | Qué es real (fuente oficial), qué es supuesto y qué se ha descartado |

## Cómo funciona sin servidor
La carrera se calcula a partir de una **hora simulada**. El QR lleva esa hora y el reloj del PC, así que cada móvil que lo escanea ve **la misma carrera, sincronizada**, sin backend.

## Presentar
- Abre `index.html` en el PC.
  - `←` y `→` pasan de un escenario a otro.
  - `espacio` pausa el reloj.
  - Los botones ×10 y ×60 aceleran la carrera.
- El jurado escanea el QR y explora la app en su móvil.
- En el móvil, el botón **⚙︎ Demo** permite mover el reloj o saltar a un escenario.

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
