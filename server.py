import eventlet
# eventlet must patch sockets and threads before other imports that
# may use networking or threading. Do this early.
eventlet.monkey_patch()

from flask import Flask, send_from_directory
from flask_socketio import SocketIO
import pyautogui
import ctypes
import socket

pyautogui.FAILSAFE = False

app = Flask(__name__, static_folder='static')
socketio = SocketIO(app, cors_allowed_origins='*', async_mode='eventlet')


@app.route('/')
def index():
    return send_from_directory(app.static_folder, 'index.html')


@socketio.on('move')
def on_move(data):
    try:
        dx = float(data.get('dx', 0))
        dy = float(data.get('dy', 0))
        print(f"Received move dx={dx} dy={dy}")
        pyautogui.moveRel(dx, dy)
    except Exception as e:
        print('move error', e)


@socketio.on('click')
def on_click(data):
    button = data.get('button', 'left')
    try:
        print(f"Received click button={button}")
        pyautogui.click(button=button)
    except Exception as e:
        print('click error', e)


@socketio.on('scroll')
def on_scroll(data):
    try:
        dy = int(data.get('dy', 0))
        print(f"Received scroll dy={dy}")
        pyautogui.scroll(dy)
    except Exception as e:
        print('scroll error', e)


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
        print(f"Received volume action={action}")
        if action == 'up':
            key_event(VK_VOLUME_UP)
        elif action == 'down':
            key_event(VK_VOLUME_DOWN)
        elif action == 'mute':
            key_event(VK_VOLUME_MUTE)
    except Exception as e:
        print('volume error', e)


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
