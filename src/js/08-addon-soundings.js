/* Soundings • a photographic field expedition at Berth 4. */
(() => {
  'use strict';

  const MODE = 'soundings';
  const ARCHIVE = 'saltline.soundings.album.v1';
  const plates = [
    { name: 'Veilray', habitat: 'East quay', behavior: 'Wings unfurled', color: '#ace6cb', site: [26.8, 16.3], sky: [39, 9.1, 22.2], size: 10.8 },
    { name: 'Chime Medusa', habitat: 'Crane alley', behavior: 'Bell in bloom', color: '#f0bcd5', site: [-3.3, 6.8], sky: [-2, 12, 18], size: 7 },
    { name: 'Lanternback', habitat: 'Outer quay', behavior: 'Sounding call', color: '#f1ca79', site: [29, 20], sky: [49, 14, 29], size: 21 },
  ];
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const tau = 2 * Math.PI;

  function boot() {
    if (window.__fatal || window.__G?.showcase) return;
    if (!window.__ready) return requestAnimationFrame(boot);
    if (window.__G.game?.finishSoundings) init(window.__G);
  }

  // Parametric skins carry their own pigment, so the markings follow the animals at both light settings.
  function createFauna(T) {
    const world = new T.Group();
    world.name = 'soundings-migration';
    const vec = (x, y, z) => new T.Vector3(x, y, z);
    const group = parent => { const g = new T.Group(); parent.add(g); return g; };
    function mesh(parent, geo, material) {
      const m = new T.Mesh(geo, material);
      parent.add(m);
      return m;
    }
    const luminous = color => new T.MeshBasicMaterial({ color, toneMapped: false });
    const skin = (emissive, shininess = 18) => new T.MeshPhongMaterial({
      color: 0xffffff, vertexColors: true, emissive, side: T.DoubleSide, shininess,
      specular: 0x7b9386,
    });
    function patch(parent, nu, nv, point, pigment, material) {
      const coords = [], colors = [], indices = [];
      for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, v = j / nv;
        coords.push(...point(u, v));
        const c = pigment(u, v);
        colors.push(c.r, c.g, c.b);
        if (i && j) {
          const d = j * (nu + 1) + i, a = d - nu - 2;
          indices.push(a, a + 1, d, a, d, d - 1);
        }
      }
      const geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.Float32BufferAttribute(coords, 3));
      geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      return mesh(parent, geo, material);
    }
    const ramp = (a, b, t) => new T.Color(a).lerp(new T.Color(b), clamp(t, 0, 1));
    function filament(parent, points, radius, material) {
      return mesh(parent, new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p => vec(...p))), 22, radius, 5, false), material);
    }
    function oval(parent, color, x, y, z, sx, sy, sz) {
      const o = mesh(parent, new T.SphereGeometry(1, 16, 12), color);
      o.position.set(x, y, z);
      o.scale.set(sx, sy, sz);
      return o;
    }
    // The fin root stays fixed while a cambered, swept blade bends toward the tip.
    function blade(parent, side, span, sweep, chord, camber, mat, tint, vein) {
      const hinge = group(parent);
      function surface(u, v) {
        const width = chord * Math.pow(1 - u, .7) * (.82 + .18 * Math.sin(Math.PI * u));
        return [sweep * u * u + (v - .48) * width, camber * Math.sin(Math.PI * u) + .16 * Math.sin(v * Math.PI) * (1 - u), side * span * u];
      }
      patch(hinge, 24, 10, surface, (u,v) => ramp(tint, 0xb2d4bb, .12 + .65 * u + .1 * Math.sin(24 * u + 6 * v)), mat);
      for (const v of [.06, .31, .58, .82]) {
        filament(hinge, [0,.2,.45,.7,.97].map(u => {
          const p = surface(u, v + Math.sin(u * Math.PI) * .09);
          p[1] += .025;
          return p;
        }), .022, vein);
      }
      return hinge;
    }
    function ray() {
      const root = group(world), mint = luminous(0xbbffe0), dark = skin(0x184b4e);
      oval(root, new T.MeshPhongMaterial({color:0x387873,emissive:0x123638}), 0,0,0,1.5,.36,.53);
      const wings = [-1,1].map(side => blade(root, side, 4.4, 1.55, 3, .36, dark, 0x246568, mint));
      for (const side of [-1,1]) {
        filament(root, [[-1.1,.05,side*.24],[-1.55,-.08,side*.4],[-1.82,.1,side*.45]], .078, mint);
        oval(root, mint, -.92,.21,side*.37,.1,.07,.06);
      }
      filament(root, [[.8,0,0],[2.4,.04,0],[3.4,.1,.28],[4.8,.42,.18]], .045, mint);
      return {root, pose(t) { wings.forEach((w,i) => w.rotation.x = (i ? 1 : -1) * (.15 + .38 * Math.sin(t * 1.65))); }};
    }
    function medusa() {
      const root = group(world), jelly = skin(0x644268), rose = luminous(0xffc6df), silk = luminous(0xcc93cf);
      const bells = [];
      for (let k = 0; k < 3; k++) {
        const bell = group(root);
        const scale = [1,.47,.32][k];
        bell.scale.setScalar(scale);
        bell.position.set([0,2.4,-2.2][k], [0,-.7,.85][k], [0,.7,-.4][k]);
        function hood(u, v) {
          const a = u * tau, arc = .025 + v * 1.74;
          const r = 1.65 * Math.sin(arc) * (1 + .055 * Math.cos(12*a) * v);
          return [r*Math.cos(a), 1.5*Math.cos(arc) + .12*Math.cos(12*a)*v*v, r*Math.sin(a)];
        }
        patch(bell, 72, 15, hood, (u,v) => ramp(0x8b678f, 0xffdebd, .18 + .4*(1-v) + .36*Math.pow(Math.cos(tau*u*6),8)), jelly);
        const rim = [];
        for (let i=0;i<=72;i++) rim.push(vec(...hood(i/72,1)));
        bell.add(new T.Line(new T.BufferGeometry().setFromPoints(rim), new T.LineBasicMaterial({color:0xffd3ce})));
        const tendrils = [];
        for (let i=0;i<14;i++) {
          const a=tau*i/14, length=2.1+1.6*(.5+.5*Math.cos(i*3.1));
          const stem = group(bell);
          stem.position.set(1.48*Math.cos(a),-.19,1.48*Math.sin(a));
          const points=Array.from({length:10},(_,j)=>{const u=j/9;return [.22*Math.sin(u*8+a)*u,-length*u,.35*Math.cos(u*6+a)*u];});
          filament(stem,points,i%3===0?.052:.023,i%3===0?rose:silk);
          tendrils.push(stem);
        }
        bells.push({bell,scale,tendrils});
      }
      return {root,pose(t){ bells.forEach(({bell,scale,tendrils},k)=>{
        const pulse=Math.sin(t*1.9+k);
        bell.scale.set(scale*(1+.09*pulse),scale*(1-.08*pulse),scale*(1+.09*pulse));
        tendrils.forEach((stem,i)=>{stem.rotation.z=.13*Math.sin(t*1.4+k+i*.54);stem.rotation.x=.11*Math.cos(t*1.6+i);});
      });}};
    }
    function whale() {
      const root = group(world), gold = luminous(0xffdb92), hide = skin(0x293f45), ivory = luminous(0xe0c78d);
      // Cross sections run nose to tail, with a blunt rostrum and a narrow tail stock.
      function body(u,v) {
        const angle = v*tau, taper = Math.pow(Math.max(.0001,Math.sin(Math.PI*u)),.56) * (1.68 - 1.42*u);
        return [-8.2+16.4*u, 1.85*taper*Math.sin(angle)+.34*Math.sin(u*5), 2.12*taper*Math.cos(angle)];
      }
      patch(root,64,40,body,(u,v)=>{
        const belly=clamp((-Math.sin(v*tau)-.01)*2.1,0,1);
        return ramp(0x23434e,0xd8c28c, .10+.82*belly+.07*Math.sin(u*82+v*20));
      },hide);
      for(const side of [-1,1]) {
        for(let i=0;i<7;i++) {
          const points=Array.from({length:10},(_,j)=>{
            const u=.045+.48*j/9, v=.75+side*(.034+i*.033+.015*Math.sin(u*6));
            const p=body(u,v);p[2]*=1.012;p[1]-=.018;return p;
          });
          filament(root,points,.025+i*.002,i%3===0?gold:ivory);
        }
        const fin=blade(root,side,4.25,2.8,1.85,-.88,hide,0x3b5a5f,ivory);
        fin.position.set(-2.1,-.75,side*1.5);
        oval(root,gold,-5.73,.1,side*1.94,.17,.12,.11);
      }
      const tail=group(root);tail.position.set(7.65,-.3,0);
      [-1,1].forEach(side=>blade(tail,side,3.18,1.2,1.72,.26,hide,0x3f6468,ivory));
      const fin=blade(root,1,1.3,1.1,1.6,.02,hide,0x31505c,ivory);fin.rotation.x=-Math.PI/2;fin.position.set(3.5,.98,0);
      return {root,pose(t){tail.rotation.z=.26*Math.sin(t*1.12);}};
    }
    const animals=[ray(),medusa(),whale()];
    animals[0].root.scale.setScalar(1.27);
    animals.forEach(({root},i)=>{root.name=plates[i].name;root.visible=false;});
    // Suspended luminous spores give each sighting a moving sense of scale.
    const dust = new Float32Array(96*3);
    for(let i=0;i<96;i++) {
      const a=i*2.39996, r=2.1+((i*37)%89)/13;
      dust.set([r*Math.cos(a),Math.sin(i*1.33)*3.8,r*Math.sin(a)],i*3);
    }
    const geo=new T.BufferGeometry();
    geo.setAttribute('position',new T.BufferAttribute(dust,3));
    const motes=new T.Points(geo,new T.PointsMaterial({color:0xffe0a2,size:.075,transparent:true,opacity:.77,depthWrite:false}));
    world.add(motes);
    function animate(index,t) {
      const {root,pose}=animals[index], base=plates[index].sky;
      root.position.set(base[0]+Math.sin(t*.24)*2.6,base[1]+Math.sin(t*.62)*.76,base[2]+Math.cos(t*.27)*1.2);
      root.rotation.set((index===0?.24:0)+.09*Math.sin(t*.7), ([-1.95,.15,1.18][index])+.27*Math.cos(t*.31), .075*Math.sin(t*.6));
      pose(t);
      motes.position.copy(root.position);
      motes.rotation.y=t*.075;
    }
    return {world,animals,animate};
  }
  function init(G) {
    const {THREE:T, camera, player, weapon, input, game, hud} = G;
    const menu=game.menus.root, ui=document.querySelector('#ui'), canvas=G.renderer.domElement;
    const debrief=menu.querySelector('.m-debrief');
    const start={pos:new T.Vector3(26.8,0,16.3),yaw:-2.10};
    const inverseCamera=new T.Quaternion(), direction=new T.Vector3(), projected=new T.Vector3(), site=new T.Vector3();
    let fauna=null, run=null, frameBounds=null, lastAlbum=null;
    try {
      const saved=JSON.parse(localStorage.getItem(ARCHIVE));
      if (Array.isArray(saved) && saved.length===3 && saved.every((p,i)=>p?.name===plates[i].name &&
          typeof p.image==='string' && p.image.startsWith('data:image/jpeg;base64,') &&
          Number.isInteger(p.score) && p.score>=0 && p.score<=100)) lastAlbum=saved;
    } catch {}

    const header=document.createElement('header');
    header.className='snd-title';
    header.innerHTML='<div class="snd-imprint"><i aria-hidden="true">≋</i> Saltline Field Survey</div><h1>Soundings</h1><p>The tide has brought something to Berth 4.<br>Take a field camera. Document the migration.</p>';
    menu.querySelector('.m-title-main').prepend(header);
    const imprint=document.createElement('aside');
    imprint.className='snd-caption';
    imprint.innerHTML='<span>Field plate III</span><i>Lanternback over Saltline Terminal</i>';
    menu.querySelector('.m-title').append(imprint);
    const archiveButton=document.createElement('button');
    archiveButton.className='snd-archive btn';
    archiveButton.textContent='Save last contact sheet';
    menu.querySelector('.m-title .m-actions').append(archiveButton);
    archiveButton.hidden=!lastAlbum;
    archiveButton.addEventListener('click',()=>saveSheet(lastAlbum,archiveButton));
    const deploy=menu.querySelector('[data-act="deploy"]'), restart=menu.querySelector('[data-act="restart"]');
    const redeploy=debrief.querySelector('[data-act="redeploy"]');
    const originalLabels=[deploy,restart,redeploy].map(b=>b.textContent);
    function title() {deploy.textContent=menu.dataset.mode===MODE?'Begin survey':originalLabels[0];}
    new MutationObserver(title).observe(menu,{attributes:true,attributeFilter:['data-mode']});
    title();

    const overlay=document.createElement('div');
    overlay.className='snd-instrument';
    overlay.innerHTML=`
      <div class="snd-plate"><small>Field camera <b> / </b> <span class="snd-index"></span></small>
        <strong class="snd-species"></strong><span class="snd-habitat"></span></div>
      <div class="snd-finder"><i></i><i></i><i></i><i></i><div class="snd-cross"></div>
        <div class="snd-scale"></div><div class="snd-frame-label">SALTLINE OPTICS</div></div>
      <div class="snd-readout"><i></i><span></span></div>
      <div class="snd-controls"></div>
      <div class="snd-proof" hidden><figure><img alt=""><figcaption><i></i><b></b></figcaption></figure>
        <div class="snd-proof-actions"><button type="button" data-proof="keep">File plate</button><button type="button" data-proof="retake">Retake</button></div>
        <small class="snd-proof-keys"></small></div>`;
    ui.append(overlay);
    const touchLabels=[['.t-fire','Camera shutter'],['.t-ads','Zoom']].map(([selector,label])=>{
      const button=ui.querySelector(selector);
      return {button,label,original:button?.getAttribute('aria-label')};
    });
    const el=q=>overlay.querySelector(q), finder=el('.snd-finder'), readout=el('.snd-readout span'), proof=el('.snd-proof');
    const resize=new ResizeObserver(()=>{frameBounds=null;});
    resize.observe(canvas);resize.observe(finder);
    const report=document.createElement('div');
    report.className='snd-report';
    report.innerHTML='<div class="snd-imprint">Saltline Field Survey</div><h2>Contact sheet</h2><p class="snd-edition"></p><div class="snd-prints"></div>';
    debrief.prepend(report);
    const exportButton=document.createElement('button');
    exportButton.className='btn snd-export';
    exportButton.textContent='Save contact sheet';
    debrief.querySelector('.m-actions').prepend(exportButton);
    exportButton.addEventListener('click',()=>saveSheet(lastAlbum,exportButton));

    async function saveSheet(album,button) {
      if (!album || button.disabled) return;
      button.disabled=true;
      const label=button.textContent;
      try {
        const images=await Promise.all(album.map(p=>new Promise((resolve,reject)=>{
          const img=new Image();img.onload=()=>resolve(img);img.onerror=reject;img.src=p.image;
        })));
        const sheet=document.createElement('canvas');
        sheet.width=1800;sheet.height=660;
        const ctx=sheet.getContext('2d');
        ctx.fillStyle='#ede7d7';ctx.fillRect(0,0,sheet.width,sheet.height);
        ctx.fillStyle='#213a33';ctx.font='20px monospace';ctx.fillText('SALTLINE FIELD SURVEY   /   BERTH 4',42,58);
        ctx.font='italic 56px Georgia';ctx.fillText('Soundings',42,124);
        ctx.strokeStyle='#696e58';ctx.beginPath();ctx.moveTo(42,148);ctx.lineTo(1758,148);ctx.stroke();
        images.forEach((img,i)=>{
          const x=42+i*577;
          ctx.drawImage(img,x,176,559,373);
          ctx.fillStyle='#213a33';ctx.font='italic 31px Georgia';ctx.fillText(plates[i].name,x,593);
          ctx.font='17px monospace';ctx.fillText('PLATE 0'+(i+1)+'   /   '+album[i].score+' POINTS',x,627);
        });
        const blob=await new Promise(resolve=>sheet.toBlob(resolve,'image/png'));
        if(!blob) throw new Error('Image export failed');
        const a=document.createElement('a');
        a.href=URL.createObjectURL(blob);a.download='Saltline - Soundings contact sheet.png';
        document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),30000);
      } catch {button.textContent='Export failed · try again';}
      finally {button.disabled=false;if(button.textContent!==label)setTimeout(()=>button.textContent=label,2500);}
    }
    function finish() {
      lastAlbum=run.photos.slice();
      let saved=true;
      try {localStorage.setItem(ARCHIVE,JSON.stringify(lastAlbum));}catch{saved=false;}
      archiveButton.hidden=false;
      const score=lastAlbum.reduce((a,p)=>a+p.score,0);
      report.querySelector('.snd-edition').textContent='Berth 4  /  '+(window.__SL_NIGHT?'Night':'Dusk')+'  /  '+score+' of 300 points'+(saved?'':'  /  Save a copy before closing');
      const prints=report.querySelector('.snd-prints');
      prints.replaceChildren();
      lastAlbum.forEach((p,i)=>{
        const fig=document.createElement('figure'), img=new Image(), caption=document.createElement('figcaption');
        img.src=p.image;img.alt='Your photograph of '+p.name;
        const label=document.createElement('small'), name=document.createElement('i');
        label.textContent='PL. 0'+(i+1)+'  /  '+p.score;name.textContent=p.name;
        caption.append(label,name);fig.append(img,caption);prints.append(fig);
      });
      run.ended=true;overlay.classList.remove('on');debrief.classList.add('snd-finished');
      redeploy.textContent='New survey';
      game.finishSoundings();
    }
    function nextPlate() {
      const index=run.photos.length, plate=plates[index];
      fauna.animals.forEach((a,i)=>a.root.visible=i===index);
      run.phase=0;run.proof=null;run.pending=false;run.feedback=0;run.armed=false;
      proof.hidden=true;overlay.classList.remove('review','locked');
      el('.snd-index').textContent='Plate 0'+(index+1)+' / 03';
      el('.snd-species').textContent=plate.name;
      el('.snd-habitat').textContent=plate.habitat;
      site.set(plate.site[0],.65,plate.site[1]);
      fauna.animate(index,0);
      hud.setMarkers([{id:MODE,short:'◇',label:plate.habitat,pos:site.clone(),kind:'dash'}]);
      frameBounds=null;
    }
    function begin() {
      if (!fauna) fauna=createFauna(T);
      G.scene.add(fauna.world);
      run={photos:[],ended:false,phase:0,armed:false,zoom:false,hint:'',device:null};
      weapon.setVisible(false);player.invulnerable=true;
      player.pitch=.47;
      ui.classList.add('snd-active');overlay.classList.add('on');
      restart.textContent='Restart survey';
      touchLabels.forEach(({button,label})=>button?.setAttribute('aria-label',label));
      nextPlate();
    }
    function reset() {
      if(!run)return;
      G.scene.remove(fauna.world);run=null;
      touchLabels.forEach(({button,original})=>{if(original)button.setAttribute('aria-label',original);});
      ui.classList.remove('snd-active','snd-transit');overlay.classList.remove('on','review','locked');
      proof.hidden=true;debrief.classList.remove('snd-finished');
      hud.setMarkers([]);restart.textContent=originalLabels[1];redeploy.textContent=originalLabels[2];
    }
    function action(kind) {
      if(!run?.proof || run.ended || game.state!=='playing')return;
      if(kind==='keep') {
        run.photos.push(run.proof);
        if(run.photos.length===plates.length){finish();return;}
        nextPlate();
      } else {
        run.proof=null;proof.hidden=true;overlay.classList.remove('review');run.armed=false;
      }
    }
    proof.querySelectorAll('button').forEach(b=>{
      b.addEventListener('pointerdown',e=>e.stopPropagation());
      b.addEventListener('click',e=>{e.stopPropagation();action(b.dataset.proof);});
    });
    // Read the same viewport crop that the four viewfinder corners mark on screen.
    function crop() {
      if(!frameBounds) {
        const f=finder.getBoundingClientRect(), c=canvas.getBoundingClientRect();
        frameBounds={x:(f.left-c.left)/c.width,y:(f.top-c.top)/c.height,w:f.width/c.width,h:f.height/c.height};
      }
      return frameBounds;
    }
    function sight(index) {
      const target=fauna.animals[index].root.position, plate=plates[index], f=crop();
      camera.updateMatrixWorld();
      projected.copy(target).project(camera);
      const x=((projected.x+1)*.5-f.x)/f.w, y=((1-projected.y)*.5-f.y)/f.h;
      const distance=camera.position.distanceTo(target);
      const front=projected.z<1 && projected.z>=-1;
      const size=plate.size/(2*distance*Math.tan(camera.fov*Math.PI/360)*camera.aspect*f.w);
      const range=Math.hypot(player.pos.x-plate.site[0],player.pos.z-plate.site[1]);
      ui.classList.toggle('snd-transit',range>15);
      let hint='',locked=false;
      if(range>15) hint='Walk to '+plate.habitat+'  ·  '+Math.round(range)+' m';
      else if(!front || x<.10 || x>.90 || y<.1 || y>.90) {
        direction.copy(target).sub(camera.position).applyQuaternion(inverseCamera.copy(camera.quaternion).invert());
        const side=Math.abs(direction.x)>Math.abs(direction.y) || direction.z>0;
        hint=side?(direction.x<0?'← Turn left':'Turn right →'):(direction.y>0?'↑ Look up':'↓ Look down');
      } else if(!G.physics.lineOfSight(camera.position,target))hint='Find a clear view';
      else {locked=true;hint=size<.23?'In frame  ·  zoom for detail':'In frame  ·  press shutter';}
      const composition=1-clamp(Math.hypot(x-.5,y-.5)*1.5,0,1);
      const framing=1-clamp(Math.abs(size-.66)/.66,0,1);
      const cycle=[1.65,1.9,1.12][index];
      const behavior=.5+.5*Math.sin(run.phase*cycle);
      return {locked,hint,score:Math.round(30+28*composition+24*framing+18*behavior),behavior};
    }
    function expose(sighting) {
      const plate=plates[run.photos.length], f=crop();
      const photo=document.createElement('canvas');photo.width=900;photo.height=600;
      const ctx=photo.getContext('2d');
      ctx.drawImage(canvas,f.x*canvas.width,f.y*canvas.height,f.w*canvas.width,f.h*canvas.height,0,0,900,600);
      const image=photo.toDataURL('image/jpeg',.85);
      run.proof={name:plate.name,score:sighting.score,image};
      const img=proof.querySelector('img');img.src=image;img.alt='Exposure of '+plate.name;
      el('.snd-proof figcaption i').textContent=plate.name;
      el('.snd-proof figcaption b').textContent=sighting.score+' / 100';
      const description=sighting.behavior>.82?plate.behavior+' captured':'Exposure ready';
      el('.snd-proof-keys').textContent=description+(input.touch?'':input.device==='pad'?'  ·  RT file / X retake':'  ·  Click to file / R to retake');
      proof.hidden=false;overlay.classList.add('review');run.armed=false;
      G.audio?.play?.('ui_click',{gain:.6,pitch:1.65});
    }
    function update(dt) {
      if(!run || run.ended || game.state!=='playing')return;
      const device=input.touch?'touch':input.device==='pad'?'pad':'mouse';
      if(device!==run.device) {
        el('.snd-controls').textContent={touch:'Shutter to expose  ·  Zoom for detail',pad:'RT  Shutter     LT  Zoom',mouse:'LMB / Enter  Shutter     RMB  Zoom'}[device];run.device=device;
      }
      if(!input.fire)run.armed=true;
      const shutter=run.armed && (input.fire || input.pressed('fire'));
      if(run.proof) {
        if(input.pressed('reload'))action('retake');
        else if(shutter)action('keep');
        return;
      }
      run.phase+=dt;
      fauna.animate(run.photos.length,run.phase);
      const fov=game.menus.settings.fov||74, target=input.ads?fov*.62:fov;
      if(Math.abs(camera.fov-target)>.01){camera.fov=target;camera.updateProjectionMatrix();}
      if(shutter){run.pending=true;run.armed=false;}
      run.feedback=Math.max(0,run.feedback-dt);
    }
    // The WebGL buffer is readable here, before the browser composites and clears it.
    const frame=G.render.frame;
    G.render.frame=function(dt) {
      const value=frame.call(this,dt);
      if(run && !run.ended && !run.proof && game.state==='playing') {
        const s=sight(run.photos.length);
        if(run.pending) {
          run.pending=false;
          if(s.locked)expose(s);
          else {run.feedback=1.2;G.audio?.play?.('ui_click',{gain:.3,pitch:.65});}
        }
        const hint=(run.feedback?'No exposure  ·  ':'')+s.hint;
        if(run.hint!==hint){readout.textContent=hint;run.hint=hint;}
        overlay.classList.toggle('locked',s.locked);
      }
      return value;
    };
    const baseReset=player.reset, baseWeapon=weapon.update;
    player.reset=function(point){reset();return baseReset.call(this,game.run.mode===MODE?start:point);};
    weapon.update=function(dt){if(run)update(dt);else return baseWeapon.call(this,dt);};
    G.events.on('game:state',({state})=>{
      if(state==='title'||state==='dead'){reset();return;}
      if(game.run.mode!==MODE)return;
      if(state==='playing'){if(!run)begin();else{overlay.classList.add('on');run.armed=false;}}
      if(state==='paused')overlay.classList.remove('on');
    });
    if(game.run.mode===MODE && game.state==='playing'){baseReset.call(player,start);begin();}
  }
  boot();
})();
