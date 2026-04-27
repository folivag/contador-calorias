# Contador de Calorías

App web (PWA) para registrar alimentos habituales y llevar un diario de calorías y macronutrientes.

## Funciones

- **📷 Escaneo de código de barras** con la cámara → busca en [Open Food Facts](https://world.openfoodfacts.org) (sin API key, gratis).
- **🔍 Búsqueda online por nombre** en Open Food Facts.
- **✨ Cálculo de macros con IA** (Claude API) para alimentos sin código.
- **⚡ Escanear y agregar directo al diario**: cámara → producto → cantidad → listo.
- **📊 Calculador automático de objetivos** (Mifflin-St Jeor + TDEE) según sexo, edad, peso, altura, actividad y meta.
- **🔔 Recordatorios diarios** para registrar comidas (in-app + notificaciones del sistema).
- **PWA instalable** en Android e iOS desde el navegador.
- **APK nativo** vía Capacitor con notificaciones locales reales.
- **Funciona offline** (excepto APIs externas).

---

## 1. Probar rápido

Abre `index.html` en el navegador. Funciona casi todo, **excepto la cámara** (los navegadores bloquean `getUserMedia` en `file://`).

## 2. Servir localmente (recomendado)

Necesitas Node.js. En la carpeta del proyecto:

```bash
npx serve -p 3000 .
```

Abre `http://localhost:3000`. La cámara, el service worker y la instalación PWA funcionan en `localhost`.

Para usar desde el celular en la misma wifi: `npx ngrok http 3000` te da una URL HTTPS pública temporal.

---

## 3. Instalar como app en el celular (PWA)

### Android (Chrome / Edge)

1. Abre la URL en Chrome.
2. Banner **"Instalar app"** o menú ⋮ → **"Instalar app"**.
3. Confirma. Queda como cualquier app del cajón.

### iPhone (Safari)

1. Abre la URL en Safari (solo Safari instala PWAs en iOS).
2. Botón **Compartir** → **"Agregar a pantalla de inicio"**.

### Permisos

- **Cámara**: el navegador la pide al primer escaneo.
- **Notificaciones**: para recordatorios diarios. Las puedes activar en ⚙ → "Recordatorios" → "Solicitar permiso".

---

## 4. Calculador de objetivos

En ⚙ → **"Calcular automáticamente según mi cuerpo"**:

1. Ingresa sexo, edad, peso, altura.
2. Elige nivel de actividad (sedentario → muy activo).
3. Elige meta (déficit -25/-15%, mantener, surplus +10/+20%).
4. Ajusta la proteína por kg (1.6–2.2 g/kg).
5. **Calcular** muestra BMR, TDEE y macros.
6. **Aplicar** los guarda como tus objetivos diarios.

Fórmula: **Mifflin-St Jeor** (la más precisa para población general). Las grasas se fijan en mínimo 25% de las calorías o 0.8 g/kg, lo que sea mayor; los carbos cubren el resto.

---

## 5. Recordatorios

En ⚙ → **"Recordatorios"**:

1. Activa la casilla.
2. Define la hora (default: 21:00).
3. Solicita permiso de notificaciones.
4. Guarda.

**En el navegador / PWA**:
- Si tienes la app abierta a esa hora y no has registrado nada → notificación del sistema.
- Si abres la app después de la hora sin haber registrado nada → banner amarillo en "Hoy".

**En la APK con Capacitor**:
- Notificación del sistema **real**, programada nativamente, funciona aunque la app esté cerrada.

---

## 6. Compilar como APK nativo (Capacitor)

### Requisitos

- Node.js v18+
- Android Studio + SDK
- Java JDK 17+

### Pasos

```bash
npm install                    # instala Capacitor + plugin de notificaciones
npx cap add android            # crea /android con el proyecto nativo
npx cap sync android           # sincroniza archivos web + plugins
npx cap open android           # abre Android Studio
```

En Android Studio: **Build → Build APK(s)**. APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

Para el splash screen y los iconos adaptativos, primero genera los PNG (paso 7), luego:

```bash
npx @capacitor/assets generate --android --iconBackgroundColor '#0f172a' --splashBackgroundColor '#0f172a'
```

Tras cualquier cambio en archivos web: `npx cap sync android`.

---

## 7. Generar iconos PNG (para Android adaptive icon)

El `icon.svg` ya funciona para PWA en navegadores modernos. Para Capacitor / Android adaptive icons necesitas PNGs.

```bash
npx serve -p 3001 .
```

Abre `http://localhost:3001/tools/generate-icons.html`:

1. Click **"Generar y previsualizar"**.
2. Click **"Descargar todos"** (12 PNGs: 48 → 1024, incluyendo maskables).
3. Mueve los PNGs descargados desde tu carpeta de Descargas → `icons/`.
4. Si vas a usar Capacitor: copia `icon-1024.png` a la raíz como `icon.png` para que `@capacitor/assets generate` lo use como source.

---

## 8. IA opcional (macros por nombre)

Para alimentos sin código de barras (preparaciones caseras, etc.):

1. Saca una API key en [console.anthropic.com](https://console.anthropic.com).
2. ⚙ → pega en **API Key**.
3. Al crear un alimento, ingresa nombre + porción → **✨ Calcular macros con IA**.

Modelo: `claude-haiku-4-5-20251001`.

---

## 9. Estructura

```
contador-calorias/
├── index.html              # SPA + modales
├── styles.css              # tema oscuro responsive
├── app.js                  # storage, scan, OFF, IA, calc, notif, render
├── manifest.json           # PWA manifest
├── sw.js                   # service worker (offline)
├── icon.svg                # icono base (vectorial)
├── icons/                  # PNGs generados (vacío hasta usar la tool)
├── tools/
│   └── generate-icons.html # generador de PNGs desde SVG
├── package.json            # Capacitor + plugins
├── capacitor.config.json   # config Android
└── README.md
```

---

## 10. APIs externas

| Servicio | Uso | API key |
|---|---|---|
| [Open Food Facts](https://world.openfoodfacts.org) | Datos por código de barras + búsqueda | ❌ |
| [@zxing/library](https://github.com/zxing-js/library) (CDN) | Lector de códigos | ❌ |
| [Anthropic API](https://docs.anthropic.com) | Macros para alimentos sin código | ✅ Opcional |

---

## 11. Limitaciones

- **localStorage ~5 MB**: con fotos comprimidas a 600 px JPEG q=0.78, ~60–80 alimentos. Si crece más, conviene migrar a IndexedDB.
- **Notificaciones programadas en navegador**: solo funcionan mientras la app esté abierta. Para que funcionen con la app cerrada, usa la APK con Capacitor (que sí tiene notificaciones nativas reales).
- **iOS < 16.4**: PWAs con cámara tienen menos soporte. Para esos casos, mejor Capacitor.
