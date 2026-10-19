// Approved Fireworks v2: choreography and particle equations preserved.
export function createFireworksRenderer(c){
 const W=390;let H=650,seed=928;
 const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
 const colors=['#ffd78a','#ffbc63','#ff748d','#b1a6ff','#8cd4ff','#fff4ca'];
 const sprites=colors.map(color=>{const s=document.createElement('canvas');s.width=s.height=40;const x=s.getContext('2d'),g=x.createRadialGradient(20,20,0,20,20,20);g.addColorStop(0,'#fff9e9');g.addColorStop(.09,color);g.addColorStop(.28,color+'90');g.addColorStop(1,color+'00');x.fillStyle=g;x.fillRect(0,0,40,40);return s});

  const plan=[
  {t:1.02,x:190,y:228,size:1.08,color:0,n:230},
  {t:2.03,x:93,y:184,size:.70,color:2,n:155},
  {t:2.65,x:291,y:258,size:.81,color:3,n:175},
  {t:3.37,x:135,y:330,size:.64,color:4,n:150},
  {t:3.89,x:263,y:170,size:.86,color:0,n:195},
  {t:4.24,x:80,y:248,size:.76,color:5,n:180},
  {t:4.43,x:208,y:300,size:1.02,color:0,n:220},
  {t:4.55,x:73,y:365,size:.75,color:2,n:160},
  {t:4.73,x:308,y:298,size:.85,color:4,n:175},
  {t:4.91,x:127,y:145,size:.90,color:0,n:210},
  {t:5.08,x:268,y:386,size:.85,color:3,n:180},
  {t:5.23,x:81,y:247,size:.88,color:5,n:210},
  {t:5.39,x:220,y:224,size:1.25,color:0,n:290}
 ];
 for(const f of plan){
  f.launch=f.t-.86;f.fromX=f.x+(random()-.5)*90;f.particles=[];f.finale=f.t>=3.89;
  for(let i=0;i<f.n;i++){
   const angle=i*2.399963+random()*.09,z=random()*2-1,projection=Math.sqrt(1-z*z),speed=(140+random()*88)*f.size*projection;
   f.particles.push({vx:Math.cos(angle)*speed,vy:Math.sin(angle)*speed,life:1.5+random()*.95,k:.77+random()*.35,phase:random()*Math.PI*2,size:.5+random()*.65,color:random()<.16?5:f.color,drift:(random()-.5)*7,tail:.16+random()*.18});
  }
 }
 function point(f,p,t){const d=(1-Math.exp(-p.k*t))/p.k;return [f.x+p.vx*d+p.drift*t*t,f.y+p.vy*d+40*(t-d)/p.k]}
 function rocket(f,t){
  const u=(t-f.launch)/.86;if(u<0||u>=1)return;
  function pos(v){v=clamp(v);return [f.fromX+(f.x-f.fromX)*v,f.y+(H+20-f.y)*Math.pow(1-v,1.7)]}
  c.strokeStyle='#ffd092';c.lineCap='round';
  for(let j=0;j<12;j++){const a=pos(u-j*.009),z=pos(u-(j+1)*.009);c.globalAlpha=(1-j/12)*.88;c.lineWidth=j<3?1.15:.65;c.beginPath();c.moveTo(...a);c.lineTo(...z);c.stroke()}
  const h=pos(u);c.globalAlpha=.9;c.drawImage(sprites[0],h[0]-5,h[1]-5,10,10);
 }
 function burst(f,t){
  const age=t-f.t;if(age<0||age>(f.finale?3.5:2.6))return;
  // Small local ignition glow, no full-screen white flash.
  if(age<.26){c.globalAlpha=.35*Math.exp(-age*17);const s=28+age*210;c.drawImage(sprites[f.color],f.x-s/2,f.y-s/2,s,s)}
  for(const p of f.particles){
   const life=p.life+(f.finale?.95:0);if(age>life)continue;
   const fade=1-smooth((age-p.life*.43)/(p.life*.57)),twinkle=.67+.33*Math.sin(p.phase+age*(12+p.size*5));
   const ember=f.finale?smooth((age-.75)/.8):0;
   const shimmer=.18+.82*Math.pow(.5+.5*Math.sin(p.phase*2+age*(8+p.size*3)),3);
   const residual=ember*.48*(1-smooth((age-(life-1.0))/1.0))*shimmer;
   const a=Math.max(fade*(age<.6?1:twinkle),residual),fragment=1-ember;
   const pigment=f.finale&&age>1.25?0:p.color;
   const head=point(f,p,age);c.strokeStyle=colors[pigment];c.lineCap='round';
   // Short tapering curved trails; older fragments break into falling sparks.
   const trail=Math.min(age,p.tail*(1+age*.25));
   for(let j=0;j<5&&fragment>.015;j++){
    const t0=age-trail*j/5,t1=age-trail*(j+1)/5,from=point(f,p,t0),to=point(f,p,t1);
    c.globalAlpha=a*(1-j/5)*.88*fragment;c.lineWidth=p.size*(1-j*.12);c.beginPath();c.moveTo(...from);c.lineTo(...to);c.stroke();
   }
   c.globalAlpha=a*.86;const s=p.size*(5+ember*1.5);c.drawImage(sprites[pigment],head[0]-s/2,head[1]-s/2,s,s);
   c.globalAlpha=a;c.fillStyle='#fff4da';c.fillRect(head[0]-.4,head[1]-.4,.8,.8);
   if(age>.42){
    for(let j=1;j<=3;j++){
     const lag=j*.11+p.tail*.4,birth=Math.max(0,age-lag),q=point(f,p,birth),spark=.5+.5*Math.sin(p.phase*3+j*7+age*19);
     c.globalAlpha=a*spark*(1-j*.2)*.68;c.fillStyle=colors[pigment];c.fillRect(q[0]+Math.sin(p.phase+j)*lag*(4+ember*18),q[1]+lag*lag*(30+ember*70),.65,.9);
    }
   }
  }
 }

 const baseY=plan.map(f=>f.y);
 return {duration:9200,dispose(){},draw(ms,width,height){
 if(ms<=0||ms>=9200)return;
 const scale=width/W;H=height/scale;plan.forEach((f,i)=>f.y=baseY[i]*H/650);
 const t=ms/1000;c.save();c.fillStyle='rgba(2,5,13,'+(.72*smooth(t/.55)*(1-smooth((t-7.35)/1.85)))+')';c.fillRect(0,0,width,height);
 c.scale(scale,scale);c.globalCompositeOperation='lighter';for(const f of plan){rocket(f,t);burst(f,t)}c.restore();
 }};
}
