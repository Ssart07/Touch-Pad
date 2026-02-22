import eventlet
# eventlet must patch sockets and threads before other imports that
# may use networking or threading. Do this early.
eventlet.monkey_patch()

# Compatibility shim: in newer Python versions `pkgutil.get_loader` may be
# missing; provide a thin wrapper that returns the loader from importlib.
# This avoids older libraries (like some Flask versions) that call
# `pkgutil.get_loader(...)` directly.
import pkgutil
import importlib.util
if not hasattr(pkgutil, 'get_loader'):
    def _compat_get_loader(name):
        # importlib.util.find_spec can raise ValueError for __main__ in
        # certain execution contexts; guard against that and return None
        # when the loader cannot be determined.
        try:
            if name == '__main__':
                return None
            spec = importlib.util.find_spec(name)
            return getattr(spec, 'loader', None) if spec is not None else None
        except Exception:
            return None
    pkgutil.get_loader = _compat_get_loader

import logging
from flask import Flask, send_from_directory, request, jsonify
from flask_socketio import SocketIO
import pyautogui
import ctypes
import socket
import random
import time
try:
    import pyperclip
except Exception:
    pyperclip = None

pyautogui.FAILSAFE = False

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s: %(message)s')

app = Flask(__name__, static_folder='static')
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')

# pairing state: simple in-memory structures
pair_codes = {}  # code -> expiry
paired_sids = set()

def generate_pair_code():
    code = '%06d' % random.randint(0, 999999)
    pair_codes[code] = time.time() + 60*10  # valid 10 minutes
    return code

@app.route('/pair')
def pair_page():
    # generate a code and return a small page with a QR linking to the index with ?pair=CODE
    code = generate_pair_code()
    from urllib.parse import quote_plus
    target = request.host_url.rstrip('/') + '/?pair=' + code
    qr_url = 'https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=' + quote_plus(target)
    html = f"""
    <html><body style='font-family:system-ui;padding:20px'>
    <h2>Emparejar dispositivo</h2>
    <p>Escanea este QR con el móvil o abre: <b>{target}</b></p>
    <img src='{qr_url}' alt='QR'>
    <p>Código: <b>{code}</b> (válido 10 minutos)</p>
    </body></html>
    """
    return html

@socketio.on('connect')
def handle_connect():
    try:
        logging.info(f"Client connected: sid={request.sid} addr={request.remote_addr} args={dict(request.args)}")
        # allow pairing via query parameter on connect
        code = request.args.get('pair')
        if code:
            logging.info(f"Pair code on connect: {code}")
            expiry = pair_codes.get(code)
            if expiry and expiry > time.time():
                paired_sids.add(request.sid)
                logging.info(f"Paired sid={request.sid} via connect param code={code}")
                socketio.emit('paired', room=request.sid)
            else:
                logging.info(f"Pair code invalid/expired on connect: {code}")
    except Exception:
        logging.info("Client connected (no request info)")

@socketio.on('disconnect')
def handle_disconnect():
    logging.info("Client disconnected")

@socketio.on('move')
def on_move(data):
    try:
        dx = float(data.get('dx', 0))
        dy = float(data.get('dy', 0))
        #logging.info(f"Received move dx={dx} dy={dy}")
        pyautogui.moveRel(dx, dy)
    except Exception as e:
        logging.exception('move error')


@socketio.on('click')
def on_click(data):
    button = data.get('button', 'left')
    try:
        logging.info(f"Received click button={button}")
        if data.get('action') == 'down':
            pyautogui.mouseDown(button=button)
        elif data.get('action') == 'up':
            pyautogui.mouseUp(button=button)
        elif data.get('action') == 'double':
            pyautogui.doubleClick(button=button)
        else:
            pyautogui.click(button=button)
    except Exception as e:
        logging.exception('click error')


@socketio.on('scroll')
def on_scroll(data):
    try:
        dy = int(data.get('dy', 0))
        pyautogui.scroll(dy)
    except Exception as e:
        logging.exception('scroll error')


# Volume via Windows keybd_event
def key_event(hexKey):
    user32 = ctypes.windll.user32
    KEYEVENTF_EXTENDEDKEY = 0x0001
    KEYEVENTF_KEYUP = 0x0002
    user32.keybd_event(hexKey, 0, KEYEVENTF_EXTENDEDKEY, 0)
    user32.keybd_event(hexKey, 0, KEYEVENTF_EXTENDEDKEY | KEYEVENTF_KEYUP, 0)


