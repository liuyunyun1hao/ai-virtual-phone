import type { BubbleSprite } from './types';

const excluded = 'button,script,style,.imessage-tapback-badge,.echo-replay-message,[aria-hidden="true"]';
function color(style: CSSStyleDeclaration, fallback: string) {
    const value = style.getPropertyValue('--bubble-surface-color').trim() || style.backgroundColor;
    return !value || value === 'rgba(0, 0, 0, 0)' || value === 'transparent' ? fallback : value;
}

/** Rasterize visible text at its measured line positions; never capture unsent drafts. */
export function captureBubble(node: HTMLElement, opaque = true): BubbleSprite {
    const rect = node.getBoundingClientRect(), width = Math.max(1, node.offsetWidth || rect.width), height = Math.max(1, node.offsetHeight || rect.height);
    const sprite = document.createElement('canvas');sprite.width = Math.ceil((width + 10) * 2);sprite.height = Math.ceil((height + 10) * 2);
    const c = sprite.getContext('2d')!;c.scale(2,2);c.translate(5,5);
    const style = getComputedStyle(node), row = node.closest<HTMLElement>('.chat-msg-wrapper'), user = row?.dataset.role === 'user' || node.classList.contains('chat-bubble-role-user');
    const glass = !!node.closest('[data-glass-bubbles]');
    c.fillStyle = color(style, user ? '#168cf5' : '#535967');
    if(glass)c.fillStyle=user?'#0571dd':style.getPropertyValue('--im26-char-bubble-fill').trim()||'#121a23';
    // Force a fully opaque fill without changing the live bubble's glass surface.
    const probe=document.createElement('canvas');probe.width=probe.height=1;const pc=probe.getContext('2d')!;pc.fillStyle=c.fillStyle;pc.fillRect(0,0,1,1);const rgb=pc.getImageData(0,0,1,1).data;
    if(opaque)c.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    else if(glass)c.fillStyle=`rgba(${rgb[0]},${rgb[1]},${rgb[2]},.86)`;
    c.beginPath();c.roundRect(0,0,width,height,Math.min(parseFloat(style.borderRadius)||20,height/2));c.fill();
    if(row?.hasAttribute('data-imessage-tail')){
        c.save();if(!user){c.translate(width,0);c.scale(-1,1)}
        c.beginPath();c.moveTo(width-14,height-10);c.quadraticCurveTo(width-5,height,width+5,height+3);c.quadraticCurveTo(width-7,height+4,width-18,height-2);c.fill();c.restore();
    }
    c.save();c.beginPath();c.rect(0,0,width,height);c.clip();
    const sx=width/rect.width,sy=height/rect.height,walker=document.createTreeWalker(node,NodeFilter.SHOW_TEXT);
    const segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
    let text:Node|null;
    while((text=walker.nextNode())){
        const parent=text.parentElement;if(!parent||parent.closest(excluded))continue;
        const st=getComputedStyle(parent);if(st.display==='none'||st.visibility==='hidden')continue;
        c.font=`${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`;c.fillStyle=st.color;c.textBaseline='middle';
        for(const item of segmenter.segment(text.textContent||'')){
            if(!item.segment.trim())continue;
            const range=document.createRange();range.setStart(text,item.index);range.setEnd(text,item.index+item.segment.length);
            const r=range.getBoundingClientRect();if(!r.width||!r.height)continue;
            c.fillText(item.segment,(r.left-rect.left)*sx,(r.top-rect.top+r.height/2)*sy);
        }
    }
    c.restore();return {sprite,width:width+10,height:height+10,normalization:Math.sqrt(112.5*47.5/((width+10)*(height+10)))};
}

/** Echo has its own display typography: a small chat font must not shrink the show.
 * Keep DOM capture unchanged for Love's source bubble and whole-room snapshots. */
