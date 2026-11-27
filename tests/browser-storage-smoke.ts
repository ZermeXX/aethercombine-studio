import {openProjectDatabase, ProjectStorage} from '../src/utils/projectStorage';
import {createProject} from '../src/design-system/projectRegistry';
async function main(){
 const p=createProject('histoviva','Browser smoke');
 const payload={schemaVersion:1 as const,script:'Narration',seoScript:'SEO',thumbnailTitle:'Title',thumbnailBadge:'Badge',chapters:'Intro'};
 let storage=new ProjectStorage(await openProjectDatabase());
 try {
  await storage.createProject(p);
  await storage.saveProject(p,1,payload);
  await storage.putAsset('histoviva',p.projectId,{assetId:'a1',name:'test.bin',blob:new Blob([new Uint8Array([1,2,3])])});
 } finally {storage.close();}
 storage=new ProjectStorage(await openProjectDatabase());
 try {
  const restored=await storage.getPayload('histoviva',p.projectId);
  if(JSON.stringify(restored)!==JSON.stringify(payload))throw new Error('Payload mismatch');
  if(await storage.getPayload('the_whisker_trio',p.projectId)!==null)throw new Error('Workspace isolation failed');
  const asset=await storage.getAsset('histoviva',p.projectId,'a1');
  if(!asset||Array.from(new Uint8Array(await asset.blob.arrayBuffer())).join(',')!=='1,2,3')throw new Error('Asset mismatch');
 } finally {storage.close();}
 document.body.textContent='BROWSER_STORAGE_PASS';
}
main().catch(e=>{document.body.textContent='BROWSER_STORAGE_FAIL: '+String(e);});
