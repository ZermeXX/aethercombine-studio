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

import {migrateLegacySecrets} from '../src/utils/aetherPersistence';
test('failed session migration preserves Google GitHub and Telegram legacy records',()=>{
 const original=JSON.stringify({access_token:'fixture-google',expires_at:123,github_token:'fixture-github'});
 const l=storage({aether_google_auth:original,ac_gh_token:'fixture-github',ac_tg_bot_token:'fixture-bot',ac_tg_chat_id:'fixture-chat'});
 const s=storage();s.setItem=()=>{throw new Error('quota');};
 migrateLegacySecrets(l,s);
 expect(l.getItem('aether_google_auth')).toBe(original);
 expect(l.getItem('ac_gh_token')).toBe('fixture-github');
 expect(l.getItem('ac_tg_bot_token')).toBe('fixture-bot');
 expect(s.getItem('aether_secrets_purged_v1')).toBeNull();
});
test('successful session migration verifies credentials before cleanup',()=>{
 const l=storage({aether_google_auth:JSON.stringify({access_token:'fixture-google',expires_at:123}),ac_gh_token:'fixture-github',ac_tg_bot_token:'fixture-bot',ac_tg_chat_id:'fixture-chat'});
 const s=storage();migrateLegacySecrets(l,s);
 expect(JSON.parse(s.getItem('aether_google_token_session')!).access_token).toBe('fixture-google');
 expect(JSON.parse(s.getItem('aether_github_token_session')!).github_token).toBe('fixture-github');
 expect(JSON.parse(s.getItem('aether_telegram_session')!).bot_token).toBe('fixture-bot');
 expect(l.getItem('ac_gh_token')).toBeNull();
 expect(l.getItem('ac_tg_bot_token')).toBeNull();
 expect(JSON.parse(l.getItem('aether_google_auth')!).access_token).toBeUndefined();
});
