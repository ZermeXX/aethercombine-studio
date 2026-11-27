import {test,expect} from 'bun:test';
import {createElement as h} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {StudioShell,STUDIO_MODULES} from '../src/design-system/StudioShell';
test('all six production modules retain stable ids',()=>{
 expect(STUDIO_MODULES.map(m=>m.id)).toEqual(['combine','loop','verbaflow','seo','thumb','editor']);
});
test('shell identifies active module and preserves workspace children',()=>{
 const html=renderToStaticMarkup(h(StudioShell,{active:'loop',onSelect:()=>{},children:h('main',{},'Workspace content')}));
 expect(html).toContain('id="tab-loop"');
 expect(html).toContain('aria-current="page"');
 expect(html.match(/aria-current="page"/g)?.length).toBe(1);
 for(const m of STUDIO_MODULES) expect(html).toContain('aria-controls="view-'+m.id+'"');
 expect(html).toContain('Workspace content');
});
