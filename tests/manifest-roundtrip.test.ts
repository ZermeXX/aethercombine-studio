import { expect, test } from 'bun:test';
import { mergeManifestRoundTrip as merge, isLosslessManifestImport } from '../src/components/MontageCombineView';

test('unchanged projection preserves original metadata and disabled flags', () => {
  const original = { youtube_seo: {title:'Amazon'}, shorts_export:{enabled:false}, drift_guard:{diff_sec:0}, scenes:[{scene_id:'1',lower_third:{location:'Upano'},voice_start:0.2}] };
  const baseline = { youtube_seo:{title:'Template'}, shorts_export:{enabled:true}, drift_guard:{diff_sec:8.4}, scenes:[{scene_id:'1',voice_start:9}] };
  expect(merge(original,baseline,structuredClone(baseline))).toEqual(original);
});
test('nested edits retain unknown fields', () => {
  expect(merge({export_settings:{crf:18,custom:true}}, {export_settings:{crf:18}}, {export_settings:{crf:20}})).toEqual({export_settings:{crf:20,custom:true}});
});
test('scene reorder preserves metadata by identity', () => {
  const original=[{scene_id:'1',location:'A'},{scene_id:'2',location:'B'}];
  const baseline=[{scene_id:'1',duration:9},{scene_id:'2',duration:9}];
  expect(merge(original,baseline,[{scene_id:'2',duration:8},{scene_id:'1',duration:9}])).toEqual([{scene_id:'2',location:'B',duration:8},{scene_id:'1',location:'A'}]);
});
test('explicit false and removal survive merge', () => {
  expect(merge({enabled:true,mode:'native',extra:1},{enabled:true,mode:'native'},{enabled:false})).toEqual({enabled:false,extra:1});
});
test('new and removed scenes are reflected', () => {
  expect(merge([{scene_id:'1',extra:1}],[{scene_id:'1'}],[{scene_id:'2',duration:9}])).toEqual([{scene_id:'2',duration:9}]);
});

for (const version of ['8.0', '8.1']) {
  test('full manifest activates lossless import for '+version, () => {
    const original = {manifest_version:version, scenes:[{scene_id:'1',location:'Upano'}], timeline:[{scene_id:'1',location:'Upano'}]};
    const projection = {manifest_version:'8.1', scenes:[{scene_id:'1'}], timeline:[{scene_id:'1'}]};
    expect(isLosslessManifestImport(original)).toBe(true);
    expect(merge(original,projection,structuredClone(projection))).toEqual(original);
  });
}
test('legacy and incomplete manifests do not activate full round trip', () => {
  expect(isLosslessManifestImport({manifest_version:'2.4-FINAL',scenes:[],timeline:[]})).toBe(false);
  expect(isLosslessManifestImport({manifest_version:'8.1',timeline:[]})).toBe(false);
});
