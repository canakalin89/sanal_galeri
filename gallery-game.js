// Gizli oyun yalnızca mevcut 3D oturumunu değiştirir; hiçbir sergi verisi yazılmaz.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const LOGO_TAPS = 17, MAX_LIVES = 3, HIT_GRACE_SECONDS = 1.25;
  function createRound(total) { return { total, taps: 0, phase: 'idle', countdown: 3, lives: MAX_LIVES, wave: 0, kills: 0 }; }
  function loseLife(round) { if (round.phase === 'playing') round.lives = Math.max(0, round.lives - 1); return round.lives; }
  function logoTap(round) {
    if (round.phase !== 'idle') return false;
    if (++round.taps !== LOGO_TAPS) return false;
    round.phase = 'countdown'; round.countdown = 3; return true;
  }
  function advanceCountdown(round, dt) {
    if (round.phase !== 'countdown') return;
    round.countdown = Math.max(0, round.countdown - Math.max(0, dt));
    if (round.countdown === 0) round.phase = 'playing';
  }
  function waveSize(round, mobile) { return Math.min(round.wave, mobile ? 6 : 10, round.total - round.kills); }
  function segmentHitsBox(a, b, box) {
    let enter = 0, leave = 1;
    for (const key of ['x','y','z']) {
      const delta = b[key] - a[key], min = box.min[key], max = box.max[key];
      if (Math.abs(delta) < 1e-8) { if (a[key] < min || a[key] > max) return false; continue; }
      const first = (min-a[key])/delta, second = (max-a[key])/delta;
      enter = Math.max(enter, Math.min(first, second)); leave = Math.min(leave, Math.max(first, second));
      if (enter > leave) return false;
    }
    return true;
  }
  function waypoint(plan, from, target) {
    const crossed = plan.partitions.filter(p => (from.x-p.x)*(target.x-p.x) < 0)
      .sort((a,b) => Math.abs(a.x-from.x)-Math.abs(b.x-from.x));
    for (const p of crossed) {
      const crossingZ = from.z + (target.z-from.z) * (p.x-from.x)/(target.x-from.x);
      if (Math.abs(crossingZ) > p.length/2 + 0.55) continue;
      const north = -p.length/2-0.8, south = p.length/2+0.8;
      const z = Math.abs(from.z-north)+Math.abs(target.z-north) < Math.abs(from.z-south)+Math.abs(target.z-south) ? north : south;
      return { x: Math.abs(from.z-z) > 0.12 ? from.x : p.x + Math.sign(target.x-from.x)*0.8, z };
    }
    return target;
  }

  function create(THREE, { scene, camera, plan, frames, mobile, onModeChange, onShadowChange }) {
    const el = id => document.getElementById(id);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let round = createRound(frames.length), saved = [], queue = [], enemies = [], shots = [], bursts = [];
    let elapsed = 0, waveDelay = 0, shotDelay = 0, immune = 0, firing = false, paused = false, disposed = false;
    let effects = null, figureFactory = null, sphere, coreBlue, coreRed, haloBlue, haloRed, hitTime = 0;
    const owned = [], hud = el('gal3d-game-hud'), screen = el('gal3d-game-screen'), overlay = el('gal3d-overlay');
    const blocks = plan.partitions.map(p => ({ min: { x:p.x-0.16,y:0,z:-p.length/2 }, max:{ x:p.x+0.16,y:plan.height-0.3,z:p.length/2 } }));
    const blocked = (a,b) => blocks.some(box => segmentHitsBox(a,b,box));
    const temp = new THREE.Vector3(), aim = new THREE.Vector3(), direction = new THREE.Vector3();
    function announce(text) { if (el('gal3d-game-message').textContent !== text) el('gal3d-game-message').textContent = text; }
    function updateHud() {
      el('gal3d-game-lives').textContent = '♥'.repeat(round.lives) + '♡'.repeat(MAX_LIVES - round.lives);
      el('gal3d-game-lives').setAttribute('aria-label', `${round.lives} can kaldı`);
      el('gal3d-game-lives-count').textContent = `${round.lives}/${MAX_LIVES}`;
      el('gal3d-game-wave').textContent = String(round.wave);
      el('gal3d-game-score').textContent = `${round.kills}/${round.total}`;
      hud.classList.toggle('critical', round.lives === 1);
    }
    function ensureEffects() {
      if (effects) return;
      effects = new THREE.Group(); effects.name = 'Gizli oyun efektleri'; scene.add(effects);
      figureFactory = GalleryFigure.createFactory(THREE);
      sphere = new THREE.SphereGeometry(0.1, 8, 6);
      coreBlue = new THREE.MeshBasicMaterial({ color:0xc9f4ff, toneMapped:false });
      coreRed = new THREE.MeshBasicMaterial({ color:0xffad60, toneMapped:false });
      const canvas = document.createElement('canvas'); canvas.width=canvas.height=64;
      const ctx=canvas.getContext('2d'), gradient=ctx.createRadialGradient(32,32,0,32,32,32);
      gradient.addColorStop(0,'rgba(255,255,255,1)'); gradient.addColorStop(0.18,'rgba(255,255,255,0.9)');
      gradient.addColorStop(0.45,'rgba(255,255,255,0.3)'); gradient.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
      const map=new THREE.CanvasTexture(canvas);
      haloBlue=new THREE.SpriteMaterial({ map,color:0x168fff,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false });
      haloRed=haloBlue.clone();haloRed.color.set(0xff2610);
      owned.push(sphere,coreBlue,coreRed,map,haloBlue,haloRed);
    }
    function makeFlame(blue) {
      const group=new THREE.Group();
      group.add(new THREE.Mesh(sphere,blue?coreBlue:coreRed));
      const halo=new THREE.Sprite(blue?haloBlue:haloRed);halo.scale.setScalar(0.75);group.add(halo);effects.add(group);
      return group;
    }
    function projectile(position, vector, blue) {
      if (shots.length >= (mobile?30:48)) return;
      const mesh=makeFlame(blue);mesh.position.copy(position);
      shots.push({ mesh,velocity:vector.clone().normalize().multiplyScalar(blue?19:5.2+round.wave*0.16),blue,life:blue?2.3:6 });
    }
    function burst(position) {
      if (bursts.length >= (mobile?8:16)) return;
      const mesh=makeFlame(true);mesh.position.copy(position);bursts.push({mesh,life:0.42});
    }
    function removeEffects() {
      for (const item of [...shots,...bursts]) effects?.remove(item.mesh);
      shots=[];bursts=[];
    }
    function restore() {
      for (const enemy of enemies) enemy.figure.dispose();
      for (const item of saved) {
        item.frame.position.copy(item.position);item.frame.quaternion.copy(item.rotation);item.frame.scale.copy(item.scale);item.frame.visible=item.visible;
        item.shadows.forEach(([mesh,value])=>{mesh.castShadow=value;});
      }
      saved=[]; enemies=[];queue=[]; removeEffects();onShadowChange();
    }
    function end(won) {
      if (round.phase !== 'playing') return;
      round.phase='ended';firing=false;restore();updateHud();
      screen.classList.remove('hidden');el('gal3d-game-countdown').textContent=won?'SALON KURTULDU':'OYUN BİTTİ';
      announce(won?'Bütün tablolar yerine döndü. Sergin güvende.':'Tablolar yerine döndü. Bir dahaki sefere!');
      onModeChange('ended');
    }
    function damage() {
      if (immune>0 || round.phase!=='playing') return;
      loseLife(round);immune=HIT_GRACE_SECONDS;hitTime=reducedMotion?0:0.22;
      updateHud();if(round.lives===0)end(false);
    }
    function tapLogo() {
      if(disposed || !logoTap(round)) return false;
      ensureEffects(); elapsed=0;waveDelay=0;shotDelay=0;immune=0;firing=false;paused=false;
      saved=frames.map(frame=>({frame,position:frame.position.clone(),rotation:frame.quaternion.clone(),scale:frame.scale.clone(),visible:frame.visible,shadows:[]}));
      for(const item of saved) item.frame.traverse(node=>{if(node.isMesh){item.shadows.push([node,node.castShadow]);node.castShadow=false;}});
      queue=saved.slice().sort((a,b)=>a.position.distanceToSquared(camera.position)-b.position.distanceToSquared(camera.position));
      overlay.classList.add('game-active');hud.classList.remove('hidden');screen.classList.remove('hidden');
      el('gal3d-game-fire').classList.toggle('hidden',!mobile);el('gal3d-game-countdown').textContent='3';
      announce(mobile?'Sürükle: nişan al · Sol çubuk: yürü · Mavi düğme: ateş':'WASD: yürü · Fare: nişan al · Tıkla / Boşluk: mavi ateş');
      updateHud();onModeChange('countdown');onShadowChange();return true;
    }
    function fire(vector) {
      if(round.phase!=='playing'||paused||shotDelay>0)return;
      camera.getWorldDirection(direction);
      if(vector)direction.copy(vector);
      projectile(camera.position,direction,true);shotDelay=0.24;
    }
    function spawnWave() {
      round.wave++;const size=waveSize(round,mobile);
      for(let i=0;i<size;i++){
        const item=queue.shift();if(!item)break;
        const normal=new THREE.Vector3(0,0,1).applyQuaternion(item.rotation);
        const figure=figureFactory.create(item.frame,i*1.7);
        figure.group.position.copy(item.position).addScaledVector(normal,0.65);figure.group.position.y=0;
        figure.group.rotation.y=Math.atan2(camera.position.x-figure.group.position.x,camera.position.z-figure.group.position.z);
        effects.add(figure.group);item.frame.visible=false;
        enemies.push({figure,fireIn:2+i*0.65,hp:round.wave>=5?2:1});
      }
      updateHud();announce(`Dalga ${round.wave} · ${enemies.length} tablo`);
    }
    function advanceShots(dt) {
      for(let i=shots.length-1;i>=0;i--){
        const shot=shots[i],from=shot.mesh.position.clone();
        shot.mesh.position.addScaledVector(shot.velocity,dt);shot.life-=dt;
        const to=shot.mesh.position;
        let remove=shot.life<=0||Math.abs(to.x)>plan.width/2||Math.abs(to.z)>plan.depth/2||to.y<0||to.y>plan.height||blocked(from,to);
        if(!remove){
          const line=new THREE.Line3(from,to);
          if(shot.blue){
            for(let j=enemies.length-1;j>=0;j--){
              const enemy=enemies[j],p=enemy.figure.group.position;
              const hitBox={min:{x:p.x-0.33,y:0.12,z:p.z-0.3},max:{x:p.x+0.33,y:1.93,z:p.z+0.3}};
              if(segmentHitsBox(from,to,hitBox)){
                remove=true;
                if(--enemy.hp<=0){temp.copy(p);temp.y=1.1;burst(temp);enemy.figure.dispose();enemies.splice(j,1);round.kills++;updateHud();}
                break;
              }
            }
          } else {line.closestPointToPoint(camera.position,true,temp);if(temp.distanceTo(camera.position)<0.34){remove=true;damage();if(round.phase!=='playing')return;}}
        }
        if(remove){effects.remove(shot.mesh);shots.splice(i,1);}
        else if(!reducedMotion)shot.mesh.children[1].scale.setScalar(0.65+Math.sin(elapsed*20+i)*0.08);
      }
    }
    function tick(dt) {
      if(disposed||paused||round.phase==='idle'||round.phase==='ended')return;
      if(round.phase==='countdown'){
        advanceCountdown(round,dt);el('gal3d-game-countdown').textContent=String(Math.max(1,Math.ceil(round.countdown)));
        if(round.phase==='playing'){screen.classList.add('hidden');onModeChange('playing');spawnWave();}
        return;
      }
      elapsed+=dt;shotDelay=Math.max(0,shotDelay-dt);immune=Math.max(0,immune-dt);hitTime=Math.max(0,hitTime-dt);
      el('gal3d-game-hit').style.opacity=String(hitTime/0.22*0.35);
      if(firing)fire();
      for(const enemy of enemies){
        const p=enemy.figure.group.position,target=waypoint(plan,p,camera.position);
        const dx=target.x-p.x,dz=target.z-p.z,distance=Math.hypot(dx,dz);
        const playerDistance=Math.hypot(p.x-camera.position.x,p.z-camera.position.z);
        let step=0;
        if(playerDistance>2.7 || target!==camera.position){
          step=Math.min(distance,dt*(0.55+Math.min(round.wave,10)*0.08));
          if(distance>0.01){p.x+=dx/distance*step;p.z+=dz/distance*step;}
        }
        enemy.fireIn-=dt;
        const charging=Math.max(0,Math.min(1,1-enemy.fireIn/0.65));
        const facing=step>0.001&&charging===0?Math.atan2(dx,dz):Math.atan2(camera.position.x-p.x,camera.position.z-p.z);
        const turn=Math.atan2(Math.sin(facing-enemy.figure.group.rotation.y),Math.cos(facing-enemy.figure.group.rotation.y));
        enemy.figure.group.rotation.y+=turn*Math.min(1,dt*8);
        enemy.figure.animate(dt,step,charging,reducedMotion);
        if(enemy.fireIn<=0){
          const muzzle=enemy.figure.fireOrigin();
          if(!blocked(muzzle,camera.position)){
            aim.copy(camera.position).sub(muzzle);projectile(muzzle,aim,false);enemy.figure.onFire();enemy.fireIn=Math.max(1.8,3.3-round.wave*0.12)+Math.random()*0.7;
          }
        }
        if(playerDistance<0.7){damage();if(round.phase!=='playing')return;}
      }
      advanceShots(dt);if(round.phase!=='playing')return;
      for(let i=bursts.length-1;i>=0;i--){const b=bursts[i];b.life-=dt;b.mesh.scale.setScalar(reducedMotion?1:1+(0.42-b.life)*5);if(b.life<=0){effects.remove(b.mesh);bursts.splice(i,1);}}
      if(!enemies.length){
        if(round.kills>=round.total){end(true);return;}
        waveDelay+=dt;if(waveDelay>=2){waveDelay=0;spawnWave();}
      }
    }
    function exit() {
      if(round.phase==='idle')return;
      firing=false;restore();round=createRound(frames.length);hitTime=0;
      overlay.classList.remove('game-active');hud.classList.add('hidden');screen.classList.add('hidden');el('gal3d-game-fire').classList.add('hidden');el('gal3d-game-hit').style.opacity='0';
      onModeChange('idle');
    }
    function setPaused(value) {
      paused=value;firing=false;
      if(round.phase==='playing'){
        screen.classList.toggle('hidden',!value);el('gal3d-game-countdown').textContent=value?'DURAKLATILDI':'';
        if(value)announce('Devam etmek için salona dön.');
      }
    }
    function dispose(){exit();disposed=true;scene.remove(effects);figureFactory?.dispose();owned.forEach(resource=>resource.dispose());}
    return { tapLogo,fire,tick,exit,dispose,setPaused,setFiring:value=>{firing=value;}, mode:()=>round.phase };
  }
  return { LOGO_TAPS,MAX_LIVES,HIT_GRACE_SECONDS,createRound,loseLife,logoTap,advanceCountdown,waveSize,segmentHitsBox,waypoint,create };
});
