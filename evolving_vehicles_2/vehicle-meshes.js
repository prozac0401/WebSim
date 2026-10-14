/* Reference-built vehicle meshes. Axis: x forward, y right, z up, metres.
 * Silhouettes and glazing outlines were traced by hand from the manufacturer
 * photographs already distributed in evolving_vehicles/assets/vehicles/.
 * Width, height, length and wheelbase follow the selected factory specification.
 * These authored models are not manufacturer CAD, scans or photogrammetry.
 */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const P = (x, y, z) => ({ x, y, z });
  // Profile entries: longitudinal fraction, roof/bonnet height fraction, top width
  // as a proportion of half body width. Rear is negative, nose is positive.
  // Glazing entries are actual side-window outlines in the same x / z fractions.
  const MODELS = {
    g80: { width: 1.925, type: 'sedan', belt: .665, shift: .026, wind: [.115,.225], rearGlass: [-.342,-.196], roof: [-.19,.11], grille: 'crest', lamps: 'two-line',
      profile: [[-.5,.61,.83],[-.47,.68,.91],[-.40,.705,.91],[-.34,.765,.81],[-.27,.875,.76],[-.18,.965,.73],[-.08,.992,.73],[.02,.99,.72],[.105,.962,.73],[.16,.865,.77],[.225,.73,.86],[.31,.72,.91],[.42,.69,.9],[.485,.64,.85],[.5,.605,.79]],
      glass: [[[-.326,.726],[-.276,.816],[-.209,.889],[-.251,.737]],[[-.241,.726],[-.195,.937],[-.066,.963],[-.047,.726]],[[-.028,.726],[-.046,.963],[.081,.94],[.197,.731]]],
      details: 'Long rearward cabin, parabolic fastback roof, long hood, Genesis crest grille and two-line lamps.' },
    k5: { width: 1.86, type: 'sedan', belt: .655, shift: .02, wind: [.10,.225], rearGlass: [-.36,-.205], roof: [-.20,.095], grille: 'tiger', lamps: 'star',
      profile: [[-.5,.63,.83],[-.475,.7,.92],[-.39,.72,.91],[-.31,.83,.79],[-.215,.95,.73],[-.10,.995,.72],[.015,.997,.72],[.10,.946,.74],[.225,.727,.86],[.34,.7,.91],[.44,.64,.89],[.5,.555,.8]],
      glass: [[[-.30,.75],[-.245,.84],[-.198,.906],[-.225,.75]],[[-.219,.744],[-.182,.932],[-.052,.964],[-.034,.737]],[[-.016,.733],[-.025,.96],[.072,.929],[.191,.737]]], details: 'Low fastback roof, long rear quarter glass, sharp tiger-nose fascia and star-map lights.' },
    avante: { width: 1.825, type: 'sedan', belt: .665, shift: .015, wind: [.09,.215], rearGlass: [-.35,-.18], roof: [-.18,.085], grille: 'wide', lamps: 'angular', angular: true,
      profile: [[-.5,.66,.85],[-.47,.73,.91],[-.39,.755,.89],[-.28,.89,.75],[-.18,.975,.72],[-.055,1,.73],[.06,.978,.74],[.11,.923,.76],[.215,.73,.87],[.34,.703,.92],[.45,.62,.87],[.5,.55,.8]],
      glass: [[[-.36,.77],[-.261,.888],[-.223,.907],[-.268,.776]],[[-.244,.758],[-.191,.941],[-.055,.968],[-.04,.748]],[[-.021,.748],[-.035,.967],[.06,.938],[.185,.746]]], details: '2027 reference silhouette, angular low sedan, triangular rear quarter glass and vertical rear lamps.' },
    grandeur: { width: 1.88, type: 'sedan', belt: .665, shift: .006, wind: [.09,.22], rearGlass: [-.36,-.19], roof: [-.18,.085], grille: 'wide', lamps: 'bar',
      profile: [[-.5,.63,.86],[-.48,.707,.92],[-.40,.727,.91],[-.32,.81,.81],[-.23,.925,.75],[-.15,.978,.73],[-.025,.997,.73],[.08,.974,.74],[.145,.875,.78],[.22,.742,.88],[.34,.715,.93],[.45,.647,.9],[.5,.56,.83]],
      glass: [[[-.348,.746],[-.263,.861],[-.225,.9],[-.265,.749]],[[-.241,.739],[-.192,.931],[-.055,.962],[-.035,.736]],[[-.016,.736],[-.034,.963],[.067,.939],[.196,.742]]], details: 'Long formal sedan, separate opera quarter glass, continuous thin front and rear light bars.' },
    ioniq5: { width: 1.89, type: 'hatch', belt: .655, shift: .026, wind: [.10,.244], rearGlass: [-.46,-.325], roof: [-.32,.10], grille: 'pixel', lamps: 'pixel', angular: true,
      profile: [[-.5,.58,.88],[-.48,.73,.95],[-.438,.79,.91],[-.34,.965,.8],[-.29,.993,.8],[-.075,1,.8],[.10,.97,.8],[.244,.734,.9],[.35,.7,.94],[.47,.61,.9],[.5,.55,.86]],
      glass: [[[-.325,.75],[-.274,.948],[-.063,.959],[-.059,.73]],[[-.038,.728],[-.041,.959],[.091,.937],[.213,.72]]], details: 'Long wheelbase, short overhangs, angular clamshell hood, thick C-pillar and pixel light masks.' },
    santafe: { width: 1.90, type: 'suv', belt: .645, shift: .025, wind: [.08,.25], rearGlass: [-.47,-.435], roof: [-.435,.08], grille: 'wide', lamps: 'h', angular: true, rails: true,
      profile: [[-.5,.64,.91],[-.485,.87,.94],[-.455,.967,.88],[-.425,.994,.85],[-.12,1,.85],[.075,.982,.85],[.25,.718,.92],[.36,.704,.95],[.46,.656,.94],[.5,.59,.9]],
      glass: [[[-.465,.71],[-.434,.936],[-.33,.95],[-.335,.704]],[[-.316,.703],[-.311,.95],[-.238,.95],[-.235,.699]],[[-.213,.698],[-.214,.95],[-.045,.95],[-.025,.69]],[[-.006,.69],[-.027,.95],[.063,.946],[.213,.695]]], details: 'Upright square tail, long level roof, segmented glazing, squared wheel arches and H lamps.' },
    ray: { width: 1.595, type: 'box', belt: .60, shift: .018, wind: [.135,.318], rearGlass: [-.495,-.446], roof: [-.44,.135], grille: 'small', lamps: 'vertical',
      profile: [[-.5,.65,.83],[-.49,.70,.93],[-.46,.925,.94],[-.425,.985,.88],[-.3,1,.87],[.07,.995,.87],[.15,.965,.86],[.315,.635,.93],[.42,.615,.94],[.485,.607,.88],[.5,.60,.8]],
      glass: [[[-.36,.675],[-.365,.934],[-.305,.94],[-.30,.65]],[[-.28,.65],[-.285,.944],[-.108,.944],[-.102,.642]],[[-.077,.642],[-.083,.942],[.116,.934],[.284,.645]]], details: 'Tall Kei MPV with vertical tail, short stepped hood and large separate sliding-door windows.' },
    morning: { width: 1.595, type: 'hatch', belt: .63, shift: .028, wind: [.065,.292], rearGlass: [-.47,-.315], roof: [-.30,.065], grille: 'tiger', lamps: 'vertical',
      profile: [[-.5,.58,.84],[-.49,.7,.92],[-.43,.82,.88],[-.335,.95,.81],[-.25,.99,.79],[-.08,1,.79],[.065,.975,.79],[.16,.857,.83],[.29,.68,.9],[.41,.635,.92],[.49,.61,.86],[.5,.60,.8]],
      glass: [[[-.345,.724],[-.271,.927],[-.086,.95],[-.074,.686]],[[-.049,.683],[-.061,.952],[.062,.93],[.251,.667]]], details: 'Compact hatchback, high rear roof, steep rear window, rising rear side glass and vertical lamps.' },
    torres: { width: 1.89, type: 'suv', belt: .635, shift: .025, wind: [.075,.244], rearGlass: [-.482,-.365], roof: [-.365,.075], grille: 'slots', lamps: 'thin', angular: true, rails: false,
      profile: [[-.5,.59,.91],[-.486,.72,.93],[-.463,.80,.92],[-.421,.895,.89],[-.365,.961,.85],[-.25,.976,.84],[-.10,.976,.84],[.02,.966,.835],[.075,.944,.83],[.14,.847,.86],[.244,.702,.92],[.32,.690,.97],[.42,.675,.97],[.48,.655,.94],[.5,.645,.90]],
      glass: [[[-.461,.718],[-.389,.909],[-.315,.915],[-.356,.706]],[[-.238,.693],[-.213,.917],[-.052,.923],[-.041,.686]],[[-.020,.683],[-.030,.923],[.064,.907],[.219,.679]]], details: 'Torres J100 petrol: upright cabin with a wide black C-pillar, separate rear quarter glass, clamshell hood tie-downs, pronounced squared fender cladding, offset spare-wheel tailgate embossing.' },
    carnival: { width: 1.995, type: 'van', belt: .642, shift: .015, wind: [.08,.275], rearGlass: [-.49,-.427], roof: [-.425,.08], grille: 'wide', lamps: 'vertical', rails: true,
      profile: [[-.5,.62,.88],[-.487,.75,.95],[-.452,.96,.9],[-.41,.991,.86],[-.15,1,.85],[.065,.981,.84],[.275,.71,.91],[.39,.678,.95],[.475,.65,.91],[.5,.64,.85]],
      glass: [[[-.46,.704],[-.416,.941],[-.23,.951],[-.267,.701]],[[-.229,.699],[-.204,.952],[-.028,.95],[-.024,.694]],[[-.003,.693],[-.007,.949],[.06,.94],[.242,.706]]], details: 'Long MPV with broad metallic C-pillar, long sliding-door glass and vertical star-map lamps.' },
    staria: { width: 1.995, type: 'van', belt: .59, shift: .036, wind: [.10,.405], rearGlass: [-.492,-.465], roof: [-.44,.10], grille: 'wide', lamps: 'bar',
      profile: [[-.5,.36,.86],[-.493,.64,.94],[-.471,.94,.94],[-.43,.987,.89],[-.15,1,.88],[.075,.982,.87],[.18,.89,.87],[.285,.76,.9],[.39,.65,.91],[.46,.53,.9],[.5,.36,.8]],
      glass: [[[-.458,.609],[-.441,.936],[-.246,.954],[-.246,.604]],[[-.226,.604],[-.226,.955],[.001,.943],[.001,.604]],[[.023,.606],[.022,.941],[.10,.925],[.33,.671],[.255,.61]]], details: 'Continuous one-box curved nose, very large low-belt glazing, full-width front light bar.' },
    musso_ev: { width: 1.92, type: 'pickup', belt: .635, shift: .026, wind: [.105,.267], rearGlass: [-.209,-.192], roof: [-.185,.105], grille: 'closed', lamps: 'thin', rails: false, angular: true,
      profile: [[-.5,.651,.93],[-.477,.670,.975],[-.222,.674,.975],[-.206,.689,.94],[-.198,.916,.86],[-.184,.965,.84],[-.135,.981,.835],[.02,.979,.835],[.105,.954,.83],[.17,.850,.87],[.267,.692,.935],[.36,.683,.98],[.45,.667,.96],[.49,.65,.94],[.5,.641,.91]],
      glass: [[[-.152,.740],[-.158,.924],[-.031,.929],[-.022,.687],[-.120,.697]],[[.001,.685],[-.008,.929],[.092,.912],[.235,.677]]], details: 'Musso EV O100 electric pickup: long double cab, squared muscular arches with metallic tabs, sidewall shoulder creases, full-height metallic sports-bar fins, ribbed open load bed and horizontal pixel DRL strip.' },
    porter2: { width: 1.74, type: 'truck', belt: .59, shift: .003395, wind: [.341,.453], rearGlass: [.0815,.088], roof: [.115,.31], grille: 'small', lamps: 'vertical',
      profile: [[-.5,.576,.96],[-.46,.576,.98],[.070,.576,.98],[.0824,.919,.914],[.089,.970,.908],[.115,.994,.891],[.248,.997,.891],[.310,.982,.891],[.341,.949,.897],[.378,.858,.914],[.419,.741,.937],[.454,.650,.943],[.471,.604,.943],[.487,.571,.908],[.5,.558,.828]],
      glass: [[[.097,.690],[.097,.909],[.111,.944],[.138,.949],[.147,.909],[.147,.726],[.128,.680]],[[.169,.640],[.167,.949],[.297,.944],[.328,.914],[.435,.650],[.378,.635]]], details: 'Porter II super cab: official 1240/2640/1275 mm front overhang/wheelbase/rear overhang, 2860×1630×355 mm drop-side bed, smaller dual rear tyres, steep cab-over windscreen and vertically stacked clear headlamps.' }
  };
  function tint(hex, amount) {
    let c=String(hex||'#98a9af').replace('#','');if(c.length===3)c=c.split('').map(v=>v+v).join('');
    if(!/^[\da-f]{6}$/i.test(c))c='98a9af';const n=parseInt(c,16),a=Math.abs(amount),t=amount>0?255:0;
    return '#'+[n>>16,(n>>8)&255,n&255].map(v=>Math.round(v+(t-v)*a).toString(16).padStart(2,'0')).join('');
  }
  function interp(points,x,column=1,smooth=true){
    if(x<=points[0][0])return points[0][column];if(x>=points.at(-1)[0])return points.at(-1)[column];
    let i=0;while(points[i+1][0]<x)i++;const a=points[i],b=points[i+1],t=(x-a[0])/(b[0]-a[0]);
    if(!smooth)return a[column]+(b[column]-a[column])*t;
    const p=points[Math.max(0,i-1)],q=points[Math.min(points.length-1,i+2)];
    const m0=(b[column]-p[column])/(b[0]-p[0]),m1=(q[column]-a[column])/(q[0]-a[0]);
    const v=(2*t*t*t-3*t*t+1)*a[column]+(t*t*t-2*t*t+t)*(b[0]-a[0])*m0+(-2*t*t*t+3*t*t)*b[column]+(t*t*t-t*t)*(b[0]-a[0])*m1;
    return clamp(v,Math.min(a[column],b[column]),Math.max(a[column],b[column]));
  }
  function create(id,spec={},color='#9aaeb9'){
    const m=MODELS[id]||MODELS.g80,L=(spec.lengthMm||4800)/1000,W=(spec.widthMm||m.width*1000)/1000,H=(spec.heightMm||1500)/1000,WB=(spec.wheelbaseMm||L*610)/1000;
    const paint=color,glass='#1b2a32',rubber='#171c20',trim='#283035',silver='#b9c3c9',faces=[];
    const R=(spec.frontTireRadiusMm||335)/1000,Rr=(spec.rearTireRadiusMm||R*1000)/1000;
    const frontAxle=WB/2+m.shift*L,rearAxle=frontAxle-WB;
    const sill=m.type==='truck'?.29:Math.max(.19,R*.64),angular=!!m.angular;
    let currentPart='body';
    function face(vertices,fill,stroke,width=.4,material){
      if(!material){
        material=currentPart==='wheels'?(['#171c20','#151a1e','#252b30','#242d33'].includes(fill)?'rubber':'chrome'):
          [glass,'#18262e'].includes(fill)?'glass':fill===silver||fill==='#d7dfe3'?'chrome':
          ['#e5f5fc','#ba2b32','#bbd2dd'].includes(fill)?'light':
          ['#283035','#343b40','#192329','#20292e','#1b252b','#1d252a'].includes(fill)?'rubber':'paint';
      }
      if(currentPart==='body'&&vertices.length>=3){
        const a=vertices[0],b=vertices[1],c=vertices[2],u={x:b.x-a.x,y:b.y-a.y,z:b.z-a.z},v={x:c.x-a.x,y:c.y-a.y,z:c.z-a.z};
        const n=P(u.y*v.z-u.z*v.y,u.z*v.x-u.x*v.z,u.x*v.y-u.y*v.x),center=vertices.reduce((p,q)=>P(p.x+q.x/vertices.length,p.y+q.y/vertices.length,p.z+q.z/vertices.length),P(0,0,0));
        if(n.x*center.x/(L*L)+n.y*center.y/(W*W)+n.z*(center.z-H*.36)/(H*H)<0)vertices=[...vertices].reverse();
      }
      faces.push({vertices,fill,stroke,width,material,part:currentPart});
    }
    function quad(a,b,c,d,fill,stroke,width,material){face([a,b,c,d],fill,stroke,width,material);}
    function line(vertices,stroke,width=.55,material='chrome'){
      // Give trim physical thickness as well as a Canvas fallback stroke. The GPU
      // depth renderer must see window surrounds, shut lines and grille mesh.
      face(vertices,null,stroke,width,material);
      for(let i=0;i<vertices.length-1;i++){
        const a=vertices[i],b=vertices[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z,span=Math.hypot(dx,dy,dz);if(span<1e-6)continue;
        const half=.0028*Math.max(.6,width),perp=Math.abs(dx)<Math.abs(dy)*.15?P(0,-dz,dy):P(-dz,0,dx),len=Math.hypot(perp.x,perp.y,perp.z)||1;
        const v=(p,sign)=>P(p.x+sign*perp.x/len*half,p.y+sign*perp.y/len*half,p.z+sign*perp.z/len*half);
        face([v(a,-1),v(b,-1),v(b,1),v(a,1)],stroke,null,width,stroke==='#e5f5fc'?'light':material);
      }
    }
    function top(x){return interp(m.profile,x,1,!angular)*H;}
    const sedan=m.type==='sedan',roundEnds=!angular&&m.type!=='truck',endBend=roundEnds?W*.085:W*.045;
    // The plan view is not an extruded side silhouette: the ends pinch in, the
    // wheel shoulders are broad, and the cabin side narrows toward the roof.
    const widthProfile=m.type==='truck'?[[-.5,.94],[-.42,.99],[.06,.99],[.10,.94],[.32,.98],[.46,.95],[.5,.87]]:
      angular?[[-.5,.93],[-.46,.975],[-.34,1],[-.16,.984],[.10,.984],[.31,1],[.44,.98],[.5,.93]]:
      [[-.5,.89],[-.475,.95],[-.40,.985],[-.29,1],[-.13,.973],[.08,.968],[.29,1],[.38,.992],[.46,.97],[.5,.91]];
    function bodyWidth(x){return W*.5*interp(widthProfile,x);}
    function shoulder(x){
      const rearLift=sedan?.018*Math.exp(-Math.pow((x+.29)/.18,2)):0;
      return Math.min(top(x)-.076,H*(m.belt+.035+rearLift-.015*Math.max(0,x-.1)));
    }
    function roofWidth(x){
      const cabin=clamp((top(x)-shoulder(x)-.075)/(H*.16),0,1),outer=bodyWidth(x)*.97;
      return outer*(1-cabin)+Math.min(outer,W*.5*interp(m.profile,x,2,!angular))*cabin;
    }
    // Convex roof/bonnet sections have a continuous crown and rolled outside
    // edges; the old flat centre with vertical slab sides lost this volume.
    function roofDrop(x,t){
      const cabin=clamp((top(x)-shoulder(x))/(H*.21),0,1),u=Math.abs(t);
      return (.012+.006*cabin)*u*u+(.035+.013*cabin)*Math.pow(u,4);
    }
    function roofZ(x,y){const t=y/Math.max(.001,roofWidth(x));return top(x)-roofDrop(x,t);}
    function roundedX(x,u,z){
      const fade=Math.pow(clamp((Math.abs(x)-.405)/.095,0,1),2);
      const v=clamp((z-sill)/Math.max(.01,top(x)-sill),0,1);
      // Bumper is full at knee height and tucks beneath the body.
      const upperSetback=!sedan&&x>0?.055*Math.pow(clamp((v-.65)/.35,0,1),2):0;
      const belly=.018*Math.sin(v*Math.PI)-.024*Math.pow(1-v,3)-upperSetback;
      return x*L-Math.sign(x)*fade*(endBend*Math.pow(Math.abs(u),2.4)-belly);
    }
    function section(f){
      return interp(angular?[[0,.87],[.12,.94],[.24,.955],[.44,.970],[.68,1],[.88,1],[1,.968]]:
        [[0,.84],[.08,.91],[.20,.969],[.37,.945],[.57,.968],[.76,1],[.88,.989],[1,.950]],clamp(f,0,1));
    }
    function bodySide(x,z,side,offset=0){
      const f=clamp((z-sill)/Math.max(.01,shoulder(x)-sill),0,1);
      const nearWheel=Math.max(Math.exp(-Math.pow((x*L-frontAxle)/.48,2)),Math.exp(-Math.pow((x*L-rearAxle)/.48,2)));
      const flare=(angular?.013:.027)*nearWheel*Math.sin(Math.PI*f);
      const y=bodyWidth(x)*section(f)+flare;
      return P(roundedX(x,y/bodyWidth(x),z),side*(y+offset),z);
    }
    const squareArch=['santafe','torres','musso_ev'].includes(id);
    function archRise(dx,rr){return squareArch?rr*interp([[0,.99],[.64,.99],[.88,.70],[1,0]],Math.abs(dx)/rr,1,false):Math.sqrt(Math.max(0,rr*rr-dx*dx));}
    function arch(x){let z=sill;for(const [cx,r]of[[frontAxle,R],[rearAxle,Rr]]){const dx=x-cx,rr=r*1.085;if(Math.abs(dx)<rr)z=Math.max(z,r+archRise(dx,rr));}return z;}
    function sideY(x,z){
      const s=shoulder(x),rz=roofZ(x,roofWidth(x)),t=clamp((z-s)/Math.max(.001,rz-s),0,1);
      const a=bodyWidth(x)*section(1),b=roofWidth(x);
      return a+(b-a)*t+.018*Math.sin(Math.PI*t);
    }
    function sidePoint(x,z,side,offset=.007){const y=sideY(x,z*H);return P(roundedX(x,y/bodyWidth(x),z*H),side*(y+offset),z*H);}
    function surfacePoint(x,t){const y=roofWidth(x)*t,z=roofZ(x,y);return P(roundedX(x,y/bodyWidth(x),z),y,z);}
    // Front/rear accessories use this shared curved surface, so lenses/grilles
    // remain on the body rather than hovering on an unrelated vertical plane.
    function endSurface(end,u,v,offset=0){
      const x=end*.5,z0=sill,z1=roofZ(x,roofWidth(x)*u),z=z0+(z1-z0)*v;
      const sy=bodyWidth(x)*section(clamp((z-sill)/Math.max(.01,shoulder(x)-sill),0,1));
      const roofBlend=clamp((z-shoulder(x))/Math.max(.001,z1-shoulder(x)),0,1);
      const y=u*(sy+(roofWidth(x)-sy)*roofBlend);
      return P(roundedX(x,y/bodyWidth(x),z)+end*offset,y,z);
    }
    function box(x0,x1,y0,y1,z0,z1,fill){
      const a=P(x0,y0,z0),b=P(x1,y0,z0),c=P(x1,y1,z0),d=P(x0,y1,z0),A=P(x0,y0,z1),B=P(x1,y0,z1),C=P(x1,y1,z1),D=P(x0,y1,z1);
      quad(a,b,B,A,tint(fill,-.12));quad(b,c,C,B,fill);quad(c,d,D,C,tint(fill,-.20));quad(d,a,A,D,tint(fill,-.10));quad(A,B,C,D,tint(fill,.10));
    }
    function ellipsoid(cx,cy,cz,rx,ry,rz,fill,material='paint'){
      const u=20,v=8;
      const at=(i,j)=>{const a=TAU*i/u,b=-Math.PI/2+Math.PI*j/v;return P(cx+rx*Math.cos(a)*Math.cos(b),cy+ry*Math.sin(a)*Math.cos(b),cz+rz*Math.sin(b));};
      for(let i=0;i<u;i++)for(let j=0;j<v;j++)quad(at(i,j),at(i+1,j),at(i+1,j+1),at(i,j+1),fill,null,.4,material);
    }
    // Wheel geometry precedes body skin; arches really remove the covering panels.
    currentPart='wheels';
    for(const [cx,r]of[[frontAxle,R],[rearAxle,Rr]])for(const side of[-1,1]){
      const tw=m.type==='truck'&&cx===rearAxle?.28:sedan?.245:m.type==='box'?.175:.235,cy=side*(W*.48-tw*.5),segments=36;
      const rings=[[-tw*.5,.90],[-tw*.47,.96],[-tw*.35,1],[tw*.35,1],[tw*.47,.96],[tw*.5,.90]].map(([dy,scale])=>Array.from({length:segments},(_,j)=>P(cx+Math.cos(TAU*j/segments)*r*scale,cy+dy,r+Math.sin(TAU*j/segments)*r*scale)));
      for(let k=0;k<rings.length-1;k++)for(let j=0;j<segments;j++)quad(rings[k][j],rings[k][(j+1)%segments],rings[k+1][(j+1)%segments],rings[k+1][j],k===1?'#151a1e':'#252b30');
      const out=cy+side*(tw*.5+.003),circle=(rr,y=out)=>Array.from({length:segments},(_,j)=>P(cx+Math.cos(TAU*j/segments)*rr,y,r+Math.sin(TAU*j/segments)*rr));
      face(circle(r*.92),rubber,null,.4,'rubber');face(circle(r*.77),silver);face(circle(r*.73,out+side*.003),'#242d33');face(circle(r*.55,out+side*.005),'#6b747b');
      const spokes={g80:10,k5:5,avante:5,grandeur:20,ioniq5:5,santafe:12,ray:5,morning:5,torres:5,carnival:5,staria:6,musso_ev:5,porter2:6}[id]||5;
      for(let j=0;j<spokes;j++){const a=j*TAU/spokes;const v=(angle,rr)=>P(cx+Math.cos(angle)*r*rr,out+side*.009,r+Math.sin(angle)*r*rr);quad(v(a,.17),v(a+.13,.17),v(a+.15,.75),v(a-.025,.75),j%2?silver:'#d7dfe3');
        if(id==='g80'||id==='k5'||id==='grandeur'||id==='torres')quad(v(a+.13,.40),v(a+.18,.40),v(a+.30,.74),v(a+.23,.74),'#a5afb5');
        if(['ray','morning','carnival','musso_ev'].includes(id))quad(v(a-.02,.42),v(a+.27,.42),v(a+.38,.74),v(a-.05,.74),'#b5bec1');
      }
      face(circle(r*.17,out+side*.015),'#a5afb5');face(circle(r*.075,out+side*.018),'#35424b');
    }
    currentPart='body';
    const stations=new Set([...m.profile.map(p=>p[0]),...m.wind,...m.rearGlass,m.roof[0]+.045,m.roof[1]-.045]);for(let i=0;i<=84;i++)stations.add(-.5+i/84);
    for(const[cx,r]of[[frontAxle,R],[rearAxle,Rr]]){
      for(let j=0;j<=16;j++){const x=(cx+Math.cos(Math.PI*j/16)*r*1.085)/L;if(x>-.5&&x<.5)stations.add(x);}
      if(squareArch)for(const t of[-1,-.88,-.64,0,.64,.88,1])stations.add((cx+t*r*1.085)/L);
    }
    const xs=[...stations].sort((a,b)=>a-b),cross=[-1,-.97,-.92,-.82,-.68,-.50,-.28,0,.28,.50,.68,.82,.92,.97,1];
    for(let i=0;i<xs.length-1;i++){
      const a=xs[i],b=xs[i+1],pickupBed=m.type==='pickup'&&b<-.20,truckBed=m.type==='truck'&&b<.068;
      if(!pickupBed&&!truckBed)for(let j=0;j<cross.length-1;j++){
        const t=(cross[j]+cross[j+1])/2,mid=(a+b)/2;
        let fill=paint;
        const wind=mid>m.wind[0]&&mid<m.wind[1]&&Math.abs(t)<.92;
        const rear=mid>m.rearGlass[0]&&mid<m.rearGlass[1]&&Math.abs(t)<.92;
        const sunroof=['g80','k5','grandeur','ioniq5','santafe'].includes(id)&&mid>m.roof[0]+.045&&mid<m.roof[1]-.045&&Math.abs(t)<.82;
        if(wind||rear||sunroof)fill=glass;
        quad(surfacePoint(a,cross[j]),surfacePoint(b,cross[j]),surfacePoint(b,cross[j+1]),surfacePoint(a,cross[j+1]),fill,null,.4,(wind||rear||sunroof)?'glass':'paint');
      }
      if(!truckBed)for(const side of[-1,1]){
        const lo0=arch(a*L),lo1=arch(b*L),s0=shoulder(a),s1=shoulder(b),rows=[0,.04,.08,.14,.20,.28,.37,.47,.57,.67,.76,.83,.88,.94,1];
        for(let k=0;k<rows.length-1;k++){
          // Clip the common body section against each wheel opening. Bending
          // every row around the arch produced pinched, toy-like wheel fenders.
          const zA0=Math.max(lo0,sill+(s0-sill)*rows[k]),zA1=Math.max(lo0,sill+(s0-sill)*rows[k+1]);
          const zB0=Math.max(lo1,sill+(s1-sill)*rows[k]),zB1=Math.max(lo1,sill+(s1-sill)*rows[k+1]);
          if(zA1<=zA0+.00001&&zB1<=zB0+.00001)continue;
          const lowerCladding=(angular||id==='carnival')&&rows[k+1]<=(id==='musso_ev'?.28:.20);
          quad(bodySide(a,zA0,side),bodySide(b,zB0,side),bodySide(b,zB1,side),bodySide(a,zA1,side),lowerCladding?'#283035':paint);
        }
        // Several bowed sections make the windshield posts, shoulders and
        // hood cheeks continuous with the roof instead of a giant planar wall.
        if(!pickupBed&&!truckBed){
          const rows=[0,.12,.30,.55,.78,.93,1];
          const v=(x,t)=>{const z=shoulder(x)+(roofZ(x,roofWidth(x))-shoulder(x))*t;return sidePoint(x,z/H,side,0);};
          for(let j=0;j<rows.length-1;j++)quad(v(a,rows[j]),v(b,rows[j]),v(b,rows[j+1]),v(a,rows[j+1]),paint);
        }
      }
    }
    // The detail module builds real recessed apertures and closes both ends.
    // A matching curved cap is retained when the optional module is absent.
    if(!root.VehicleDetails)for(const end of[-1,1]){
      const ys=[-1,-.9,-.75,-.55,-.3,0,.3,.55,.75,.9,1],vs=[0,.08,.2,.38,.6,.8,1];
      for(let j=0;j<ys.length-1;j++)for(let k=0;k<vs.length-1;k++)quad(endSurface(end,ys[j],vs[k]),endSurface(end,ys[j+1],vs[k]),endSurface(end,ys[j+1],vs[k+1]),endSurface(end,ys[j],vs[k+1]),paint);
    }
    // Side windows use individually traced polygons, with distinct quarter panes.
    currentPart='glazing';
    if(id==='torres')for(const side of[-1,1]){
      const pts=[[-.355,.73],[-.285,.974],[-.20,.976],[-.24,.704]];
      face(pts.map(([x,z])=>sidePoint(x,z,side,.016)),'#1c2428',null,.4,'plastic');
    }
    function roundedOutline(source){
      if(angular)return source;
      const fraction=m.type==='box'?.10:.055,out=[];
      for(let i=0;i<source.length;i++){
        const a=source[(i+source.length-1)%source.length],b=source[i],c=source[(i+1)%source.length];
        const s=[b[0]+(a[0]-b[0])*fraction,b[1]+(a[1]-b[1])*fraction],e=[b[0]+(c[0]-b[0])*fraction,b[1]+(c[1]-b[1])*fraction];
        for(let j=0;j<=3;j++){const t=j/3;out.push([(1-t)*(1-t)*s[0]+2*(1-t)*t*b[0]+t*t*e[0],(1-t)*(1-t)*s[1]+2*(1-t)*t*b[1]+t*t*e[1]]);}
      }return out;
    }
    for(const side of[-1,1])for(const source of m.glass){
      const shape=roundedOutline(source);
      const vertices=shape.map(([x,z])=>sidePoint(x,z,side,.018));
      function glassTriangle(a,b,c,depth){
        if(!depth){face([a,b,c].map(([x,z])=>sidePoint(x,z,side,.018)),'#18262e',null,.4,'glass');return;}
        const ab=[(a[0]+b[0])/2,(a[1]+b[1])/2],bc=[(b[0]+c[0])/2,(b[1]+c[1])/2],ca=[(c[0]+a[0])/2,(c[1]+a[1])/2];
        glassTriangle(a,ab,ca,depth-1);glassTriangle(ab,b,bc,depth-1);glassTriangle(ca,bc,c,depth-1);glassTriangle(ab,bc,ca,depth-1);
      }
      for(let j=1;j<shape.length-1;j++)glassTriangle(shape[0],shape[j],shape[j+1],shape.length>8?1:2);
      line([...vertices,vertices[0]],'#839299',.48);
      // A restrained cool reflection follows the upper edge, not a large white stripe.
      const upper=shape.filter((_,i)=>i>0&&i<shape.length-1).map(([x,z])=>sidePoint(x,z-.009,side,.015));
      if(upper.length>1)line(upper,'#526a76',.6);
    }
    currentPart='wheel-arches';
    for(const[cx,r]of[[frontAxle,R],[rearAxle,Rr]])for(const side of[-1,1]){
      const outer=r*1.085,band=['suv','pickup'].includes(m.type)?.052:id==='ioniq5'?.040:.018;
      const samples=squareArch?[-1,-.88,-.64,0,.64,.88,1]:Array.from({length:21},(_,j)=>Math.cos(Math.PI*j/20));
      for(let j=0;j<samples.length-1;j++){
        const v=(t,rr,off=.011)=>{const x=cx+t*rr,z=r+archRise(t*rr,rr);return bodySide(x/L,z,side,off);};
        quad(v(samples[j],outer),v(samples[j+1],outer),v(samples[j+1],outer+band,.002),v(samples[j],outer+band,.002),m.angular||m.type==='truck'&&cx===rearAxle?'#343b40':paint);
        quad(v(samples[j],outer),v(samples[j+1],outer),v(samples[j+1],outer,-.06),v(samples[j],outer,-.06),'#20262a',null,.4,'rubber');
      }
    }
    currentPart='trim';
    // Separate wiper blades lie just above the lower windshield surface.
    for(const range of[[-.76,-.10],[.04,.71]])line(Array.from({length:12},(_,j)=>{
      const t=range[0]+(range[1]-range[0])*j/11,x=m.wind[1]-.014-.012*Math.sin(Math.PI*j/11),p=surfacePoint(x,t);
      return P(p.x,p.y,p.z+.010);
    }),'#171c20',1.25,'rubber');
    if(m.type!=='truck'){
      const x=m.roof[0]+.04,z=top(x)+.006,a=P(x*L-.065,-.025,z),b=P(x*L+.065,-.025,z),c=P(x*L+.065,.025,z),d=P(x*L-.065,.025,z),fin=P(x*L-.035,0,z+.065);
      face([a,b,fin],paint);face([b,c,fin],paint);face([c,d,fin],paint);face([d,a,fin],paint);
    }
    for(const side of[-1,1]){
      const windows=m.glass,frontBase=m.wind[1]-.02;
      // Door shut lines terminate at the real sill and do not cross wheel openings.
      const seams=m.type==='truck'?[.18]:m.type==='pickup'?[-.20,-.012,.25]:m.type==='box'?[-.32,-.087,.31]:[-.27,-.025,frontBase];
      for(const x of seams){const low=arch(x*L)+.012,z1=Math.min(shoulder(x)-.02,H*m.belt);if(low<z1)line(Array.from({length:13},(_,j)=>bodySide(x-.004*j/12,low+(z1-low)*j/12,side,.007)),tint(paint,-.34),.58);}
      for(const x of(m.type==='truck'?[.145]:[-.20,.03])){const z=shoulder(x)-.075,p=bodySide(x,z,side,.012);ellipsoid(p.x,p.y,p.z,.071,.014,.012,id==='g80'||id==='grandeur'?silver:tint(paint,.10),'chrome');}
      const mx=(m.wind[1]-.06)*L,mz=shoulder(mx/L)+.075,my=side*(bodyWidth(mx/L)+.085);
      // A short angled stalk and oval shell read as a mirror, not a separate cube.
      line([P(mx-.025,side*(bodyWidth(mx/L)-.005),mz-.035),P(mx-.045,my,mz+.020)],'#20272a',3.5);
      ellipsoid(mx-.015,my,mz+.035,.115,.080,.050,paint);
      const lens=[];for(let j=0;j<20;j++){const a=TAU*j/20;lens.push(P(mx-.105, my+Math.cos(a)*.057,mz+.035+Math.sin(a)*.034));}face(lens,'#53636b',null,.4,'glass');
      line([P(mx-.085,my+side*.075,mz+.033),P(mx+.065,my+side*.065,mz+.038)],'#c9d8dd',.6);
      const sill0=Math.max(rearAxle+Rr*1.12,-L*.40),sill1=frontAxle-R*1.12;
      if(sill0<sill1&&m.type!=='truck')line(Array.from({length:17},(_,j)=>bodySide((sill0+(sill1-sill0)*j/16)/L,sill+.035,side,.004)),m.angular?trim:silver,.8);
      if(id==='g80')for(const dz of[0,.078]){const z=H*.495+dz;line(Array.from({length:8},(_,j)=>bodySide((frontAxle-.70+.41*j/7)/L,z+.008*j/7,side,.006)),'#adbfc6',2.0);}
      if(id==='ioniq5'){
        const pts=[[-.18,.30],[.10,.48],[.25,.68]].map(([x,z])=>bodySide(x,z*H,side,.006));line(pts,tint(paint,-.35),.7);
        for(let j=0;j<5;j++)line(Array.from({length:13},(_,k)=>bodySide(-.22+.35*k/12,sill+.05+j*.016,side,.005)),silver,.45);
      }
      if(m.rails){const z=H+.025,y=side*W*.34;line([P(m.roof[0]*L+.11,y,z),P(m.roof[1]*L-.05,y,z)],'#4d585d',2.1);}
    }
    // A low open bed with inner walls distinguishes the pickup and cab-over truck.
    if(m.type==='truck'||m.type==='pickup'){
      currentPart='cargo-bed';const back=-L*.485,front=L*(m.type==='truck'?.06:-.205),floor=m.type==='truck'?H*.36:H*.49,wall=m.type==='truck'?H*.49:H*.67;
      box(back,front,-W*.44,W*.44,floor-.035,floor,trim);
      for(const side of[-1,1]){box(back,front,side*W*.46-.04,side*W*.46+.04,floor,wall,paint);line([P(back,side*W*.46,wall+.006),P(front,side*W*.46,wall+.006)],m.type==='pickup'?trim:silver,1.4);}
      box(back,back+.055,-W*.46,W*.46,floor,wall,paint);
      for(let j=-4;j<=4;j++)line([P(back+.07,j*W*.09,floor+.004),P(front-.04,j*W*.09,floor+.004)],'#5e676c',.55);
      if(m.type==='truck')for(const x of[back+.08,(back+front)/2,front-.08])for(const side of[-1,1])line([P(x,side*W*.485,floor),P(x,side*W*.485,wall)],silver,1.6);
      if(m.type==='truck'){
        // The Porter has an exposed ladder chassis beneath its drop-side bed;
        // carrying a solid painted skirt below the bed made it look like a van.
        for(const side of[-1,1])box(back+.04,front+.10,side*W*.29-.045,side*W*.29+.045,.33,floor-.03,'#23292b');
        for(const x of[back+.13,back*.45,front-.12])box(x-.035,x+.035,-W*.32,W*.32,.37,.43,'#23292b');
        for(const side of[-1,1])box(rearAxle-.30,rearAxle+.24,side*W*.37-.08,side*W*.37+.08,.33,.52,'#242a2d');
        box(back+.07,back+.30,-.23,.23,.28,.37,'#22292c');
        for(const side of[-1,1])line([P(front-.10,side*W*.39,wall),P(front-.10,side*W*.39,H*.99),P(front+.055,side*W*.39,H*1.005)],silver,2.5);
        line([P(front-.10,-W*.39,H*.99),P(front-.10,W*.39,H*.99)],silver,2.5);
      }
    }
    currentPart='fascia';
    if(root.VehicleDetails){
      root.VehicleDetails.append({id,spec,m,L,W,H,WB,R,Rr,frontAxle,rearAxle,sill,faces,paint,glass,rubber,trim,silver,top,bodyWidth,shoulder,roofWidth,roofZ,face,line,quad,box,P,tint,endSurface,surfacePoint,bodySide,sidePoint});
    }else{
    const fx=L*.502,rx=-L*.502,fz=top(.5),rz=top(-.5),frontW=W*.43;
    function panel(x,y0,y1,z0,z1,fill){quad(P(x,y0,z0),P(x,y1,z0),P(x,y1,z1),P(x,y0,z1),fill);}
    if(m.grille==='crest'){
      const corners=[[-.29,.91],[.29,.91],[.25,.42],[0,.23],[-.25,.42]];
      const crest=corners.map(([y,z])=>P(fx+.018+.025*(z-.23)/.68,W*y,sill+(fz-sill)*z));
      face(crest,'#1b252b',silver,1.1);line([...crest,crest[0]],silver,1.1);
      const inside=(y,z)=>{
        let yes=false;for(let i=0,j=corners.length-1;i<corners.length;j=i++){
          const a=corners[i],b=corners[j];if((a[1]>z)!==(b[1]>z)&&y<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;
        }return yes;
      };
      for(let j=-13;j<=13;j++)for(const sign of[-1,1]){
        let start=null,end=null;for(let k=0;k<=140;k++){const z=.23+k/140*.68,y=j*.028+sign*(z-.56)*.50;if(inside(y,z)){const p=P(fx+.021+.025*(z-.23)/.68,W*y,sill+(fz-sill)*z);if(!start)start=p;end=p;}}
        if(start&&end)line([start,end],'#84949c',.55);
      }
      // Low wide intake follows the actual bumper beneath the pointed crest.
      const intake=[[-.39,.055],[-.36,.19],[-.18,.22],[0,.115],[.18,.22],[.36,.19],[.39,.055]];
      for(let j=0;j<intake.length-1;j++){const a=intake[j],b=intake[j+1];quad(P(fx+.018,a[0]*W,sill+.055),P(fx+.018,b[0]*W,sill+.055),P(fx+.020,b[0]*W,sill+b[1]),P(fx+.020,a[0]*W,sill+a[1]),'#20292e');}
    } else if(m.grille==='pixel'||m.grille==='closed')panel(fx+.01,-frontW,frontW,fz-.18,fz-.045,'#1d252a');
    else {panel(fx+.01,-frontW*.83,frontW*.83,sill+.11,Math.max(sill+.19,fz-.13),'#20292e');
      if(m.grille==='slots')for(let j=-3;j<=3;j++)panel(fx+.018,j*.12-.025,j*.12+.025,sill+.16,fz-.14,silver);
      else for(let j=0;j<4;j++)line([P(fx+.018,-frontW*.78,sill+.14+j*.06),P(fx+.018,frontW*.78,sill+.14+j*.06)],'#6d7b82',.55);
    }
    const white='#e5f5fc',red='#ba2b32';
    for(const side of[-1,1]){
      const cy=side*W*.325,z=fz-.045;
      if(m.lamps==='two-line')for(const dz of[0,-.085]){
        panel(fx+.024,cy-.21,cy+.21,z+dz-.018,z+dz+.018,white);
        line([P(.49*L,side*W*.435,z+dz),P(.40*L,side*bodyWidth(.40),z+dz+.025)],white,1.6);
        panel(rx-.015,cy-.22,cy+.22,rz-.07+dz,rz-.04+dz,red);
      } else if(m.lamps==='pixel'){
        for(let j=-1;j<=1;j++)panel(fx+.025,cy+j*.105-.042,cy+j*.105+.042,z-.085,z-.005,white);
        for(let j=-1;j<=1;j++)panel(rx-.015,cy+j*.1-.04,cy+j*.1+.04,rz-.16,rz-.10,red);
      } else if(m.lamps==='h'){
        for(const yy of[cy-.12,cy+.12])panel(fx+.025,yy-.02,yy+.02,z-.16,z+.035,white);panel(fx+.027,cy-.12,cy+.12,z-.08,z-.045,white);
        panel(rx-.017,cy-.17,cy+.17,sill+.22,sill+.26,red);
      } else if(m.lamps==='vertical'){
        panel(fx+.02,cy-.045,cy+.045,z-.22,z+.01,white);panel(fx+.021,cy-.15,cy+.045,z-.005,z+.02,white);
        panel(rx-.015,cy-.035,cy+.035,rz-.27,rz-.045,red);
      } else {
        panel(fx+.024,cy-.18,cy+.18,z-.025,z+.005,white);
        if(m.lamps==='star')line([P(fx+.025,cy-side*.13,z+.003),P(fx+.025,cy+side*.16,z-.06),P(fx+.026,cy+side*.07,z-.18)],white,1.8);
        panel(rx-.015,cy-.19,cy+.19,rz-.1,rz-.065,red);
      }
      // Thin lenses wrap around the fender; no pale patches are painted on hood.
      if(m.lamps!=='two-line'){
        const lx=.45,ly=side*(bodyWidth(lx)+.005),lz=Math.min(shoulder(lx),fz+.03);
        face([P(lx*L,ly,lz),P(.495*L,side*(bodyWidth(.495)+.005),fz-.035),P(.495*L,side*(bodyWidth(.495)+.005),fz-.005),P(lx*L,ly,lz+.026)],'#bbd2dd');
      }
      panel(fx+.028,side*W*.37-.055,side*W*.37+.055,sill+.05,sill+.18,'#192329');
    }
    if(m.lamps==='bar')panel(fx+.028,-W*.405,W*.405,fz-.012,fz+.012,white);
    if(['k5','grandeur','avante','ioniq5'].includes(id))panel(rx-.02,-W*.39,W*.39,rz-.082,rz-.061,red);
    // Number plates and small marque plate avoid a blank front/rear plane.
    panel(fx+.033,-.19,.19,sill+.07,sill+.15,'#d9dedc');panel(rx-.028,-.19,.19,sill+.10,sill+.18,'#d9dedc');
    if(id==='g80')face([P(L*.443,-.09,top(.443)+.004),P(L*.43,0,top(.43)+.008),P(L*.443,.09,top(.443)+.004)],silver);
    }
    currentPart='hood-lines';
    for(const side of[-1,1])line([.27,.34,.43].map(x=>P(x*L,side*W*.27,roofZ(x,side*W*.27)+.004)),tint(paint,-.20),.5);
    root.KgmRefined?.append({id,m,L,W,H,R,Rr,frontAxle,rearAxle,sill,faces,paint,P,face,bodySide,sidePoint,surfacePoint,top,roofWidth,roofZ,bodyWidth,shoulder,endSurface,tint});
    root.HyundaiRefined?.append({id,spec,m,L,W,H,WB,R,Rr,frontAxle,rearAxle,sill,faces,paint,glass,rubber,trim,silver,top,bodyWidth,shoulder,roofWidth,roofZ,face,line,quad,box,P,tint,endSurface,surfacePoint,bodySide,sidePoint});
    return {faces,length:L,width:W,height:H,wheelbase:WB,type:m.type,metadata:{id,modeling:'reference-loft',referenceImage:'../evolving_vehicles/assets/vehicles/'+id+'.png',details:m.details,frontAxle,rearAxle,source:'Manufacturer exterior photos and selected factory dimensions; independently authored visual model, not CAD.'}};
  }
  root.VehicleMeshes=Object.freeze({create,MODELS:Object.freeze(MODELS)});
  if(typeof module!=='undefined'&&module.exports)module.exports=root.VehicleMeshes;
})(typeof window!=='undefined'?window:globalThis);
