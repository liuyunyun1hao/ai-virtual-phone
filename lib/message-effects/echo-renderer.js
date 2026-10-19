// Echo v4 cloud + early continuous orbits: eight naturally passing foreground copies.
export function createEchoRenderer(ctx,sample){
 const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
  const noise=i=>{const n=Math.sin(i*127.1+43.17)*43758.5453;return n-Math.floor(n)};
 const particles=Array.from({length:240},(_,i)=>({i,phase:noise(i+2)*Math.PI*2,lat:noise(i+92)*2-1,r:.35+.65*Math.sqrt(noise(i+277)),size:i%13===0?1.22: i%4===0?.65:.14+.3*noise(i+381),delay:noise(i+54)*.32,life:3.02+.88*noise(i+119),drift:noise(i+11)-.5}));
 // Promote eight existing particles. Their phase/depth varies continuously:
 // no timed slots, screen-space destinations, dwell windows or forced z-order.
 const nearPasses=new Set([13,39,52,78,104,130,169,208]);
 [...nearPasses].forEach((id,k)=>{
  Object.assign(particles[id],{phase:.45+k*2.399963,
   lat:(noise(id+92)*2-1)*.36,r:.62+.12*noise(id+277),speed:2.22});
 });

  function bubble(x,y,s,alpha=1){ctx.globalAlpha=alpha;ctx.drawImage(sample.sprite,x-sample.width*s/2,y-sample.height*s/2,sample.width*s,sample.height*s);ctx.globalAlpha=1;}

 return {duration:6000,dispose(){},draw(ms,w,h){
 const t=ms/1000*.7,scale=w/370;
 const dim=t>0?smooth(t/.4)*(1-smooth((t-3.45)/.65))*.13:0;ctx.fillStyle='rgba(0,0,0,'+dim+')';ctx.fillRect(0,0,w,h);
 if(t<=0||t>=4.2)return;
   const projected=[];
  for(const p of particles){
   const age=t-p.delay;if(age<=0||age>p.life)continue;
   const near=nearPasses.has(p.i);
   const yaw=age*(p.speed||2.22)+p.phase;
   const z=Math.sin(yaw)*p.r;
   const perspective=1/(1-z*.73);
   // A broad, tilted cloud crosses the screen; glyphs remain upright.
   const px=Math.cos(yaw)*p.r,py=p.lat*.86+Math.sin(yaw*.77+p.phase)*.16;
   const expansion=1+smooth((age-1.85)/1.1)*1.5;
   // Keep foreground copies in the same cloud, but damp its outward spread
   // as they approach the lens. Otherwise perspective and expansion compound
   // into a large, fast billboard sweeping sideways across the whole screen.
   // Depth/size/time remain unchanged; this is a continuous orbit adjustment.
   const foreground=near?smooth((z-.15)/.5):0;
   const orbitExpansion=1+(expansion-1)*(1-.78*foreground);
   const lateral=1-.3*foreground;
   const cx=w*(.52-.11*smooth((age-1.3)/1.5)),cy=h*(.64-.1*clamp(age/3));
   // Enter as an already dispersed cloud from the left edge, not from the source.
   const entryShift=w*1.7*Math.pow(1-clamp(t/.9),2.5);
   const x=cx+(px-py*.18)*w*(near?.28:.43)*perspective*orbitExpansion*lateral-entryShift;
   const y=cy+(py+px*.1)*h*(near?.3:.41)*perspective*orbitExpansion;
   const farExit=1-smooth((age-(p.life-.75))/.8)*.8;
   // Background copies keep their original scale and orbit.
   const rawScale=p.size*perspective;
   // Foreground belongs to the dense climax, not the dissolving tail.
   // Retreat between 3.36s and 4s; no abrupt removal or transparent giants.
   const nearPresence=1-smooth((t-2.35)/.45);
   // A modest foreground lift, not giant billboard-sized copies.
   // Only these eight copies change size; the surrounding swarm is untouched.
   const nearBoost=near?.45*smooth((z-.15)/.5)*nearPresence:0;
   // Blend the distant ending by depth, avoiding the previous z=.35 scale jump.
   const exitScale=1-(1-farExit)*(1-smooth((z-.15)/.4)*(near?nearPresence:1));
   const depthScale=(rawScale/(1+rawScale*.85)+nearBoost)*exitScale;
   const s=Math.min(depthScale*sample.normalization,w*.72/(sample.width*scale))*scale;
   // No transparent swarm: only a brief, staggered final disappearance.
   const alpha=1-smooth((age-(p.life-.16))/.16);
   projected.push({x,y,s,z,alpha});
  }
  projected.sort((a,b)=>a.z-b.z);
  for(const p of projected)bubble(p.x,p.y,p.s,p.alpha);
 }};
}
