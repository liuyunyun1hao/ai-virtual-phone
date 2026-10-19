"use client";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Palette, RotateCcw } from "lucide-react";
import { loadChatSessions, type ChatSession } from "@/lib/chat-storage";
import { loadCharacters } from "@/lib/character-storage";
import { getChatCharacterAvatar } from "@/lib/chat-session-avatar";
import { extractAvatarNameColor, DEFAULT_AVATAR_NAME_COLOR } from "@/lib/avatar-name-color";
import { BUBBLE_COLORS_EVENT, resolveBubbleColors, validColor, hex, type BubbleColors } from "@/lib/chat-bubble-colors";
import { loadBubbleColors, saveBubbleColors, readColorStore, deleteColorHistory, renameColorHistory, type ColorHistory, type ColorScope } from "@/lib/chat-bubble-color-store";
import { Toggle } from "@/components/ui/form";
export { BUBBLE_COLORS_EVENT, type BubbleColors } from "@/lib/chat-bubble-colors";

const HUES = [192, 216, 252, 282, 330, 6, 24, 42, 51, 62, 81, 102];
const GRID = [Array.from({length:12},(_,i)=>hex([255-i*255/11,255-i*255/11,255-i*255/11])),
    ...[16,24,33,43,52,62,72,82,92].map(l=>HUES.map(h=>hslHex(h,85,l)))].flat();
