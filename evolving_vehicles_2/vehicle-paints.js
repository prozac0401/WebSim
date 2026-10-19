/* Factory paint names/codes for the represented model years.
 * Hex, roughness and clearcoat are display approximations, not measured OEM data.
 */
(function(root){
'use strict';
const bmwLaunch='https://www.press.bmwgroup.com/usa/article/detail/T0238507EN_US/the-all-new-2016-bmw-m2';
const bmwCodes='https://www.bmw.ie/content/dam/bmw/marketIE/bmw_ie/pdf/BMWM2Coup%C3%A9_F87_201707.pdf.asset.1550226992546.pdf';
const toyotaColors='https://toyota.jp/pages/contents/gr86/001_p_001/4.0/pdf/spec/gr86_color_202205.pdf';
const paint=(id,name,code,hex,finish,sourceUrl,extra={})=>Object.freeze({id,name,code,hex,finish,
 roughness:finish==='solid'?.24:finish==='pearl'?.22:.28,clearcoat:.92,
 sourceUrl,rgbStatus:'estimated-display-color',surfaceStatus:'render-approximation',...extra});
const lists=Object.freeze({
 bmw_m2:Object.freeze([
  paint('long-beach-blue','롱 비치 블루 메탈릭','C16','#167fa7','metallic',bmwCodes),
  paint('alpine-white','알파인 화이트','300','#e7e8e4','solid',bmwCodes),
  paint('black-sapphire','블랙 사파이어 메탈릭','475','#20232a','metallic',bmwCodes),
  paint('mineral-grey','미네랄 그레이 메탈릭','B39','#62676a','metallic',bmwCodes)
 ]),
 gr86:Object.freeze([
  paint('spark-red','스파크 레드','DCK','#ce171f','solid',toyotaColors,{finishStatus:'render-classification'}),
  paint('crystal-white-pearl','크리스털 화이트 펄','K1X','#e8e9e5','pearl',toyotaColors),
  paint('crystal-black-silica','크리스털 블랙 실리카','D4S','#202329','metallic',toyotaColors,{finishStatus:'render-classification'}),
  paint('bright-blue','브라이트 블루','DAR','#46a4c4','solid',toyotaColors,{finishStatus:'render-classification'}),
  paint('ice-silver','아이스 실버 메탈릭','G1U','#b5bdc1','metallic',toyotaColors),
  paint('magnetite-grey','마그네타이트 그레이 메탈릭','P8Y','#50575d','metallic',toyotaColors),
  paint('sapphire-blue','사파이어 블루','WCH','#1c3769','metallic',toyotaColors,{finishStatus:'render-classification'})
 ])
});
const provenance=Object.freeze({
 bmw_m2:Object.freeze({generation:'F87 original M2 / N55',modelYears:'2016–2017',market:'launch palette; USA/UK',
  sourceUrls:Object.freeze([bmwLaunch,bmwCodes]),notes:'Four launch colors. Excludes M2 Competition and G87 colors. The official launch release confirms availability; the BMW brochure supplies paint codes.'}),
 gr86:Object.freeze({generation:'ZN8',modelYears:'2021–2023',market:'Japan RZ/SZ/RC',
  sourceUrls:Object.freeze([toyotaColors]),notes:'Seven ordinary early-ZN8 colors in the May 2022 Toyota chart, matching the 2023 community exterior. Excludes later replacement colors and limited-edition-only colors. Explicit pearl/metallic names retain that finish; the remaining shader finish classifications are approximations.'})
});
const empty=Object.freeze([]);
function get(id){return lists[id]||empty;}
function choose(id,index=0){const colors=get(id);if(!colors.length)return null;const n=Number.isFinite(Number(index))?Math.trunc(Number(index)):0;return colors[((n%colors.length)+colors.length)%colors.length];}
const api=Object.freeze({get,choose,lists,provenance});
if(typeof module!=='undefined'&&module.exports)module.exports=api;
root.VehiclePaints=api;
})(typeof globalThis!=='undefined'?globalThis:this);
