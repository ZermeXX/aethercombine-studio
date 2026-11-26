import { test, expect } from 'bun:test';
import { validateManifestV8 } from '../src/components/MontageCombineView';

const fixture = () => ({
  project_name: 'Histoviva_EP02_Amazon_4K',
  total_scenes: 1, total_duration_sec: 9,
  timeline: [{ scene_id: '001', duration_sec: 9, assets: {video_file:'scene.mp4',voiceover_file:'voice.wav'}, camera_movement:'zoom_in',camera_zoom:1.12,transition:'fade',transition_duration:0.5,voiceover_volume:1,ambient_volume:0.35 }],
  export_settings: {resolution:'4k',video_codec:'libx264',aspect_ratio:'16:9',fps:24,crf:18,preset:'veryfast',bitrate_mbps:35,audio_bitrate_kbps:320,preview_duration_sec:0}
});
test('valid Cinema manifest',()=>expect(validateManifestV8(fixture())).toEqual([]));
for (const mode of ['zoom_in','zoom_out','pan_left','pan_right','pan_up','pan_down','static']) {
  test('camera '+mode,()=>{const m=fixture();m.timeline[0].camera_movement=mode;expect(validateManifestV8(m)).toEqual([]);});
}
for (const mode of ['fade','dip_to_black','dip_to_white','cut','none']) {
  test('transition '+mode,()=>{const m=fixture();m.timeline[0].transition=mode;expect(validateManifestV8(m)).toEqual([]);});
}
test('duplicate scene blocks dispatch',()=>{const m=fixture();m.timeline.push({...m.timeline[0]});m.total_scenes=2;expect(validateManifestV8(m).some(x=>x.severity==='error')).toBe(true);});
test('invalid duration blocks dispatch',()=>{const m=fixture();m.timeline[0].duration_sec=-1;expect(validateManifestV8(m).some(x=>x.severity==='error')).toBe(true);});
test('missing narration warns',()=>{const m=fixture();m.timeline[0].assets.voiceover_file='';expect(validateManifestV8(m).map(x=>x.severity)).toEqual(['warning']);});
test('invalid audio gain blocks dispatch',()=>{const m=fixture();m.timeline[0].ambient_volume=5;expect(validateManifestV8(m).some(x=>x.severity==='error')).toBe(true);});
test('unsupported codec blocks dispatch',()=>{const m=fixture();m.export_settings.video_codec='libx265';expect(validateManifestV8(m).some(x=>x.severity==='error')).toBe(true);});
