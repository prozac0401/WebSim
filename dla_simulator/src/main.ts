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
const timeline=$('dla-history') as HTMLInputElement;
const palette=$('dla-palette') as HTMLSelectElement;
const fitView=$('dla-fit') as HTMLInputElement;
let repaintPending=false;
let particles:{x:number;y:number}[]=[],viewCount=0,followGrowth=true;
function paintParticle(p:{x:number;y:number},i:number){const t=1-Math.exp(-i/1800);ctx.fillStyle=palette.value==='growth'?`hsl(${170-135*t},${42+15*t}%,${30+17*t}%)`:'#21654f';ctx.fillRect(p.x,p.y,1,1);}
function historyLabel(){timeline.max=String(sticks);timeline.value=String(viewCount);$('dla-history-value').textContent=`${viewCount.toLocaleString()} / ${sticks.toLocaleString()}개`;timeline.disabled=sticks===0;$('dla-history-note').textContent=viewCount===sticks?'현재까지 붙은 입자를 모두 보여 줍니다. 슬라이더를 왼쪽으로 옮겨 가지가 갈라진 순간을 찾아보세요.':`성장 기록 중 처음 ${viewCount.toLocaleString()}개를 보고 있습니다. 아래 수치는 실제 계산 전체이며, 시작·100개 시도는 최신 상태에서 이어집니다.`;}
function repaint(){
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle=getComputedStyle(canvas).backgroundColor;ctx.fillRect(0,0,600,600);
 if(fitView.checked){let left=300,right=300,top=300,bottom=300;for(let i=0;i<viewCount;i++){const p=particles[i];left=Math.min(left,p.x);right=Math.max(right,p.x+1);top=Math.min(top,p.y);bottom=Math.max(bottom,p.y+1);}const scale=Math.min(12,520/Math.max(1,right-left,bottom-top));ctx.setTransform(scale,0,0,scale,300-(left+right)*scale/2,300-(top+bottom)*scale/2);}
 ctx.fillStyle='#21654f';ctx.fillRect(300,300,1,1);for(let i=0;i<viewCount;i++)paintParticle(particles[i],i);ctx.setTransform(1,0,0,1,0,0);historyLabel();
}
function scheduleRepaint(){if(repaintPending)return;repaintPending=true;requestAnimationFrame(()=>{repaintPending=false;repaint();});}
function showLatest(){followGrowth=true;viewCount=sticks;repaint();}
function hud(){ $('stick-stat').textContent=sticks.toLocaleString();$('attempt-stat').textContent=attempts.toLocaleString();$('radius-stat').textContent=radius.toFixed(1)+'칸';$('hud').textContent=`씨앗 포함 ${sticks+1}개 · 성공률 ${attempts?(100*sticks/attempts).toFixed(1):'0.0'}%`;canvas.dataset.sticks=String(sticks); }
function clear(){particles=[];viewCount=0;followGrowth=true;sticks=attempts=radius=perSecond=0;repaint();hud();}
function setRunning(on:boolean){if(on)showLatest();running=on;start.textContent=on?'일시정지':'시작';start.setAttribute('aria-pressed',String(on));worker.postMessage({type:on?'start':'pause'});status.textContent=on?'성장 중 · 바깥 가지가 입자를 먼저 만납니다.':'일시정지 · 조건 하나를 바꾸고 초기화해 비교해 보세요.';}
function reset(){setRunning(false);worker.postMessage({type:'reset'});}
function sendParams(){worker.postMessage({type:'params',params});}
for(const key of Object.keys(params) as (keyof Params)[]){const input=document.getElementById(key) as HTMLInputElement;const change=()=>{let value=Number(input.value);if(!Number.isFinite(value))return;if(key==='seed'){value=Math.max(0,Math.min(4294967295,Math.floor(value)));input.value=String(value);}params={...params,[key]:value};const output=document.getElementById(key+'-value');if(output)output.textContent=input.value;sendParams();if(key==='seed'){reset();status.textContent='시드를 바꾸어 새 씨앗에서 시작합니다.';}};input.addEventListener(input.type==='range'?'input':'change',change);}
timeline.oninput=()=>{setRunning(false);followGrowth=false;viewCount=Math.max(0,Math.min(sticks,Number(timeline.value)));repaint();};
palette.onchange=repaint;fitView.onchange=repaint;$('dla-latest').onclick=showLatest;
start.onclick=()=>setRunning(!running);$('dla-reset').onclick=reset;$('dla-step').onclick=()=>{setRunning(false);showLatest();worker.postMessage({type:'step'});status.textContent='입자 100개를 시도합니다. 일부는 붙지 않고 제거됩니다.';};$('dla-save').onclick=()=>{const a=document.createElement('a');a.download=`dla-seed-${params.seed}-first-${viewCount}.png`;a.href=canvas.toDataURL('image/png');a.click();};
worker.onmessage=(e:MessageEvent)=>{const d=e.data;if(d.type==='reset'){clear();status.textContent='중앙 씨앗으로 초기화했습니다. 시작을 눌러 보세요.';}if(d.type==='boundary'){setRunning(false);status.textContent='격자의 가장자리에 도달해 성장을 멈췄습니다. PNG를 저장하거나 초기화하세요.';}if(d.type==='batch'){attempts+=d.processed;perSecond+=d.processed;for(const p of d.particles){particles.push(p);sticks++;}if(followGrowth)viewCount=sticks;radius=d.clusterRadius;hud();historyLabel();scheduleRepaint();}};
worker.onerror=()=>{running=false;start.textContent='시작';status.textContent='계산을 시작하지 못했습니다. 페이지를 새로고침해 주세요.';};sendParams();clear();setInterval(()=>{$('rate-stat').textContent=perSecond.toLocaleString()+'/초';perSecond=0;},1000);

const snapshot=()=>({mode:'dla',running,seed:params.seed,sticks,attempts,radius,shownParticles:viewCount,palette:palette.value,fitView:fitView.checked,coordinateSystem:'600 × 600; x right, y down; seed (300, 300)'});
Object.assign(window,{render_game_to_text:()=>JSON.stringify(snapshot()),advanceTime:()=>Promise.resolve()});
Object.assign($('dla-app'),{_model:{get state(){return {...snapshot(),particles:particles.map(p=>({...p}))};}}});
