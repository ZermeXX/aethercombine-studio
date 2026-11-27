import {test,expect} from 'bun:test';
import {createElement as h} from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {Button,Input,Select,Slider,Toggle,Panel,StatusBadge,ProgressBar,Modal,Tooltip,SectionHeader,normalizeProgress} from '../src/design-system/components';

test('button defaults to non-submit and busy disables it',()=>{
 const html=render(h(Button,{busy:true},'Render'));
 expect(html).toContain('type="button"');expect(html).toContain('disabled');expect(html).toContain('aria-busy="true"');
});
test('input exposes error and accessible label',()=>{
 const html=render(h(Input,{label:'Name',id:'name',error:'Required'}));
 expect(html).toContain('for="name"');expect(html).toContain('aria-invalid="true"');expect(html).toContain('aria-describedby="name-help"');
});
test('select renders options',()=>expect(render(h(Select,{label:'Mode'},h('option',{value:'native'},'Native')))).toContain('Native'));
test('slider exposes formatted value',()=>expect(render(h(Slider,{label:'Gain',value:50,onValueChange:()=>{},format:v=>v+'%'}))).toContain('aria-valuetext="50%"'));
test('toggle uses switch semantics',()=>expect(render(h(Toggle,{label:'Enabled',checked:true,onCheckedChange:()=>{}}))).toContain('role="switch"'));
test('progress clamps and supports indeterminate state',()=>{
 expect(normalizeProgress(-1)).toBe(0);expect(normalizeProgress(101)).toBe(100);expect(normalizeProgress(NaN)).toBe(0);
 expect(render(h(ProgressBar,{value:150}))).toContain('value="100"');
 expect(render(h(ProgressBar,{}))).toContain('Processing');
});
test('unknown status is not a pass',()=>expect(render(h(StatusBadge,{status:'unknown'}))).toContain('Unverified'));
test('panel, section header, modal and tooltip render semantics',()=>{
 expect(render(h(Panel,{},'Settings'))).toContain('<section');
 expect(render(h(SectionHeader,{title:'Export'}))).toContain('<h2');
 expect(render(h(Modal,{open:false,title:'Confirm',onClose:()=>{},children:'Body'}))).toContain('aria-labelledby');
 expect(render(h(Tooltip,{text:'Help',children:'Info'}))).toContain('role="tooltip"');
});
