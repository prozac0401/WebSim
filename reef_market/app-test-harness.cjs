// Minimal DOM host for executing the real UI event handlers with the real engines.
// Canvas painting is inert; state transitions and control properties remain real.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
module.exports=function loadApp(folder,engineName,search=''){
 const elements=new Map(),noop=()=>{},listeners=new Map();
 const paint=new Proxy({createLinearGradient:()=>({addColorStop:noop}),createRadialGradient:()=>({addColorStop:noop})},{get:(t,k)=>k in t?t[k]:noop});
 function element(id=''){if(id&&elements.has(id))return elements.get(id);const e={id,value:id==='seed'?'42':id==='terrain-tool'?'view':id==='terrain-preset'?'basic':'',disabled:id==='terrain-undo'||id==='undo-terrain',checked:true,hidden:false,clientWidth:700,width:0,height:0,style:{},textContent:'',innerHTML:'',dataset:{},classList:{contains:()=>false,add:noop,remove:noop},getContext:()=>paint,setAttribute:noop,getBoundingClientRect:()=>({left:0,top:0,width:700,height:700}),addEventListener(type,fn){this['on'+type]=fn;},replaceChildren:noop,setPointerCapture:noop,focus:noop,toDataURL:()=>'',click(){if(!this.disabled)this.onclick?.();}};if(id)elements.set(id,e);return e;}
 const root=path.join(__dirname,'..'),E=require(path.join(root,folder,engineName==='ReefEngine'?'reef-engine.js':engineName==='MicrobeEngine'?'microbe-engine.js':'predator-engine.js'));
 const context={[engineName]:E,URLSearchParams,location:{search},performance:{now:()=>0},innerWidth:1440,innerHeight:1000,devicePixelRatio:1,matchMedia:()=>({matches:false,addEventListener:noop}),requestAnimationFrame:noop,addEventListener:noop,document:{fullscreenElement:null,getElementById:element,createElement:()=>element(),addEventListener:(type,fn)=>listeners.set(type,fn)}};context.window=context;
 vm.runInNewContext(fs.readFileSync(path.join(root,folder,folder+'.js'),'utf8'),context,{filename:folder+'.js'});
 return{element,context,state:()=>JSON.parse(context.render_game_to_text()),select(id,value){const e=element(id);e.value=value;e.onchange?.();},click(id){element(id).click();},forceClick(id){element(id).onclick?.();},key(key,code=key){listeners.get('keydown')?.({key,code,target:{tagName:'CANVAS'},preventDefault:noop});}};
};