function hslHex(h:number,s:number,l:number) {
    s/=100; l/=100;
    const a=s*Math.min(l,1-l);
    return hex([0,8,4].map(n=>{const k=(n+h/30)%12;return (l-a*Math.max(-1,Math.min(k-3,9-k,1)))*255;}));
}
function Segment({options,value,onChange,label}:{options:readonly string[];value:string;onChange:(value:string)=>void;label:string}) {
    return <div className="color-segment" role="group" aria-label={label}>{options.map(option=><button key={option} type="button" aria-pressed={value===option} onClick={()=>onChange(option)}>{option}</button>)}</div>;
}
function ColorHistoryRow({entry,onLoad,onDelete,onRename}:{entry:ColorHistory;onLoad:()=>void;onDelete:()=>void;onRename:(name:string)=>void}) {
    const [offset,setOffset]=useState(0);
    const [editing,setEditing]=useState(false);
    const title=entry.name || (entry.scope==="global"?"全局方案":"聊天方案");
    const gesture=useRef<{x:number;y:number;start:number;horizontal:boolean;vertical:boolean}|null>(null);
    const suppressClick=useRef(false);
    return <div className="color-history-row">
        <button type="button" className="color-history-delete" aria-label="删除这条配色记录" tabIndex={offset ? 0 : -1} onClick={onDelete}>删除</button>
        <div className="color-history-entry" style={{transform:`translateX(${offset}px)`}}
            onPointerDown={e=>{if(e.button!==0 || editing)return;gesture.current={x:e.clientX,y:e.clientY,start:offset,horizontal:false,vertical:false};suppressClick.current=false;}}
            onPointerMove={e=>{const g=gesture.current;if(!g||g.vertical)return;const dx=e.clientX-g.x,dy=e.clientY-g.y;if(!g.horizontal){if(Math.abs(dy)>8&&Math.abs(dy)>Math.abs(dx)){g.vertical=true;return;}if(Math.abs(dx)<8)return;g.horizontal=true;e.currentTarget.setPointerCapture(e.pointerId);}suppressClick.current=true;setOffset(Math.max(-72,Math.min(0,g.start+dx)));}}
            onPointerUp={()=>{if(gesture.current?.horizontal)setOffset(v=>v < -30 ? -72 : 0);gesture.current=null;}}
            onPointerCancel={()=>{gesture.current=null;setOffset(0);}}
            onClickCapture={e=>{if(suppressClick.current){e.stopPropagation();e.preventDefault();suppressClick.current=false;return;}if(offset){e.stopPropagation();e.preventDefault();setOffset(0);}}}
            onKeyDown={e=>{if(editing)return;if(e.key==="ArrowLeft"){e.preventDefault();setOffset(-72);}if(e.key==="Escape")setOffset(0);}}
        ><button type="button" className="color-history-load" aria-label={`载入${title}`} onClick={onLoad}><span className="color-history-dots"><i style={{background:entry.colors.user||"#38acfc"}}/><i style={{background:entry.colors.char||"#e9e9eb"}}/></span></button><div className="color-history-details">
          {editing ? <input autoFocus maxLength={40} aria-label="方案名称" defaultValue={title} onFocus={e=>e.currentTarget.select()} onBlur={e=>{onRename(e.currentTarget.value);setEditing(false);}} onKeyDown={e=>{if(e.nativeEvent.isComposing)return;if(e.key==="Enter")e.currentTarget.blur();if(e.key==="Escape"){e.currentTarget.value=title;e.currentTarget.blur();}}}/> : <button type="button" className="color-history-name" aria-label={`修改方案名称：${title}`} onClick={()=>setEditing(true)}>{title}</button>}
          <button type="button" className="color-history-date" aria-label={`载入${title}`} onClick={onLoad}><small>{new Date(entry.createdAt).toLocaleString()}</small></button>
        </div></div>
    </div>;
}
export function BubbleColorSettings({ session }: { session: ChatSession }) {
    const [open,setOpen]=useState(false);
    const [target,setTarget]=useState("我");
    const [layer,setLayer]=useState("气泡");
    const [tab,setTab]=useState("选色");
    const [scope,setScope]=useState<ColorScope>("local");
    const [history,setHistory]=useState(()=>readColorStore().history);
    const [notice,setNotice]=useState("");
    const [value,setValue]=useState<BubbleColors>(()=>loadBubbleColors(session.id, loadChatSessions().find(s=>s.id===session.id)?.bubbleColors));
    const valueRef=useRef(value);
    const dirtyRef=useRef(false);
    const [dark,setDark]=useState(false);
    const [sample,setSample]=useState<string>();
    const [hexDraft,setHexDraft]=useState("");
    const trigger=useRef<HTMLButtonElement>(null);
    const panel=useRef<HTMLDivElement>(null);
    const other=session.isGroup?"群成员":"对方";
    const user=target==="我";
    const auto=!user&&value.charMode==="auto";
    const colors=resolveBubbleColors(value,dark,user,sample);
    const colorKey=user?(layer==="气泡"?"user":"userText"):(layer==="气泡"?"char":"charText");
    const opacityKey=user?(layer==="气泡"?"userOpacity":"userTextOpacity"):(layer==="气泡"?"charOpacity":"charTextOpacity");
    const selected=validColor(value[colorKey])||(layer==="气泡"?(user?"#38acfc":dark?"#353539":"#e9e9eb"):(user?"#ffffff":dark?"#ffffff":"#101012"));
    const opacity=value[opacityKey]??1;
    const close=()=>{if(dirtyRef.current){saveBubbleColors(session.id,valueRef.current,"local",true);dirtyRef.current=false;}setOpen(false);requestAnimationFrame(()=>trigger.current?.focus());};
    useEffect(()=>{const media=matchMedia("(prefers-color-scheme: dark)");setDark(media.matches);const fn=()=>setDark(media.matches);media.addEventListener("change",fn);return()=>media.removeEventListener("change",fn);},[]);
    useEffect(()=>{setHexDraft(selected.toUpperCase());},[selected]);
    useEffect(()=>{
        if(!open)return;
        const latest=loadBubbleColors(session.id,loadChatSessions().find(s=>s.id===session.id)?.bubbleColors);
        valueRef.current=latest;setValue(latest);setHistory(readColorStore().history);setTab("选色");setNotice("");
        let active=true;
        const char=loadCharacters().find(c=>c.id===(session.isGroup?session.participantIds?.[0]:session.contactId));
        setSample(undefined);
        const avatar=getChatCharacterAvatar(loadChatSessions().find(item=>item.id===session.id)||session,char);
        if(avatar)void extractAvatarNameColor(avatar,true).then(color=>{if(active&&color!==DEFAULT_AVATAR_NAME_COLOR)setSample(color);});
        panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
        return()=>{active=false;};
    },[open,session.contactId,session.isGroup,session.participantIds]);
    const save=(patch:Partial<BubbleColors>,reset=false)=>{
        const next=reset?{...patch}:{...valueRef.current,...patch};
        valueRef.current=next;setValue(next);dirtyRef.current=true;setNotice("");
        saveBubbleColors(session.id,next);
    };
    const changeColor=(color:string)=>save({...(!user?{charMode:"manual" as const}:{}),[colorKey]:color});
    const apply=()=>{
        const next=saveBubbleColors(session.id,valueRef.current,scope,true);
        dirtyRef.current=false;setHistory(next.history);
        setNotice(scope==="global"?"已应用到全部聊天":"已应用到当前聊天");
    };
    return <>
        <button ref={trigger} type="button" className="menu-item" onClick={()=>setOpen(true)}><span className="chat-info-icon"><Palette size={22}/></span><span className="menu-label-group"><span className="menu-label">气泡改色</span></span><span className="menu-right"><span className="menu-desc">颜色与透明度</span><ChevronRight size={16}/></span></button>
        {open&&createPortal(<div ref={panel} className="bubble-colors-page" role="dialog" aria-modal="true" aria-label="气泡改色" onKeyDown={event=>{
            if(event.key==="Escape"){event.stopPropagation();close();}
            if(event.key==="Tab"){
                const items=Array.from(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),[tabindex="0"]')||[]).filter(el=>!el.closest("fieldset:disabled"));
                const first=items[0],last=items[items.length-1];
                if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
                else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
            }
        }}>
            <div className="color-page-nav"><button type="button" className="settings-back" aria-label="返回聊天设置" onClick={close}><ChevronLeft/></button><h1>气泡改色</h1><button type="button" className="settings-back" aria-label="恢复经典配色" onClick={()=>save({},true)}><RotateCcw size={19}/></button></div>
            <div className="color-page-body">
                <Segment options={["我",other]} value={target} onChange={setTarget} label="选择气泡归属"/>
                <div className="color-preview" aria-label="配色预览"><span style={{color:colors.text}}>{user?"今天也想和你聊聊天。":"嗯，我在听。"}<i style={{background:colors.surface,opacity:colors.opacity}}/></span></div>
                <Segment options={["选色","应用范围"]} value={tab} onChange={setTab} label="配色与应用范围"/>
                {tab==="选色"&&<>
                {!user&&<div className="color-auto-row"><div><strong>跟随头像自动改色</strong><p>{session.isGroup?"每位成员使用自己的头像颜色":"头像更新后，气泡颜色也随之变化"}</p></div><Toggle checked={auto} onChange={enabled=>save({charMode:enabled?"auto":"manual"})}/></div>}
                <fieldset className="color-editor" disabled={auto}>
                    <legend className="sr-only">手动配色</legend>
                    <Segment options={["气泡","文字"]} value={layer} onChange={setLayer} label="调整气泡或文字"/>
                    {<div className="color-grid">{GRID.map((color,i)=><button key={i} type="button" style={{background:color}} aria-label={color} aria-pressed={selected.toLowerCase()===color.toLowerCase()} onClick={()=>changeColor(color)}/>)}</div>}
                    <label className="color-hex"><span>十六进制颜色</span><input aria-label="十六进制颜色" value={hexDraft} maxLength={7} spellCheck={false} onChange={e=>{setHexDraft(e.target.value);if(validColor(e.target.value))changeColor(e.target.value);}} onBlur={()=>setHexDraft(selected.toUpperCase())}/></label>
                    <div className="color-opacity"><label htmlFor="bubble-color-opacity">不透明度</label><div><input id="bubble-color-opacity" aria-label={layer+"不透明度"} type="range" min="0" max="100" value={Math.round(opacity*100)} style={{"--picked-color":selected} as CSSProperties} onChange={e=>save({...(!user?{charMode:"manual" as const}:{}),[opacityKey]:Number(e.target.value)/100})}/><output>{Math.round(opacity*100)}%</output></div></div>
                    <div className="color-swatches">{["#000000","#ffffff","#0088ff","#34c759","#ffcc00","#ff3b30","#a855f7","#e9e9eb"].map(color=><button key={color} type="button" aria-label={"选择"+color} style={{background:color}} onClick={()=>changeColor(color)}/>)}</div>
                </fieldset></>}
                {tab==="应用范围"&&<div className="color-scope-page">
                    <h2>应用到哪里？</h2>
                    <p>整套方案包含我与对方的气泡、文字、透明度及自动改色开关。</p>
                    <div className="color-scope-options">{(["local","global"] as const).map(item=><button key={item} type="button" aria-pressed={scope===item} onClick={()=>{setScope(item);setNotice("");}}><span><strong>{item==="local"?"当前聊天":"全部聊天"}</strong><small>{item==="local"?"仅影响这个私聊或群聊":"应用于所有私聊、群聊及之后的新聊天"}</small></span><span>{scope===item?"●":"○"}</span></button>)}</div>
                    <p>新的全局方案会覆盖之前的全局及单聊设置。之后单独修改某个聊天，只影响那个聊天。</p>
                    <button type="button" className="color-apply" onClick={apply}>{scope==="global"?"应用到全部聊天":"应用到当前聊天"}</button>
                    <p role="status">{notice}</p>
                    <h2>配色记录</h2>
                    <p>点名称重命名，点色块或日期载入当前聊天；左滑删除记录，不影响现用配色。</p>
                    <div className="color-history">{history.length===0?<p>保存或应用后，方案会保留在这里。</p>:history.map(entry=><ColorHistoryRow key={entry.id} entry={entry} onRename={name=>setHistory(renameColorHistory(entry.id,name))} onDelete={()=>{setHistory(deleteColorHistory(entry.id));setNotice("已删除记录，当前配色保持不变");}} onLoad={()=>{save(entry.colors,true);setHistory(readColorStore().history);setNotice("已载入当前聊天，可继续编辑或应用到全部聊天");}}/>)}</div>
                </div>}
                <p className="color-footnote">{auto?"自动模式已开启，手动设置保留但暂不生效。":"编辑即时预览并保存到当前聊天；在「应用范围」中应用到全部聊天。"}{!user&&session.isGroup?" 手动颜色统一应用于群成员；预览展示首位成员。":""} 卡片保持原样。</p>
            </div>
        </div>, trigger.current!.closest(".imessage-settings-page")!)}
    </>;
}
