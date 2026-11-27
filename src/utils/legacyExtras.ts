// Explicit allowlists for legacy scalar settings and module snapshots.
type Scalar=string|number|boolean;
type Obj=Record<string,unknown>;
export interface LegacyExtras {
 project?:Record<string,Scalar>;
 render?:Record<string,Scalar|string[]|number[]|Record<string,Scalar|number[]>>;
 seo?:{tone:string;selectedTitleId:string;titles:Record<string,string>[];description:string;tagsString:string};
 voice?:Record<string,Scalar|string[]>;
 thumbnails?:Partial<Record<'A'|'B'|'C',Obj>>;
 branding?:{brand_identity?:Obj;lower_third_config?:Obj};
}
function obj(v:unknown):Obj{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('Invalid legacy settings');return v as Obj;}
function pick(v:unknown,strings:string[],numbers:string[],booleans:string[]):Record<string,Scalar>{
 const a=obj(v),out:Record<string,Scalar>={};
 for(const [keys,type] of [[strings,'string'],[numbers,'number'],[booleans,'boolean']] as const)for(const k of keys){
 if(a[k]===undefined)continue;
 if(typeof a[k]!==type||(type==='number'&&!Number.isFinite(a[k])))throw new Error('Invalid setting '+k);
 out[k]=a[k] as Scalar;
 }return out;
}
function text(v:unknown):string{if(typeof v!=='string')throw new Error('Invalid module text');return v;}
function choice(v:unknown,values:string[]):string{const s=text(v);if(!values.includes(s))throw new Error('Invalid module selection');return s;}
function strings(v:unknown):string[]{if(!Array.isArray(v))throw new Error('Invalid string list');return v.map(text);}

function thumbnailSlots(v:unknown):NonNullable<LegacyExtras['thumbnails']>{
 const a=obj(v),out:NonNullable<LegacyExtras['thumbnails']>={};
 const badges=['4k_ultra_hd','documentary','true_story','real_events','based_on_facts','history','archive','full_story','3_hours','rain_sounds','thunderstorm','fireplace','ocean_waves','forest_night','deep_sleep','study_and_focus','relax','no_ads','dark_screen','asmr'];
 for(const id of ['A','B','C'] as const){
  if(a[id]===undefined)continue;
  const s=obj(a[id]),q:Obj=pick(s,['topText','topColor','bottomText','bottomColor','splashShape','splashColor','customBadgeText','customBadgePosition','title','bottomLine','splashPreset','splashCustomColor'],['splashPaddingPct','splashShadowPct','badgeScalePct'],['badgesEnabled','customBadgeEnabled']);
  if(q.splashShape!==undefined)choice(q.splashShape,['monolith_bristle','jagged_splash','bottom_slash','double_strokes','distressed_grunge','tapered_speed','none']);
  if(q.splashPreset!==undefined)choice(q.splashPreset,['red','charcoal','gold','custom','none']);
  if(q.customBadgePosition!==undefined)choice(q.customBadgePosition,['left','right']);
  if(s.badgeTexts!==undefined)q.badgeTexts=strings(s.badgeTexts);
  if(s.badgePositions!==undefined)q.badgePositions=strings(s.badgePositions).map(x=>choice(x,['left','right']));
  if(s.presetBadges!==undefined){const p=obj(s.presetBadges),items:Obj={};for(const k of badges){if(p[k]===undefined)continue;const item=pick(p[k],['position'],[],['enabled']);if(item.position!==undefined)choice(item.position,['left','right']);items[k]=item;}q.presetBadges=items;}
  if(s.hookLayout!==undefined)q.hookLayout=pick(s.hookLayout,[],['xPct','yPct','topScalePct','bottomScalePct','blockTiltDeg','lineSpacingPct'],['autoFitBottomToTop']);
  if(s.bgAdjust!==undefined)q.bgAdjust=pick(s.bgAdjust,[],['contrastPct','brightnessPct','vibrancePct'],[]);
  out[id]=q;
 }return out;
}
function branding(v:unknown):NonNullable<LegacyExtras['branding']>{
 const a=obj(v),out:NonNullable<LegacyExtras['branding']>={};
 if(a.brand_identity!==undefined)out.brand_identity=pick(a.brand_identity,['name','episode_label'],[],['enabled']);
 if(a.lower_third_config!==undefined){
 const b=obj(a.lower_third_config),q:Obj=pick(b,['style','emblem_path'],['anim_sec'],['enabled']);
 if(q.style!==undefined)choice(q.style,['histoviva_broadcast_en']);
 if(b.show_sec!==undefined){const n=b.show_sec;if(!Array.isArray(n)||n.length!==2||n.some(x=>typeof x!=='number'||!Number.isFinite(x)||x<0)||n[0]>=n[1])throw new Error('Invalid broadcast timing');q.show_sec=[...n];}
 if(b.bar_bg_rgba!==undefined){const n=b.bar_bg_rgba;if(!Array.isArray(n)||n.length!==4||n.some(x=>!Number.isInteger(x)||x<0||x>255))throw new Error('Invalid broadcast color');q.bar_bg_rgba=[...n];}
 out.lower_third_config=q;
 }return out;
}

