import type {AetherCombineDraftSlice} from './aetherPersistence';
import type {ProjectPayload} from './projectPayload';
import {projectPayload} from './projectPayload';
import {applyModulePatch} from './scopedModulePersistence';
import {narrativeScenes} from './narrativeSceneProjection';
import {legacyExtras} from './legacyExtras';
export function hydrateCombine(p:ProjectPayload):AetherCombineDraftSlice{
 const v=projectPayload(p),e=v.legacyExtras,c=e?.combine??{};
 return {...c, narrative_scenes:v.production?.narrative_scenes??[],export_settings:{...(c.export_settings as Record<string,unknown>|undefined),...e?.branding}} as AetherCombineDraftSlice;
}
export function captureCombine(p:ProjectPayload,slice:AetherCombineDraftSlice):ProjectPayload{
 const exp=slice.export_settings??{};
 const previous=p.legacyExtras?.branding;
 const branding={...previous,...(exp.brand_identity===undefined?{}:{brand_identity:exp.brand_identity}),...(exp.lower_third_config===undefined?{}:{lower_third_config:exp.lower_third_config})};
 const validated=legacyExtras({combine:slice,branding});
 return applyModulePatch(p,{module:'combine',narrativeScenes:narrativeScenes(slice.narrative_scenes??[]),combine:validated.combine,branding:validated.branding});
}
