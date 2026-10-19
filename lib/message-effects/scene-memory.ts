import { loadChatMessages, updateMessageMediaData } from '../chat-storage';
import { saveChatImageToIndexedDB, getChatImageFromIndexedDB } from '../chat-asset-storage';
import type { EffectKind } from './types';

const pending = new Map<string,Promise<void>>();
export function trackEffectScene(sessionId:string,work:Promise<void>){
    const safe=work.catch(()=>{});pending.set(sessionId,safe);
    void safe.finally(()=>{if(pending.get(sessionId)===safe)pending.delete(sessionId)});
}
export async function saveEffectScene(sessionId:string,messageId:string,effect:EffectKind,canvas:HTMLCanvasElement,phase:number,partial:boolean){
    let message=loadChatMessages(sessionId).find(m=>m.id===messageId);
    if(!message||message.isRetracted||message.mediaData?.screenEffectScene)return;
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,'image/jpeg',.78));if(!blob)return;
    const imageRef=await saveChatImageToIndexedDB(blob);
    message=loadChatMessages(sessionId).find(m=>m.id===messageId);
    if(!message||message.isRetracted||message.mediaData?.screenEffect!==effect)return;
    updateMessageMediaData(messageId,{...message.mediaData,screenEffectScene:{imageRef,effect,phase,capturedAt:new Date().toISOString(),partial}});
}
/** No model request here: attach the latest recorded scene only to a normal chat request. */
export async function readLatestEffectScene(sessionId:string){
    if(pending.has(sessionId))await Promise.race([pending.get(sessionId),new Promise<void>(resolve=>setTimeout(resolve,1500))]);
    const messages=loadChatMessages(sessionId);
    let index=messages.length-1;
    while(index>=0&&(messages[index].isRetracted||!messages[index].mediaData?.screenEffectScene))index--;
    if(index<0||index<messages.length-16)return null;
    const message=messages[index],scene=message.mediaData!.screenEffectScene!;
    const url=await getChatImageFromIndexedDB(scene.imageRef);
    return url?{url,scene,messageId:message.id}:null;
}