export function legacyExtras(v:unknown):LegacyExtras{
 const a=obj(v),out:LegacyExtras={};
 if(a.thumbnails!==undefined)out.thumbnails=thumbnailSlots(a.thumbnails);
 if(a.branding!==undefined)out.branding=branding(a.branding);
 if(a.project!==undefined)out.project=pick(a.project,['active_format_preset','end_screen_safe_zone','manifest_duration_badge'],[],['ambient_loop_enabled']);
 if(a.render!==undefined){
 const r=obj(a.render);const t:NonNullable<LegacyExtras['render']>=pick(r,['expected_video_filename','expected_audio_filename','loop_subtitle_language','loop_srt_custom_content','render_specs_summary'],['crossfade_duration','audio_crossfade_duration'],['loop_draft_mode','seamless_stitch_enabled','audio_crossfade_enabled','loop_burn_in_subtitles','loop_upload_srt_to_drive','shorts_factory_enabled','strict_scene_duration_lock','sidecar_burn_in_video','export_separate_srt_files','export_output_chapters_enabled','export_release_card_md_enabled']);
 if(r.selected_subtitle_languages!==undefined)t.selected_subtitle_languages=strings(r.selected_subtitle_languages);
 if(r.continuous_bed!==undefined)t.continuous_bed=pick(r.continuous_bed,['asset_id','file_name'],['acrossfade_sec','veo_audio_weight','bed_audio_weight'],['enabled','loop_entire_duration','veo_native_audio']);
 if(r.loop_master_audio!==undefined)t.loop_master_audio=pick(r.loop_master_audio,['file_name','start_timecode'],['weight'],['enabled']);
 if(r.seamless_asymmetry!==undefined){const q=obj(r.seamless_asymmetry),n=q.random_interval;const x:Record<string,Scalar|number[]>=pick(q,[],[],['enabled']);if(n!==undefined){if(!Array.isArray(n)||n.length!==2||n.some(y=>typeof y!=='number'||!Number.isFinite(y)||y<0)||n[0]>n[1])throw new Error('Invalid interval');x.random_interval=[...n];}t.seamless_asymmetry=x;}
 out.render=t;
 }
 if(a.seo!==undefined){const s=obj(a.seo);if(!Array.isArray(s.titles))throw new Error('Invalid SEO titles');const titles=s.titles.map(v=>{const t=obj(v);return {id:choice(t.id,['A','B','C']),category:choice(t.category,['Intrigue','Contradiction','Drama']),categoryRu:text(t.categoryRu),title:text(t.title)};});if(new Set(titles.map(t=>t.id)).size!==titles.length)throw new Error('Duplicate SEO title');out.seo={tone:choice(s.tone,['Dark Mystery','Cozy Ambient','Historical Doc','Cinematic Drama']),selectedTitleId:choice(s.selectedTitleId,['A','B','C']),titles,description:text(s.description),tagsString:text(s.tagsString)};}
 if(a.voice!==undefined){const v=obj(a.voice);const q:Record<string,Scalar|string[]>=pick(v,['activeEngine','selectedLang','selectedGender','selectedVoiceId'],[],[]);if(v.activeAccount!==undefined)q.activeAccount=choice(String(v.activeAccount),['1','2']);if(v.favorites!==undefined)q.favorites=strings(v.favorites);if(q.activeEngine!==undefined)choice(q.activeEngine,['elevenlabs','edgetts']);if(q.selectedGender!==undefined)choice(q.selectedGender,['all','male','female']);if(q.selectedLang!==undefined)choice(q.selectedLang,['all','English US','English UK','Русский','Українська','Español','Deutsch','Français']);out.voice=q;}
 return out;
}
