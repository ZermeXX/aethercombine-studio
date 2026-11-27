import {test,expect} from 'bun:test';
import {createProject,validateProject,projectMetadata} from '../src/design-system/projectRegistry';
test('unique IDs and workspace defaults',()=>{
 const a=createProject('histoviva','EP03'),b=createProject('the_whisker_trio','Loop');
 expect(a.projectId).not.toBe(b.projectId);expect(a.activeModule).toBe('combine');expect(b.activeModule).toBe('loop');
 expect(validateProject(a)).toBe(true);
});
test('reject invalid schema, workspace and revision',()=>{
 const p=createProject('histoviva','EP03');
 expect(validateProject({...p,schemaVersion:2})).toBe(false);
 expect(validateProject({...p,workspaceId:'other'})).toBe(false);
 expect(validateProject({...p,revision:0})).toBe(false);
 expect(()=>createProject('histoviva',' ')).toThrow();
});
test('metadata projection excludes arbitrary credential properties',()=>{
 const p=createProject('histoviva','EP03');
 expect(projectMetadata({...p,apiKey:'test-only',nested:{token:'test-only'}})).toEqual(p);
});
