// Tek gökyüzü çiziminde iki bulut katmanı; yüzey rüzgârı üst seviye hareketinin yaklaşımıdır.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GallerySky = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NOISE_SIZE = 128, CLOUD_SCALE = 240;
  function windVelocity(report) {
    if (!report) return { x:0, z:0 };
    // Haritada +X doğu, -Z kuzeydir. Meteorolojik yön rüzgârın geldiği yönü belirtir.
    const angle = report.windDirection * Math.PI / 180;
    const speed = Math.max(0, Math.min(40, report.windSpeed));
    return { x:-Math.sin(angle)*speed/CLOUD_SCALE, z:Math.cos(angle)*speed/CLOUD_SCALE };
  }
  function create(THREE, { mobile = false, reducedMotion = false } = {}) {
    let seed = 1703;
    const bytes = new Uint8Array(NOISE_SIZE * NOISE_SIZE * 4);
    for (let i=0;i<bytes.length;i++) {
      seed = (Math.imul(seed,1664525)+1013904223) >>> 0; bytes[i]=seed>>>24;
    }
    const noise = new THREE.DataTexture(bytes,NOISE_SIZE,NOISE_SIZE,THREE.RGBAFormat);
    noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
    noise.minFilter = noise.magFilter = THREE.LinearFilter;
    noise.generateMipmaps = false; noise.needsUpdate = true;
    const uniforms = {
      noiseMap:{value:noise}, drift:{value:new THREE.Vector2()},
      daylight:{value:1}, dusk:{value:0}, coverage:{value:0}, storm:{value:0}, haze:{value:0},
      sunDirection:{value:new THREE.Vector3(0.2,0.7,0.7).normalize()}
    };
    const material = new THREE.ShaderMaterial({
      side:THREE.BackSide, depthWrite:false, toneMapped:false,
      defines:{ CLOUD_OCTAVES:mobile?4:5 }, uniforms,
      vertexShader:`varying vec3 vDirection;
        void main(){vDirection=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
      fragmentShader:`
        varying vec3 vDirection;
        uniform sampler2D noiseMap;
        uniform vec2 drift;
        uniform float daylight, dusk, coverage, storm, haze;
        uniform vec3 sunDirection;
        float noiseAt(vec2 p){
          vec2 cell=floor(p),f=fract(p); f=f*f*(3.0-2.0*f);
          return texture2D(noiseMap,(cell+f+0.5)/128.0).r;
        }
        float field(vec2 p){
          float value=0.0,weight=0.53;
          for(int i=0;i<CLOUD_OCTAVES;i++){
            value+=noiseAt(p)*weight; p=p*2.0+vec2(17.0,31.0); weight*=0.5;
          }
          return value;
        }
        float density(vec2 p,float cover){
          float base=field(p);
          float threshold=mix(0.79,0.24,cover);
          return smoothstep(threshold,threshold+0.19,base)*smoothstep(0.0,0.12,cover);
        }
        vec4 cloudLayer(vec2 p,vec3 direction,float cover,float upper){
          float dense=density(p,cover);
          vec2 lightStep=normalize(sunDirection.xz+vec2(0.001))*0.18;
          float towardSun=density(p+lightStep,cover);
          float edge=clamp((dense-towardSun)*3.0,0.0,1.0);
          float thickness=smoothstep(0.15,0.95,dense);
          float sunFacing=pow(max(0.0,dot(direction,sunDirection)),7.0);
          vec3 shade=mix(vec3(0.43,0.51,0.61),vec3(0.27,0.32,0.39),storm);
          vec3 lit=mix(vec3(0.99,0.98,0.94),shade,thickness*(0.48+storm*0.28));
          lit+=edge*vec3(0.25,0.23,0.18)*(0.35+sunFacing*0.65)*(1.0-storm*0.7);
          lit=mix(lit,vec3(1.0,0.58,0.31),dusk*(0.18+sunFacing*0.48));
          vec3 night=mix(vec3(0.065,0.085,0.125),vec3(0.026,0.037,0.060),thickness);
          vec3 color=mix(night,lit,daylight);
          float opacity=(1.0-exp(-dense*mix(3.2,1.4,upper)))*smoothstep(0.02,0.18,direction.y);
          return vec4(color,opacity);
        }
        void main(){
          vec3 d=normalize(vDirection); float h=max(0.0,d.y);
          vec3 day=mix(vec3(0.76,0.81,0.80),vec3(0.25,0.49,0.72),pow(h,0.55));
          vec3 night=mix(vec3(0.065,0.09,0.13),vec3(0.008,0.018,0.04),pow(h,0.4));
          vec3 color=mix(night,day,daylight);
          color+=dusk*vec3(0.28,0.09,0.025)*pow(1.0-h,5.0);
          float sun=max(0.0,dot(d,sunDirection));
          color+=vec3(1.0,0.8,0.55)*(pow(sun,1500.0)*0.7+pow(sun,30.0)*0.1)*daylight*(1.0-storm);
          if(h>0.02 && coverage>0.001){
            // Farklı yükseklikler uzaklaşma hissi verir; desenler döndürülmeden rüzgârla taşınır.
            vec2 plane=d.xz/max(0.075,h);
            vec4 high=cloudLayer(plane*3.8-drift*1.25+vec2(43.0,19.0),d,coverage*0.84,1.0);
            vec4 low=cloudLayer(plane*2.0-drift,d,coverage,0.0);
            color=mix(color,high.rgb,high.a);
            color=mix(color,low.rgb,low.a);
          }
          vec3 fogColor=mix(vec3(0.065,0.09,0.13),vec3(0.64,0.69,0.71),daylight);
          color=mix(color,fogColor,(haze*0.65+storm*0.15)*pow(1.0-h,2.0));
          gl_FragColor=vec4(color,1.0);
        }`
    });
    const mesh=new THREE.Mesh(new THREE.SphereGeometry(1250,32,16),material);
    // Sahnenin ortak temizleyicisi materyali bırakırken shader dokusu da bırakılır.
    material.addEventListener('dispose',()=>noise.dispose());
    mesh.name='Rüzgârla hareket eden bulutlu gökyüzü'; mesh.renderOrder=-10;
    const velocity={x:0,z:0}, target={x:0,z:0,coverage:0,storm:0,haze:0};
    let receivedWeather=false;
    function update(cycle,sunPosition,conditions,report){
      uniforms.daylight.value=cycle.daylight; uniforms.dusk.value=cycle.dusk;
      uniforms.sunDirection.value.copy(sunPosition).normalize();
      Object.assign(target,windVelocity(report),{coverage:report?conditions.cloud:0,storm:conditions?.thunder?1:0,haze:conditions?.fog?1:0});
      if(report&&!receivedWeather){
        for(const key of ['coverage','storm','haze'])uniforms[key].value=target[key];
        velocity.x=target.x;velocity.z=target.z;receivedWeather=true;
      }
    }
    function tick(dt,cameraPosition){
      // Gökyüzü uzak bir çevredir; büyük salonlarda kameranın dışına çıkmaz.
      if(cameraPosition)mesh.position.copy(cameraPosition);
      const blend=1-Math.exp(-Math.max(0,dt)/8);
      for(const key of ['coverage','storm','haze'])uniforms[key].value+=(target[key]-uniforms[key].value)*blend;
      velocity.x+=(target.x-velocity.x)*blend;velocity.z+=(target.z-velocity.z)*blend;
      // İki katmanın ortak tekrar periyodu; uzun açık oturumlarda kayan nokta hassasiyeti korunur.
      if(!reducedMotion){uniforms.drift.value.x=(uniforms.drift.value.x+velocity.x*dt)%512;uniforms.drift.value.y=(uniforms.drift.value.y+velocity.z*dt)%512;}
    }
    return {mesh,update,tick};
  }
  return {windVelocity,create};
});
