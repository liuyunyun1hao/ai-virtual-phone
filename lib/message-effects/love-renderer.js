// Approved Love v5: exact mesh, material and motion; live scene replaces mock texture.
export function createLoveRenderer(ctx,reflection){
  const clamp=v=>Math.max(0,Math.min(1,v)),smooth=v=>{v=clamp(v);return v*v*(3-2*v)},mix=(a,b,t)=>a+(b-a)*t;
 const heart=new Path2D('M160 310 C144 307 49 249 26 175 C9 121 24 69 63 45 C104 19 133 53 154 66 Q160 71 166 66 C188 52 214 19 254 44 C293 69 310 119 293 175 C271 245 180 303 160 310 Z');
 function surface(){const c=document.createElement('canvas');c.width=960;c.height=1020;return c}
 const metal=surface(),ink=metal.getContext('2d');ink.scale(3,3);
 const body=ink.createRadialGradient(159,157,12,156,148,180);[[0,'#890002'],[.45,'#850002'],[.72,'#760001'],[.9,'#5b0000'],[1,'#440000']].forEach(([p,c])=>body.addColorStop(p,c));
 ink.fillStyle=body;ink.fill(heart);ink.save();ink.clip(heart);
 // Shape-aware depth shading: a narrow dark-red turn rolls into the inflated face.
 // Rasterized once. Distance to the actual silhouette avoids both a flat fill
 // and the old uniform, nearly-black blurred outline.
 const volume=document.createElement('canvas');volume.width=320;volume.height=340;
 const vc=volume.getContext('2d');vc.fillStyle='#fff';vc.fill(heart);
 const pixels=vc.getImageData(0,0,320,340),distance=new Float32Array(320*340);
 for(let i=0;i<distance.length;i++)distance[i]=pixels.data[i*4+3]>127?10000:0;
 for(let y=1;y<339;y++)for(let x=1;x<319;x++){
  const i=y*320+x;if(distance[i])distance[i]=Math.min(distance[i],distance[i-1]+1,distance[i-320]+1,distance[i-321]+1.414,distance[i-319]+1.414);
 }
 for(let y=338;y>0;y--)for(let x=318;x>0;x--){
  const i=y*320+x;if(distance[i])distance[i]=Math.min(distance[i],distance[i+1]+1,distance[i+320]+1,distance[i+321]+1.414,distance[i+319]+1.414);
 }
 for(let i=0;i<distance.length;i++){
  const d=distance[i],j=i*4;
  if(!d){pixels.data[j+3]=0;continue;}
  const x=i%320,y=Math.floor(i/320),turn=.31*Math.exp(-d/6)+.17*Math.exp(-d/23);
  const weight=.88+.12*x/320+.10*y/340;
  pixels.data[j]=35;pixels.data[j+1]=0;pixels.data[j+2]=0;pixels.data[j+3]=Math.round(255*turn*weight);
 }
 vc.putImageData(pixels,0,0);ink.drawImage(volume,0,0);
 function glow(x,y,rx,ry,rotation,color,alpha){ink.save();ink.translate(x,y);ink.rotate(rotation);ink.scale(rx,ry);const g=ink.createRadialGradient(0,0,0,0,0,1);const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16));[[0,1],[.25,.7],[.5,.3],[.75,.065],[1,0]].forEach(([p,a])=>g.addColorStop(p,`rgba(${rgb.join(',')},${a})`));ink.globalAlpha=alpha;ink.fillStyle=g;ink.fillRect(-1,-1,2,2);ink.restore()}
 // A single continuous concave reflection, feathered into the red metal.
 glow(117,119,87,73,-.18,'#c9080b',.18);
 ink.save();ink.strokeStyle='rgba(239,0,7,.5)';ink.lineWidth=8;ink.lineCap='round';ink.filter='blur(5px)';ink.beginPath();ink.moveTo(116,78);ink.bezierCurveTo(139,98,174,105,202,77);ink.stroke();ink.restore();
 glow(156,92,54,23,-.06,'#ff0008',.98);
 glow(39,162,13,45,-.29,'#f30a13',.73);glow(285,177,11,44,.32,'#f30610',.61);
 // Two short, unequal reflected edges: deliberately no continuous bright outline.
 ink.strokeStyle='rgba(255,89,72,.57)';ink.lineWidth=.65;ink.beginPath();ink.moveTo(210,41);ink.bezierCurveTo(226,35,244,41,250,45);ink.stroke();
 ink.restore();
 // Inflated front surface, rendered with pose-dependent normals and reflections.
 // Geometry/field are prepared once; only small pose uniforms change per frame.
 const balloon=document.createElement('canvas');balloon.width=800;balloon.height=850;
 const gl=balloon.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:false,preserveDrawingBuffer:true});
 let paintBalloon=null;const textures=[],buffers=[],shaders=[];let gpuProgram=null;
 if(gl){
  const vertex=`
   precision mediump float;
   attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
   uniform float yaw; uniform float pitch; uniform float fullness;
   varying vec3 N; varying vec2 UV; varying vec3 P;
   void main(){
    float cy=cos(yaw),sy=sin(yaw),cp=cos(pitch),sp=sin(pitch);
    mat3 ry=mat3(cy,0.,-sy,0.,1.,0.,sy,0.,cy);
    mat3 rx=mat3(1.,0.,0.,0.,cp,sp,0.,-sp,cp);
    vec3 p=position;p.z*=fullness;
    vec3 n=normalize(vec3(normal.xy*fullness,normal.z));
    p=rx*ry*p;N=rx*ry*n;UV=uv;P=p;
    float perspective=640./(640.-p.z);
    gl_Position=vec4(p.x*perspective/160.,-p.y*perspective/170.,-p.z/200.,1.);
   }`;
  const fragment=`
   precision mediump float;
   uniform sampler2D mask; uniform sampler2D environment;
   uniform float yaw; uniform float pitch; uniform float lift;
   uniform vec2 sceneCenter;
   varying vec3 N; varying vec2 UV; varying vec3 P;
   float bell(float v,float width){return exp(-v*v/(width*width));}
   void main(){
    float alpha=texture2D(mask,UV).a;if(alpha<.06)discard;
    vec3 n=normalize(N);float facing=max(n.z,0.);
    float light=dot(n,normalize(vec3(-.35,-.55,1.)));
    float red=.12+.395*pow(facing,1.25)+.025*light;
    vec2 q=UV*vec2(320.,340.);
    // Curved notch response slides with the virtual viewing/light angle.
    float nx=157.+yaw*47.;float ny=88.+pitch*49.;
    float notch=bell(q.y-(ny-.008*(q.x-nx)*(q.x-nx)),10.)*bell(q.x-nx,39.);
    float broad=bell(q.y-105.,45.)*bell(q.x-(128.+yaw*55.),85.);
    // The side lights are reflections of narrow environment strips on curved normals.
    float left=bell(n.x+.78-yaw*.2,.22)*bell(q.y-157.-pitch*60.,40.);
    float right=bell(n.x-.78-yaw*.18,.19)*bell(q.y-178.-pitch*40.,53.);
    float side=(left*.37+right*(.34+.18*lift));
    side+=.29*bell(q.x-(37.+yaw*18.)+.19*(q.y-155.),10.)*bell(q.y-155.-pitch*48.,33.);
    side+=(.23+.14*lift)*bell(q.x-(285.+yaw*15.)-.18*(q.y-168.),8.)*bell(q.y-168.-pitch*42.,37.);
    // One hard, short shoulder glint, with a feathered red skirt.
    float hx=230.+yaw*30.;float hy=46.+pitch*26.;
    float crest=bell(q.y-(hy+.012*(q.x-hx)*(q.x-hx)),1.05)*bell(q.x-hx,22.);
    red+=notch*.48+broad*.028+side+crest*.35;
    vec3 r=reflect(vec3(0.,0.,-1.),n);
    // Mirrored convex reflection, NOT screen-aligned transparency. Sampling shifts
    // with the balloon's position; curved normals compress UI around the shoulders.
    vec2 envUV=vec2(.5-(UV.x-.5)*1.65-r.x*.10,(UV.y-.08)*1.10+r.y*.075);
    envUV+=(sceneCenter-vec2(.5,.4))*vec2(.28,.32);
    vec4 env=texture2D(environment,clamp(envUV,vec2(.005),vec2(.995)));
    float inFrame=step(0.,envUV.x)*step(envUV.x,1.)*step(0.,envUV.y)*step(envUV.y,1.);
    float region=.015+.38*smoothstep(.18,.65,abs(n.x))+.20*bell(q.y-64.,20.);
    float reflectedLight=dot(env.rgb,vec3(.22,.68,.10))*env.a*inFrame;
    vec3 color=vec3(red,.0015+notch*.006,.002+side*.008);
    // Pale warm specular catches on opaque red foil; no flat pink text overlay.
    color+=reflectedLight*vec3(.85,.48,.39)*region;
    gl_FragColor=vec4(clamp(color,0.,1.),alpha);
   }`;
  function shader(type,code){const s=gl.createShader(type);shaders.push(s);gl.shaderSource(s,code);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s}
  const program=gl.createProgram();gpuProgram=program;gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  // Smooth distance field before differentiation: avoid faceted normals from pixel stairs.
  const heightField=new Float32Array(320*340);
  for(let y=0;y<340;y++)for(let x=0;x<320;x++){
   let sum=0;for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++)sum+=distance[Math.max(0,Math.min(339,y+dy))*320+Math.max(0,Math.min(319,x+dx))];
   heightField[y*320+x]=60*Math.sqrt(sum/25/80);
  }
  // Round the medial ridges of a distance field into a single inflated cushion.
  const kernel=Array.from({length:35},(_,i)=>Math.exp(-Math.pow((i-17)/8,2)/2)),weight=kernel.reduce((a,b)=>a+b,0),tempHeight=new Float32Array(heightField.length);
  for(let y=0;y<340;y++)for(let x=0;x<320;x++){let value=0;for(let k=-17;k<=17;k++)value+=heightField[y*320+Math.max(0,Math.min(319,x+k))]*kernel[k+17];tempHeight[y*320+x]=value/weight;}
  for(let y=0;y<340;y++)for(let x=0;x<320;x++){let value=0;for(let k=-17;k<=17;k++)value+=tempHeight[Math.max(0,Math.min(339,y+k))*320+x]*kernel[k+17];heightField[y*320+x]=value/weight*smooth(distance[y*320+x]/9);}
  const depth=(x,y)=>heightField[Math.max(0,Math.min(339,y))*320+Math.max(0,Math.min(319,x))];
  const vertices=[],indices=[],cols=81,rows=86;
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
   const px=x*4,py=y*4,z=depth(px,py),nx=-(depth(px+2,py)-depth(px-2,py))/4,ny=-(depth(px,py+2)-depth(px,py-2))/4;
   vertices.push(px-160,py-170,z,nx,ny,1,px/320,py/340);
   if(x<cols-1&&y<rows-1){const i=y*cols+x;indices.push(i,i+1,i+cols,i+1,i+cols+1,i+cols);}
  }
  const vertexBuffer=gl.createBuffer();buffers.push(vertexBuffer);gl.bindBuffer(gl.ARRAY_BUFFER,vertexBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);
  for(const [name,size,offset] of [['position',3,0],['normal',3,12],['uv',2,24]]){const a=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,size,gl.FLOAT,false,32,offset);}
  const indexBuffer=gl.createBuffer();buffers.push(indexBuffer);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
  const maskCanvas=document.createElement('canvas');maskCanvas.width=640;maskCanvas.height=680;const maskInk=maskCanvas.getContext('2d');maskInk.scale(2,2);maskInk.fillStyle='#fff';maskInk.fill(heart);
  function texture(unit,name,source){gl.activeTexture(gl.TEXTURE0+unit);const resource=textures[unit]||(textures[unit]=gl.createTexture());gl.bindTexture(gl.TEXTURE_2D,resource);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);gl.uniform1i(gl.getUniformLocation(program,name),unit);}
  texture(0,'mask',maskCanvas);
  const uniform={};for(const name of ['yaw','pitch','fullness','lift'])uniform[name]=gl.getUniformLocation(program,name);
  uniform.sceneCenter=gl.getUniformLocation(program,'sceneCenter');
  paintBalloon=(yaw,pitch,fullness,lift,environment,centerX=.5,centerY=.4)=>{
   if(environment)texture(1,'environment',environment);
   gl.viewport(0,0,800,850);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.DEPTH_TEST);
   gl.uniform1f(uniform.yaw,yaw);gl.uniform1f(uniform.pitch,pitch);gl.uniform1f(uniform.fullness,fullness);gl.uniform1f(uniform.lift,lift);gl.uniform2f(uniform.sceneCenter,centerX,centerY);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
  };
 }

 if(paintBalloon)paintBalloon(0,0,1,0,reflection);
 return {duration:6000,degraded:!paintBalloon,dispose(){if(gl){textures.forEach(t=>gl.deleteTexture(t));buffers.forEach(b=>gl.deleteBuffer(b));shaders.forEach(s=>gl.deleteShader(s));if(gpuProgram)gl.deleteProgram(gpuProgram);gl.getExtension('WEBGL_lose_context')?.loseContext();}},draw(ms,width,height,anchor){
 if(ms<=0||ms>=6000)return;
 const t=ms/1000,unit=width/370,ax=anchor.x/unit,ay=anchor.y/unit;
   const inflate=smooth(t/2.65),lift=smooth((t-3.1)/2.6),scale=mix(.035,1.34,inflate)*(1-.055*lift);
  const flutter=smooth(t/.2)*(1-smooth((t-.55)/1.8));
  const breath=Math.sin(t*8.7+.4)*.018*flutter;
  const sx=scale*(.86+.14*smooth(t/1.6))*(1+breath),sy=scale*(.82+.18*smooth(t/2.0))*(1-breath*.6);
  const settle=smooth(t/2.8),px=mix(ax,200,settle)-110*lift,py=ay-10*inflate-(height/unit+60)*Math.pow(lift,1.35);
  const angle=Math.sin(t*5.1-.4)*.075*(1-.65*inflate)-.065*lift+Math.sin(t*9.2)*.028*flutter;
  const yaw=Math.sin(t*5.1+.5)*.23*(1-.6*inflate)-.10*lift;
  const pitch=Math.sin(t*4.3-.6)*.07*(1-.55*inflate)+.055*lift;

 ctx.save();ctx.fillStyle='rgba(0,0,0,'+(.13*smooth(t/.5)*(1-smooth((t-4.65)/1.1)))+')';ctx.fillRect(0,0,width,height);
 if(paintBalloon)paintBalloon(yaw,pitch,.52+.48*inflate,lift,null,px/370,(py-140*sy)/(height/unit));
 ctx.scale(unit,unit);ctx.translate(px,py);ctx.rotate(angle);ctx.scale(sx,sy);ctx.translate(-160,-310);ctx.drawImage(paintBalloon?balloon:metal,0,0,320,340);ctx.restore();
 return lift<.14;
 }};
}
