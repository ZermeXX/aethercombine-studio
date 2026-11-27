import {test,expect} from 'bun:test';
import {projectPayload} from '../src/utils/projectPayload';
const fixture={schemaVersion:1 as const,script:'Narration',seoScript:'SEO',thumbnailTitle:'Title',thumbnailBadge:'Badge',chapters:'00:00 Intro'};
test('payload projects only approved fields',()=>{expect(projectPayload({...fixture,apiKey:'fixture',nested:{token:'fixture'}})).toEqual(fixture);});
test('invalid payload is rejected',()=>{expect(()=>projectPayload({...fixture,script:42})).toThrow();expect(()=>projectPayload({...fixture,schemaVersion:2})).toThrow();});
