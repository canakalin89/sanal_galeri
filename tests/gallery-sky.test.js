const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const { windVelocity, create } = require('../gallery-sky');

test('meteorolojik ruzgar geldigi yonun tersine tasir; sakin ve eksik veride kayma yoktur', () => {
  const north=windVelocity({windDirection:0,windSpeed:12});
  const east=windVelocity({windDirection:90,windSpeed:12});
  assert.ok(north.z>0 && Math.abs(north.x)<1e-9);
  assert.ok(east.x<0 && Math.abs(east.z)<1e-9);
  assert.deepEqual(windVelocity(null),{x:0,z:0});
  assert.equal(Math.hypot(...Object.values(windVelocity({windDirection:40,windSpeed:0}))),0);
});

test('bulutlar ruzgarla ilerler; hava degisimi sicramaz, eksik veride temizlenir ve doku birakilir', async () => {
  const THREE=await import(pathToFileURL(path.join(__dirname,'../vendor/three.module.js')).href);
  const sky=create(THREE,{mobile:true}),u=sky.mesh.material.uniforms;
  const cycle={daylight:1,dusk:0},sun=new THREE.Vector3(1,1,1);
  sky.update(cycle,sun,{cloud:0.6},{windSpeed:12,windDirection:90});
  sky.tick(1,new THREE.Vector3(100,1.65,40));
  assert.ok(u.drift.value.x<0);assert.equal(u.coverage.value,0.6);
  assert.equal(sky.mesh.position.x,100);
  const position=u.drift.value.clone();
  sky.update({daylight:0,dusk:0},sun,{cloud:1,thunder:true},{windSpeed:12,windDirection:270});
  assert.ok(u.drift.value.equals(position));assert.equal(u.coverage.value,0.6);
  sky.tick(1);assert.ok(u.coverage.value>0.6 && u.coverage.value<1);
  assert.equal(u.daylight.value,0);
  sky.update(cycle,sun,null,null);sky.tick(240);
  assert.ok(u.coverage.value<0.001 && u.storm.value<0.001);
  let disposed=false;u.noiseMap.value.addEventListener('dispose',()=>{disposed=true;});
  sky.mesh.material.dispose();sky.mesh.geometry.dispose();assert.equal(disposed,true);
});

test('hareket azaltma bulut kaymasini durdurur, guncel hava ve gece renkleri korunur', async () => {
  const THREE=await import(pathToFileURL(path.join(__dirname,'../vendor/three.module.js')).href);
  const sky=create(THREE,{reducedMotion:true}),u=sky.mesh.material.uniforms;
  sky.update({daylight:0,dusk:0.1},new THREE.Vector3(1,1,1),{cloud:0.85},{windSpeed:20,windDirection:45});
  sky.tick(60);assert.equal(u.drift.value.length(),0);assert.equal(u.coverage.value,0.85);
  assert.equal(u.daylight.value,0);sky.mesh.material.dispose();sky.mesh.geometry.dispose();
});
