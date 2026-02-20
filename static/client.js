const socket = io();

const pad = document.getElementById('pad');
let lastX = null, lastY = null;
let twoLastY = null, twoLastX = null;
let lastTouchCount = 0;
let twoStartTime = 0;
let twoMoved = false;

let sensitivity = 1.0;
const SMOOTH_N = 3;
const bufX = [];
const bufY = [];

function sendMoveRaw(dx, dy){
  socket.emit('move', {dx: dx, dy: dy});
}

function sendMove(dx, dy){
  dx = dx * sensitivity;
  dy = dy * sensitivity;
  bufX.push(dx); if(bufX.length>SMOOTH_N) bufX.shift();
  bufY.push(dy); if(bufY.length>SMOOTH_N) bufY.shift();
  const avgDx = bufX.reduce((a,b)=>a+b,0)/bufX.length;
  const avgDy = bufY.reduce((a,b)=>a+b,0)/bufY.length;
  sendMoveRaw(avgDx, avgDy);
}

// Touch handlers
pad.addEventListener('touchstart', e=>{
  lastTouchCount = e.touches.length;
  if(e.touches.length===1){
    const t = e.touches[0]; lastX = t.clientX; lastY = t.clientY;
  } else if(e.touches.length===2){
    const t0 = e.touches[0], t1 = e.touches[1];
    twoLastY = (t0.clientY + t1.clientY)/2;
    twoLastX = (t0.clientX + t1.clientX)/2;
    twoStartTime = Date.now();
    twoMoved = false;
  }
});

pad.addEventListener('touchmove', e=>{
  e.preventDefault();
  if(e.touches.length===1){
    const t = e.touches[0]; const dx = t.clientX - lastX; const dy = t.clientY - lastY; lastX = t.clientX; lastY = t.clientY; sendMove(dx, dy);
  } else if(e.touches.length===2){
    const t0 = e.touches[0], t1 = e.touches[1];
    const centerY = (t0.clientY + t1.clientY)/2;
    const dy = centerY - twoLastY;
    if(Math.abs(dy) > 1) twoMoved = true;
    twoLastY = centerY;
    // send scroll (invert Y for natural scroll)
    socket.emit('scroll', {dy: Math.round(-dy * sensitivity * 2)});
  }
});

pad.addEventListener('touchend', e=>{
  // detect two-finger tap as right click
  if(lastTouchCount===2){
    const dt = Date.now() - twoStartTime;
    if(!twoMoved && dt < 300){
      socket.emit('click', {button:'right'});
    }
  }
  lastTouchCount = e.touches.length;
});

// mouse support for testing desde PC
pad.addEventListener('mousedown', e=>{
  lastX = e.clientX; lastY = e.clientY;
  const move = (ev)=>{ const dx = ev.clientX - lastX; const dy = ev.clientY - lastY; lastX = ev.clientX; lastY = ev.clientY; sendMove(dx, dy); };
  const up = ()=>{ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});

// UI controls
const leftBtn = document.getElementById('left');
const rightBtn = document.getElementById('right');
const volUp = document.getElementById('vol-up');
const volDown = document.getElementById('vol-down');
const mute = document.getElementById('mute');
const sensitivityEl = document.getElementById('sensitivity');
const dragLockBtn = document.getElementById('drag-lock');
const statusEl = document.getElementById('status');

let dragLock = false;

leftBtn.addEventListener('click', ()=> socket.emit('click',{button:'left'}));
rightBtn.addEventListener('click', ()=> socket.emit('click',{button:'right'}));
volUp.addEventListener('click', ()=> socket.emit('volume',{action:'up'}));
volDown.addEventListener('click', ()=> socket.emit('volume',{action:'down'}));
mute.addEventListener('click', ()=> socket.emit('volume',{action:'mute'}));

sensitivityEl.addEventListener('input', e=>{ sensitivity = parseFloat(e.target.value); });

dragLockBtn.addEventListener('click', ()=>{
  dragLock = !dragLock;
  dragLockBtn.textContent = dragLock ? 'Arrastre: ON' : 'Bloq Arrastre';
  if(dragLock){
    socket.emit('drag_start', {button:'left'});
    dragLockBtn.classList.add('active');
  } else {
    socket.emit('drag_end', {button:'left'});
    dragLockBtn.classList.remove('active');
  }
});

// connection indicator
socket.on('connect', ()=>{ statusEl.textContent = 'Conectado'; statusEl.style.background = '#e0ffe0'; });
socket.on('disconnect', ()=>{ statusEl.textContent = 'Desconectado'; statusEl.style.background = '#ffdede'; });
