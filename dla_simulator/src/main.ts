import './style.css';
import { NeighborMode } from './dla';
import type { Params } from './dla';
import DlaWorker from './worker?worker&inline';
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const worker = new DlaWorker();
let params: Params = {stickProb:1,spawnMargin:5,killMargin:10,neighborMode:NeighborMode.Four,biasAngle:0,biasStrength:0,particleBatch:100,seed:1};
let running=false,sticks=0,attempts=0,radius=0,perSecond=0;
const status=document.getElementById('status')!;
const start=document.getElementById('dla-start') as HTMLButtonElement;
const $=(id:string)=>document.getElementById(id)!;
function hud(){ $('stick-stat').textContent=sticks.toLocaleString();$('attempt-stat').textContent=attempts.toLocaleString();$('radius-stat').textContent=radius.toFixed(1)+'칸';$('hud').textContent=`씨앗 포함 ${sticks+1}개 · 성공률 ${attempts?(100*sticks/attempts).toFixed(1):'0.0'}%`;canvas.dataset.sticks=String(sticks); }
function clear(){ctx.fillStyle=getComputedStyle(canvas).backgroundColor;ctx.fillRect(0,0,600,600);ctx.fillStyle='#21654f';ctx.fillRect(300,300,1,1);sticks=attempts=radius=perSecond=0;hud();}
function setRunning(on:boolean){running=on;start.textContent=on?'일시정지':'시작';start.setAttribute('aria-pressed',String(on));worker.postMessage({type:on?'start':'pause'});status.textContent=on?'성장 중 · 바깥 가지가 입자를 먼저 만납니다.':'일시정지 · 조건 하나를 바꾸고 초기화해 비교해 보세요.';}
function reset(){setRunning(false);worker.postMessage({type:'reset'});}
function sendParams(){worker.postMessage({type:'params',params});}
for(const key of Object.keys(params) as (keyof Params)[]){const input=document.getElementById(key) as HTMLInputElement;const change=()=>{let value=Number(input.value);if(!Number.isFinite(value))return;if(key==='seed'){value=Math.max(0,Math.min(4294967295,Math.floor(value)));input.value=String(value);}params={...params,[key]:value};const output=document.getElementById(key+'-value');if(output)output.textContent=input.value;sendParams();if(key==='seed'){reset();status.textContent='시드를 바꾸어 새 씨앗에서 시작합니다.';}};input.addEventListener(input.type==='range'?'input':'change',change);}
start.onclick=()=>setRunning(!running);$('dla-reset').onclick=reset;$('dla-step').onclick=()=>{setRunning(false);worker.postMessage({type:'step'});status.textContent='입자 100개를 시도합니다. 일부는 붙지 않고 제거됩니다.';};$('dla-save').onclick=()=>{const a=document.createElement('a');a.download=`dla-seed-${params.seed}.png`;a.href=canvas.toDataURL('image/png');a.click();};
worker.onmessage=(e:MessageEvent)=>{const d=e.data;if(d.type==='reset'){clear();status.textContent='중앙 씨앗으로 초기화했습니다. 시작을 눌러 보세요.';}if(d.type==='boundary'){setRunning(false);status.textContent='격자의 가장자리에 도달해 성장을 멈췄습니다. PNG를 저장하거나 초기화하세요.';}if(d.type==='batch'){attempts+=d.processed;perSecond+=d.processed;for(const p of d.particles){ctx.fillStyle=`hsl(${145+(sticks%100)*0.6},38%,35%)`;ctx.fillRect(p.x,p.y,1,1);sticks++;}radius=d.clusterRadius;hud();}};
worker.onerror=()=>{running=false;start.textContent='시작';status.textContent='계산을 시작하지 못했습니다. 페이지를 새로고침해 주세요.';};sendParams();clear();setInterval(()=>{$('rate-stat').textContent=perSecond.toLocaleString()+'/초';perSecond=0;},1000);
