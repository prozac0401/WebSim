"""Calibrated volume reconstruction from official Hyundai turntable photos.

Requires numpy, scipy, scikit-image and Pillow in output/model-python (or the
normal Python environment). Camera calibration uses independently measured wheel
hub pixels, actual wheelbase/track and tyre radius. The 3D hull is intersected
against all 60 silhouettes; per-triangle UVs project onto the nearest-facing
original photograph. This is a photo reconstruction, never manufacturer CAD.
"""
import sys, pathlib, json, base64, gzip, io, argparse
sys.path.insert(0,str(pathlib.Path('output/model-python').resolve()))
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates, binary_fill_holes
from scipy.spatial import cKDTree
from skimage.measure import marching_cubes

HERE=pathlib.Path(__file__).resolve().parent
DEFINITIONS={
 'avante':dict(length=4.765,width=1.825,height=1.425,wheelbase=2.750,radius=.32535,track=.800,roofColor=[.72,.735,.735],
  page='https://www.hyundai.com/kr/ko/e/vehicles/the-all-new-avante/intro',
  # frame, axle (+front/-rear), side, pixel x/y. Unmodified 940x515 PNGs.
  hubs=[(1,1,-1,516,378),(1,-1,-1,686,356),(11,1,-1,241,374),(11,-1,-1,716,372),
   (21,1,-1,219,361),(21,-1,-1,480,380),(31,-1,1,518,378),(31,1,1,690,356),
   (41,1,1,727,372),(41,-1,1,251,373),(51,1,1,487,379),(51,-1,1,222,358)]),
 'grandeur':dict(length=5.050,width=1.880,height=1.460,wheelbase=2.895,radius=.352,track=.815,roofColor=[.30,.17,.145],
  page='https://www.hyundai.com/kr/ko/e/vehicles/the-new-grandeur/intro',
  hubs=[(1,1,-1,470,328),(1,-1,-1,688,313),(11,1,-1,222,321),(11,-1,-1,690,322),
   (21,1,-1,236,307),(21,-1,-1,452,328),(31,-1,1,489,328),(31,1,1,704,310),
   (41,-1,1,252,321),(41,1,1,719,322),(51,1,1,466,328),(51,-1,1,249,310)])
}

def basis(frame,p):
 theta=np.deg2rad((frame-1)*6)+p[7]
 right=np.array([-np.cos(theta),np.sin(theta),0.])
 horiz=np.array([-np.sin(theta),-np.cos(theta),0.])
 eye=horiz*np.cos(p[2])+np.array([0,0,np.sin(p[2])])
 up=-horiz*np.sin(p[2])+np.array([0,0,np.cos(p[2])])
 return right,up,eye

def project(x,frame,p):
 right,up,eye=basis(frame,p);x=x+np.array([p[5],p[6],0]);depth=p[1]-x@eye
 return np.array([p[3]+p[0]*(x@right)/depth,p[4]-p[0]*(x@up)/depth]).T