export function captureEchoBubble(node: HTMLElement): BubbleSprite {
    const style=getComputedStyle(node),row=node.closest<HTMLElement>('.chat-msg-wrapper');
    const user=row?.dataset.role==='user'||node.classList.contains('chat-bubble-role-user');
    const glass=!!node.closest('[data-glass-bubbles]');
    const sprite=document.createElement('canvas'),c=sprite.getContext('2d')!;
    const font=`${style.fontWeight || '400'} 20px -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif`;
    c.font=font;
    let ink=style.color,foundInk=false;
    // Read only displayed message content, excluding reactions, controls and hidden text.
    function textOf(current:Node):string {
        if(current.nodeType===Node.TEXT_NODE){
            const parent=current.parentElement;if(!parent)return '';
            if(!foundInk&&(current.textContent||'').trim()){ink=getComputedStyle(parent).color;foundInk=true;}
            return current.textContent||'';
        }
        if(!(current instanceof HTMLElement))return '';
        const st=getComputedStyle(current);
        if(current.matches(excluded)||st.display==='none'||st.visibility==='hidden')return '';
        if(current.tagName==='BR')return '\n';
        const body=Array.from(current.childNodes).map(textOf).join('');
        return current!==node&&['block','list-item'].includes(st.display)?`\n${body}\n`:body;
    }
    const text=textOf(node).replace(/[\t ]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
    const lines:string[]=[],segmenter=new Intl.Segmenter(undefined,{granularity:'grapheme'});
    // Same eight-CJK-character line measure as the approved 15-character preview.
    for(const paragraph of text.split('\n')){
        let line='';
        for(const {segment} of segmenter.segment(paragraph)){
            if(line&&c.measureText(line+segment).width>160){lines.push(line.trimEnd());line='';}
            line+=segment;
        }
        lines.push(line.trimEnd());
    }
    const bodyWidth=Math.min(188,Math.max(64,...lines.map(line=>c.measureText(line).width+43)));
    const bodyHeight=lines.length===1?38:lines.length*26+16;
    const width=bodyWidth+9.5,height=bodyHeight+9.5;
    sprite.width=Math.ceil(width*3);sprite.height=Math.ceil(height*3);
    c.scale(3,3);c.font=font;
    let fill=color(style,user?'#168cf5':'#535967');
    if(glass)fill=user?'#0571dd':style.getPropertyValue('--im26-local-bubble-fill').trim()||style.getPropertyValue('--im26-char-bubble-fill').trim()||'#121a23';
    const probe=document.createElement('canvas');probe.width=probe.height=1;
    const pc=probe.getContext('2d')!;pc.fillStyle=fill;pc.fillRect(0,0,1,1);
    const rgb=pc.getImageData(0,0,1,1).data;
    c.fillStyle=`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
    c.beginPath();c.roundRect(2,2,bodyWidth,bodyHeight,19);c.fill();
    if(row?.hasAttribute('data-imessage-tail')){
        c.save();if(!user){c.translate(bodyWidth+4,0);c.scale(-1,1);}
        c.beginPath();c.moveTo(bodyWidth-12,bodyHeight-8);
        c.bezierCurveTo(bodyWidth-4,bodyHeight-1,bodyWidth+1,bodyHeight+2,bodyWidth+7,bodyHeight+4);
        c.bezierCurveTo(bodyWidth-2,bodyHeight+6,bodyWidth-9,bodyHeight+3,bodyWidth-15,bodyHeight);
        c.closePath();c.fill();c.restore();
    }
    c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';
    lines.forEach((line,i)=>c.fillText(line,bodyWidth/2+2,bodyHeight/2+2+(i-(lines.length-1)/2)*26));
    // Short copies retain the approved size. Long copies shrink at most 15%,
    // not by sqrt(area), so adding lines does not turn the text into specks.
    const normalization=lines.length===1?1:Math.max(.85,Math.min(1,Math.pow(112.5*47.5/(width*height),.15)));
    return {sprite,width,height,normalization};
}

function image(url:string):Promise<HTMLImageElement|null>{
    return new Promise(resolve=>{
        const img=new Image();let settled=false;
        const finish=(value:HTMLImageElement|null)=>{if(settled)return;settled=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(value)};
        const timer=setTimeout(()=>finish(null),1200);
        img.crossOrigin='anonymous';img.onload=()=>{
            try{const test=document.createElement('canvas');test.width=test.height=1;test.getContext('2d')!.drawImage(img,0,0,1,1);test.toDataURL();finish(img)}catch{finish(null)}
        };img.onerror=()=>finish(null);img.src=url;
    });
}

/** A local composite of the visible chat region, not a capture of other apps or hidden history. */
export async function captureEffectRoom(room:HTMLElement){
    const rect=room.getBoundingClientRect(),width=room.clientWidth,height=room.clientHeight,sx=width/rect.width,sy=height/rect.height;
    const scene=document.createElement('canvas'),reflection=document.createElement('canvas');
    scene.width=Math.round(width*1.5);scene.height=Math.round(height*1.5);reflection.width=740;reflection.height=1240;
    const c=scene.getContext('2d')!,r=reflection.getContext('2d')!;c.scale(1.5,1.5);r.scale(740/width,1240/height);
    const style=getComputedStyle(room);c.fillStyle=style.backgroundColor==='rgba(0, 0, 0, 0)'?'#f5f5f7':style.backgroundColor;c.fillRect(0,0,width,height);
    let partial=false;
    const url=style.backgroundImage.match(/^url\(["']?(.*?)["']?\)$/)?.[1];
    // Load visible assets concurrently, with a shared per-URL promise. Slow remote
    // images cannot introduce a separate timeout for every bubble and avatar.
    const assets=new Map<string,Promise<HTMLImageElement|null>>();
    const load=(src:string)=>{if(!assets.has(src))assets.set(src,image(src));return assets.get(src)!};
    const photos=Array.from(room.querySelectorAll<HTMLImageElement>('[data-msg-id] img,.page-header img')).filter(n=>{const b=n.getBoundingClientRect();return b.width&&b.height&&b.bottom>rect.top&&b.top<rect.bottom&&!n.closest('.message-effect-live')});
    for(const pic of photos)void load(pic.currentSrc||pic.src);
    if(url){const img=await load(url);if(img){const scale=Math.max(width/img.naturalWidth,height/img.naturalHeight);c.drawImage(img,(width-img.naturalWidth*scale)/2,(height-img.naturalHeight*scale)/2,img.naturalWidth*scale,img.naturalHeight*scale)}else partial=true;}
    else if(style.backgroundImage!=='none')partial=true;
    const visible=Array.from(room.querySelectorAll<HTMLElement>('[data-msg-id]')).filter(n=>!n.closest('.message-effect-live,.echo-live,.love-live'));
    for(const node of visible){
        const b=node.getBoundingClientRect();if(b.bottom<rect.top||b.top>rect.bottom||!b.width||!b.height)continue;
        const x=(b.left-rect.left)*sx,y=(b.top-rect.top)*sy,w=b.width*sx,h=b.height*sy;
        const sample=captureBubble(node,false);c.drawImage(sample.sprite,x-5,y-5,w+10,h+10);
        for(const pic of photos.filter(p=>node.contains(p))){
            const bitmap=await load(pic.currentSrc||pic.src);if(!bitmap){partial=true;continue;}
            const b=pic.getBoundingClientRect(),px=(b.left-rect.left)*sx,py=(b.top-rect.top)*sy,pw=b.width*sx,ph=b.height*sy,st=getComputedStyle(pic);
            c.save();c.beginPath();c.roundRect(px,py,pw,ph,Math.min(parseFloat(st.borderRadius)||0,pw/2,ph/2));c.clip();
            const fit=st.objectFit,scale=fit==='contain'?Math.min(pw/bitmap.naturalWidth,ph/bitmap.naturalHeight):Math.max(pw/bitmap.naturalWidth,ph/bitmap.naturalHeight);
            if(fit==='fill')c.drawImage(bitmap,px,py,pw,ph);else c.drawImage(bitmap,px+(pw-bitmap.naturalWidth*scale)/2,py+(ph-bitmap.naturalHeight*scale)/2,bitmap.naturalWidth*scale,bitmap.naturalHeight*scale);
            c.restore();
        }
        r.fillStyle='rgba(255,255,255,.12)';r.beginPath();r.roundRect(x,y,w,h,Math.min(20,h/2));r.fill();
        r.fillStyle='#fff';r.textAlign='center';r.textBaseline='middle';r.font='15px sans-serif';r.fillText((node.innerText||'').trim().slice(0,80),x+w/2,y+h/2,w-12);
        if(node.querySelector('video,canvas,iframe')||node.dataset.mediaType&& !['text','quote','image','sticker'].includes(node.dataset.mediaType))partial=true;
        // Complex transformed image stacks/annotation layers are an approximation.
        if(node.querySelector('svg')&&node.dataset.mediaType==='image')partial=true;
    }
    for(const node of Array.from(room.querySelectorAll<HTMLElement>('.page-header .imessage-header-button,.page-header .imessage-contact-avatar,.page-header .imessage-contact-name'))){
        const b=node.getBoundingClientRect();if(!b.width||!b.height)continue;const x=(b.left-rect.left)*sx,y=(b.top-rect.top)*sy,w=b.width*sx,h=b.height*sy;
        for(const ink of [c,r]){ink.fillStyle='rgba(255,255,255,.16)';ink.beginPath();ink.roundRect(x,y,w,h,Math.min(w,h)/2);ink.fill()}
        const img=node.querySelector('img'),svg=node.querySelector('svg');let pic:HTMLImageElement|null=null;
        if(img)pic=await load(img.currentSrc||img.src);
        else if(svg){const clone=svg.cloneNode(true) as SVGSVGElement;clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(w*.6));clone.setAttribute('height',String(h*.6));const originals=[svg,...svg.querySelectorAll('*')],copies=[clone,...clone.querySelectorAll('*')];copies.forEach((el,i)=>{const s=getComputedStyle(originals[i]);for(const p of ['fill','stroke','color','stroke-width'])el.setAttribute(p,s.getPropertyValue(p))});pic=await image('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(clone)))}
        if(pic)for(const ink of [c,r]){ink.save();ink.beginPath();ink.roundRect(x,y,w,h,Math.min(w,h)/2);ink.clip();const inset=img?0:w*.2;ink.drawImage(pic,x+inset,y+inset,w-inset*2,h-inset*2);ink.restore()}
        else if(img||svg)partial=true;
        else for(const ink of [c,r]){ink.fillStyle=getComputedStyle(node).color;ink.font='14px sans-serif';ink.textAlign='center';ink.textBaseline='middle';ink.fillText((node.innerText||'').slice(0,30),x+w/2,y+h/2,w)}
    }
    return {scene,reflection,width,height,partial};
}
