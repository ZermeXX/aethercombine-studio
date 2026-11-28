export type UiLanguage='ru'|'en';
const key='story-nexus.ui-language.v1';
export function readUiLanguage():UiLanguage {
 try {const v=localStorage.getItem(key);return v==='ru'?'ru':'en';} catch{return 'en';}
}
export function saveUiLanguage(value:UiLanguage):void {
 try{localStorage.setItem(key,value);}catch{/* Storage may be unavailable. */}
}
export function uiText(language:UiLanguage,en:string,ru:string):string{return language==='ru'?ru:en;}
