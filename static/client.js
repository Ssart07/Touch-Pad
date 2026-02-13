const socket = io();

const pad = document.getElementById('pad');
let lastX = null, lastY = null;

function sendMove(dx, dy){
  socket.emit('move', {dx: dx, dy: dy});
}

pad.addEventListener('touchstart', e=>{
  const t = e.touches[0]; lastX = t.clientX; lastY = t.clientY;
});
pad.addEventListener('touchmove', e=>{
  e.preventDefault(); const t = e.touches[0]; const dx = t.clientX - lastX; const dy = t.clientY - lastY; lastX = t.clientX; lastY = t.clientY; sendMove(dx, dy);
});

// mouse support for testing desde PC
pad.addEventListener('mousedown', e=>{ lastX = e.clientX; lastY = e.clientY; const move = (ev)=>{ const dx = ev.clientX - lastX; const dy = ev.clientY - lastY; lastX = ev.clientX; lastY = ev.clientY; sendMove(dx, dy); }; const up = ()=>{ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); }; window.addEventListener('mousemove', move); window.addEventListener('mouseup', up); });

document.getElementById('left').addEventListener('click', ()=> socket.emit('click',{button:'left'}));
document.getElementById('right').addEventListener('click', ()=> socket.emit('click',{button:'right'}));
document.getElementById('vol-up').addEventListener('click', ()=> socket.emit('volume',{action:'up'}));
document.getElementById('vol-down').addEventListener('click', ()=> socket.emit('volume',{action:'down'}));
document.getElementById('mute').addEventListener('click', ()=> socket.emit('volume',{action:'mute'}));
