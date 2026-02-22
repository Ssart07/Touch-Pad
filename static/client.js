// parse pair code from URL param if present
function getParam(name){ const u = new URL(window.location.href); return u.searchParams.get(name); }
const pairCodeFromUrl = getParam('pair');
const socket = io();

// send pair code on connect if present
socket.on('connect', ()=>{
  statusEl && (statusEl.textContent = 'Conectado');
  if(pairCodeFromUrl){ socket.emit('pair', {code: pairCodeFromUrl}); }
});

const pad = document.getElementById('pad');
let lastX = null, lastY = null;
let twoLastY = null, twoLastX = null;
let lastTouchCount = 0;
let twoStartTime = 0;
let twoMoved = false;

let sensitivity = 1.0;
const SMOOTH_N = 2;
const bufX = [];
const bufY = [];
let lastSendTime = 0;
const SEND_INTERVAL = 16; // ms (~60fps)

function sendMoveRaw(dx, dy){
  const now = Date.now();
  if(now - lastSendTime < SEND_INTERVAL) return;
  lastSendTime = now;
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

// Note: we avoid blocking touch events at document-level to preserve OS gestures handling.
// The pad element uses non-passive listeners and preventDefault there to avoid browser navigation.

// Touch handlers (register as non-passive so we can prevent default)
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
  } else if(e.touches.length===3){
    const t0 = e.touches[0], t1 = e.touches[1], t2 = e.touches[2];
    pad._threeStart = {
      x: (t0.clientX + t1.clientX + t2.clientX)/3,
      y: (t0.clientY + t1.clientY + t2.clientY)/3,
      t: Date.now()
    };
  }
}, {passive:false});

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
}, {passive:false});

pad.addEventListener('touchend', e=>{
  // detect two-finger tap as right click
  if(lastTouchCount===2){
    const dt = Date.now() - twoStartTime;
    if(!twoMoved && dt < 300){
      socket.emit('click', {button:'right'});
    }
  }
  // three-finger gesture detection
  if(pad._threeStart){
    const start = pad._threeStart; delete pad._threeStart;
    // compute end center from changedTouches if possible
    let endX = start.x, endY = start.y;
    if(e.changedTouches && e.changedTouches.length>0){
      let sx = 0, sy = 0; for(let i=0;i<e.changedTouches.length;i++){ sx += e.changedTouches[i].clientX; sy += e.changedTouches[i].clientY; }
      endX = sx / e.changedTouches.length; endY = sy / e.changedTouches.length;
    }
    const dx = endX - start.x, dy = endY - start.y;
    if(Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)){
      if(dy > 0) socket.emit('gesture',{type:'three_down'});
      else socket.emit('gesture',{type:'three_up'});
    } else if(Math.abs(dx) > 60){
      if(dx > 0) socket.emit('gesture',{type:'three_right'});
      else socket.emit('gesture',{type:'three_left'});
    }
  }
  lastTouchCount = e.touches.length;
}, {passive:false});
// also handle touchcancel to detect gestures if the OS cancels touches
pad.addEventListener('touchcancel', e=>{
  // reuse touchend logic for three-finger gestures
  if(pad._threeStart){
    const start = pad._threeStart; delete pad._threeStart;
    let endX = start.x, endY = start.y;
    if(e.changedTouches && e.changedTouches.length>0){
      let sx = 0, sy = 0; for(let i=0;i<e.changedTouches.length;i++){ sx += e.changedTouches[i].clientX; sy += e.changedTouches[i].clientY; }
      endX = sx / e.changedTouches.length; endY = sy / e.changedTouches.length;
    }
    const dx = endX - start.x, dy = endY - start.y;
    if(Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)){
      if(dy > 0) socket.emit('gesture',{type:'three_down'});
      else socket.emit('gesture',{type:'three_up'});
    } else if(Math.abs(dx) > 60){
      if(dx > 0) socket.emit('gesture',{type:'three_right'});
      else socket.emit('gesture',{type:'three_left'});
    }
  }
}, {passive:false});

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
const profilesEl = document.getElementById('profiles');
const saveProfileBtn = document.getElementById('save-profile');
const keyboardToggle = document.getElementById('keyboard-toggle');
const keyboardInput = document.getElementById('keyboard-input');
const clipboardToPcBtn = document.getElementById('clipboard-to-pc');
const clipboardFromPcBtn = document.getElementById('clipboard-from-pc');

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

// keyboard
keyboardToggle.addEventListener('click', ()=>{
  if(keyboardInput.style.display === 'none'){
    keyboardInput.style.display = 'block'; keyboardInput.focus();
  } else {
    keyboardInput.style.display = 'none';
  }
});
keyboardInput.addEventListener('keydown', e=>{
  if(e.key === 'Enter'){
    const txt = keyboardInput.value; if(!txt) return;
    socket.emit('type', {text: txt}); keyboardInput.value = ''; keyboardInput.blur();
  }
});

// clipboard
clipboardToPcBtn.addEventListener('click', async ()=>{
  try{
    const text = await navigator.clipboard.readText();
    socket.emit('clipboard_set', {text});
  }catch(err){
    // fallback: ask user to paste text manually
    const text = prompt('Pega aquí el texto para enviar al PC:');
    if(text) socket.emit('clipboard_set', {text});
  }
});
clipboardFromPcBtn.addEventListener('click', ()=>{
  socket.emit('get_clipboard');
});

// profiles
function loadProfiles(){
  const p = JSON.parse(localStorage.getItem('tp_profiles')||'[]');
  profilesEl.innerHTML = '';
  p.forEach(pr=>{ const opt=document.createElement('option'); opt.value=pr.name; opt.textContent=pr.name; profilesEl.appendChild(opt); });
}
saveProfileBtn.addEventListener('click', ()=>{
  const name = prompt('Nombre del perfil'); if(!name) return;
  const p = JSON.parse(localStorage.getItem('tp_profiles')||'[]');
  p.push({name, sensitivity}); localStorage.setItem('tp_profiles', JSON.stringify(p)); loadProfiles();
});
profilesEl.addEventListener('change', ()=>{
  const name = profilesEl.value; const p = JSON.parse(localStorage.getItem('tp_profiles')||'[]'); const sel = p.find(x=>x.name===name); if(sel){ sensitivity = sel.sensitivity; sensitivityEl.value = sel.sensitivity; }
});
loadProfiles();

// connection indicator
socket.on('connect', ()=>{ statusEl.textContent = 'Conectado'; statusEl.style.background = '#e0ffe0'; });
socket.on('disconnect', ()=>{ statusEl.textContent = 'Desconectado'; statusEl.style.background = '#ffdede'; });

// handle clipboard text from PC
socket.on('clipboard', data=>{
  const txt = data && data.text;
  if(txt){
    console.log('clipboard event received, length=', txt.length);
    // Try to write to clipboard, then always show prompt so user can manually copy if needed
    navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(txt).then(()=>{
          alert('Portapapeles recibido y copiado en el dispositivo');
          // also show prompt so user can see the text
          prompt('Portapapeles recibido (copia manual si es necesario):', txt);
        }).catch(()=>{
          // fallback prompt
          prompt('Portapapeles recibido. Copia el texto:', txt);
        })
      : prompt('Portapapeles recibido. Copia el texto:', txt);
  } else alert('Portapapeles vacío');
});

// feedback for pairing
socket.on('paired', ()=>{ alert('Emparejado con el PC'); });
socket.on('pair_failed', ()=>{ alert('Código de emparejamiento inválido'); });
