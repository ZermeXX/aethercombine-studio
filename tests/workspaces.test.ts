import {test,expect} from 'bun:test';
import {CHANNEL_PROFILES,WORKSPACE_SELECTION_KEY,isWorkspaceId,readWorkspaceSelection,saveWorkspaceSelection} from '../src/design-system/workspaces';
test('channel defaults are independent and immutable',()=>{
 expect(CHANNEL_PROFILES.histoviva.defaultModule).toBe('combine');
 expect(CHANNEL_PROFILES.histoviva.preferredStorage).toBe('standard');
 expect(CHANNEL_PROFILES.the_whisker_trio.defaultModule).toBe('loop');
 expect(CHANNEL_PROFILES.the_whisker_trio.defaultDurationHours).toBe(3);
 expect(CHANNEL_PROFILES.the_whisker_trio.preferredStorage).toBe('pro');
 expect(Object.isFrozen(CHANNEL_PROFILES.histoviva)).toBe(true);
});
test('selection round trip touches only the dedicated key',()=>{
 const values=new Map([['aether_workspace_draft','legacy']]);
 const storage={getItem:(k:string)=>values.get(k)??null,setItem:(k:string,v:string)=>{values.set(k,v);}};
 expect(readWorkspaceSelection(storage)).toBe('histoviva');
 expect(saveWorkspaceSelection('the_whisker_trio',storage)).toBe(true);
 expect(readWorkspaceSelection(storage)).toBe('the_whisker_trio');
 expect(values.get('aether_workspace_draft')).toBe('legacy');
 values.set(WORKSPACE_SELECTION_KEY,'invalid');
 expect(readWorkspaceSelection(storage)).toBe('histoviva');
});
test('invalid values and inaccessible storage fail safely',()=>{
 expect(isWorkspaceId('unknown')).toBe(false);
 const storage={getItem:()=>{throw Error('blocked');},setItem:()=>{throw Error('blocked');}};
 expect(readWorkspaceSelection(storage)).toBe('histoviva');
 expect(saveWorkspaceSelection('histoviva',storage)).toBe(false);
});
