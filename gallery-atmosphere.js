// Yağış cephe camlarının dışında ve cam çatının üstündedir; ses kullanıcı tarafından açılır.
(function () {
  function create(THREE, scene, plan, mobile) {
    const count = mobile ? 400 : 900;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const group = new THREE.Group(); group.name = 'Okul hava durumu'; scene.add(group);
    const roof = GalleryRoof.layout(plan);
    // Ön cephe ve çatı aynı toplam parçacık bütçesini paylaşır.
    const particles = Array.from({ length: count }, (_, index) => index % 3 === 0
      ? { overhead: true, x: (Math.random() - 0.5) * plan.width, y: roof.ridgeHeight + 0.3 + Math.random() * 14, z: (Math.random() - 0.5) * plan.depth }
      : { overhead: false, x: (Math.random() - 0.5) * (plan.width + 60), y: Math.random() * 38 - 4, z: plan.depth / 2 + 0.7 + Math.random() * 65 });
    const rainPositions = new Float32Array(count * 6), snowPositions = new Float32Array(count * 3);
    const rainGeometry = new THREE.BufferGeometry(); rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xc1d4de, transparent: true, opacity: 0.32, depthWrite: false }));
    const snowGeometry = new THREE.BufferGeometry(); snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3).setUsage(THREE.DynamicDrawUsage));
    const snow = new THREE.Points(snowGeometry, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: 'void main(){ vec4 p=modelViewMatrix*vec4(position,1.0); gl_Position=projectionMatrix*p; gl_PointSize=clamp(70.0/max(1.0,-p.z),1.3,7.0); }',
      fragmentShader: 'void main(){ float a=1.0-smoothstep(0.22,0.5,length(gl_PointCoord-vec2(0.5))); gl_FragColor=vec4(0.94,0.96,1.0,a*0.82); }'
    }));
    rain.frustumCulled = snow.frustumCulled = false;
    rain.visible = snow.visible = false; group.add(rain, snow);
    const flash = new THREE.DirectionalLight(0xd5e4ff, 0); flash.position.set(0, 20, plan.depth / 2 + 40); group.add(flash);
    let report = null, weather = null, sound = false, visible = true, strikeIn = 25, flashTime = 0;
    let audio = null, bed = null, bedGain = null, noiseBuffer = null, disposed = false;
    const thunderSources = new Set();
    function stopThunder() {
      for (const source of thunderSources) { try { source.stop(); } catch {} }
      thunderSources.clear();
    }

    function updateSound() {
      if (!audio || !bedGain) return;
      const volume = sound && visible && weather?.rain ? 0.025 * weather.intensity : 0;
      bedGain.gain.setTargetAtTime(volume, audio.currentTime, 0.4);
    }
    async function setSound(enabled) {
      if (disposed) return false;
      if (!enabled) { sound = false; stopThunder(); updateSound(); await audio?.suspend().catch(() => {}); return false; }
      const Context = window.AudioContext || window.webkitAudioContext;
      if (!Context) return false;
      try {
        if (!audio) {
          audio = new Context(); noiseBuffer = audio.createBuffer(1, audio.sampleRate * 4, audio.sampleRate);
          const values = noiseBuffer.getChannelData(0);
          let previous = 0;
          for (let i = 0; i < values.length; i++) { previous = (previous + (Math.random() * 2 - 1) * 0.04) / 1.03; values[i] = previous * 5; }
          bed = audio.createBufferSource(); bed.buffer = noiseBuffer; bed.loop = true;
          const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 1500;
          bedGain = audio.createGain(); bedGain.gain.value = 0;
          bed.connect(filter); filter.connect(bedGain); bedGain.connect(audio.destination); bed.start();
        }
        await audio.resume(); sound = !disposed && audio.state === 'running'; updateSound(); return sound;
      } catch { sound = false; return false; }
    }
    function thunder() {
      if (!sound || !visible || !audio || audio.state !== 'running') return;
      const source = audio.createBufferSource(); source.buffer = noiseBuffer;
      const filter = audio.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 230;
      const gain = audio.createGain(), start = audio.currentTime + 1.6;
      gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.14, start + 0.35); gain.gain.exponentialRampToValueAtTime(0.001, start + 3.8);
      source.connect(filter); filter.connect(gain); gain.connect(audio.destination);
      thunderSources.add(source);
      source.onended = () => { thunderSources.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
      source.start(start); source.stop(start + 4);
    }
    function setWeather(next) {
      report = next; weather = next ? GalleryWeather.describe(next) : null;
      rain.visible = !reducedMotion && Boolean(weather?.rain);
      snow.visible = !reducedMotion && Boolean(weather?.snow);
      const activeCount = Math.round(count * (weather?.intensity || 0));
      rainGeometry.setDrawRange(0, activeCount * 2); snowGeometry.setDrawRange(0, activeCount);
      if (!weather?.thunder) { flashTime = 0; flash.intensity = 0; strikeIn = 25; stopThunder(); }
      updateSound();
    }
    function tick(dt) {
      if (!visible || !weather || reducedMotion) return;
      if (rain.visible || snow.visible) {
        const wind = Math.min(7, report.windSpeed * 0.3), angle = report.windDirection * Math.PI / 180;
        const wx = -Math.sin(angle) * wind, wz = Math.cos(angle) * wind;
        particles.forEach((p, i) => {
          p.y -= dt * (weather.snow ? 1.7 : 18); p.x += wx * dt; p.z += wz * dt;
          if (p.overhead) GalleryRoof.confineParticle(roof, p);
          else {
            if (p.y < -4) p.y = 34;
            if (Math.abs(p.x) > (plan.width + 60) / 2) p.x *= -0.98;
            const near = plan.depth / 2 + 0.7;
            if (p.z < near) p.z = near + 64; else if (p.z > near + 65) p.z = near;
          }
          const s = i * 3, r = i * 6;
          snowPositions[s] = rainPositions[r] = p.x;
          snowPositions[s+1] = rainPositions[r+1] = p.y;
          snowPositions[s+2] = rainPositions[r+2] = p.z;
          rainPositions[r+3] = p.x - wx * 0.04; rainPositions[r+4] = p.y + 0.8; rainPositions[r+5] = p.z - wz * 0.04;
        });
        rainGeometry.attributes.position.needsUpdate = rain.visible;
        snowGeometry.attributes.position.needsUpdate = snow.visible;
      }
      if (weather.thunder) {
        strikeIn -= dt;
        if (strikeIn <= 0) { flashTime = 0.32; strikeIn = 30 + Math.random() * 35; thunder(); }
        flashTime = Math.max(0, flashTime - dt); flash.intensity = Math.sin(flashTime / 0.32 * Math.PI) * 1.4;
      }
    }
    function setVisible(value) {
      visible = value; flash.intensity = 0; updateSound();
      if (!value) { stopThunder(); audio?.suspend().catch(() => {}); }
      else if (sound) audio?.resume().catch(() => {});
    }
    function dispose() { disposed = true; sound = false; stopThunder(); bed?.stop(); audio?.close().catch(() => {}); }
    return { setWeather, setSound, tick, setVisible, dispose };
  }
  window.GalleryAtmosphere = { create };
})();
