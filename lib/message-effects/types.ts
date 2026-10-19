export type EffectKind = 'echo' | 'love' | 'fireworks';
export type EffectAnchor = { x:number; y:number };
export type BubbleSprite = { sprite:HTMLCanvasElement; width:number; height:number; normalization:number };
export type EffectRenderer = {duration:number; degraded?:boolean; draw(ms:number,width:number,height:number,anchor:EffectAnchor):boolean|void; dispose():void};
