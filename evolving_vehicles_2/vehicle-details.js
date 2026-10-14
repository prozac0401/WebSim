/* Individually authored exterior fittings, traced from the official reference
 * images in assets/reference. Coordinates are physical metres through the
 * body surface helpers, so lamps, grilles and bumper apertures follow the skin.
 * This is reference-based modelling, not factory CAD or a scanned asset. */
(function (root) {
  'use strict';
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  const rect=(u0,v0,u1,v1)=>[[u0,v0],[u1,v0],[u1,v1],[u0,v1]];
  const mirror=(p,s)=>p.map(([u,v])=>[u*s,v]);
  const WHITE='#cfe3ed', RED='#a90c17', CHROME='#929da4', BLACK='#0a1116', LENS='#192127';
  function append(c){
    const {id,m,L,W,H,faces,paint,top,roofWidth,roofZ,surfacePoint,endSurface,face,quad,P}=c;
    const sill=c.sill??Math.max(.19,c.R*.64),holes={1:[],'-1':[]};
    const point=(end,u,v,d=0)=>endSurface?endSurface(end,u,v,d):P(end*(L*.5-.10*Math.pow(Math.abs(u),2.4)+d),u*W*.445,sill+v*(top(end*.5)-sill));
    function emit(vertices,fill,material='paint',part='fascia',flat=false){
      if(vertices.length<3)return;const a=vertices[0],b=vertices[1],cc=vertices[2];
      const nx=(b.y-a.y)*(cc.z-a.z)-(b.z-a.z)*(cc.y-a.y);
      const mean=vertices.reduce((t,p)=>t+p.x,0)/vertices.length;
      if(nx*mean<0)vertices=[...vertices].reverse();
      face(vertices,fill,null,.4,material);const f=faces[faces.length-1];f.part=part;f.flat=flat;
    }
    function triangle(end,a,b,d,col,material,offset,part,depth=1){
      if(depth){const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+d[0])/2,(b[1]+d[1])/2],ca=[(d[0]+a[0])/2,(d[1]+a[1])/2];triangle(end,a,ab,ca,col,material,offset,part,depth-1);triangle(end,ab,b,bc,col,material,offset,part,depth-1);triangle(end,ca,bc,d,col,material,offset,part,depth-1);triangle(end,ab,bc,ca,col,material,offset,part,depth-1);return;}
      emit([point(end,...a,offset),point(end,...b,offset),point(end,...d,offset)],col,material,part);
    }
    // Ear-clipping keeps concave intakes and angular lamp outlines from being
    // filled across their recesses by a triangle fan.
    function triangulate(poly){
      const p=poly.map(v=>[...v]),out=[];let area=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];area+=a[0]*b[1]-b[0]*a[1];}if(area<0)p.reverse();
      const cross=(a,b,d)=>(b[0]-a[0])*(d[1]-a[1])-(b[1]-a[1])*(d[0]-a[0]);
      for(let guard=0;p.length>3&&guard<200;guard++){let found=false;for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],d=p[(i+1)%p.length];if(cross(a,b,d)<1e-10)continue;if(p.some((v,j)=>j!==i&&j!==(i+p.length-1)%p.length&&j!==(i+1)%p.length&&cross(a,b,v)>-1e-10&&cross(b,d,v)>-1e-10&&cross(d,a,v)>-1e-10))continue;out.push([a,b,d]);p.splice(i,1);found=true;break;}if(!found)break;}
      if(p.length===3)out.push(p);return out;
    }
    function panel(end,poly,col,material='paint',offset=.004,part='fascia-panel'){
      for(const t of triangulate(poly)){const span=Math.max(Math.max(...t.map(p=>p[0]))-Math.min(...t.map(p=>p[0])),Math.max(...t.map(p=>p[1]))-Math.min(...t.map(p=>p[1])));triangle(end,...t,col,material,offset,part,span>.75?3:span>.35?2:span>.12?1:0);}
    }
    // A narrow ribbon has real surface area in both the GPU and canvas paths.
    function strip(end,path,width,col=WHITE,material='light',offset=.009,part='lamp-signature'){
      for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],du=b[0]-a[0],dv=b[1]-a[1],len=Math.hypot(du,dv)||1,ou=-dv/len*width/2,ov=du/len*width/2;panel(end,[[a[0]+ou,a[1]+ov],[b[0]+ou,b[1]+ov],[b[0]-ou,b[1]-ov],[a[0]-ou,a[1]-ov]],col,material,offset,part);}
    }
    function outline(end,poly,width,col=CHROME,offset=.005){strip(end,[...poly,poly[0]],width,col,'chrome',offset,'aperture-surround');}
    function recess(end,poly,{depth=.035,frame=paint,lip=.012,fill=BLACK,material='rubber',part='recess'}={}){
      holes[end].push(poly);const center=poly.reduce((a,p)=>[a[0]+p[0]/poly.length,a[1]+p[1]/poly.length],[0,0]);
      const inner=poly.map(p=>[center[0]+(p[0]-center[0])*.965,center[1]+(p[1]-center[1])*.96]);
      for(let i=0;i<poly.length;i++){const j=(i+1)%poly.length;emit([point(end,...poly[i],.001),point(end,...poly[j],.001),point(end,...inner[j],-depth),point(end,...inner[i],-depth)],frame,frame===paint?'paint':'chrome',part+'-wall');}
      panel(end,inner,fill,material,-depth,part+'-interior');if(lip)outline(end,poly,lip,frame,.002);return inner;
    }
    function lens(end,poly,part='lamp-housing'){recess(end,poly,{depth:.018,frame:'#303a40',lip:.012,fill:LENS,material:'glass',part});}
    const inside=(poly,u,v)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>v)!==(b[1]>v)&&u<(b[0]-a[0])*(v-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
    function mesh(end,poly,spacing=.075,col='#576269',diamond=true,offset=-.015){
      for(const sign of diamond?[-1,1]:[0])for(let row=-32;row<=32;row++){
        let run=[];const flush=()=>{if(run.length>1){const simple=run.filter((p,i)=>i===0||i===run.length-1||i%8===0);strip(end,simple,.008,col,'chrome',offset,'grille-lattice');}run=[];};
        for(let j=0;j<=90;j++){const v=j/90,u=row*spacing+sign*(v-.5)*.72;if(inside(poly,u,v))run.push([u,v]);else flush();}flush();
      }
    }
    function slats(end,poly,vertical=false,count=8,col='#3b454b',offset=-.014){
      const us=poly.map(p=>p[0]),vs=poly.map(p=>p[1]),a=Math.min(...us),b=Math.max(...us),lo=Math.min(...vs),hi=Math.max(...vs);
      for(let j=1;j<count;j++){const u=a+(b-a)*j/count,v=lo+(hi-lo)*j/count,run=[];for(let k=0;k<=60;k++){const p=vertical?[u,lo+(hi-lo)*k/60]:[a+(b-a)*k/60,v];if(inside(poly,...p))run.push(p);}if(run.length>1)strip(end,run.filter((p,i)=>i===0||i===run.length-1||i%10===0),.011,col,'chrome',offset,'grille-blade');}
    }
    function projector(end,u,v,w=.055,h=.055){panel(end,rect(u-w/2,v-h/2,u+w/2,v+h/2),'#7c98a6','glass',-.006,'projector-lens');strip(end,[[u-w*.42,v+h*.25],[u+w*.42,v+h*.25]],.008,WHITE,'light',-.003,'projector-reflector');}
    function pixel(end,u,v,w=.065,h=.055,col=WHITE){panel(end,rect(u-w/2,v-h/2,u+w/2,v+h/2),col,'light',.009,'pixel-lamp');panel(end,rect(u-w*.29,v-h*.24,u+w*.29,v+h*.24),'#263b44','glass',.011,'pixel-lamp-core');}
    function plate(end,v,width=.50,height){
      const uw=width/(W*.89),vh=.115/Math.max(.22,top(end*.5)-sill);
      const pp=(poly,col,mat,offset,part)=>height==null?panel(end,poly,col,mat,offset,part):highPanel(end,poly.map(([u,z])=>[u,(height+(z-v)*(top(end*.5)-sill))/H]),col,mat,offset+(id==='torres'?.04:0));
      pp(rect(-uw*.52,v-vh*.57,uw*.52,v+vh*.57),'#20282d','rubber',.012,'plate-mount');
      pp(rect(-uw*.5,v-vh*.5,uw*.5,v+vh*.5),'#d7dedd','paint',.016,'number-plate');
      // Small separated type strokes remain legible as a manufacturer display
      // plate at close range instead of a blank floating white rectangle.
      const label=id.toUpperCase().replace('_',''),glyphs={A:['01110','10001','11111','10001','10001'],B:['11110','10001','11110','10001','11110'],C:['01111','10000','10000','10000','01111'],E:['11111','10000','11110','10000','11111'],F:['11111','10000','11110','10000','10000'],G:['01111','10000','10111','10001','01111'],I:['111','010','010','010','111'],K:['10001','10010','11100','10010','10001'],L:['10000','10000','10000','10000','11111'],M:['10001','11011','10101','10001','10001'],N:['10001','11001','10101','10011','10001'],O:['01110','10001','10001','10001','01110'],P:['11110','10001','11110','10000','10000'],Q:['01110','10001','10101','10010','01101'],R:['11110','10001','11110','10010','10001'],S:['01111','10000','01110','00001','11110'],T:['11111','00100','00100','00100','00100'],U:['10001','10001','10001','10001','01110'],V:['10001','10001','10001','01010','00100'],Y:['10001','01010','00100','00100','00100'],'0':['01110','10011','10101','11001','01110'],'2':['11110','00001','01110','10000','11111'],'5':['11111','10000','11110','00001','11110'],'8':['01110','10001','01110','10001','01110']};
      const gw=uw*.65/(label.length*6),gh=vh*.5/5;
      [...label].forEach((ch,i)=>{const g=glyphs[ch];if(!g)return;g.forEach((row,r)=>[...row].forEach((b,j)=>{if(b==='1'){const u=-uw*.325+(i*6+j)*gw;pp(mirror(rect(u,v+vh*.25-r*gh-gh*.83,u+gw*.8,v+vh*.25-r*gh),-end),'#263039','rubber',.0175,'plate-type');}}));});
    }
    // All coordinates below are traced front-on proportions, each model has its
    // own nose and tail rather than a shared grille with a changed badge.
    if(id==='g80'){
      const crest=[[-.635,.98],[.635,.98],[.619,.77],[.575,.52],[.46,.37],[.25,.25],[0,.19],[-.25,.25],[-.46,.37],[-.575,.52],[-.619,.77]];
      recess(1,crest,{frame:CHROME,lip:.013,depth:.055,part:'genesis-crest'});mesh(1,crest,.075,'#9aa3a7',true,-.022);
      const intake=[[-.91,.04],[.91,.04],[.88,.23],[.80,.33],[.54,.33],[.28,.21],[0,.135],[-.28,.21],[-.54,.33],[-.80,.33],[-.88,.23]];
      recess(1,intake,{frame:paint,lip:.016,depth:.045,part:'g80-lower-intake'});mesh(1,intake,.07,'#38464d',true,-.026);
      for(const s of[-1,1]){
        for(const v of[.87,.66]){const shape=mirror([[.68,v-.065],[.98,v-.045],[.985,v+.045],[.69,v+.048]],s);lens(1,shape,'g80-two-line-housing');strip(1,mirror([[.70,v-.025],[.965,v-.008]],s),.018,WHITE);for(let i=0;i<6;i++)projector(1,s*(.72+i*.043),v+.018,.024,.035);}
        const tail=[[.39,.84],[.96,.90],[.92,.82],[.44,.77]];for(const dv of[0,-.18]){const p=mirror(tail.map(([u,v])=>[u,v+dv]),s);lens(-1,p);strip(-1,mirror([[.43,.81+dv],[.925,.865+dv]],s),.020,RED);}
        lens(-1,mirror([[.58,.21],[.94,.19],[.88,.30],[.65,.31]],s));strip(-1,mirror([[.61,.23],[.91,.23]],s),.018,RED);
      }
      panel(-1,[[-.87,.01],[.87,.01],[.83,.13],[.54,.16],[.33,.10],[-.33,.10],[-.54,.16],[-.83,.13]],BLACK,'rubber');
      strip(-1,[[-.91,.11],[-.52,.14],[-.31,.08],[.31,.08],[.52,.14],[.91,.11]],.015,CHROME,'chrome');plate(1,.53,.47);plate(-1,.34,.47);
    }else if(id==='k5'){
      const tiger=[[-.70,.91],[-.35,.89],[-.25,.95],[.25,.95],[.35,.89],[.70,.91],[.63,.72],[.24,.73],[.18,.77],[-.18,.77],[-.24,.73],[-.63,.72]];
      recess(1,tiger,{frame:'#30383d',lip:.008,part:'k5-tiger-nose'});mesh(1,tiger,.10,'#48535b');
      const lower=[[-.89,.06],[.89,.06],[.85,.40],[.30,.39],[.16,.25],[-.16,.25],[-.30,.39],[-.85,.40]];recess(1,lower,{lip:.022});mesh(1,lower,.12,'#38434b');
      for(const s of[-1,1]){lens(1,mirror([[.55,.74],[.94,.70],[.99,.88],[.91,1.01],[.59,.96]],s));strip(1,mirror([[.57,.91],[.88,.94],[.985,.83],[.89,.72],[.98,.56]],s),.022);for(let j=0;j<4;j++)projector(1,s*(.63+j*.071),.83,.048,.065);
        lens(-1,mirror([[.48,.90],[.99,.90],[.96,.53],[.84,.45],[.85,.77],[.47,.80]],s));strip(-1,mirror([[.50,.86],[.94,.85],[.92,.58],[.85,.49]],s),.024,RED);}
      strip(-1,[[-.48,.865],[.48,.865]],.022,RED);plate(1,.50);plate(-1,.32);
    }else if(id==='avante'){
      const lower=[[-.76,.04],[.76,.04],[.94,.32],[.83,.57],[.55,.55],[.45,.39],[-.45,.39],[-.55,.55],[-.83,.57],[-.94,.32]];recess(1,lower,{lip:.008,frame:'#232a2e'});slats(1,lower,false,7);
      strip(1,[[-.95,.96],[-.74,.91],[.74,.91],[.95,.96]],.015,'#1c252a','rubber');
      for(const s of[-1,1]){strip(1,mirror([[.47,.922],[.87,.947],[.98,1.025]],s),.019);const h=mirror([[.68,.48],[.94,.42],[.91,.70],[.73,.72]],s);lens(1,h);for(const v of[.54,.64])projector(1,s*.81,v,.10,.036);strip(-1,mirror([[.96,.95],[.96,.48]],s),.035,RED);}
      strip(-1,[[-.89,.84],[.89,.84]],.019,RED);panel(-1,rect(-.95,.02,.95,.37),'#171e22','rubber');for(const s of[-1,1])panel(-1,mirror([[.43,.05],[.87,.05],[.86,.30],[.42,.29]],s),'#7a858a','chrome');plate(1,.45);plate(-1,.30);
    }else if(id==='grandeur'){
      const grille=[[-.94,.08],[.94,.08],[.91,.51],[.83,.60],[-.83,.60],[-.91,.51]];recess(1,grille,{frame:CHROME,lip:.012,depth:.046});mesh(1,grille,.069,'#a3adb1',true,-.017);
      strip(1,[[-.985,.96],[-.65,.98],[0,.985],[.65,.98],[.985,.96]],.020);for(const s of[-1,1]){for(const v of[.25,.37,.49])projector(1,s*.84,v,.058,.070);strip(-1,mirror([[.58,.14],[.88,.14]],s),.017,RED);}
      strip(-1,[[-.99,.89],[-.6,.895],[0,.9],[.6,.895],[.99,.89]],.021,RED);strip(-1,[[-.98,.48],[-.52,.43],[.52,.43],[.98,.48]],.030,'#20272c','rubber');panel(-1,rect(-.91,.01,.91,.13),BLACK,'rubber');plate(1,.39);plate(-1,.32);
    }else if(id==='ioniq5'){
      const mask=[[-.98,.81],[.98,.81],[.99,1.0],[-.99,1.0]];lens(1,mask,'ioniq-pixel-mask');
      for(const s of[-1,1])for(let j=0;j<2;j++)pixel(1,s*(.58+j*.22),.90,.15,.13);
      const lower=[[-.86,.05],[.86,.05],[.78,.30],[.55,.39],[-.55,.39],[-.78,.30]];recess(1,lower,{frame:'#51595b',lip:.018});strip(1,[[-.96,.11],[-.81,.36],[-.61,.42],[.61,.42],[.81,.36],[.96,.11]],.020,'#343c3f','rubber');
      lens(-1,rect(-.98,.77,.98,.96),'ioniq-tail-pixel-mask');for(const s of[-1,1])for(let i=0;i<8;i++)for(let j=0;j<2;j++)panel(-1,rect(s*(.50+i*.056)-.015,.805+j*.063,s*(.50+i*.056)+.015,.825+j*.063),RED,'light',.008,'tail-pixels');
      panel(-1,[[-.92,.02],[.92,.02],[.84,.28],[-.84,.28]],'#252d30','rubber');strip(-1,[[-.94,.02],[-.85,.30],[.85,.30],[.94,.02]],.025,CHROME,'chrome');plate(1,.51);plate(-1,.48);
    }else if(id==='santafe'){
      const upper=rect(-.97,.71,.97,.96);recess(1,upper,{lip:.005,frame:'#222a2f'});mesh(1,upper,.085,'#828d91');strip(1,[[-.95,.83],[.95,.83]],.043,paint,'paint',.010);
      for(const s of[-1,1]){const p=mirror(rect(.63,.70,.96,.98),s);lens(1,p);strip(1,mirror([[.67,.73],[.67,.95]],s),.025);strip(1,mirror([[.91,.73],[.91,.95]],s),.025);strip(1,mirror([[.67,.83],[.91,.83]],s),.027);recess(1,mirror(rect(.80,.20,.95,.61),s),{lip:.016,frame:'#a0a7a6'});}
      const lower=rect(-.70,.02,.70,.22);recess(1,lower,{lip:.008});mesh(1,lower,.09,'#707d81');recess(1,rect(-.76,.46,.76,.61),{lip:0,depth:.021});
      lens(-1,rect(-.97,.49,.97,.69),'santafe-low-tail-panel');for(const s of[-1,1]){strip(-1,mirror([[.40,.53],[.40,.65]],s),.034,RED);strip(-1,mirror([[.89,.53],[.89,.65]],s),.034,RED);strip(-1,mirror([[.40,.59],[.89,.59]],s),.031,RED);strip(-1,mirror([[.58,.20],[.91,.20]],s),.019,RED);}
      panel(-1,rect(-.98,.01,.98,.14),'#242d31','rubber');plate(1,.33);plate(-1,.20);
    }else if(id==='ray'){
      const closed=[[-.61,.60],[-.50,.56],[.50,.56],[.61,.60],[.62,.91],[.50,.97],[-.50,.97],[-.62,.91]];panel(1,closed,paint,'paint');outline(1,closed,.019,'#31383c');for(const v of[.67,.76,.85])for(const s of[-1,1])strip(1,mirror([[.12,v],[.48,v]],s),.012,'#aab5b8','paint');
      for(const s of[-1,1]){const h=mirror([[.63,.56],[.91,.59],[.99,.91],[.91,1.01],[.61,.98],[.57,.91]],s);lens(1,h);strip(1,mirror([[.66,.59],[.88,.62],[.92,.88]],s),.022);for(const v of[.66,.77,.88])projector(1,s*.78,v,.085,.052);}
      const lower=[[-.84,.04],[.84,.04],[.81,.31],[-.81,.31]];recess(1,lower,{lip:.026,frame:'#343d40'});slats(1,lower,false,4);strip(1,[[-.69,.04],[-.60,.09],[.60,.09],[.69,.04]],.041,CHROME,'chrome');plate(1,.40,.46);
      rearTallLamps('ray');plate(-1,.58,.46,H*.54);panel(-1,rect(-.84,.01,.84,.22),'#30383b','rubber');
    }else if(id==='morning'){
      lens(1,[[-.98,.95],[.98,.95],[.98,.78],[.70,.72],[.58,.84],[-.58,.84],[-.70,.72],[-.98,.78]]);strip(1,[[-.98,.96],[-.58,.92],[.58,.92],[.98,.96]],.025);
      for(const s of[-1,1]){lens(1,mirror([[.70,.51],[.91,.56],[.98,.94],[.69,.88]],s));strip(1,mirror([[.75,.89],[.84,.59]],s),.026);for(const v of[.62,.72,.82])projector(1,s*.85,v,.07,.06);recess(1,mirror(rect(.69,.06,.92,.40),s),{frame:'#232d31',lip:.030});}
      const lower=[[-.65,.02],[.65,.02],[.66,.45],[-.66,.45]];recess(1,lower,{lip:.023,frame:'#222c30'});mesh(1,lower,.11,'#414e53');plate(1,.32,.44);
      rearTallLamps('morning');plate(-1,.27,.44,H*.30);panel(-1,rect(-.82,.01,.82,.10),'#252d31','rubber');
    }else if(id==='torres'){
      const g=rect(-.64,.76,.64,.98);recess(1,g,{lip:.008});for(let i=-3;i<=3;i++){
        const u=i*.18,tooth=[[u-.034,.765],[u+.023,.780],[u+.043,.956],[u-.010,.986]],inner=[[u-.014,.779],[u+.010,.794],[u+.025,.952],[u+.002,.969]];
        panel(1,tooth,'#262e32','plastic',.019,'torres-grille-tooth');panel(1,inner,'#a7afb1','chrome',.030,'torres-grille-chrome');
        for(let j=0;j<tooth.length;j++){const k=(j+1)%tooth.length;emit([point(1,...tooth[j],.019),point(1,...tooth[k],.019),point(1,...tooth[k],-.018),point(1,...tooth[j],-.018)],'#3a454c','plastic','torres-grille-tooth-return',true);}
      }
      for(const s of[-1,1]){lens(1,mirror([[.62,.72],[.96,.83],[.99,.98],[.59,.96]],s));strip(1,mirror([[.62,.94],[.65,.76],[.77,.83],[.97,.89]],s),.022);projector(1,s*.77,.87,.11,.08);recess(1,mirror(rect(.78,.15,.93,.58),s),{lip:.018});}
      const lo=rect(-.64,.18,.64,.61);recess(1,lo,{lip:0});slats(1,lo,false,4,'#9fa7a8');
      for(const v of[.29,.405,.52]){strip(1,[[-.64,v+.018],[-.61,v],[.61,v],[.64,v+.018]],.020,'#aab2b4','chrome',.008,'torres-grille-crossbar');}
      for(const s of[-1,1]){panel(1,mirror([[.38,.025],[.65,.025],[.60,.20],[.46,.22]],s),'#a4acae','chrome',.026,'torres-skid-corner');for(const u of[.47,.54])strip(1,mirror([[u,.045],[u,.17]],s),.018,'#3e484c','plastic',.030,'torres-skid-slot');}
      strip(1,[[-.68,.02],[-.59,.17],[.59,.17],[.68,.02]],.050,CHROME,'chrome');plate(1,.32);
      rearTallLamps('torres');plate(-1,.42,.50,H*.48);panel(-1,rect(-.89,.01,.89,.23),'#343e41','rubber');for(const s of[-1,1])panel(-1,mirror([[.49,.01],[.72,.01],[.71,.21],[.53,.24]],s),CHROME,'chrome');
    }else if(id==='carnival'){
      const g=[[-.73,.94],[.73,.94],[.70,.57],[.45,.48],[-.45,.48],[-.70,.57]];recess(1,g,{frame:CHROME,lip:.012,depth:.045});for(let i=-9;i<=9;i++){const u=i*.071;strip(1,[[u-.025,.57],[u+.015,.84]],.014,'#929b9f','chrome',-.010);strip(1,[[u+.025,.60],[u-.015,.78]],.009,'#3f4d55','chrome',-.007);}
      for(const s of[-1,1]){lens(1,mirror([[.78,.49],[.95,.50],[.98,.98],[.75,.95]],s));strip(1,mirror([[.94,.52],[.94,.89],[.87,.98],[.21,.98]],s),.025);for(let i=0;i<4;i++)projector(1,s*.85,.56+i*.087,.075,.052);}
      const low=[[-.83,.03],[.83,.03],[.79,.27],[-.79,.27]];recess(1,low,{lip:.018,frame:'#949e9f'});slats(1,low,false,3);plate(1,.36);
      rearTallLamps('carnival');plate(-1,.39,.50,H*.40);panel(-1,rect(-.93,.01,.93,.20),'#30393d','rubber');strip(-1,[[-.93,.07],[-.74,.12],[.74,.12],[.93,.07]],.036,CHROME,'chrome');
    }else if(id==='staria'){
      const low=rect(-.94,.02,.94,.79);recess(1,low,{lip:.022,frame:'#8b9699'});slats(1,low,false,11,'#6e7d83');for(let i=-7;i<=7;i++)strip(1,[[i*.125,.05],[i*.125,.76]],.013,'#37434a','rubber',-.005);
      for(const s of[-1,1]){lens(1,mirror(rect(.72,.44,.94,.95),s));for(let a=0;a<2;a++)for(let b=0;b<3;b++)projector(1,s*(.77+a*.10),.53+b*.15,.055,.09);}
      hoodBar(.447,.90,.012,WHITE);plate(1,.41);rearTallLamps('staria');plate(-1,.55,.50,H*.49);
    }else if(id==='musso_ev'){
      lens(1,rect(-.99,.91,.99,1.01));for(const s of[-1,1])strip(1,mirror([[.55,.95],[.97,.95]],s),.022);for(let i=-3;i<=3;i++)pixel(1,i*.15,.96,.085,.045);
      panel(1,rect(-.63,.62,.63,.90),'#323c40','rubber');const g=rect(-.64,.28,.64,.58);recess(1,g,{lip:.012});slats(1,g,false,4,'#66767d');
      for(const s of[-1,1]){lens(1,mirror(rect(.77,.17,.94,.58),s));for(const v of[.27,.44])projector(1,s*.86,v,.095,.095);panel(1,mirror([[.43,.15],[.56,.15],[.59,.41],[.50,.46],[.44,.39]],s),'#bf2b25','paint',.015,'musso-tow-cover');}
      strip(1,[[-.68,.02],[-.57,.13],[.57,.13],[.68,.02]],.065,CHROME,'chrome');plate(1,.30);rearTallLamps('musso_ev');plate(-1,.20);panel(-1,rect(-.93,.01,.93,.27),'#303a40','rubber');
      panel(-1,rect(-.80,.27,.80,.48),'#253138','plastic',.007,'musso-tailgate-lower-insert');
      panel(-1,[[-.16,.91],[.16,.91],[.12,.855],[-.12,.855]],'#263238','plastic',.018,'musso-tailgate-handle');
      for(const s of[-1,1]){panel(-1,mirror([[.42,.045],[.68,.045],[.68,.23],[.61,.275],[.48,.275],[.43,.23]],s),'#a8b0b2','chrome',.025,'musso-rear-skid-corner');for(const v of[.11,.15,.19])strip(-1,mirror([[.47,v],[.62,v]],s),.014,'#4c5b61','plastic',.029,'musso-rear-skid-rib');panel(-1,mirror(rect(.49,.045,.64,.078),s),RED,'light',.031,'musso-reflector');}
      strip(-1,[[-.43,.08],[.43,.08]],.035,'#a8b0b2','chrome',.024,'musso-rear-skid');
    }else if(id==='porter2'){
      for(const s of[-1,1]){const p=mirror([[.70,.58],[.93,.57],[.93,.91],[.80,.99],[.70,.92]],s);lens(1,p);for(const v of[.65,.78,.90])projector(1,s*.82,v,.14,.095);lens(1,mirror(rect(.67,.20,.86,.43),s));projector(1,s*.76,.31,.12,.12);}
      recess(1,rect(-.56,.04,.56,.34),{lip:.020});strip(1,[[-.94,.57],[-.55,.54],[.55,.54],[.94,.57]],.028,CHROME,'chrome');plate(1,.40,.40);
      for(const s of[-1,1]){panel(-1,mirror(rect(.58,.08,.92,.27),s),'#6a171b','glass',.008,'porter-tail-housing');panel(-1,mirror(rect(.62,.12,.76,.24),s),RED,'light',.012);panel(-1,mirror(rect(.78,.12,.88,.24),s),'#c4aa69','light',.013);}plate(-1,.12,.38);
    }
    function hoodBar(x,t,width,col){
      if(!surfacePoint)return;for(let j=0;j<48;j++){const a=-t+j/48*t*2,b=-t+(j+1)/48*t*2,p0=surfacePoint(x-width/L/2,a),p1=surfacePoint(x-width/L/2,b),p2=surfacePoint(x+width/L/2,b),p3=surfacePoint(x+width/L/2,a);for(const p of[p0,p1,p2,p3])p.z+=.007;emit([p0,p1,p2,p3],col,'light','upper-light-bar');}
    }
    function highPoint(end,u,z,offset=.008){
      const endZ=roofZ(end*.5,u*roofWidth(end*.5));if(z<=endZ)return point(end,u,(z-sill)/(endZ-sill),offset);
      // In a tall hatch/van the upper tail is ahead of the bumper cap. Find the
      // photographed back surface rather than projecting vertical lights into air.
      let outer=.5,inner=.34;for(let j=0;j<28;j++){const t=(outer+inner)/2,x=end*t,y=u*roofWidth(x);if(roofZ(x,y)>z)inner=t;else outer=t;}const best=end*(outer+inner)/2;
      if(surfacePoint){const p=surfacePoint(best,u);p.x+=end*offset;p.z=z;return p;}
      return P(best*L+end*offset,u*roofWidth(best),z);
    }
    function highPanel(end,poly,col,material='light',offset=.010){
      const draw=(a,b,c,depth)=>{if(!depth){emit([a,b,c].map(([u,z])=>highPoint(end,u,z*H,offset)),col,material,'upper-tail-lens');return;}const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];draw(a,ab,ca,depth-1);draw(ab,b,bc,depth-1);draw(ca,bc,c,depth-1);draw(ab,bc,ca,depth-1);};
      for(const t of triangulate(poly)){const span=Math.max(Math.max(...t.map(p=>p[0]))-Math.min(...t.map(p=>p[0])),Math.max(...t.map(p=>p[1]))-Math.min(...t.map(p=>p[1])));draw(...t,span>.75?4:span>.30?3:span>.10?2:0);}
    }
    function highStrip(end,path,width,col=RED){for(let i=0;i<path.length-1;i++){const a=path[i],b=path[i+1],du=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(du,dz)||1,ou=-dz/len*width/2,ov=du/len*width/2;highPanel(end,[[a[0]+ou,a[1]+ov],[b[0]+ou,b[1]+ov],[b[0]-ou,b[1]-ov],[a[0]-ou,a[1]-ov]],col,'light',.022);}}
    function rearTallLamps(style){
      const defs={ray:{lo:.46,hi:.65,u:.87,w:.10},morning:{lo:.43,hi:.72,u:.87,w:.10},torres:{lo:.43,hi:.68,u:.85,w:.11},carnival:{lo:.48,hi:.72,u:.88,w:.09},staria:{lo:.43,hi:.82,u:.88,w:.065},musso_ev:{lo:.41,hi:.64,u:.86,w:.10}};
      const d=defs[style];for(const s of[-1,1]){
        const p=mirror([[d.u-d.w,d.lo],[d.u+d.w,d.lo+.02],[d.u+d.w,d.hi-.01],[d.u-d.w,d.hi]],s);highPanel(-1,p,'#25282b','glass',.012);
        if(style==='staria'){for(let y=0;y<3;y++)for(let z=0;z<18;z++){const u=s*(d.u-d.w*.70+y*d.w*.60),h=d.lo+.04+z*(d.hi-d.lo-.05)/18;highPanel(-1,rect(u-.010,h,u+.010,h+.009),RED,'light',.015);}}
        else if(style==='ray'){highStrip(-1,mirror([[d.u-.04,d.lo+.025],[d.u+.04,d.lo+.03],[d.u+.05,d.hi-.03],[d.u-.04,d.hi-.025]],s),.017);highStrip(-1,mirror([[d.u-.08,(d.lo+d.hi)/2],[d.u+.08,(d.lo+d.hi)/2]],s),.014,'#c9d3d4');}
        else if(style==='musso_ev'){highStrip(-1,mirror([[d.u-.05,d.hi-.02],[d.u,d.hi-.05],[d.u+.05,d.hi-.02]],s),.022);highStrip(-1,mirror([[d.u,d.hi-.05],[d.u,d.lo+.05]],s),.033);highStrip(-1,mirror([[d.u-.05,d.lo+.02],[d.u,d.lo+.05],[d.u+.05,d.lo+.02]],s),.022);}
        else{highStrip(-1,mirror([[d.u-.055,d.lo+.025],[d.u+.04,d.lo+.06],[d.u+.04,d.hi-.03],[d.u-.10,d.hi-.025]],s),.020);for(let j=0;j<3;j++)highStrip(-1,mirror([[d.u-.02+j*.035,d.lo+.06],[d.u-.02+j*.035,d.lo+.12]],s),.009);}
      }
      if(['morning','carnival'].includes(style))highStrip(-1,[[-.89,d.hi-.025],[.89,d.hi-.025]],.013);
      if(style==='torres'){
        // The pressed spare-wheel motif and offset handle are characteristic.
        highPanel(-1,[[-.50,.40],[.39,.40],[.50,.48],[.49,.65],[.35,.72],[-.36,.72],[-.50,.65]],paint,'paint',.025);
        highPanel(-1,rect(.34,.52,.59,.56),'#79858b','chrome',.04);
      }
    }
    // Thin chrome marque emblems are geometry, allowing file:// and offline use.
    if(surfacePoint){const badgeX=id==='staria'?.420:id==='porter2'?.491:.463,cy=0,z=top(badgeX);if(id==='g80'){
      const a=surfacePoint(badgeX,0),wing=.15;emit([P(a.x-.018,-wing,a.z+.01),P(a.x+.015,-.035,a.z+.014),P(a.x+.015,.035,a.z+.014),P(a.x-.018,wing,a.z+.01),P(a.x-.045,0,a.z+.018)],CHROME,'chrome','genesis-wing-emblem');
    }else if(['k5','ray','morning','carnival'].includes(id)){
      const p=surfacePoint(badgeX,0);for(const seg of[[[-.075,-.012],[-.075,.012]],[[-.075,0],[-.035,.012]],[[-.075,0],[-.035,-.012]],[[-.025,-.012],[.025,.012]],[[.025,.012],[.025,-.012]],[[.035,-.012],[.075,.012]],[[.075,.012],[.075,-.012]]]){const[a,b]=seg;emit([P(p.x+a[1]-.002,a[0],p.z+.01),P(p.x+b[1]-.002,b[0],p.z+.01),P(p.x+b[1]+.002,b[0],p.z+.01),P(p.x+a[1]+.002,a[0],p.z+.01)],CHROME,'chrome','kia-emblem');}
    }else if(!['torres','musso_ev'].includes(id)){
      const p=surfacePoint(badgeX,0);for(let j=0;j<32;j++){const a=j*Math.PI/16,b=(j+1)*Math.PI/16;emit([P(p.x+Math.cos(a)*.028,Math.sin(a)*.057,p.z+.009),P(p.x+Math.cos(b)*.028,Math.sin(b)*.057,p.z+.009),P(p.x+Math.cos(b)*.023,Math.sin(b)*.051,p.z+.009),P(p.x+Math.cos(a)*.023,Math.sin(a)*.051,p.z+.009)],CHROME,'chrome','hyundai-emblem');}
      emit([P(p.x-.016,-.029,p.z+.01),P(p.x+.013,.035,p.z+.01),P(p.x+.018,.03,p.z+.01),P(p.x-.010,-.035,p.z+.01)],CHROME,'chrome','hyundai-emblem');
    }}
    // Close the bumper around genuine openings. Every aperture boundary is a
    // grid edge, preventing paint triangles from covering recessed grilles.
    for(const end of[-1,1]){
      const rows=new Set([0,1,...Array.from({length:25},(_,j)=>j/24)]);for(const hole of holes[end])for(const[,v]of hole)if(v>0&&v<1)rows.add(v);
      const vs=[...rows].sort((a,b)=>a-b);
      const crossings=(poly,v)=>{const out=[];for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];if((a[1]<=v&&b[1]>v)||(b[1]<=v&&a[1]>v))out.push({u:a[0]+(v-a[1])*(b[0]-a[0])/(b[1]-a[1]),a,b});}return out.sort((a,b)=>a.u-b.u);};
      const at=(edge,v)=>typeof edge==='number'?edge:edge.a[0]+(v-edge.a[1])*(edge.b[0]-edge.a[0])/(edge.b[1]-edge.a[1]);
      for(let i=0;i<vs.length-1;i++){const v0=vs[i],v1=vs[i+1],vm=(v0+v1)/2,intervals=[];for(const hole of holes[end]){const cs=crossings(hole,vm);for(let j=0;j<cs.length-1;j+=2)intervals.push([cs[j],cs[j+1]]);}intervals.sort((a,b)=>a[0].u-b[0].u);
        const merged=[];for(const pair of intervals){const last=merged[merged.length-1];if(last&&pair[0].u<=last[1].u){if(pair[1].u>last[1].u)last[1]=pair[1];}else merged.push(pair);}
        const spans=[];let left=-1;for(const[r,l]of merged){spans.push([left,r]);left=l;}spans.push([left,1]);
        for(const[a,b]of spans){const a0=clamp(at(a,v0),-1,1),a1=clamp(at(a,v1),-1,1),b0=clamp(at(b,v0),-1,1),b1=clamp(at(b,v1),-1,1),n=Math.max(1,Math.ceil(Math.max(b0-a0,b1-a1)/.10));for(let j=0;j<n;j++){const t0=j/n,t1=(j+1)/n;emit([point(end,a0+(b0-a0)*t0,v0),point(end,a0+(b0-a0)*t1,v0),point(end,a1+(b1-a1)*t1,v1),point(end,a1+(b1-a1)*t0,v1)],paint,'paint','bumper-skin');}}
      }
    }
  }
  root.VehicleDetails=Object.freeze({append});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.VehicleDetails;
})(typeof window!=='undefined'?window:globalThis);
