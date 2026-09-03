const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRound,logoTap,advanceCountdown,waveSize,segmentHitsBox,waypoint } = require('../gallery-game');
const { plan } = require('../gallery-layout');

test('yalnizca 17 logo tiklamasi oyunu acar ve tam uc saniye sonra baslar', () => {
  const round=createRound(28);
  for(let i=0;i<16;i++){assert.equal(logoTap(round),false);assert.equal(round.phase,'idle');}
  assert.equal(logoTap(round),true);assert.equal(round.phase,'countdown');
  assert.equal(logoTap(round),false);
  advanceCountdown(round,1);assert.equal(round.countdown,2);
  advanceCountdown(round,1);assert.equal(round.countdown,1);
  assert.equal(round.phase,'countdown');
  advanceCountdown(round,1);assert.equal(round.phase,'playing');
  assert.equal(createRound(28).taps,0);
});

test('saldiri dalgalari azdan coga artar, mobil siniri ve kalan eser sayisi asılmaz', () => {
  const round=createRound(28);
  const counts=[];
  for(let wave=1;round.kills<round.total;wave++){
    round.wave=wave;const count=waveSize(round,true);counts.push(count);round.kills+=count;
    assert.ok(count<=6 && count>0);
  }
  assert.deepEqual(counts,[1,2,3,4,5,6,6,1]);
  assert.equal(round.kills,28);
  assert.equal(waveSize({...round,wave:100,total:2000,kills:0},false),10);
  assert.equal(waveSize({...round,wave:8,total:1,kills:0},true),1);
});

test('hizli atislar iki kare arasinda ince sergi duvarini delmez', () => {
  const box={min:{x:-0.16,y:0,z:-5},max:{x:0.16,y:3.6,z:5}};
  assert.equal(segmentHitsBox({x:-1,y:1.65,z:0},{x:1,y:1.65,z:0},box),true);
  assert.equal(segmentHitsBox({x:-1,y:1.65,z:6},{x:1,y:1.65,z:6},box),false);
  assert.equal(segmentHitsBox({x:-1,y:4,z:0},{x:1,y:4,z:0},box),false);
  assert.equal(segmentHitsBox({x:-1,y:1,z:0},{x:-1,y:1,z:2},box),false);
});

test('tablolar oyuncuya sergi duvarinin icinden gitmek yerine ucundan dolasir', () => {
  const room=plan(28), p=room.partitions[0];
  const from={x:p.x-1.5,z:0},target={x:p.x+1.5,z:0};
  const first=waypoint(room,from,target);
  assert.equal(first.x,from.x);assert.ok(Math.abs(first.z)>p.length/2);
  const second=waypoint(room,first,target);
  assert.ok(second.x>p.x);assert.equal(second.z,first.z);
  assert.equal(waypoint(room,second,target),target);
});

test('son tablo vurulunca kazanilir ve asil sahne nesneleri silinmeden geri yuklenir', async () => {
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
  const {pathToFileURL}=require('node:url');
  const THREE=await import(pathToFileURL(path.join(__dirname,'../vendor/three.module.js')).href);
  const elements=new Map();
  const document={getElementById(id){
    if(!elements.has(id))elements.set(id,{textContent:'',value:0,style:{},classList:{add(){},remove(){},toggle(){}}});
    return elements.get(id);
  },createElement(){return {width:64,height:64,getContext(){return {createRadialGradient(){return {addColorStop(){}};},fillRect(){}};}};}};
  const context={module:{exports:{}},document,window:{matchMedia:()=>({matches:true})}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../gallery-game.js'),'utf8'),context);
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,1.65,3);
  const frame=new THREE.Group(),geometry=new THREE.BoxGeometry(1,1,0.05),material=new THREE.MeshBasicMaterial();
  const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;frame.add(mesh);frame.position.set(0,1.8,-3.9);scene.add(frame);
  const original=frame.position.clone();let originalDisposed=false;geometry.addEventListener('dispose',()=>{originalDisposed=true;});
  const game=context.module.exports.create(THREE,{scene,camera,plan:plan(1),frames:[frame],mobile:true,onModeChange(){},onShadowChange(){}});
  for(let i=0;i<17;i++)game.tapLogo();
  game.setPaused(true);game.tick(30);assert.equal(game.mode(),'countdown');
  game.setPaused(false);game.tick(3);assert.equal(game.mode(),'playing');
  game.fire();for(let i=0;i<30 && game.mode()==='playing';i++)game.tick(0.05);
  assert.equal(game.mode(),'ended');
  assert.equal(document.getElementById('gal3d-game-countdown').textContent,'SALON KURTULDU');
  assert.ok(frame.position.equals(original));assert.equal(frame.visible,true);assert.equal(mesh.castShadow,true);
  game.exit();assert.equal(game.mode(),'idle');game.dispose();
  assert.deepEqual(scene.children,[frame]);assert.equal(originalDisposed,false);
  geometry.dispose();material.dispose();
});