def build(id,calibrate_only=False):
 d=DEFINITIONS[id];out=HERE/id;folder=out/'turntable'
 def error(p):
  return np.concatenate([project(np.array([a*d['wheelbase']/2,s*p[8],d['radius']]),f,p)-[u,v] for f,a,s,u,v in d['hubs']])
 p=least_squares(error,[4000,24,.10,470,425 if id=='avante' else 378,0,0,-np.pi/3,d['track']],
  bounds=([900,5,.01,420,300,-.5,-.3,-1.5,.65],[18000,110,.3,520,470,.5,.3,-.6,1.0]),xtol=1e-12,ftol=1e-12,gtol=1e-12,max_nfev=2000).x
 rms=float(np.sqrt(np.mean(error(p)**2)));print(id,'calibration',p.tolist(),'hub RMS',rms,flush=True)
 if rms>3:raise ValueError(f'{id}: camera reprojection RMS {rms:.1f}px needs correction')
 calibration={'parameters':p.tolist(),'hubRmsPixels':rms,'hubs':d['hubs'],'physicalDimensions':{k:d[k] for k in ['length','width','height','wheelbase','radius','track']}}
 (out/'calibration.json').write_text(json.dumps(calibration,indent=2)+'\n')
 contact=Image.new('RGB',(940*2,515*3),(110,110,110))
 for i,f in enumerate([1,11,21,31,41,51]):
  im=Image.open(folder/f'{f:03}.png').convert('RGBA');background=Image.new('RGB',im.size,(110,110,110));background.paste(im,mask=im.getchannel('A'));draw=ImageDraw.Draw(background)
  for ff,a,s,u,v in d['hubs']:
   if ff!=f:continue
   q=project(np.array([a*d['wheelbase']/2,s*p[8],d['radius']]),f,p);draw.ellipse((u-4,v-4,u+4,v+4),outline='red',width=2);draw.line((q[0]-8,q[1],q[0]+8,q[1]),fill='lime',width=1);draw.line((q[0],q[1]-8,q[0],q[1]+8),fill='lime',width=1)
  contact.paste(background,((i%2)*940,(i//2)*515))
 contact.save(out/'calibration-preview.jpg')
 if calibrate_only:return
 frames=list(range(1,61));pictures=[np.asarray(Image.open(folder/f'{f:03}.png').convert('RGBA')) for f in frames]
 # The Avante's shallow roof break, boot lip and sharp wheel arches are visibly
 # softened by the original 24 mm volume. Retain their measured 60-view contour
 # with an 18 mm grid and a 10 mm smoothing footprint. Other cars are unchanged.
 step=.018 if id=='avante' else .024
 axes=[np.arange(-d['length']*.59,d['length']*.59,step),np.arange(-d['width']*.67,d['width']*.67,step),np.arange(-.07,d['height']+.20,step)]
 grid=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1);points=grid.reshape(-1,3);sdf=np.full(len(points),1000,dtype=np.float32)
 for frame,im in zip(frames,pictures):
  # Transparent glass must not punch a tunnel through the car. Exterior alpha
  # still removes the semitransparent studio-floor shadow.
  mask=binary_fill_holes(im[:,:,3]>225);field=distance_transform_edt(mask)-distance_transform_edt(~mask)
  uv=project(points,frame,p);distance=map_coordinates(field,[uv[:,1],uv[:,0]],order=1,mode='constant',cval=-100)
  sdf=np.minimum(sdf,distance)
 # Remove opaque studio-floor pixels without cutting the tyre contact patches.
 wheels=np.zeros(len(points),dtype=bool)
 for axle in [-d['wheelbase']/2,d['wheelbase']/2]:
  for side in [-1,1]:
   wheels|=((points[:,0]-axle)**2+(points[:,2]-d['radius'])**2<(d['radius']+.035)**2)&(abs(points[:,1]-side*p[8])<.19)
 sdf[(points[:,2]<.16)&~wheels]=-30
 sdf[points[:,2]<-.005]=-30
 sdf=gaussian_filter(sdf.reshape(grid.shape[:-1]),.55 if id=='avante' else .75)
 v,faces,n,_=marching_cubes(sdf,level=0,spacing=(step,step,step));v+=np.array([a[0] for a in axes])
 centres=v[faces].mean(1);normals=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]]);normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9)
 if np.mean(np.sum(normals*(centres-[0,0,.7]),axis=1))<0:normals=-normals;faces=faces[:,::-1]
 # Use 30 original views for the material atlas; the silhouette volume above
 # uses all 60. Camera projections are preserved in the source calibration.
 selected=list(range(0,60,2));scores=[]
 for i in selected:
  _,_,eye=basis(frames[i],p);scores.append(normals@eye)
 chosen=np.argmax(np.array(scores),axis=0)
 # A single low-elevation turntable cannot observe horizontal roof detail. Use
 # a quiet body-colour crown there rather than stretched windshield fragments.
 roof=(centres[:,2]>d['height']*.935)&(normals[:,2]>.65)
 if id=='avante':
  # The black shark-fin antenna appears at x ~= -1.15 m in both true side
  # frames (012/042). It is an observed feature, not part of the inferred crown.
  roof&=~((centres[:,0]<-1.02)&(abs(centres[:,1])<.105))
 chosen[roof]=-1
 vertex_normals=np.zeros(v.shape,dtype=np.float64)
 weighted=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]])
 for corner in range(3):np.add.at(vertex_normals,faces[:,corner],weighted)
 vertex_normals/=np.maximum(np.linalg.norm(vertex_normals,axis=1)[:,None],1e-9)
 primitives=[]
 for pick,i in enumerate(selected):
  frame=frames[i];im=pictures[i];tris=faces[chosen==pick]
  if not len(tris):continue
  indices=np.arange(len(tris)*3,dtype=np.uint32);verts=v[tris].reshape(-1,3);ns=vertex_normals[tris].reshape(-1,3);uv=project(verts,frame,p)/[im.shape[1],im.shape[0]]
  data=np.concatenate([verts,ns,uv],axis=1).astype('<f4')
  # Source RGB remains intact. Removing alpha here makes transparent factory
  # glass an opaque photographed surface, instead of missing body geometry.
  tex=Image.fromarray(im[:,:,:3]);b=io.BytesIO();tex.save(b,format='PNG')
  primitives.append(dict(name=f'frame-{frame}',vertices=base64.b64encode(data.tobytes()).decode(),indices=base64.b64encode(indices.tobytes()).decode(),indexType=4,triangles=len(tris),bounds=dict(min=verts.min(0).tolist(),max=verts.max(0).tolist()),color=[1,1,1],paint=False,material=4,alpha=1,texture='data:image/png;base64,'+base64.b64encode(b.getvalue()).decode()))
 if np.any(roof):
  tris=faces[roof];verts=v[tris].reshape(-1,3);ns=vertex_normals[tris].reshape(-1,3);data=np.concatenate([verts,ns,np.zeros((len(verts),2))],axis=1).astype('<f4');indices=np.arange(len(verts),dtype=np.uint32)
  primitives.append(dict(name='unobserved-roof-crown',vertices=base64.b64encode(data.tobytes()).decode(),indices=base64.b64encode(indices.tobytes()).decode(),indexType=4,triangles=len(tris),bounds=dict(min=verts.min(0).tolist(),max=verts.max(0).tolist()),color=d['roofColor'],paint=False,material=0,alpha=1,texture=None))
 result=dict(id=id,bounds=dict(min=v.min(0).tolist(),max=v.max(0).tolist()),triangles=len(faces),primitives=primitives,source=dict(kind='photo-reconstruction',label='현대 공식 360도 이미지 · 실루엣 재구성',url=d['page'],configuration='60 unmodified manufacturer turntable frames, calibrated hub projections, volumetric silhouette intersection, 30 projective photo textures. Not manufacturer CAD.',hubRmsPixels=rms))
 encoded=base64.b64encode(gzip.compress(json.dumps(result,separators=(',',':')).encode())).decode();(HERE/f'{id}-runtime.js').write_text('ManufacturerModels.registerCompressed('+json.dumps(encoded)+');\n',encoding='utf8')
 summary={**result,'primitives':[{k:(len(value) if value is not None else 0) if k=='texture' else value for k,value in item.items() if k not in ['vertices','indices']} for item in primitives]}
 (HERE/f'{id}-runtime-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
 print(id,'geometry',len(v),len(faces),'bounds',v.min(0).tolist(),v.max(0).tolist(),'runtime MB',len(encoded)/1e6,flush=True)

def project_existing(id):
 """Weld the volume and attach orbit-aware projective cameras, without rerunning
 the expensive silhouette intersection. Original static UVs are replaced by
 the renderer's two-neighbour photograph projection, avoiding panel seams.
 """
 file=HERE/f'{id}-runtime.js';text=file.read_text();payload=json.loads(text[text.index('(')+1:text.rindex(')')]);result=json.loads(gzip.decompress(base64.b64decode(payload)))
 # Marching cubes can leave tiny concentric height steps in an almost-flat
 # crown. Fit a continuous quadratic to the measured crown, including analytic
 # normals; also move the shared boundary vertices in the adjacent body skin.
 roof_part=next((item for item in result['primitives'] if item['name']=='unobserved-roof-crown'),None)
 if roof_part and id=='avante' and not result['source'].get('silhouetteRefinement'):
  # Preserve the actual roof/A-/C-pillar join instead of moving the entire
  # perimeter onto one quadratic. The old fit displaced that edge by up to
  # 35 mm, producing a raised white plate in side and three-quarter views.
  # Only the unobserved interior receives a bounded smooth fit; boundary
  # positions and normals remain those of the measured silhouette volume.
  rv=np.frombuffer(base64.b64decode(roof_part['vertices']),dtype='<f4').reshape(-1,8).copy()
  ri=np.frombuffer(base64.b64decode(roof_part['indices']),dtype='<u4' if roof_part['indexType']==4 else '<u2').reshape(-1,3)
  unique,inverse=np.unique(rv[:,:3],axis=0,return_inverse=True);triangles=inverse[ri]
  edges=np.sort(np.concatenate([triangles[:,[0,1]],triangles[:,[1,2]],triangles[:,[2,0]]]),axis=1);edges,counts=np.unique(edges,axis=0,return_counts=True)
  boundary=unique[np.unique(edges[counts==1])];dist=cKDTree(boundary[:,:2]).query(rv[:,:2])[0]
  x,y=rv[:,0],rv[:,1];design=np.stack([np.ones(len(x)),x,x*x,x**3,x**4,y,y*y,x*y*y,x*x*y*y],axis=1)
  coeff=np.linalg.lstsq(design,rv[:,2],rcond=None)[0];t=np.clip((dist-.025)/.12,0,1);weight=t*t*(3-2*t)
  delta=np.clip(design@coeff-rv[:,2],-.012,.012)*weight;rv[:,2]+=delta
  dx=coeff[1]+2*coeff[2]*x+3*coeff[3]*x*x+4*coeff[4]*x**3+coeff[7]*y*y+2*coeff[8]*x*y*y
  dy=coeff[5]+2*coeff[6]*y+2*coeff[7]*x*y+2*coeff[8]*x*x*y
  fitted=np.stack([-dx,-dy,np.ones(len(x))],axis=1);fitted/=np.linalg.norm(fitted,axis=1)[:,None]
  rv[:,3:6]=rv[:,3:6]*(1-weight[:,None])+fitted*weight[:,None];rv[:,3:6]/=np.linalg.norm(rv[:,3:6],axis=1)[:,None]
  roof_part['vertices']=base64.b64encode(rv.astype('<f4').tobytes()).decode();roof_part['bounds']={'min':rv[:,:3].min(0).tolist(),'max':rv[:,:3].max(0).tolist()}
  result['source']['silhouetteRefinement']={'voxelMillimetres':18,'smoothingMillimetres':9.9,'roofBoundaryPreserved':True,'crownMaximumCorrectionMillimetres':round(float(abs(delta).max())*1000,3),'observedAntennaPreserved':True}
  print(id,'boundary-preserving crown max correction mm',round(float(abs(delta).max())*1000,2),flush=True)
 elif roof_part and id!='avante':
  rv=np.frombuffer(base64.b64decode(roof_part['vertices']),dtype='<f4').reshape(-1,8).copy();old=rv[:,:3].copy();x,y=old[:,0],old[:,1]
  design=np.stack([np.ones(len(x)),x,y,x*x,x*y,y*y],axis=1);coeff=np.linalg.lstsq(design,old[:,2],rcond=None)[0]
  rv[:,2]=design@coeff;normal=np.stack([-(coeff[1]+2*coeff[3]*x+coeff[4]*y),-(coeff[2]+coeff[4]*x+2*coeff[5]*y),np.ones(len(x))],axis=1);normal/=np.linalg.norm(normal,axis=1)[:,None];rv[:,3:6]=normal
  changes={tuple(a):float(b) for a,b in zip(old,rv[:,2])};roof_part['vertices']=base64.b64encode(rv.astype('<f4').tobytes()).decode();roof_part['bounds']={'min':rv[:,:3].min(0).tolist(),'max':rv[:,:3].max(0).tolist()}
  for primitive in result['primitives']:
   if primitive is roof_part:continue
   array=np.frombuffer(base64.b64decode(primitive['vertices']),dtype='<f4').reshape(-1,8).copy()
   for vertex in array:
    z=changes.get(tuple(vertex[:3]));
    if z is not None:vertex[2]=z
   primitive['vertices']=base64.b64encode(array.astype('<f4').tobytes()).decode()
  print(id,'continuous crown max correction mm',round(float(np.max(abs(rv[:,2]-old[:,2])))*1000,2),flush=True)
 if id=='avante' and not result['source'].get('silhouetteRefinement',{}).get('antennaWidthEstimated'):
  # Low-angle silhouette intersection overestimates a shark fin's unseen
  # transverse width. Keep every observed longitudinal/vertical coordinate
  # intact, narrowing only the raised centre above the neighbouring roof.
  # Its estimated width is explicitly recorded; it is not manufacturer CAD.
  arrays=[np.frombuffer(base64.b64decode(item['vertices']),dtype='<f4').reshape(-1,8).copy() for item in result['primitives']]
  positions=np.unique(np.concatenate([a[:,:3] for a in arrays]),axis=0)
  strip=positions[(positions[:,0]>-1.38)&(positions[:,0]<-.98)&(abs(positions[:,1])>.27)&(abs(positions[:,1])<.36)&(positions[:,2]>1.29)]
  x,y=strip[:,0],strip[:,1];design=np.stack([np.ones(len(x)),x,x*x,x**3,y*y],axis=1);coeff=np.linalg.lstsq(design,strip[:,2],rcond=None)[0]
  changed=0;maximum=0
  for primitive,a in zip(result['primitives'],arrays):
   x,y,z=a[:,0],a[:,1].copy(),a[:,2];base=coeff[0]+coeff[1]*x+coeff[2]*x*x+coeff[3]*x**3+coeff[4]*y*y
   t=np.clip((z-base-.003)/.015,0,1);weight=t*t*(3-2*t);weight*=((x>-1.31)&(x<-1.02)&(abs(y)<.24))
   a[:,1]=y*(1-.78*weight);changed+=int(np.count_nonzero(weight));maximum=max(maximum,float(np.max(abs(a[:,1]-y))))
   ix=np.frombuffer(base64.b64decode(primitive['indices']),dtype='<u4' if primitive['indexType']==4 else '<u2').reshape(-1,3)
   if np.any(weight):
    xyz,inverse=np.unique(a[:,:3],axis=0,return_inverse=True);tri=inverse[ix];weighted=np.cross(xyz[tri[:,1]]-xyz[tri[:,0]],xyz[tri[:,2]]-xyz[tri[:,0]]);ns=np.zeros_like(xyz)
    for corner in range(3):np.add.at(ns,tri[:,corner],weighted)
    ns/=np.maximum(np.linalg.norm(ns,axis=1)[:,None],1e-12);a[weight>0,3:6]=ns[inverse[weight>0]]
   primitive['vertices']=base64.b64encode(a.astype('<f4').tobytes()).decode();primitive['bounds']={'min':a[:,:3].min(0).tolist(),'max':a[:,:3].max(0).tolist()}
  result['source']['silhouetteRefinement']['antennaWidthEstimated']={'preservedAxes':['longitudinal','vertical'],'transverseTipScale':.22,'maximumTransverseCorrectionMillimetres':round(maximum*1000,3),'note':'Unobserved fin width estimated from the narrow roof antenna; measured side profile and overall height unchanged.'}
  print(id,'antenna width correction',changed,'vertices; maximum mm',round(maximum*1000,2),flush=True)
 calibration=json.loads((HERE/id/'calibration.json').read_text());p=np.array(calibration['parameters']);parts=[];roof=[]
 for primitive in result['primitives']:
  if primitive['name']=='unobserved-roof-crown':roof.append(primitive);continue
  data=np.frombuffer(base64.b64decode(primitive['vertices']),dtype='<f4').reshape(-1,8)
  indices=np.frombuffer(base64.b64decode(primitive['indices']),dtype='<u4' if primitive['indexType']==4 else '<u2')
  parts.append(data[indices,:6])
 unique,inverse=np.unique(np.concatenate(parts),axis=0,return_inverse=True);data=np.concatenate([unique,np.zeros((len(unique),2))],axis=1).astype('<f4');index_type=2 if len(unique)<65536 else 4;indices=inverse.astype('<u2' if index_type==2 else '<u4')
 all_positions=[unique[:,:3]]+[np.frombuffer(base64.b64decode(item['vertices']),dtype='<f4').reshape(-1,8)[:,:3] for item in roof]
 all_positions=np.concatenate(all_positions);result['bounds']={'min':all_positions.min(0).tolist(),'max':all_positions.max(0).tolist()}
 triangles=indices.reshape(-1,3);centres=data[triangles,:3].mean(1);normals=data[triangles,3:6].mean(1)
 # Upper glass and deck surfaces are barely visible to the sideways source
 # cameras. Their forward/rear-facing source photographs retain the real hood
 # and glazing detail at steep viewing angles, without pulling door/window
 # imagery across the bonnet. Sidewalls still blend the nearest orbit views.
 upper=(centres[:,2]>DEFINITIONS[id]['height']*.48)&(normals[:,2]>.46)&(abs(normals[:,1])<.68)
 if id=='avante':
  # The previous normal-only test also selected shoulder creases, A/C-pillars
  # and mirrors. Projecting a front photo onto those side-facing surfaces put
  # its background and hidden door pixels across the real side silhouette.
  # Reserve fixed images for the visible inner glass/bonnet/deck. Side pillars,
  # outer fenders and mirrors keep their matching orbit photographs.
  upper&=(abs(centres[:,1])<.60)&(normals[:,2]>.58)&(abs(normals[:,1])<.50)
 front=upper&(centres[:,0]>.10);rear=upper&(centres[:,0]<-.10)
 front_camera=max(range(30),key=lambda i:basis(1+i*2,p)[2][0]);rear_camera=min(range(30),key=lambda i:basis(1+i*2,p)[2][0])
 rebuilt=[]
 for name,selection,fixed in [('calibrated-hyundai-body',~(front|rear),None),('front-upper-projection',front,front_camera),('rear-upper-projection',rear,rear_camera)]:
  group=triangles[selection];used,local=np.unique(group,return_inverse=True);vertices=data[used];itype=2 if len(used)<65536 else 4;local=local.astype('<u2' if itype==2 else '<u4')
  primitive=dict(name=name,vertices=base64.b64encode(vertices.tobytes()).decode(),indices=base64.b64encode(local.tobytes()).decode(),indexType=itype,triangles=len(group),bounds={'min':vertices[:,:3].min(0).tolist(),'max':vertices[:,:3].max(0).tolist()},color=[1,1,1],paint=False,material=4,alpha=1,texture=None,photoProjected=True)
  if fixed is not None:primitive['photoCameraIndex']=fixed
  rebuilt.append(primitive)
 for item in roof:item['photoProjected']=False
 cameras=[];textures=[]
 for frame in range(1,61,2):
  image=Image.open(HERE/id/'turntable'/f'{frame:03}.png').convert('RGBA')
  if id=='avante':
   # Transparent source pixels contain the studio's green matte RGB. Extend
   # only the exterior edge colours into that discarded background so a
   # sub-pixel hull/projection mismatch cannot draw green cracks. Filling
   # interior mask holes keeps all photographed glazing colours untouched.
   rgba=np.asarray(image);mask=binary_fill_holes(rgba[:,:,3]>225);nearest=distance_transform_edt(~mask,return_distances=False,return_indices=True)
   rgb=rgba[:,:,:3].copy();rgb[~mask]=rgb[nearest[0][~mask],nearest[1][~mask]];image=Image.fromarray(rgb)
  else:image=image.convert('RGB')
  stream=io.BytesIO();image.save(stream,format='JPEG',quality=94,subsampling=0,optimize=True)
  r,u,e=basis(frame,p);cameras.append(dict(eye=e.tolist(),right=r.tolist(),up=u.tolist(),focal=float(p[0]),distance=float(p[1]),center=p[3:5].tolist(),offset=[float(p[5]),float(p[6]),0],width=image.width,height=image.height,textureIndex=len(textures)))
  textures.append('data:image/jpeg;base64,'+base64.b64encode(stream.getvalue()).decode())
 result['primitives']=[*rebuilt,*roof];result['photoProjection']=dict(cameras=cameras,textures=textures);result['source']['configuration']='60 official manufacturer turntable photographs; calibrated 3D silhouette hull with view-dependent two-camera photo projection. Upper front/rear panels use fixed matching source views; the unobserved roof crown is estimated. Not manufacturer CAD.'
 encoded=base64.b64encode(gzip.compress(json.dumps(result,separators=(',',':')).encode())).decode();file.write_text('ManufacturerModels.registerCompressed('+json.dumps(encoded)+');\n',encoding='utf8')
 summary={**result,'photoProjection':{'cameras':cameras,'textures':len(textures)},'primitives':[{k:value for k,value in item.items() if k not in ['vertices','indices','texture']} for item in result['primitives']]};(HERE/f'{id}-runtime-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
 print(id,'projective runtime',len(unique),'shared vertices',len(textures),'cameras',round(len(encoded)/1e6,2),'MB',flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*',default=list(DEFINITIONS));parser.add_argument('--calibrate-only',action='store_true');parser.add_argument('--project-existing',action='store_true');args=parser.parse_args()
 for id in args.ids:
  if not args.project_existing:build(id,args.calibrate_only)
  if not args.calibrate_only:project_existing(id)
