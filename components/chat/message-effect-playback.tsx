import { useEffect, useRef, useState } from 'react';
import { captureBubble, captureEchoBubble, captureEffectRoom } from '@/lib/message-effects/capture';
import { createEchoRenderer } from '@/lib/message-effects/echo-renderer';
import { createLoveRenderer } from '@/lib/message-effects/love-renderer';
import { createFireworksRenderer } from '@/lib/message-effects/fireworks-renderer';
import { saveEffectScene, trackEffectScene } from '@/lib/message-effects/scene-memory';
import type { EffectKind, EffectRenderer } from '@/lib/message-effects/types';

export function MessageEffectPlayback({source,effect,onDone,sessionId,messageId}:{source:HTMLElement;effect:EffectKind;onDone:()=>void;sessionId?:string;messageId?:string}){
    const layer=useRef<HTMLDivElement>(null),surface=useRef<HTMLCanvasElement>(null),done=useRef(onDone);done.current=onDone;
    const [degraded,setDegraded]=useState(false);
    useEffect(()=>{
        const host=layer.current,canvas=surface.current;if(!host||!canvas)return;
        const motion=matchMedia('(prefers-reduced-motion: reduce)');if(motion.matches){done.current();return;}
        const ctx=canvas.getContext('2d');if(!ctx){done.current();return;}
        let disposed=false,finished=false,frame=0,renderer:EffectRenderer|undefined,observer:ResizeObserver|undefined;
        let w=host.clientWidth,h=host.clientHeight,x=0,y=0,sourceX=0,sourceY=0,elapsed=0,last=0;
        const finish=()=>{if(finished||disposed)return;finished=true;done.current()};
        const measure=()=>{
            const bounds=host.getBoundingClientRect(),r=source.getBoundingClientRect();w=host.clientWidth;h=host.clientHeight;
            canvas.width=Math.round(w*Math.min(devicePixelRatio||1,2));canvas.height=Math.round(h*Math.min(devicePixelRatio||1,2));
            if(source.isConnected&&r.width&&bounds.width){const sx=w/bounds.width,sy=h/bounds.height;sourceX=(r.left-bounds.left)*sx;sourceY=(r.top-bounds.top)*sy;x=sourceX+r.width*sx/2;y=sourceY+r.height*sy*.32;}
        };
        const work=(async()=>{
            const room=source.closest<HTMLElement>('.chat-room-wrapper')||host.parentElement;if(!room)return finish();
            const bubble=effect==='echo'?captureEchoBubble(source):captureBubble(source),captured=await captureEffectRoom(room);if(disposed)return;
            measure();if(!w||!h)return finish();
            renderer=effect==='echo'?createEchoRenderer(ctx,bubble):effect==='love'?createLoveRenderer(ctx,captured.reflection):createFireworksRenderer(ctx);
            setDegraded(!!renderer.degraded);
            const paint=(ms:number)=>{
                ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);ctx.clearRect(0,0,w,h);
                const front=renderer!.draw(ms,w,h,{x,y});
                if(effect==='love'&&front)ctx.drawImage(bubble.sprite,sourceX-5,sourceY-5,bubble.width,bubble.height);
            };
            // Persist an overall scene keyframe, never the isolated particle layer.
            const phase=effect==='fireworks'?5500:effect==='love'?2600:2400;paint(phase);
            const snapshot=document.createElement('canvas');snapshot.width=Math.min(640,Math.round(w));snapshot.height=Math.round(snapshot.width*h/w);
            const ink=snapshot.getContext('2d')!;ink.drawImage(captured.scene,0,0,snapshot.width,snapshot.height);ink.drawImage(canvas,0,0,snapshot.width,snapshot.height);paint(0);
            const save=sessionId&&messageId?saveEffectScene(sessionId,messageId,effect,snapshot,phase,captured.partial):Promise.resolve();
            const tick=(now:number)=>{
                if(disposed||finished)return;
                if(!document.hidden){elapsed+=now-last;paint(elapsed);}last=now;
                if(elapsed>=renderer!.duration){finish();return;}frame=requestAnimationFrame(tick);
            };
            last=performance.now();frame=requestAnimationFrame(tick);observer=new ResizeObserver(measure);observer.observe(host);
            await save;
        })().catch(()=>{if(!disposed)finish()});
        if(sessionId)trackEffectScene(sessionId,work);
        const visibility=()=>{last=performance.now()};document.addEventListener('visibilitychange',visibility);
        const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();finish()}};document.addEventListener('keydown',key);
        motion.addEventListener('change',finish);
        return ()=>{disposed=true;cancelAnimationFrame(frame);observer?.disconnect();renderer?.dispose();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('keydown',key);motion.removeEventListener('change',finish)};
    },[source,effect,sessionId,messageId]);
    return <div ref={layer} className={`message-effect-live ${effect}-live`} data-effect={effect} onPointerDown={e=>e.stopPropagation()}>
        <canvas ref={surface} aria-hidden="true" />
        {degraded&&<span className="message-effect-fallback" role="status">当前设备使用简化爱心效果</span>}
        <button type="button" className="message-effect-skip" onClick={onDone}>跳过特效</button>
    </div>;
}
