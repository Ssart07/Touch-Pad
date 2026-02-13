# PC ↔ Móvil — Bridge (MVP)

Pequeño proyecto para controlar un PC Windows desde un móvil Android mediante una página web y WebSockets.

Características MVP:
- Touchpad (mover y click)
- Scroll
- Botones de volumen (subir/bajar/mute)

Requisitos:
- Python 3.9+
- Windows (para control de volumen con API nativa)

Instalación y ejecución (PowerShell):

```powershell
python -m pip install -r requirements.txt
python server.py
```

Abrir en el móvil: `http://<IP_DEL_PC>:5000/` y conectar.

Notas:
- Inicialmente funciona en la misma red LAN.
- Para control nativo del teléfono en sentido inverso haremos una app nativa más adelante.
