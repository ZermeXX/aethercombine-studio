import { test, expect } from 'bun:test';
import { validateManifestV8 } from '../src/components/MontageCombineView';
import { parseRenderQC, qcChecks } from '../src/components/RenderQCDashboard';
const fixture = (patch: Record<string,unknown> = {}) => ({
 manifest_version:'8.1',schema_version:'3.0',project_name:'Histoviva_EP02_Amazon_4K',total_scenes:1,total_duration_sec:9,
 timeline:[{scene_id:'001',duration_sec:9,assets:{video_file:'scene.mp4',voiceover_file:'voice.wav'},...patch}],
 export_settings:{resolution:'4k',video_codec:'libx264',aspect_ratio:'16:9',fps:24,crf:18,preset:'veryfast',bitrate_mbps:35,audio_bitrate_kbps:320,preview_duration_sec:0}
});
const errors=(m:unknown)=>validateManifestV8(m).filter(x=>x.severity==='error');
for(const mode of ['native','hybrid','stretch','freeze','loop']) test('V8.1 duration '+mode,()=>expect(errors(fixture({video_duration_mode:mode,max_extension_sec:2}))).toEqual([]));
for(const mode of ['native','cinematic']) test('V8.1 camera '+mode,()=>expect(errors(fixture({camera_policy:mode}))).toEqual([]));
for(const key of ['allow_video_reuse','source_audio_enabled','adaptive_audio','audio_ducking','brand_identity_visible']){
 test(key+' false preserved as valid',()=>expect(errors(fixture({[key]:false}))).toEqual([]));
 test(key+' invalid type',()=>expect(errors(fixture({[key]:'false'})).length).toBeGreaterThan(0));
}
for(const patch of [{video_duration_mode:'bad'},{camera_policy:'bad'},{max_extension_sec:2.1},{source_audio_volume:4.1}]) test('reject '+JSON.stringify(patch),()=>expect(errors(fixture(patch)).length).toBeGreaterThan(0));
const cta={enabled:true,style:'subscribe_bell',show_sec:[1,8.2],click_sec:3.9,bell_sec:5.75,sfx_enabled:true,sfx_volume:.5};
test('CTA EP02',()=>expect(errors(fixture({cta_config:cta}))).toEqual([]));
test('CTA reversed events',()=>expect(errors(fixture({cta_config:{...cta,bell_sec:2}})).length).toBeGreaterThan(0));
test('CTA unsupported style',()=>expect(errors(fixture({cta_config:{...cta,style:'bad'}})).length).toBeGreaterThan(0));
test('CTA invalid gain',()=>expect(errors(fixture({cta_config:{...cta,sfx_volume:2}})).length).toBeGreaterThan(0));
test('V8.1 duration mismatch',()=>expect(errors({...fixture(),total_duration_sec:10}).length).toBeGreaterThan(0));
const qc={duration_sec:304.5,scenes:34,resolution:'1280x720',fps:24,expected_video_frames:7308,actual_video_frames:7308,av_delta_ms:0,av_tolerance_ms:1000/24,integrated_lufs:-14.15,target_lufs:-14,true_peak_dbtp:-1.41,target_true_peak_dbtp:-1.5};
test('EP02 QC checks',()=>expect(qcChecks(parseRenderQC(qc)).map(x=>x.status)).toEqual(['PASS','PASS','PASS','PASS']));
test('QC frame mismatch',()=>expect(qcChecks({...qc,actual_video_frames:7307})[0].status).toBe('REVIEW'));
test('QC missing measurement',()=>expect(qcChecks({...qc,integrated_lufs:null})[2].status).toBe('UNKNOWN'));
test('QC invalid report',()=>expect(()=>parseRenderQC({})).toThrow());
