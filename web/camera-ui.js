"use strict";
function cameraLabels() {
  $('viewRange-value').textContent=(2*+$('viewRange').value).toFixed(0)+' m';
  $('followLag-value').textContent=(+$('followLag').value).toFixed(2)+' s';
}
function setViewRange(value) {
  const input=$('viewRange');input.value=String(Math.min(+input.max,Math.max(+input.min,value)));
  cameraLabels();draw();
}
$('viewRange').addEventListener('input',()=>{cameraLabels();draw();});
$('followLag').addEventListener('input',()=>{cameraLabels();draw();});
$('zoom-in').onclick=()=>setViewRange(+$('viewRange').value/1.2);
$('zoom-out').onclick=()=>setViewRange(+$('viewRange').value*1.2);
$('center-view').onclick=()=>{if(demoMode==='live'){liveCamera.reset(live.history[liveCursor].truth);draw();}};
$('reset-view').onclick=()=>{if(demoMode==='live'){liveCamera.reset(live.origin);setViewRange(PlotCamera.defaults.viewRange);}};
$('state-plot').addEventListener('wheel',event=>{
  if(demoMode!=='live')return;
  event.preventDefault();
  const delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?300:1);
  setViewRange(+$('viewRange').value*Math.exp(Math.max(-.3,Math.min(.3,delta*.002))));
},{passive:false});
const cameraTouches=new Map();
let pinchDistance=0,pinchRange=0,pinchUsed=false;
function cameraTouchStart(event) {
  cameraTouches.set(event.pointerId,[event.clientX,event.clientY]);
  $('state-plot').setPointerCapture(event.pointerId);
  if(cameraTouches.size===1)pinchUsed=false;
  if(cameraTouches.size===2){pinchUsed=true;const [a,b]=[...cameraTouches.values()];pinchDistance=Math.hypot(a[0]-b[0],a[1]-b[1]);pinchRange=+$('viewRange').value;}
}
$('state-plot').addEventListener('pointermove',event=>{
  if(!cameraTouches.has(event.pointerId))return;
  cameraTouches.set(event.pointerId,[event.clientX,event.clientY]);
  if(cameraTouches.size===2&&pinchDistance>0){const [a,b]=[...cameraTouches.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(distance>0)setViewRange(pinchRange*pinchDistance/distance);}
});
function endCameraTouch(event,cancelled=false) {
  if(!cameraTouches.has(event.pointerId))return;
  if(!pinchUsed&&!cancelled&&demoMode==='live')applyPlotForce(event);
  cameraTouches.delete(event.pointerId);
  if(cameraTouches.size<2)pinchDistance=0;
}
$('state-plot').addEventListener('pointerup',event=>endCameraTouch(event));
$('state-plot').addEventListener('pointercancel',event=>endCameraTouch(event,true));
$('state-plot').addEventListener('lostpointercapture',event=>endCameraTouch(event,true));
cameraLabels();
