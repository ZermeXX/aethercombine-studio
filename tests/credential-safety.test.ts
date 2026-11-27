import {test,expect} from 'bun:test';
import {migrateVoiceCredentials} from '../src/utils/credentialSafety';
function storage(initial:Record<string,string>={}):Storage{
 const m=new Map(Object.entries(initial));
 return {get length(){return m.size;},key:i=>Array.from(m.keys())[i]??null,getItem:k=>m.get(k)??null,setItem:(k,v)=>{m.set(k,v);},removeItem:k=>{m.delete(k);},clear:()=>m.clear()};
}
test('migrate both slots and preserve nonsecret preferences',()=>{
 const l=storage({aether_voice_settings:JSON.stringify({elevenKey1:'fixture-a',activeEngine:'edgetts'}),config_voice_studio:JSON.stringify({apiKey2:'fixture-b',provider:'edgetts'}),elevenlabs_api_key_1:'fixture-a'});
 const s=storage();migrateVoiceCredentials(l,s);migrateVoiceCredentials(l,s);
 expect(s.getItem('elevenlabs_api_key_1')).toBe('fixture-a');expect(s.getItem('elevenlabs_api_key_2')).toBe('fixture-b');
 expect(l.getItem('elevenlabs_api_key_1')).toBeNull();expect(JSON.parse(l.getItem('aether_voice_settings')!)).toEqual({activeEngine:'edgetts'});expect(JSON.parse(l.getItem('config_voice_studio')!)).toEqual({provider:'edgetts'});
});
test('failed session write retains legacy data',()=>{
 const l=storage({elevenlabs_api_key_1:'fixture'}),s=storage();s.setItem=()=>{throw new Error('quota');};
 expect(()=>migrateVoiceCredentials(l,s)).toThrow();expect(l.getItem('elevenlabs_api_key_1')).toBe('fixture');
});
