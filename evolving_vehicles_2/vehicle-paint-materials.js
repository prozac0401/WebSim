/* Source-specific paint boundaries. Geometry, textures and non-body parts stay
 * immutable. Torres uses complete OEM color photographs, never a whole-photo
 * tint or an inferred pixel mask. Shader colors/finishes are display estimates. */
(function(root){
'use strict';
const cache=new WeakMap();
// Median of the unoccluded center hood strip in each official front frame
// (05.jpg, normalized 1024x518: x430..594/y237..247). These are photo-matching
// fill colors, not measured factory pigments. No source pixels are recolored.
const torresPhotoFill=Object.freeze({EBL:'#848283',WAA:'#cbccc7',GAO:'#575d58',ADL:'#6d737f',BAS:'#172747',LAK:'#27282a'});
function prepare(data){
 if(!data||!Array.isArray(data.primitives)||!['avante_n','torres'].includes(data.id))return data;
 if(cache.has(data))return cache.get(data);
 const body=p=>!p.wheel&&!p.drl&&!p.drlCover&&(data.id==='avante_n'
  ?p.materialName==='M_2022_Hyundai_Elantra_N_Ceramic_White'
  :['inferred-painted-roof','inferred-painted-hood'].includes(p.name));
 const parts=list=>list.map(p=>{
  if(!body(p))return p;
  // Inferred panels are not calibrated to visible source pixels: projecting
  // the hood stretched windshield pixels over it. Keep their geometry and use
  // a photo-matched fill with only a weak neutral reflection in the shader.
  if(data.id==='torres')return {...p,paint:true,photoPaint:true,photoPaintColors:torresPhotoFill,material:0};
  return {...p,paint:true,material:0};
 });
 const photoVariants=root.VehiclePaintPhotos?.[data.id]?.paintVariants;
 const result={...data,primitives:parts(data.primitives),
  ...(data.fallbackPrimitives?{fallbackPrimitives:parts(data.fallbackPrimitives)}:{}),
  ...(data.id==='torres'&&data.photoProjection&&photoVariants
   ?{photoProjection:{...data.photoProjection,paintVariants:photoVariants}}:{})};
 cache.set(data,result);cache.set(result,result);return result;
}
const api=Object.freeze({prepare});root.VehiclePaintMaterials=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
