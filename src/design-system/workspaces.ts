export type WorkspaceId = 'histoviva' | 'the_whisker_trio';
export type ChannelProfile = {
 id: WorkspaceId;
 name: string;
 productionType: 'documentary' | 'ambient_loop';
 defaultModule: 'combine' | 'loop';
 language: 'en';
 resolution: '4k';
 fps: 24;
 preferredStorage: 'standard' | 'pro';
 defaultDurationHours?: number;
};
export const CHANNEL_PROFILES: Readonly<Record<WorkspaceId, Readonly<ChannelProfile>>> = Object.freeze({
 histoviva: Object.freeze({id:'histoviva',name:'HISTOVIVA',productionType:'documentary',defaultModule:'combine',language:'en',resolution:'4k',fps:24,preferredStorage:'standard'}),
 the_whisker_trio: Object.freeze({id:'the_whisker_trio',name:'The Whisker Trio',productionType:'ambient_loop',defaultModule:'loop',language:'en',resolution:'4k',fps:24,preferredStorage:'pro',defaultDurationHours:3}),
});
export const WORKSPACE_SELECTION_KEY='aether_v9_workspace_selection';
export function isWorkspaceId(value:unknown):value is WorkspaceId {
 return value==='histoviva'||value==='the_whisker_trio';
}
type SelectionStorage=Pick<Storage,'getItem'|'setItem'>;
export function readWorkspaceSelection(storage?:SelectionStorage):WorkspaceId {
 try {const value=(storage??globalThis.localStorage).getItem(WORKSPACE_SELECTION_KEY);return isWorkspaceId(value)?value:'histoviva';}
 catch{return 'histoviva';}
}
export function saveWorkspaceSelection(value:WorkspaceId,storage?:SelectionStorage):boolean {
 if(!isWorkspaceId(value))return false;
 try{(storage??globalThis.localStorage).setItem(WORKSPACE_SELECTION_KEY,value);return true;}catch{return false;}
}

/** Production navigation follows the channel's production type. Shared tools remain available. */
export function allowsModule(workspace:WorkspaceId,module:'verbaflow'|'seo'|'combine'|'loop'|'thumb'|'voice'|'art'):boolean {
 if(module==='loop')return CHANNEL_PROFILES[workspace].productionType==='ambient_loop';
 if(module==='combine')return CHANNEL_PROFILES[workspace].productionType==='documentary';
 return true;
}
