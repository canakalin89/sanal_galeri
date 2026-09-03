// Eser dokusuyla kaplı eklemli stickman; kaynak görsel ve materyale dokunulmaz.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GalleryFigure = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createFactory(THREE) {
    const sphere = new THREE.SphereGeometry(1, 10, 8);
    const bone = new THREE.CylinderGeometry(1, 1, 1, 8);
    const foot = new THREE.BoxGeometry(1, 1, 1);
    const gem = new THREE.OctahedronGeometry(1);
    const wood = new THREE.MeshStandardMaterial({ color:0x594331,roughness:0.8 });
    const metal = new THREE.MeshStandardMaterial({ color:0xc4a15d,roughness:0.4,metalness:0.5 });
    const fire = new THREE.MeshBasicMaterial({ color:0xff3823,toneMapped:false });
    const figures = new Set();
    function create(sourceFrame, seed = 0) {
      const group = new THREE.Group(); group.name = 'Tablo stickman';
      const body = new THREE.Group(); group.add(body);
      const skin = new THREE.MeshStandardMaterial({ color:0xffffff,roughness:0.72 });
      const source = sourceFrame.userData.artworkSurface || sourceFrame.children.find(node=>node.isMesh && node.material?.map);
      const parts=[];
      function part(parent,geometry,x,y,z,sx,sy,sz,material=skin) {
        const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);mesh.scale.set(sx,sy,sz);parent.add(mesh);parts.push(mesh);return mesh;
      }
      function joint(parent,x,y,z) { const node=new THREE.Group();node.position.set(x,y,z);parent.add(node);return node; }
      part(body,sphere,0,1.68,0,0.235,0.235,0.235);
      part(body,bone,0,1.17,0,0.115,0.66,0.115);
      part(body,sphere,0,0.88,0,0.145,0.12,0.13);
      const legs=[];
      for(const side of [-1,1]){
        const hip=joint(body,side*0.12,0.86,0);
        part(hip,sphere,0,0,0,0.095,0.095,0.095);
        part(hip,bone,0,-0.18,0,0.075,0.36,0.075);
        const knee=joint(hip,0,-0.36,0);
        part(knee,sphere,0,0,0,0.088,0.088,0.088);
        part(knee,bone,0,-0.19,0,0.065,0.38,0.065);
        part(knee,foot,0,-0.43,0.055,0.145,0.13,0.25);
        legs.push({hip,knee});
      }
      const arms=[];
      for(const side of [-1,1]){
        const shoulder=joint(body,side*0.14,1.4,0);
        shoulder.rotation.z=side*0.28;
        part(shoulder,sphere,0,0,0,0.09,0.09,0.09);
        part(shoulder,bone,0,-0.16,0,0.065,0.32,0.065);
        const elbow=joint(shoulder,0,-0.32,0);
        part(elbow,sphere,0,0,0,0.075,0.075,0.075);
        part(elbow,bone,0,-0.14,0,0.06,0.28,0.06);
        part(elbow,sphere,0,-0.3,0,0.078,0.078,0.078);
        arms.push({shoulder,elbow});
      }
      const staff=joint(arms[1].elbow,0,-0.3,0.025);
      part(staff,bone,0,0.3,0,0.027,1.5,0.027,wood);
      part(staff,bone,0,0.92,0,0.045,0.1,0.045,metal);
      const crystal=part(staff,gem,0,1.06,0,0.09,0.14,0.09,fire);
      const muzzle=joint(staff,0,1.08,0.03);
      // Eklemler ayrı hareket eder, aynı parçalar mobilde altı çizim grubunda çizilir.
      const batches=new Map();
      for(const part of parts){
        const key=part.geometry.uuid+part.material.uuid;
        if(!batches.has(key))batches.set(key,{parts:[]});
        batches.get(key).parts.push(part);part.visible=false;
      }
      for(const batch of batches.values()){
        batch.mesh=new THREE.InstancedMesh(batch.parts[0].geometry,batch.parts[0].material,batch.parts.length);
        batch.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        batch.mesh.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1.1,0),2);
        group.add(batch.mesh);
      }
      const inverse=new THREE.Matrix4(),matrix=new THREE.Matrix4();
      let stride=seed, birth=0, recoil=0;
      const origin=new THREE.Vector3();
      const figure={
        group,muzzle,
        animate(dt,distance,cast,reducedMotion) {
          birth=Math.min(1,birth+dt/0.6);stride+=distance*7.5;recoil=Math.max(0,recoil-dt*4);
          const growth=reducedMotion?1:birth*birth*(3-2*birth);
          body.scale.setScalar(0.15+growth*0.85);body.position.y=(1-growth)*1.35;
          const walking=distance>0.0001&&!reducedMotion;
          const swing=walking?Math.sin(stride)*0.5:0;
          legs[0].hip.rotation.x=swing;legs[1].hip.rotation.x=-swing;
          legs[0].knee.rotation.x=Math.max(0,-swing)*1.1;legs[1].knee.rotation.x=Math.max(0,swing)*1.1;
          body.position.y+=walking?Math.sin(stride*2)*0.015:0;
          arms[0].shoulder.rotation.x=-swing*0.7;
          arms[1].shoulder.rotation.x=-0.12-cast*0.35-recoil*0.08;
          arms[1].elbow.rotation.x=-0.2-cast*0.5;
          staff.rotation.x=0.32+cast*1.3;
          staff.rotation.z=-0.4;
          crystal.scale.set(0.09*(1+cast*0.6),0.14*(1+cast*0.6),0.09*(1+cast*0.6));
          // Görsel geç yüklenirse bütün uzuvlar aynı kaynak dokuyu birlikte alır.
          const map=source?.material?.map||null;
          if(skin.map!==map){skin.map=map;skin.needsUpdate=true;}
          group.updateMatrixWorld(true);inverse.copy(group.matrixWorld).invert();
          for(const batch of batches.values()){
            batch.parts.forEach((part,i)=>{matrix.multiplyMatrices(inverse,part.matrixWorld);batch.mesh.setMatrixAt(i,matrix);});
            batch.mesh.instanceMatrix.needsUpdate=true;
          }
        },
        fireOrigin(){group.updateMatrixWorld(true);muzzle.getWorldPosition(origin);return origin;},
        onFire(){recoil=1;},
        dispose(){group.removeFromParent();for(const batch of batches.values())batch.mesh.dispose();skin.dispose();figures.delete(figure);}
      };
      figures.add(figure);figure.animate(0,0,0,false);return figure;
    }
    function dispose(){
      for(const figure of [...figures])figure.dispose();
      for(const resource of [sphere,bone,foot,gem,wood,metal,fire])resource.dispose();
    }
    return {create,dispose};
  }
  return {createFactory};
});
