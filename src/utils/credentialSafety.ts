const keys=['elevenlabs_api_key_1','elevenlabs_api_key_2'] as const;
const records=['aether_voice_settings','config_voice_studio'] as const;
const fields=['elevenKey1','elevenKey2','apiKey1','apiKey2'] as const;
export function migrateVoiceCredentials(local:Storage,session:Storage):void {
 const parsed=records.map(k=>{const raw=local.getItem(k);if(!raw)return null;const v=JSON.parse(raw);if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid voice settings');return v as Record<string,unknown>;});
 for(let i=0;i<2;i++){
  const key=keys[i];const candidates=[session.getItem(key),parsed[0]?.[fields[i]],local.getItem(key),parsed[1]?.[fields[i+2]]];
  const value=candidates.find(v=>typeof v==='string'&&v.length>0);
  if(typeof value==='string'){session.setItem(key,value);if(session.getItem(key)!==value)throw new Error('Session credential write failed');}
 }
 for(let i=0;i<records.length;i++){const v=parsed[i];if(v){for(const f of fields)delete v[f];local.setItem(records[i],JSON.stringify(v));}}
 for(const k of keys)local.removeItem(k);
}
export function readVoiceCredential(slot:1|2):string {
 try{return sessionStorage.getItem(keys[slot-1])??'';}catch{return '';}
}
export function writeVoiceCredential(slot:1|2,value:string):boolean {
 try{const k=keys[slot-1];if(value)sessionStorage.setItem(k,value);else sessionStorage.removeItem(k);return (sessionStorage.getItem(k)??'')===value;}catch{return false;}
}
