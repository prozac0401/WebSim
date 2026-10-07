/* Two exact orthographic projections of one 12³ voxel volume. No physics or ray approximation. */
(function(root){
  'use strict';
  const N=12;
  const makeRows=(widths)=>widths.map(w=>'.'.repeat(Math.floor((N-w)/2))+'#'.repeat(w)+'.'.repeat(Math.ceil((N-w)/2)));
  const MISSIONS={
    gate:{name:'작은 문과 계단',front:['............','............','............','............','............','............','....####....','....####....','....#..#....','....#..#....','....#..#....','....#..#....'],side:['............','............','............','............','............','............','.....#......','.....##.....','.....###....','.....####...','.....####...','.....####...']},
    tree:{name:'나무와 다이아몬드',front:makeRows([0,2,4,2,6,4,8,6,10,2,2,2]),side:makeRows([0,2,4,6,8,10,10,8,6,4,2,2])},
    heart:{name:'하트와 물결',front:['............','..###..###..','.##########.','.##########.','..########..','...######...','....####....','.....##.....','.....##.....','.....##.....','.....##.....','............'],side:['............','....###.....','...#####....','..#####.....','.#####......','..#####.....','...#####....','....#####...','.....#####..','....#####...','.....###....','............']}
  };
  class ShadowSculpture{
    constructor(mission='gate'){this.n=N;this.load(mission);}
    index(x,y,z){return (y*N+z)*N+x;}
    coordinates(i){return{x:i%N,y:Math.floor(i/(N*N)),z:Math.floor(i/N)%N};}
    valid(x,y,z){return [x,y,z].every(v=>Number.isInteger(v)&&v>=0&&v<N);}
    get(x,y,z){return this.valid(x,y,z)?this.voxels[this.index(x,y,z)]:0;}
    load(mission='gate'){
      this.mission=MISSIONS[mission]?mission:'free';this.name=MISSIONS[mission]?.name||'자유 조각';
      this.voxels=new Uint8Array(N*N*N);this.undoStack=[];this.targetFront=null;this.targetSide=null;
      if(this.mission!=='free'){
        this.targetFront=this._mask(MISSIONS[mission].front);this.targetSide=this._mask(MISSIONS[mission].side);
        for(let y=0;y<N;y++)for(let z=0;z<N;z++)for(let x=0;x<N;x++)if(this.targetFront[y*N+x]&&this.targetSide[y*N+z])this.voxels[this.index(x,y,z)]=1;
      }
      this.recalculate();this.initialCount=this.count;return this;
    }
    _mask(rows){const mask=new Uint8Array(N*N);rows.forEach((row,screenY)=>{for(let x=0;x<N;x++)mask[(N-1-screenY)*N+x]=row[x]==='#'?1:0;});return mask;}
    recalculate(){
      this.front=new Uint16Array(N*N);this.side=new Uint16Array(N*N);this.count=0;
      for(let i=0;i<this.voxels.length;i++)if(this.voxels[i]){const {x,y,z}=this.coordinates(i);this.front[y*N+x]++;this.side[y*N+z]++;this.count++;}
      this.minimum=0;this.missing=0;this.extra=0;let targetPixels=0;
      if(this.targetFront){
        for(let y=0;y<N;y++){let a=0,b=0;for(let c=0;c<N;c++){a+=this.targetFront[y*N+c];b+=this.targetSide[y*N+c];}if((a===0)!==(b===0))throw new Error('Incompatible target row');this.minimum+=Math.max(a,b);}
        for(const [actual,target] of [[this.front,this.targetFront],[this.side,this.targetSide]])for(let i=0;i<actual.length;i++){targetPixels+=target[i];if(target[i]&&!actual[i])this.missing++;if(!target[i]&&actual[i])this.extra++;}
      }
      this.matches=!!this.targetFront&&!this.missing&&!this.extra;
      this.accuracy=this.targetFront?100*(targetPixels-this.missing)/Math.max(1,targetPixels+this.extra):null;
      this.solved=this.matches&&this.count===this.minimum;
    }
    set(x,y,z,value){return this.apply([{x,y,z,value}]);}
    apply(edits){
      const changes=new Map();
      for(const edit of edits){if(!this.valid(edit.x,edit.y,edit.z))continue;const i=this.index(edit.x,edit.y,edit.z);if(!changes.has(i))changes.set(i,this.voxels[i]);this.voxels[i]=edit.value?1:0;}
      const changed=[...changes].filter(([i,old])=>this.voxels[i]!==old);
      if(!changed.length)return false;this.undoStack.push(changed);if(this.undoStack.length>300)this.undoStack.shift();this.recalculate();return true;
    }
    undo(){const changes=this.undoStack.pop();if(!changes)return false;for(const [i,old] of changes)this.voxels[i]=old;this.recalculate();return true;}
    safeRemove(x,y,z){return !!this.get(x,y,z)&&(!this.targetFront||(this.front[y*N+x]>1||!this.targetFront[y*N+x])&&(this.side[y*N+z]>1||!this.targetSide[y*N+z]));}
    hint(preferredY=0){
      if(!this.targetFront)return null;
      for(let offset=0;offset<N;offset++){const y=(preferredY+offset)%N;for(let z=0;z<N;z++)for(let x=0;x<N;x++)if(this.safeRemove(x,y,z))return{x,y,z};}
      return null;
    }
    minimumSolution(){
      const solution=new Uint8Array(N*N*N);if(!this.targetFront)return solution;
      for(let y=0;y<N;y++){const xs=[],zs=[];for(let c=0;c<N;c++){if(this.targetFront[y*N+c])xs.push(c);if(this.targetSide[y*N+c])zs.push(c);}for(let i=0;i<Math.max(xs.length,zs.length);i++)solution[this.index(xs[i%xs.length],y,zs[i%zs.length])]=1;}
      return solution;
    }
    static get missions(){return Object.entries(MISSIONS).map(([id,item])=>({id,name:item.name}));}
  }
  root.ShadowSculpture=ShadowSculpture;
  if(typeof module!=='undefined'&&module.exports)module.exports=ShadowSculpture;
})(typeof window!=='undefined'?window:globalThis);
