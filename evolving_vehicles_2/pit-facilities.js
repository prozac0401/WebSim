/* Photo-referenced pit architecture and service areas. Footprints are curated;
 * heights and details are estimates, and do not change race simulation routes. */
(function(root){
  'use strict';
  const terrainMesh=root.TrackEnvironment||(typeof require==='function'?require('./track-environment.js'):null);
  const EPS=1e-7,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const point=(x,y,z=0)=>({x,y,z}),distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const color=(value,fallback)=>/^#[0-9a-f]{6}$/i.test(value||'')?value:fallback;
  const bounds=points=>points.reduce((b,p)=>({minX:Math.min(b.minX,p.x),maxX:Math.max(b.maxX,p.x),minY:Math.min(b.minY,p.y),maxY:Math.max(b.maxY,p.y)}),{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity});
  function closest(a,b,p){const dx=b.x-a.x,dy=b.y-a.y,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1),0,1);return{x:a.x+t*dx,y:a.y+t*dy,z:(a.z||0)+t*((b.z||0)-(a.z||0)),distance:Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};}
  function inside(p,ring){let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
  function triangulate(ring){
    const p=ring.slice();if(p.reduce((s,a,i)=>s+a.x*p[(i+1)%p.length].y-p[(i+1)%p.length].x*a.y,0)<0)p.reverse();
    const ids=p.map((_,i)=>i),out=[];let guard=p.length*p.length;
    while(ids.length>3&&guard-->0){let found=false;for(let i=0;i<ids.length;i++){const a=p[ids[(i+ids.length-1)%ids.length]],b=p[ids[i]],c=p[ids[(i+1)%ids.length]];if(cross(a,b,c)<=EPS)continue;
      if(ids.some((id,j)=>j!==i&&j!==(i+1)%ids.length&&j!==(i+ids.length-1)%ids.length&&cross(a,b,p[id])>=-EPS&&cross(b,c,p[id])>=-EPS&&cross(c,a,p[id])>=-EPS))continue;
      out.push([a,b,c]);ids.splice(i,1);found=true;break;}if(!found)break;}
    if(ids.length===3)out.push(ids.map(i=>p[i]));return out;
  }
  function refine(triangles,size,height){const out=[];function split(t,depth=0){const lengths=t.map((a,i)=>distance(a,t[(i+1)%3])),longest=Math.max(...lengths);if(longest>size&&depth<15){const i=lengths.indexOf(longest),a=t[i],b=t[(i+1)%3],c=t[(i+2)%3],m=point((a.x+b.x)/2,(a.y+b.y)/2);split([a,m,c],depth+1);split([m,b,c],depth+1);}else out.push({vertices:t});}triangles.forEach(t=>split(t));return terrainMesh.conformTerrain(out,height).faces.map(f=>f.vertices);}
  function lineInfo(line){const cumulative=[0];for(let i=1;i<line.length;i++)cumulative.push(cumulative.at(-1)+distance(line[i-1],line[i]));return{length:cumulative.at(-1),at(s){s=clamp(s,0,cumulative.at(-1));let i=1;while(i<line.length-1&&cumulative[i]<s)i++;const a=line[i-1],b=line[i],d=cumulative[i]-cumulative[i-1],t=d>EPS?(s-cumulative[i-1])/d:0;return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,dx:(b.x-a.x)/(d||1),dy:(b.y-a.y)/(d||1)};}};}
  function build(track,data){
    data=data||{features:[],sources:[]};const projection=track.projection,geographic=(data.coordinateSystem||'wgs84')==='wgs84';
    const project=c=>{if(!Array.isArray(c)||!Number.isFinite(c[0])||!Number.isFinite(c[1]))throw Error('Invalid pit coordinate');if(!geographic)return point(c[0],c[1]);if(!projection)throw Error('Pit data needs geographic projection');return point(((c[0]-projection.origin[0])*projection.metresPerDegree*Math.cos(projection.latitudeRad)-projection.offset.x)*projection.scale,(-(c[1]-projection.origin[1])*projection.metresPerDegree-projection.offset.y)*projection.scale);};
    const faces=[],groups=new Map(),occupied=[],focusPoints=[],buildings=[],laneLines=[],heightCache=new Map();
    const stats={features:0,buildings:0,garages:0,lanes:0,boxes:0,grandstands:0,gantries:0,rooftopEquipment:0,faces:0,rejected:0,estimatedHeights:true},sourceIds=new Set((data.sources||[]).map(s=>s.id));
    const heightAt=(x,y)=>{const key=x.toFixed(5)+','+y.toFixed(5);if(heightCache.has(key))return heightCache.get(key);let nearest=null;const p=point(x,y);for(let i=0;i<track.points.length;i++){const q=closest(track.points[i],track.points[(i+1)%track.points.length],p);if(!nearest||q.distance<nearest.distance)nearest=q;}heightCache.set(key,nearest.z);return nearest.z;};
    // Segments of one photographed building share a level roof datum even
    // where the surrounding ground slopes. Foundations still reach the ground.
    const buildingBases=new Map();
    for(const f of data.features||[]){const p=f.properties||{};
      if(p.kind!=='pit-building'||typeof p.baseGroup!=='string'||!p.baseGroup||f.geometry?.type!=='Polygon'||!sourceIds.has(p.sourceId)||!p.evidence)continue;
      try{const ring=f.geometry.coordinates[0].map(project);if(ring.length<3)continue;const base=Math.max(...ring.map(q=>heightAt(q.x,q.y)));buildingBases.set(p.baseGroup,Math.max(buildingBases.get(p.baseGroup)??-Infinity,base));}catch(_){/* The normal feature validation reports malformed coordinates. */}
    }
    function face(vertices,fill,kind,id){if(vertices.length<3||vertices.some(p=>![p.x,p.y,p.z].every(Number.isFinite)))throw Error('Non-finite pit mesh');const center=vertices.reduce((c,p)=>point(c.x+p.x/vertices.length,c.y+p.y/vertices.length,c.z+p.z/vertices.length),point(0,0));const key=Math.floor(center.x/96)+','+Math.floor(center.y/96);if(!groups.has(key))groups.set(key,{faces:[],bounds:{minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity}});const group=groups.get(key),item={vertices,fill,kind,featureId:id};group.faces.push(item);faces.push(item);for(const p of vertices){const b=group.bounds;b.minX=Math.min(b.minX,p.x);b.maxX=Math.max(b.maxX,p.x);b.minY=Math.min(b.minY,p.y);b.maxY=Math.max(b.maxY,p.y);}}
    function ribbon(line,width,fill,kind,id,lift=.035){
      const expanded=[line[0]];for(let i=1;i<line.length;i++){const a=line[i-1],b=line[i],steps=Math.max(1,Math.ceil(distance(a,b)/6));for(let j=1;j<=steps;j++)expanded.push(point(a.x+(b.x-a.x)*j/steps,a.y+(b.y-a.y)*j/steps));}
      const pairs=expanded.map((p,i)=>{const a=expanded[Math.max(0,i-1)],b=expanded[Math.min(expanded.length-1,i+1)],d=distance(a,b)||1,nx=-(b.y-a.y)/d*width/2,ny=(b.x-a.x)/d*width/2;return[point(p.x+nx,p.y+ny,heightAt(p.x+nx,p.y+ny)+lift),point(p.x-nx,p.y-ny,heightAt(p.x-nx,p.y-ny)+lift)];});
      for(let i=1;i<pairs.length;i++)face([pairs[i-1][0],pairs[i][0],pairs[i][1],pairs[i-1][1]],fill,kind,id);return pairs;
    }
    function outline(ring,fill,id,lift=.075,width=.16){for(let i=0;i<ring.length;i++)ribbon([ring[i],ring[(i+1)%ring.length]],width,fill,'pit-marking',id,lift);}
    function surface(ring,fill,kind,id){for(const t of refine(triangulate(ring),15,(x,y)=>heightAt(x,y)+.025))face(t,fill,kind,id);}
    function prism(ring,bottom,top,fill,kind,id){
      const lo=ring.map(q=>point(q.x,q.y,typeof bottom==='function'?bottom(q):bottom)),hi=ring.map(q=>point(q.x,q.y,typeof top==='function'?top(q):top));
      for(let i=0;i<ring.length;i++)face([lo[i],lo[(i+1)%ring.length],hi[(i+1)%ring.length],hi[i]],fill,kind,id);
      for(const t of triangulate(ring)){const indices=t.map(q=>ring.indexOf(q));face(indices.map(i=>hi[i]),fill,kind,id);face(indices.map(i=>lo[i]).reverse(),fill,kind,id);}
    }
    function spar(a,b,width,fill,kind,id){
      const dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,length=Math.hypot(dx,dy,dz);if(length<EPS)return;
      const planar=Math.hypot(dx,dy),u=planar>EPS?point(-dy/planar,dx/planar,0):point(1,0,0),v=point((dy*u.z-dz*u.y)/length,(dz*u.x-dx*u.z)/length,(dx*u.y-dy*u.x)/length),half=width/2;
      const corners=q=>[[1,1],[-1,1],[-1,-1],[1,-1]].map(([s,t])=>point(q.x+half*(s*u.x+t*v.x),q.y+half*(s*u.y+t*v.y),q.z+half*(s*u.z+t*v.z)));
      const lo=corners(a),hi=corners(b);for(let i=0;i<4;i++)face([lo[i],lo[(i+1)%4],hi[(i+1)%4],hi[i]],fill,kind,id);face(lo,fill,kind,id);face(hi,fill,kind,id);
    }
    function frame(ring,edge){
      const a=ring[edge],b=ring[(edge+1)%ring.length],length=distance(a,b);if(length<EPS)return null;
      const ux=(b.x-a.x)/length,uy=(b.y-a.y)/length,center=ring.reduce((s,q)=>point(s.x+q.x/ring.length,s.y+q.y/ring.length),point(0,0));
      let vx=-uy,vy=ux;if((center.x-a.x)*vx+(center.y-a.y)*vy<0){vx=-vx;vy=-vy;}
      return{length,local:q=>({u:(q.x-a.x)*ux+(q.y-a.y)*uy,v:(q.x-a.x)*vx+(q.y-a.y)*vy}),at:(u,v,z=0)=>point(a.x+u*ux+v*vx,a.y+u*uy+v*vy,z)};
    }
    function clipBand(ring,low,high){
      let out=ring;
      for(const [limit,sign] of [[low,1],[high,-1]]){const input=out;out=[];for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],da=(a.v-limit)*sign,db=(b.v-limit)*sign;if(da>=-EPS)out.push(a);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({u:a.u+(b.u-a.u)*t,v:limit});}}}
      return out.filter((q,i)=>!i||Math.hypot(q.u-out[i-1].u,q.v-out[i-1].v)>EPS);
    }
    function grandstand(ring,p,id){
      const edge=clamp(Math.round(Number(p.frontEdge??p.garageEdge)||0),0,ring.length-1),f=frame(ring,edge);if(!f)return false;
      const local=ring.map(f.local),depth=Math.max(...local.map(q=>q.v));
      // Rows are clipped to a convex footprint, never a bounding-box slab
      // spanning a concave opening or the racing surface.
      const turns=ring.map((q,i)=>cross(q,ring[(i+1)%ring.length],ring[(i+2)%ring.length])).filter(v=>Math.abs(v)>EPS);
      if(depth<3||local.some(q=>q.v<-.01)||turns.some(v=>v*turns[0]<0))return false;
      const h=clamp(Number(p.height)||13,p.canopy===false?3:8,32),rows=clamp(Math.round(Number(p.rows)||14),4,24);
      const groundAt=u=>{const q=f.at(u,0);return heightAt(q.x,q.y);},umin=Math.min(...local.map(q=>q.u)),umax=Math.max(...local.map(q=>q.u));
      const sections=Math.max(1,Math.ceil((umax-umin)/48)),cuts=Array.from({length:sections+1},(_,i)=>umin+(umax-umin)*i/sections);
      const clipU=(polygon,lo,hi)=>clipBand(polygon.map(q=>({u:q.v,v:q.u})),lo,hi).map(q=>({u:q.v,v:q.u}));
      const seatHeight=clamp(Number(p.seatingHeight)||h*.58,2,h-(p.canopy===false?.3:3)),seatBase=clamp(Number(p.seatingBaseHeight)||0,0,seatHeight-1),slab=clamp(Number(p.frontSlabDepth)||2,.5,depth*.2),gap=clamp(Number(p.concourseDepth)||1.5,0,depth*.2),middle=Math.floor(rows/2),step=(depth-slab-gap)/rows;
      const lower=color(p.lowerSeatColor,'#2f6ca7'),upper=color(p.upperSeatColor,'#4b9371'),structure=color(p.structureColor,'#a9b0b0'),roofColor=color(p.roofColor,'#efefea');
      function strip(low,high,bottom,top,fill,kind){
        const band=clipBand(local,low,high);
        for(let section=0;section<sections;section++){
          const clipped=clipU(band,cuts[section],cuts[section+1]);if(clipped.length<3)continue;
          const lo=clipped.map(q=>f.at(q.u,q.v,groundAt(q.u)+bottom)),hi=clipped.map(q=>f.at(q.u,q.v,groundAt(q.u)+top));
          face(hi,fill,kind,id);
          for(let i=0;i<clipped.length;i++){
            const a=clipped[i],b=clipped[(i+1)%clipped.length];
            if(section>0&&Math.abs(a.u-cuts[section])<EPS&&Math.abs(b.u-cuts[section])<EPS||section<sections-1&&Math.abs(a.u-cuts[section+1])<EPS&&Math.abs(b.u-cuts[section+1])<EPS)continue;
            if(kind==='grandstand-riser'&&high<depth-EPS&&Math.abs(a.v-high)<EPS&&Math.abs(b.v-high)<EPS)continue;
            face([lo[i],lo[(i+1)%lo.length],hi[(i+1)%hi.length],hi[i]],fill,kind,id);
          }
        }
      }
      strip(0,slab,0,.3+seatBase,'#babcb5','grandstand-slab');
      for(let row=0;row<rows;row++){
        const low=slab+row*step+(row>=middle?gap:0),high=low+step,z=.3+seatBase+(row+1)*(seatHeight-seatBase)/rows;
        strip(low,high,0,z,'#afb5b1','grandstand-riser');
        // Continuous seat/back strips retain the tier silhouette at bounded cost.
        strip(low+step*.34,high-step*.12,z,z+.20,row<middle?lower:upper,row<middle?'grandstand-seat-lower':'grandstand-seat-upper');
        if(row===middle-1)strip(high,high+gap,0,z,'#c8c9c1','grandstand-concourse');
      }
      if(p.canopy===false){occupied.push({ring});stats.grandstands++;return true;}
      const canopyDepth=clamp(Number(p.canopyDepth)||16,3,depth+3),front=depth-canopyDepth,back=depth+.4,rise=clamp(Number(p.roofRise)||1.2,0,4),u0=Math.min(...local.map(q=>q.u))-.5,u1=Math.max(...local.map(q=>q.u))+.5;
      const roofZ=(u,v)=>groundAt(u)+h+rise*Math.sin(clamp((v-front)/(back-front),0,1)*Math.PI),roofCuts=[u0,...cuts.slice(1,-1),u1];
      for(let i=0;i<12;i++){
        const a=front+(back-front)*i/12,b=front+(back-front)*(i+1)/12;
        for(let j=1;j<roofCuts.length;j++){const l=roofCuts[j-1],r=roofCuts[j];
          face([f.at(l,a,roofZ(l,a)),f.at(r,a,roofZ(r,a)),f.at(r,b,roofZ(r,b)),f.at(l,b,roofZ(l,b))],roofColor,'grandstand-canopy',id);
          face([f.at(l,b,roofZ(l,b)-.18),f.at(r,b,roofZ(r,b)-.18),f.at(r,a,roofZ(r,a)-.18),f.at(l,a,roofZ(l,a)-.18)],'#c2c7c6','grandstand-canopy',id);
        }
        for(const u of [u0,u1])face([f.at(u,a,roofZ(u,a)),f.at(u,b,roofZ(u,b)),f.at(u,b,roofZ(u,b)-.18),f.at(u,a,roofZ(u,a)-.18)],structure,'grandstand-canopy',id);
      }
      for(const v of [front,back])for(let j=1;j<roofCuts.length;j++){const l=roofCuts[j-1],r=roofCuts[j];face([f.at(l,v,roofZ(l,v)),f.at(r,v,roofZ(r,v)),f.at(r,v,roofZ(r,v)-.18),f.at(l,v,roofZ(l,v)-.18)],structure,'grandstand-canopy',id);}
      const supports=clamp(Math.ceil(f.length/clamp(Number(p.columnSpacing)||12,8,24)),2,12);
      for(let i=0;i<=supports;i++){
        const u=.7+(f.length-1.4)*i/supports,v=depth-.7,foot=f.at(u,v),top=f.at(u,v,roofZ(u,v)-.25);
        if(!inside(foot,ring))continue;
        spar(point(foot.x,foot.y,heightAt(foot.x,foot.y)),top,.38,structure,'grandstand-column',id);
        const nose=f.at(u,front,roofZ(u,front)-.3),mid=f.at(u,(front+back)/2,roofZ(u,(front+back)/2)-.3),heel=f.at(u,back,roofZ(u,back)-.3);
        spar(nose,mid,.16,'#eeeae0','grandstand-truss',id);spar(mid,heel,.16,'#eeeae0','grandstand-truss',id);spar(nose,heel,.12,'#c5cccb','grandstand-truss',id);
        spar(f.at(u,v,groundAt(u)+h-2.5),nose,.15,i===0||i===supports?'#a64c4b':'#c5cccb','grandstand-truss',id);
      }
      const pressHeight=clamp(Number(p.pressBoxHeight)||0,0,3.5),pressDepth=clamp(Number(p.pressBoxDepth)||2.8,1,depth*.3);
      if(pressHeight>0){const section=clipBand(local,depth-pressDepth,depth),bottom=.3+seatHeight+.3,top=Math.min(h-.9,bottom+pressHeight);
        if(top>bottom&&section.length>=3){strip(depth-pressDepth,depth,bottom,top,'#8f999b','grandstand-press-box');
          const lip=clipBand(local,depth-pressDepth,depth-pressDepth+.01).map(q=>q.u);if(lip.length&&top-bottom>.5)for(let j=1;j<cuts.length;j++){const l=Math.max(Math.min(...lip),cuts[j-1]),r=Math.min(Math.max(...lip),cuts[j]);if(r>l)face([f.at(l,depth-pressDepth-.012,groundAt(l)+bottom+.25),f.at(r,depth-pressDepth-.012,groundAt(r)+bottom+.25),f.at(r,depth-pressDepth-.012,groundAt(r)+top-.2),f.at(l,depth-pressDepth-.012,groundAt(l)+top-.2)],'#4e6d7a','grandstand-press-glass',id);}
        }
      }
      occupied.push({ring});stats.grandstands++;return true;
    }
    function gantry(line,p,id){
      if(line.length!==2)return false;
      const f=frame([line[0],line[1],point(line[1].x-(line[1].y-line[0].y),line[1].y+(line[1].x-line[0].x))],0);if(!f||f.length<8)return false;
      const pier=clamp(Number(p.pierWidth)||.7,.3,2),beamDepth=clamp(Number(p.beamDepth)||.8,.4,2),clearance=clamp(Number(p.clearanceHeight)||7.5,7,16),beamHeight=clamp(Number(p.beamHeight)||1.4,.6,3);
      const roadMargin=track.width*.5+1.1+Math.SQRT2*pier/2+1;
      if(line.some(q=>track.points.some((a,i)=>closest(a,track.points[(i+1)%track.points.length],q).distance<roadMargin)))return false;
      let ground=Math.max(...line.map(q=>heightAt(q.x,q.y)));
      for(let i=0;i<track.points.length;i++){
        const a=track.points[i],b=track.points[(i+1)%track.points.length],aa=f.local(a),bb=f.local(b),band=track.width*.5+beamDepth;
        if(Math.min(aa.u,bb.u)<=f.length+band&&Math.max(aa.u,bb.u)>=-band&&Math.min(aa.v,bb.v)<=band&&Math.max(aa.v,bb.v)>=-band)ground=Math.max(ground,a.z,b.z);
      }
      const bottom=ground+clearance,top=bottom+beamHeight,rect=(u0,u1,v0,v1)=>[f.at(u0,v0),f.at(u1,v0),f.at(u1,v1),f.at(u0,v1)];
      for(const u of [0,f.length]){const ring=rect(u-pier/2,u+pier/2,-pier/2,pier/2);prism(ring,q=>heightAt(q.x,q.y),top,'#deded6','timing-gantry-pier',id);occupied.push({ring});}
      prism(rect(-pier/2,f.length+pier/2,-beamDepth/2,beamDepth/2),bottom,top,'#efefea','timing-gantry-beam',id);
      const width=clamp(Number(p.boardWidth)||8,4,f.length-2*pier),height=clamp(Number(p.boardHeight)||1.2,.7,beamHeight),left=(f.length-width)/2,z0=bottom+(beamHeight-height)/2;
      const letters={L:['100','100','100','100','111'],A:['010','101','111','101','101'],P:['110','101','110','100','100'],T:['111','010','010','010','010'],I:['111','010','010','010','111'],M:['101','111','111','101','101'],E:['111','100','110','100','111']};
      const digits={0:'abcdef',1:'bc',2:'abdeg',3:'abcdg',4:'bcfg',5:'acdfg',6:'acdefg',7:'abc',8:'abcdefg',9:'abcdfg','-':'g'};
      const segments={a:[.15,.88,.85,1],b:[.8,.51,.94,.88],c:[.8,.12,.94,.49],d:[.15,0,.85,.12],e:[.06,.12,.2,.49],f:[.06,.51,.2,.88],g:[.15,.44,.85,.56]};
      for(const side of [-1,1]){
        const at=(u,z,offset)=>f.at(side>0?u:f.length-u,side*(beamDepth/2+offset),z),panel=(x,y,w,h,fill,kind)=>{const offset=kind==='timing-gantry-board'?.015:.03;face([at(x,y,offset),at(x+w,y,offset),at(x+w,y+h,offset),at(x,y+h,offset)],fill,kind,id);};
        panel(left,z0,width,height,'#172322','timing-gantry-board');
        const text=(value,x,y,charWidth,charHeight,numeric)=>{for(const [i,ch] of [...String(value).slice(0,12)].entries()){
          if(numeric){for(const key of digits[ch]||[]){const [a,b,c,d]=segments[key];panel(x+i*charWidth+a*charWidth*.8,y+b*charHeight,(c-a)*charWidth*.8,(d-b)*charHeight,'#d5b764','timing-gantry-display');}if(ch===':'||ch==='.')for(const dy of ch===':'?[.25,.65]:[.05])panel(x+i*charWidth+.28*charWidth,y+dy*charHeight,.1*charWidth,.1*charHeight,'#d5b764','timing-gantry-display');}
          else for(const [row,bits] of (letters[ch]||[]).entries())for(let col=0;col<3;col++)if(bits[col]==='1')panel(x+i*charWidth+col*charWidth*.22,y+(4-row)*charHeight/5,charWidth*.18,charHeight*.16,'#e9ece3','timing-gantry-lettering');
        }};
        text('LAP',left+.3,z0+height*.62,width*.07,height*.27,false);text('TIME',left+width*.46,z0+height*.62,width*.07,height*.27,false);
        text(String(p.lapText??'--').replace(/[^0-9:-]/g,'').slice(0,3),left+.3,z0+height*.12,width*.09,height*.39,true);
        text(String(p.timeText??'--:--').replace(/[^0-9:.\-]/g,'').slice(0,8),left+width*.46,z0+height*.12,width*.06,height*.39,true);
      }
      stats.gantries++;return true;
    }
    function building(ring,p,id){
      const h=clamp(Number(p.height)||7,2.5,36),base=buildingBases.get(p.baseGroup)??Math.max(...ring.map(q=>heightAt(q.x,q.y))),roof=base+h,wall=color(p.wallColor,'#d3d1c5'),roofColor=color(p.roofColor,'#8c969b');
      const edge=clamp(Math.round(Number(p.garageEdge)||0),0,ring.length-1),a=ring[edge],b=ring[(edge+1)%ring.length],length=distance(a,b)||1,ux=(b.x-a.x)/length,uy=(b.y-a.y)/length;
      const center=ring.reduce((c,q)=>point(c.x+q.x/ring.length,c.y+q.y/ring.length),point(0,0));let nx=-uy,ny=ux;if((center.x-a.x)*nx+(center.y-a.y)*ny>0){nx=-nx;ny=-ny;}
      const extents=ring.map(q=>({u:(q.x-a.x)*ux+(q.y-a.y)*uy,v:-(q.x-a.x)*nx-(q.y-a.y)*ny})),umin=Math.min(...extents.map(q=>q.u)),umax=Math.max(...extents.map(q=>q.u)),vmin=Math.min(...extents.map(q=>q.v)),vmax=Math.max(...extents.map(q=>q.v));
      const rise=clamp(Number(p.roofRise)||0,0,12),style=p.roofStyle||'flat';
      function roofHeight(x,y){const u=clamp(((x-a.x)*ux+(y-a.y)*uy-umin)/Math.max(1,umax-umin),0,1),v=clamp((-(x-a.x)*nx-(y-a.y)*ny-vmin)/Math.max(1,vmax-vmin),0,1);let factor=0;if(style==='pitched')factor=1-Math.abs(v*2-1);else if(style==='sawtooth'||style==='wing'){const t=u*Math.max(1,Math.min(8,Number(p.roofSections)||3)),wave=1-Math.abs((t-Math.floor(t))*2-1);factor=style==='wing'?(.25+.75*wave)*(1-v*.45):wave;}return roof+rise*factor;}
      for(let i=0;i<ring.length;i++){if(i===edge)continue;const q=ring[i],r=ring[(i+1)%ring.length],steps=Math.max(1,Math.ceil(distance(q,r)/8));for(let j=0;j<steps;j++){const v=point(q.x+(r.x-q.x)*j/steps,q.y+(r.y-q.y)*j/steps),w=point(q.x+(r.x-q.x)*(j+1)/steps,q.y+(r.y-q.y)*(j+1)/steps);face([point(v.x,v.y,heightAt(v.x,v.y)),point(w.x,w.y,heightAt(w.x,w.y)),point(w.x,w.y,roofHeight(w.x,w.y)),point(v.x,v.y,roofHeight(v.x,v.y))],color(p.sideColor,wall),'pit-building',id);}}
      for(const t of refine(triangulate(ring),style==='flat'?24:6,roofHeight))face(t,roofColor,'pit-roof',id);
      const onFront=(u,z,offset=0)=>point(a.x+ux*u+nx*offset,a.y+uy*u+ny*offset,z),openings=[];
      const bays=Math.min(80,Math.max(0,Math.round(Number(p.garageCount)||0))),doorHeight=Math.min(4,h*.62);
      for(let i=0;i<bays;i++){const left=length*(i+.12)/bays,right=length*(i+.88)/bays,front=onFront((left+right)/2,0),bottom=heightAt(front.x,front.y)+.10;openings.push({left,right,bottom,top:bottom+doorHeight,fill:color(p.doorColor,'#46545b'),kind:'pit-garage'},{left,right,bottom:bottom+doorHeight,top:bottom+doorHeight+.12,fill:'#e7e8df',kind:'pit-garage-trim'});}
      const panels=Math.max(1,Math.ceil(length/6));
      const windowRows=clamp(Math.round(Number(p.windowRows)||1),1,16);
      if(p.windowBand||windowRows>1){
        const start=base+(bays?doorHeight+.45:.6),step=(h-(start-base)-.5)/windowRows;
        for(let row=0;row<windowRows;row++){
          const bottom=windowRows===1?base+Math.max(doorHeight+.45,h*.45):start+(row+.18)*step,top=windowRows===1?base+h*.88:start+(row+.78)*step;
          for(let i=0;i<panels;i++){const left=Math.max(.4,length*i/panels+.07),right=Math.min(length-.4,length*(i+1)/panels-.07);if(right>left&&top>bottom)openings.push({left,right,bottom,top,fill:color(p.glassColor,'#567c91'),kind:'pit-window'});}
          if(windowRows>1&&row<windowRows-1&&/^#[0-9a-f]{6}$/i.test(p.facadeAccentColor||'')&&(!Array.isArray(p.facadeAccentRows)||p.facadeAccentRows.includes(row))){
            openings.push({left:0,right:length,bottom:start+(row+.82)*step,top:start+(row+.96)*step,fill:p.facadeAccentColor,kind:'pit-facade-accent'});
          }
        }
      }
      // Partition the facade around its openings instead of layering glass and
      // doors over a long coplanar wall, which a painter's depth sort can hide.
      const cuts=[...new Set([0,length,...Array.from({length:panels+1},(_,i)=>length*i/panels),...openings.flatMap(o=>[o.left,o.right])])].sort((x,y)=>x-y);
      for(let i=1;i<cuts.length;i++){const left=cuts[i-1],right=cuts[i];if(right-left<EPS)continue;const l=onFront(left,0),r=onFront(right,0),low=[heightAt(l.x,l.y),heightAt(r.x,r.y)],high=[roofHeight(l.x,l.y),roofHeight(r.x,r.y)];let bottom=low;
        const panel=(from,to,fill,kind)=>{if(to.some((z,j)=>z>from[j]+EPS))face([onFront(left,from[0]),onFront(right,from[1]),onFront(right,to[1]),onFront(left,to[0])],fill,kind,id);};
        for(const o of openings.filter(o=>o.left<=(left+right)/2&&o.right>=(left+right)/2).sort((x,y)=>x.bottom-y.bottom)){const lo=bottom.map((z,j)=>clamp(o.bottom,z,high[j])),hi=lo.map((z,j)=>clamp(o.top,z,high[j]));panel(bottom,lo,wall,'pit-building');panel(lo,hi,o.fill,o.kind);bottom=hi;}
        panel(bottom,high,wall,'pit-building');
      }
      const canopy=clamp(Number(p.canopyDepth)||0,0,12);if(canopy>0){const z=base+Math.min(h*.64,5);for(let i=0;i<panels;i++){const left=length*i/panels,right=length*(i+1)/panels;face([onFront(left,z,0),onFront(right,z,0),onFront(right,z,canopy),onFront(left,z,canopy)],roofColor,'pit-canopy',id);}}
      // Equipment is an optional roof-only detail. Its footprint must remain
      // wholly within this building; no blue cubes are placed on the ground.
      for(const item of (Array.isArray(p.rooftopEquipment)?p.rooftopEquipment:[]).slice(0,24)){
        if(!item||typeof item!=='object')continue;
        const u=umin+clamp(Number(item.u)||0,0,1)*(umax-umin),v=vmin+clamp(Number(item.v)||0,0,1)*(vmax-vmin),w=clamp(Number(item.width)||4,.3,30),d=clamp(Number(item.depth)||2,.3,16),height=clamp(Number(item.height)||.7,.2,3);
        const rr=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([su,sv])=>point(a.x+ux*(u+su*w/2)-nx*(v+sv*d/2),a.y+uy*(u+su*w/2)-ny*(v+sv*d/2)));
        const onRoof=q=>inside(q,ring)||ring.some((r,i)=>closest(r,ring[(i+1)%ring.length],q).distance<EPS);
        const crossing=rr.some((q,i)=>ring.some((r,j)=>cross(q,rr[(i+1)%rr.length],r)*cross(q,rr[(i+1)%rr.length],ring[(j+1)%ring.length])<-EPS&&cross(r,ring[(j+1)%ring.length],q)*cross(r,ring[(j+1)%ring.length],rr[(i+1)%rr.length])<-EPS));
        if(!rr.every(onRoof)||crossing)continue;
        const z=Math.max(...rr.map(q=>roofHeight(q.x,q.y)))+.035;
        prism(rr,q=>roofHeight(q.x,q.y)+.02,z+height,color(item.color,'#477999'),'pit-rooftop-equipment',id);stats.rooftopEquipment++;
      }
      stats.buildings++;stats.garages+=bays;focusPoints.push(...ring);occupied.push({ring});
      buildings.push({id,ring,normal:point(nx,ny),height:h,area:Math.abs(ring.reduce((sum,q,i)=>sum+q.x*ring[(i+1)%ring.length].y-q.y*ring[(i+1)%ring.length].x,0))/2});
    }
    for(const f of data.features||[]){
      const p=f.properties||{},g=f.geometry,id=f.id||'pit-'+stats.features;if(!g||!p.kind||!p.sourceId||!sourceIds.has(p.sourceId)||!p.evidence){stats.rejected++;continue;}
      let coords;try{coords=(g.type==='Polygon'?g.coordinates[0]:g.coordinates).map(project);}catch(_){stats.rejected++;continue;}
      if(g.type==='Polygon'&&coords.length>1&&distance(coords[0],coords.at(-1))<EPS)coords.pop();
      if(coords.length<(g.type==='Polygon'?3:2)){stats.rejected++;continue;}stats.features++;
      if(p.kind==='pit-building'&&g.type==='Polygon')building(coords,p,id);
      else if(p.kind==='grandstand'&&g.type==='Polygon'){if(!grandstand(coords,p,id)){stats.features--;stats.rejected++;}}
      else if(p.kind==='timing-gantry'&&g.type==='LineString'){if(!gantry(coords,p,id)){stats.features--;stats.rejected++;}}
      else if(p.kind==='pit-apron'&&g.type==='Polygon'){surface(coords,color(p.color,'#6d746f'),p.kind,id);occupied.push({ring:coords});focusPoints.push(...coords);}
      else if(p.kind==='pit-lane'&&g.type==='LineString'){
        const width=clamp(Number(p.width)||6,2,24),pairs=ribbon(coords,width,color(p.color,'#68726f'),p.kind,id);if(p.edgeMarkings)for(const side of [0,1])ribbon(pairs.map(pair=>pair[side]),.13,color(p.markingColor,'#f1eee2'),'pit-marking',id,.065);
        occupied.push({line:coords,radius:width/2});laneLines.push(coords);stats.lanes++;
      }else if(p.kind==='pit-wall'&&g.type==='LineString'){
        const h=clamp(Number(p.height)||1.1,.25,5),width=clamp(Number(p.width)||.35,.1,1),pairs=ribbon(coords,width,color(p.color,'#e0ddcf'),'pit-wall-base',id,.03);
        for(let i=1;i<pairs.length;i++){const ring=[pairs[i-1][0],pairs[i][0],pairs[i][1],pairs[i-1][1]],top=ring.map(q=>point(q.x,q.y,q.z+h));for(let k=0;k<4;k++)face([ring[k],ring[(k+1)%4],top[(k+1)%4],top[k]],color(p.color,'#d6d5cb'),'pit-wall',id);face(top,color(p.capColor,'#eeeade'),'pit-wall',id);}
      }else if(p.kind==='pit-box'&&g.type==='Polygon'){outline(coords,color(p.color,'#f3d56f'),id);stats.boxes++;focusPoints.push(...coords);}
      else if(p.kind==='pit-box-row'&&g.type==='LineString'){
        const info=lineInfo(coords),n=Math.max(1,Math.min(100,Math.round(Number(p.bayCount)||1))),depth=clamp(Number(p.depth)||5,2,18),side=p.side==='left'?-1:1;
        for(let i=0;i<n;i++){const a=info.at(info.length*i/n),b=info.at(info.length*(i+1)/n),nx=-(a.dy+b.dy)*.5*side,ny=(a.dx+b.dx)*.5*side,norm=Math.hypot(nx,ny)||1,ring=[a,b,point(b.x+nx/norm*depth,b.y+ny/norm*depth),point(a.x+nx/norm*depth,a.y+ny/norm*depth)];outline(ring,color(p.color,'#f3d56f'),id);stats.boxes++;focusPoints.push(...ring);}
      }else {stats.features--;stats.rejected++;}
    }
    const allGroups=[...groups.values()],allPoints=faces.flatMap(f=>f.vertices),worldBounds=allPoints.length?bounds(allPoints):null;
    // Separate complexes (e.g. Wing/National) should not shrink both into a
    // whole-circuit view. Start at the main photographed facade and its neighbours.
    const primary=buildings.find(b=>b.id===data.metadata?.focusFeatureId)||[...buildings].sort((a,b)=>b.area-a.area)[0],cluster=primary?[primary]:[];
    if(primary){let changed=true;while(changed){changed=false;for(const b of buildings){if(cluster.includes(b))continue;if(cluster.some(other=>b.ring.some(p=>other.ring.some((q,i)=>closest(q,other.ring[(i+1)%other.ring.length],p).distance<45)))){cluster.push(b);changed=true;}}}}
    const focusBounds=cluster.length?bounds(cluster.flatMap(b=>b.ring)):focusPoints.length?bounds(focusPoints):worldBounds;let focus=null;
    if(focusBounds){const x=(focusBounds.minX+focusBounds.maxX)/2,y=(focusBounds.minY+focusBounds.maxY)/2;const line=laneLines[0],heading=line?Math.atan2(line.at(-1).y-line[0].y,line.at(-1).x-line[0].x):0;focus={target:point(x,y,heightAt(x,y)+3),distance:Math.max(80,Math.hypot(focusBounds.maxX-focusBounds.minX,focusBounds.maxY-focusBounds.minY)*1.05),heading,yaw:primary?Math.atan2(-primary.normal.x,primary.normal.y)+.25:heading+Math.PI/2,bounds:focusBounds};}
    function contains(x,y,margin=0){const p=point(x,y);return occupied.some(area=>area.ring?(inside(p,area.ring)||area.ring.some((a,i)=>closest(a,area.ring[(i+1)%area.ring.length],p).distance<margin)):area.line.some((b,i)=>i>0&&closest(area.line[i-1],b,p).distance<area.radius+margin));}
    stats.faces=faces.length;return{data,stats,faces,groups:allGroups,bounds:worldBounds,focus,contains,groundHeight:heightAt,query:(x,y,radius=440)=>allGroups.filter(g=>Math.hypot(Math.max(g.bounds.minX-x,0,x-g.bounds.maxX),Math.max(g.bounds.minY-y,0,y-g.bounds.maxY))<=radius)};
  }
  const api={build};root.PitFacilities=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
