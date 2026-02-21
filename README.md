# Touch-Pad

Pequeño servidor para controlar el PC desde un móvil usando un touchpad web.

Contenido
- `server.py` — servidor Flask + Flask-SocketIO que recibe eventos de la interfaz
- `static/index.html` — interfaz web (touchpad + controles)
- `static/client.js` — cliente JavaScript que envía eventos Socket.IO

Requisitos
- Python 3.10/3.11 recomendado (funciona en 3.14 con un shim, ver más abajo)
- Dependencias en `requirements.txt` (usa un virtualenv):
```powershell
python -m venv .venv
. .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Cómo ejecutar
1. Activar el entorno virtual.
2. Ejecutar:
```powershell
python server.py
```
3. Abrir en el móvil la URL mostrada en la consola. No uses `localhost`; usa la IP del PC en la misma red Wi‑Fi:
```
http://<IP_DEL_PC>:<PUERTO>
```

Cambios recientes y notas de depuración
- Interfaz responsive: `static/index.html` ahora usa `flex-wrap` y reglas en `@media` para que los botones y el control de sensibilidad se muestren en pantallas pequeñas.
- Ruta del cliente: la referencia a `client.js` se corrigió para servirse desde `/static/client.js` evitando 404.
- Logs en servidor: agregados handlers para `connect` / `disconnect` y un `@socketio.on_error_default` para registrar excepciones de socket.
- Compatibilidad con Python 3.14: algunos entornos muestran que `pkgutil.get_loader` ya no existe; añadimos un shim en `server.py` que proporciona un `get_loader` sencillo y robusto (captura excepciones como `ValueError` para `__main__`). Esto evita fallos de import en versiones nuevas de Python.
- Nota sobre Flask / Flask-SocketIO: hay una incompatibilidad conocida con Flask >= 2.3 y versiones antiguas de Flask-SocketIO / engineio. Si ves el error "property 'session' of 'RequestContext' object has no setter", la solución rápida y estable es fijar Flask a la versión 2.2.5:
```powershell
pip install --upgrade pip
pip install "Flask==2.2.5"
```
O alternativamente usar Python 3.11/3.10.

Consejos de depuración
- Si la página muestra "Desconectado":
  - Comprueba la consola del servidor — deberías ver `Client connected: sid=...` cuando un cliente se conecta.
  - Abre DevTools en el navegador del móvil (o usa modo dispositivo en escritorio) y revisa Console y Network para errores.
  - Asegúrate de abrir la URL con la IP del PC y el puerto correcto (imprimido por `server.py`).
  - Si conectas desde la red móvil, asegúrate de que el firewall de Windows permite el puerto; prueba temporalmente desde el mismo PC con `http://127.0.0.1:<PUERTO>` para verificar que el servidor responde.

Notas y próximos pasos
- `eventlet` muestra un DeprecationWarning; funciona pero está en mantenimiento de solo correcciones. Para proyectos nuevos considera migrar a soluciones basadas en asyncio/ASGI.
- Si quieres, puedo:
  - Fijar `Flask==2.2.5` en `requirements.txt` y actualizar el entorno virtual.
  - Añadir instrucciones para permitir el puerto en el firewall de Windows.

Si detectas nuevos errores, pega la salida de la consola del servidor y de la consola del navegador y lo reviso.
