# 🌐 Guía de Despliegue en la Nube 24/7 (Sin depender de tu PC encendida)

Para que la web de inventarios cíclicos y el Excel funcionen **los 365 días del año de forma remota**, incluso cuando tu computadora personal esté apagada o desconectada, la aplicación está lista para subirse a la nube en menos de 3 minutos de forma gratuita.

---

## 🚀 Opción 1: Despliegue Gratuito en Render.com (Recomendado)

**Render** te ofrece hosting web gratuito con conexión HTTPS segura (ej: `https://mi-inventario.onrender.com`).

### Pasos:
1. **Crear cuenta gratuita**: Ingresa a [https://render.com](https://render.com) y regístrate con tu correo o GitHub.
2. **Subir proyecto**:
   - Puedes subir esta carpeta a un repositorio privado en GitHub (ej: `inventario-ciclico`).
   - O en Render, haz clic en **"New +"** -> **"Web Service"** y conecta tu repositorio.
3. **Configuración automática**:
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
4. **¡Listo!**: En 1 minuto tendrás una URL pública y segura activa 24/7. Todos los auxiliares y encargados de los 13 centros podrán acceder desde sus celulares o tablets desde cualquier lugar.

---

## ⚡ Opción 2: Despliegue en Railway.app / Fly.io

1. Crea cuenta en [Railway.app](https://railway.app).
2. Selecciona **"Deploy from GitHub repo"**.
3. Railway detectará el `Dockerfile` y levantará el servicio en la nube en segundos.

---

## 📥 Descarga y Sincronización Remota de Excel

- Desde cualquier dispositivo remoto, los supervisores pueden hacer clic en **"Descargar Excel"** en la barra superior para obtener la última versión actualizada del archivo `.xlsx` con todas las 13 pestañas de centros y la hoja de auditoría de conteos.
