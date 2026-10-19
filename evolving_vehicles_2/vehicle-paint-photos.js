/* Original KGM one-tone turntable photographs, matched to the existing cameras.
 * Sources/conversion: assets/models/torres-paints/sources.json. */
(function(root){
'use strict';
const base=typeof document!=='undefined'?new URL('assets/models/torres-paints/',document.currentScript.src).href:'assets/models/torres-paints/';
const paintVariants={};
for(const code of ["WAA", "GAO", "ADL", "LAK", "BAS"])paintVariants[code]=Object.freeze({textures:Object.freeze(Array.from({length:36},(_,i)=>base+code+'/'+String(i+1).padStart(2,'0')+'.jpg'))});
const api=Object.freeze({torres:Object.freeze({paintVariants:Object.freeze(paintVariants)})});
root.VehiclePaintPhotos=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