VK_VOLUME_MUTE = 0xAD
VK_VOLUME_UP = 0xAF
VK_VOLUME_DOWN = 0xAE


@socketio.on('volume')
def on_volume(data):
    action = data.get('action')
    try:
        logging.info(f"Received volume action={action}")
        if action == 'up':
            key_event(VK_VOLUME_UP)
        elif action == 'down':
            key_event(VK_VOLUME_DOWN)
        elif action == 'mute':
            key_event(VK_VOLUME_MUTE)
    except Exception as e:
        logging.exception('volume error')


@socketio.on('drag_start')
def on_drag_start(data):
    button = data.get('button', 'left')
    try:
        logging.info(f"Received drag_start button={button}")
        pyautogui.mouseDown(button=button)
    except Exception:
        logging.exception('drag_start error')


@socketio.on('drag_end')
def on_drag_end(data):
    button = data.get('button', 'left')
    try:
        logging.info(f"Received drag_end button={button}")
        pyautogui.mouseUp(button=button)
    except Exception:
        logging.exception('drag_end error')



@socketio.on_error_default
def default_error_handler(e):
    logging.exception('socketio error')


# pairing socket event
@socketio.on('pair')
def on_pair(data):
    code = (data or {}).get('code')
    sid = request.sid
    now = time.time()
    if not code:
        socketio.emit('pair_failed', room=sid)
        return
    expiry = pair_codes.get(code)
    if not expiry or expiry < now:
        logging.info(f'Pair failed for sid={sid}: code invalid/expired {code}')
        socketio.emit('pair_failed', room=sid)
        return
    # success: consume code so it can't be reused
    pair_codes.pop(code, None)
    paired_sids.add(sid)
    logging.info(f'Paired sid={sid} with code={code}')
    socketio.emit('paired', room=sid)


def is_paired():
    try:
        sid = request.sid
        addr = request.remote_addr or ''
        if sid in paired_sids: return True
        if addr.startswith('127.') or addr == '::1':
            return True
    except Exception:
        pass
    return False


@socketio.on('type')
def on_type(data):
    if not is_paired():
        logging.info('type rejected: not paired')
        return
    txt = (data or {}).get('text','')
    try:
        logging.info(f'Received type text={txt}')
        pyautogui.write(txt)
    except Exception:
        logging.exception('type error')


@socketio.on('clipboard_set')
def on_clipboard_set(data):
    if not is_paired():
        logging.info('clipboard_set rejected: not paired')
        return
    txt = (data or {}).get('text','')
    try:
        logging.info('Received clipboard_set')
        if pyperclip:
            pyperclip.copy(txt)
        else:
            logging.warning('pyperclip not installed; clipboard not set')
    except Exception:
        logging.exception('clipboard_set error')


@socketio.on('get_clipboard')
def on_get_clipboard():
    if not is_paired():
        logging.info('get_clipboard rejected: not paired')
        return
    try:
        logging.info(f'get_clipboard requested by sid={request.sid}')
        if not pyperclip:
            logging.warning('pyperclip not available')
            socketio.emit('clipboard', {'text': ''}, room=request.sid)
            return
        text = pyperclip.paste()
        if text is None:
            text = ''
        logging.info('Sending clipboard content to client (length=%d)' % len(text))
        socketio.emit('clipboard', {'text': text}, room=request.sid)
    except Exception:
        logging.exception('get_clipboard error')
        socketio.emit('clipboard', {'text': ''}, room=request.sid)


@socketio.on('gesture')
def on_gesture(data):
    if not is_paired():
        logging.info('gesture rejected: not paired')
        return
    g = (data or {}).get('type')
    try:
        logging.info(f'Received gesture {g}')
        if g == 'three_down':
            pyautogui.hotkey('win','d')
        elif g == 'three_left':
            pyautogui.hotkey('ctrl','shift','tab')
        elif g == 'three_right':
            pyautogui.hotkey('ctrl','tab')
    except Exception:
        logging.exception('gesture error')


def find_free_port(start=5000, end=5100):
    for p in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(('0.0.0.0', p))
                return p
            except OSError:
                continue
    raise RuntimeError('No free port found')


if __name__ == '__main__':
    # Already monkey-patched at import time above.
    try:
        port = find_free_port(5000, 5100)
    except RuntimeError:
        port = 0
    print(f"Starting server on 0.0.0.0:{port}")
    socketio.run(app, host='0.0.0.0', port=port)
