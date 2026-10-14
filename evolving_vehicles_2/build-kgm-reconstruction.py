"""Reconstruct KGM exterior visual hulls from public, unmodified turntable PNGs.

Run fetch-kgm-turntables.mjs first. This is photographic reconstruction, not CAD.
Runtime preserves calibrated projectors for view-dependent photo texturing.
"""
import sys, pathlib, json, base64, gzip, io, argparse
ROOT=pathlib.Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT.parent/'output/model-python'))
import numpy as np
from PIL import Image
from scipy.optimize import least_squares
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates, binary_fill_holes
from scipy.sparse import coo_matrix
from skimage.measure import marching_cubes

CONFIG={
 'torres':dict(wheelbase=2.680,radius=.35785,width=1.890,height=1.720,length=4.705,phase=-.85,track=.875,
   color=[.52,.51,.49],roof=1.49,
   observations=[(1,1,-1,739,633),(1,-1,-1,1265,568),(10,1,1,1027,630),(10,-1,1,350,574),(19,1,1,1297,565),(19,-1,1,784,626),(28,1,-1,329,572),(28,-1,-1,970,623),(13,1,1,1276,613),(13,-1,1,359,595),(31,1,-1,304,596),(31,-1,-1,1211,610)]),
 'musso_ev':dict(wheelbase=3.150,radius=.3629,width=1.920,height=1.740,length=5.160,phase=-.70,track=.870,
   color=[.035,.09,.32],roof=1.50,
   observations=[(1,1,-1,589,534),(1,-1,-1,1055,482),(10,1,1,879,531),(10,-1,1,300,486),(19,1,1,1071,478),(19,-1,1,619,530),(28,1,-1,280,484),(28,-1,-1,849,525),(13,1,1,1073,517),(13,-1,1,284,504),(31,1,-1,255,504),(31,-1,-1,1040,515)])
}

def basis(frame,p):
 theta=np.deg2rad(-(frame-1)*10)+p[7]
 right=np.array([-np.cos(theta),np.sin(theta),0.])
 horiz=np.array([-np.sin(theta),-np.cos(theta),0.])
 eye=horiz*np.cos(p[2])+np.array([0,0,np.sin(p[2])])
 up=-horiz*np.sin(p[2])+np.array([0,0,np.cos(p[2])])
 return right,up,eye

def project(x,frame,p):
 right,up,eye=basis(frame,p);x=x+np.array([p[5],p[6],0.]);depth=p[1]-x@eye
 return np.array([p[3]+p[0]*(x@right)/depth,p[4]-p[0]*(x@up)/depth]).T

def build(id,step=.022,calibration_only=False):
 conf=CONFIG[id];folder=ROOT/'assets/reference/turntable'/id;out=ROOT/'assets/models'/id;out.mkdir(parents=True,exist_ok=True)
 manifest=json.loads((folder/'sources.json').read_text())
 if manifest['frames']!=36:raise ValueError('Expected the verified 36 x 10 degree KGM frame sequence')
 image0=np.asarray(Image.open(folder/'1.png').convert('RGBA'));height,width=image0.shape[:2]
 def errors(p):
  return np.concatenate([project(np.array([a*conf['wheelbase']/2,s*p[8],conf['radius']]),f,p)-[u,v] for f,a,s,u,v in conf['observations']])
 fit=least_squares(errors,[4000,14,.11,width/2,height*.73,.03,0,conf['phase'],conf['track']],
  bounds=([1200,5,.015,width*.40,height*.60,-.6,-.6,-1.25,.78],[20000,80,.35,width*.60,height*.92,.6,.6,-.40,.96]),max_nfev=1500)
 p=fit.x;rms=float(np.sqrt(np.mean(errors(p)**2)))
 calibration=dict(parameters=p.tolist(),rmsPixels=rms,observations=conf['observations'],residuals=errors(p).reshape(-1,2).tolist(),frameCount=36,frameStepDegrees=-10,source=manifest['sourcePage'])
 (out/'calibration.json').write_text(json.dumps(calibration,indent=2)+'\n')
 print(id,'calibration',p,'hub RMS',rms,flush=True)
 if calibration_only:return
 frames=list(range(1,37));pictures=[np.asarray(Image.open(folder/f'{f}.png').convert('RGBA')) for f in frames]
 axes=[np.arange(-conf['length']*.55,conf['length']*.55+step,step),np.arange(-1.14,1.14+step,step),np.arange(-.035,conf['height']+.11,step)]
 grid=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1);points=grid.reshape(-1,3)
 sdf=np.full(len(points),1000,dtype=np.float32)
 for frame,im in zip(frames,pictures):
  mask=binary_fill_holes(im[:,:,3]>230)
  field=distance_transform_edt(mask)-distance_transform_edt(~mask)
  uv=project(points,frame,p)
  distance=map_coordinates(field,[uv[:,1],uv[:,0]],order=1,mode='constant',cval=-100)
  sdf=np.minimum(sdf,distance)
 sdf=gaussian_filter(sdf.reshape(grid.shape[:-1]),.6)
 wheel_zone=(np.abs(np.abs(grid[:,:,:,0])-conf['wheelbase']/2)<conf['radius']*1.05)&(np.abs(grid[:,:,:,1])>.57)
 sdf[(grid[:,:,:,2]<0)|((grid[:,:,:,2]<.20)&~wheel_zone)]=-10
 # Side images do not observe the open load floor directly from above. Enforce
 # the known pickup cavity; the floor/inner walls remain an inferred surface.
 if id=='musso_ev':
  cavity=(grid[:,:,:,0]<-.98)&(grid[:,:,:,0]>-2.42)&(np.abs(grid[:,:,:,1])<.80)&(grid[:,:,:,2]>.73)
  sdf[cavity]=-10
 v,faces,n,_=marching_cubes(sdf,level=0,spacing=(step,step,step));v+=np.array([a[0] for a in axes]);n=-n
 edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]);edges=np.concatenate([edges,edges[:,::-1]])
 adj=coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(v),len(v))).tocsr();weights=np.asarray(adj.sum(axis=1)).ravel()
 for _ in range(9):v=.78*v+.22*(adj@v)/weights[:,None]
 def roof_crown(x,y):
  return (1.692-.030*(y/.78)**4-.022*((x+.70)/1.12)**4) if id=='torres' else (1.715-.032*(y/.79)**4-.023*((x+.12)/.78)**4)
 t=np.clip((v[:,2]-1.49)/.14,0,1);t=t*t*(3-2*t)
 v[:,2]=v[:,2]*(1-t)+roof_crown(v[:,0],v[:,1])*t
 # Retain the observed hood height. The low source camera cannot reliably
 # observe its upper surface, so finish this surface with the body paint.
 # Split triangles exactly on the roof boundary instead of classifying a
 # whole voxel triangle by normal, which leaves a saw-toothed material edge.
 threshold=1.615 if id=='torres' else 1.64
 verts=v.tolist();roof_faces=[];body_faces=[];cuts={}
 def cut(a,b):
  key=tuple(sorted((a,b)))
  if key not in cuts:
   t=(threshold-v[a,2])/(v[b,2]-v[a,2]);cuts[key]=len(verts);verts.append((v[a]*(1-t)+v[b]*t).tolist())
  return cuts[key]
 for tri in faces:
  inside=v[tri,2]>=threshold
  if np.all(inside):roof_faces.append(tri.tolist());continue
  if not np.any(inside):body_faces.append(tri.tolist());continue
  for positive,destination in [(True,roof_faces),(False,body_faces)]:
   poly=[]
   for j in range(3):
    a,b=int(tri[j]),int(tri[(j+1)%3]);ia=(v[a,2]>=threshold)==positive;ib=(v[b,2]>=threshold)==positive
    if ia:poly.append(a)
    if ia!=ib:poly.append(cut(a,b))
   for j in range(1,len(poly)-1):destination.append([poly[0],poly[j],poly[j+1]])
 v=np.asarray(verts);roof_count=len(roof_faces);faces=np.asarray(roof_faces+body_faces,dtype=np.int32)
 centres=v[faces].mean(1);normals=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]])
 if np.mean(np.sum(normals*(centres-[0,0,.8]),axis=1))<0:faces=faces[:,::-1]
 normals=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]]);normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9)
 # Use area-averaged geometry normals; raw voxel gradients introduce faceting.
 ns=np.zeros_like(v);weighted=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]])
 for j in range(3):np.add.at(ns,faces[:,j],weighted)
 ns/=np.maximum(np.linalg.norm(ns,axis=1)[:,None],1e-9)
 roof=np.arange(len(faces))<roof_count
 hood=(centres[:,0]>1.105)&(centres[:,2]>.97)&(normals[:,2]>.34)
 inferred_bed=(centres[:,0]<-.97)&(centres[:,0]>-2.43)&(np.abs(centres[:,1])<.815)&(centres[:,2]>.71)&(centres[:,2]<1.22) if id=='musso_ev' else np.zeros(len(faces),dtype=bool)
 inferred=roof|hood|inferred_bed
 def primitive(name,triangles,photo,color,material=0):
  used,indices=np.unique(triangles.reshape(-1),return_inverse=True);norms=ns[used].copy()
  if name=='inferred-painted-roof':
   # The unseen roof's silhouette intersections contain shallow voxel ripples.
   # A smooth crowned normal field avoids false dents under specular lighting.
   x,y=v[used,0],v[used,1];norms=np.column_stack([-(roof_crown(x+.001,y)-roof_crown(x-.001,y))/.002,-(roof_crown(x,y+.001)-roof_crown(x,y-.001))/.002,np.ones(len(used))]);norms/=np.linalg.norm(norms,axis=1)[:,None]
  data=np.concatenate([v[used],norms,np.zeros((len(used),2))],axis=1).astype('<f4')
  return dict(name=name,vertices=base64.b64encode(data.tobytes()).decode(),indices=base64.b64encode(indices.astype('<u4').tobytes()).decode(),indexType=4,triangles=len(triangles),color=color,paint=False,material=material,alpha=1,photoProjected=photo)
 primitives=[primitive('official-360-visual-hull',faces[~inferred],True,[1,1,1],4)]
 if np.any(roof):primitives.append(primitive('inferred-painted-roof',faces[roof],False,conf['color']))
 if np.any(hood):
  primitives.append(primitive('inferred-painted-hood',faces[hood],False,conf['color']))
 if np.any(inferred_bed):primitives.append(primitive('inferred-open-bed-liner',faces[inferred_bed],False,[.06,.07,.075],2))
 # Separate fitted roof rails and tie loops retain the characteristic overhead
 # hardware after removing the unobserved, noisy visual-hull roof surface.
 extra_vertices=[]
 def auxiliary(name,quads,color,material):
  data=[]
  for q in quads:
   for order in [(0,1,2),(0,2,3)]:
    a,b,c=[np.asarray(q[j]) for j in order];normal=np.cross(b-a,c-a);normal/=max(np.linalg.norm(normal),1e-9)
    for point in [a,b,c]:data.append([*point,*normal,0,0]);extra_vertices.append(point)
  data=np.asarray(data,dtype='<f4');primitives.append(dict(name=name,vertices=base64.b64encode(data.tobytes()).decode(),indices=base64.b64encode(np.arange(len(data),dtype='<u4').tobytes()).decode(),indexType=4,triangles=len(data)//3,color=color,paint=False,material=material,alpha=1))
 rails=[]
 for side in [-1,1]:
  start,end=(-1.43,.24) if id=='torres' else (-.71,.39);y=side*.67
  for j in range(32):
   a=start+(end-start)*j/32;b=start+(end-start)*(j+1)/32
   za=roof_crown(a,y)+.035+.012*np.sin(np.pi*j/32);zb=roof_crown(b,y)+.035+.012*np.sin(np.pi*(j+1)/32)
   for k in range(8):
    r=k*np.pi/4;s=(k+1)*np.pi/4
    rails.append([[a,y+.022*np.cos(r),za+.013*np.sin(r)],[b,y+.022*np.cos(r),zb+.013*np.sin(r)],[b,y+.022*np.cos(s),zb+.013*np.sin(s)],[a,y+.022*np.cos(s),za+.013*np.sin(s)]])
 auxiliary('inferred-roof-rails',rails,[.10,.12,.13],2)
 loops=[]
 for y in [-.64,.64]:
  x=1.15;near=(np.abs(v[:,0]-x)<.055)&(np.abs(v[:,1]-y)<.055);z=np.max(v[near,2])+.003 if np.any(near) else 1.10
  for a,b in [(-.070,-.045),(-.045,.045),(.045,.070)]:
   za=z+(.008 if a==-.070 else .035);zb=z+(.008 if b==.070 else .035)
   loops.append([[x+a,y-.017,za],[x+b,y-.017,zb],[x+b,y+.017,zb],[x+a,y+.017,za]])
 auxiliary('inferred-hood-tie-loops',loops,[.62,.66,.67],3)
 if id=='musso_ev':
  ribs=[]
  for y in np.arange(-.70,.71,.10):ribs.append([[-2.38,y-.009,.748],[-1.02,y-.009,.748],[-1.02,y+.009,.748],[-2.38,y+.009,.748]])
  auxiliary('inferred-bed-floor-ribs',ribs,[.14,.16,.17],2)
 cameras=[];textures=[]
 for frame,im in zip(frames,pictures):
  # RGB outside alpha is irrelevant to the hull but can bleed into bilinear
  # edge samples; extend the nearest opaque vehicle pixel before JPEG encoding.
  opaque=im[:,:,3]>225;nearest=distance_transform_edt(~opaque,return_distances=False,return_indices=True)
  rgb=im[:,:,:3].copy();rgb[~opaque]=rgb[nearest[0][~opaque],nearest[1][~opaque]]
  tex=Image.fromarray(rgb);tex.thumbnail((1440,1440));b=io.BytesIO();tex.save(b,format='JPEG',quality=91,subsampling=0)
  textures.append('data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())
  right,up,eye=basis(frame,p);cameras.append(dict(frame=frame,eye=eye.tolist(),right=right.tolist(),up=up.tolist(),focal=p[0],distance=p[1],center=p[3:5].tolist(),offset=[p[5],p[6],0],width=im.shape[1],height=im.shape[0],textureIndex=len(textures)-1))
 all_vertices=np.vstack([v,np.asarray(extra_vertices)]);total_triangles=sum(q['triangles'] for q in primitives)
 result=dict(id=id,bounds=dict(min=all_vertices.min(0).tolist(),max=all_vertices.max(0).tolist()),triangles=total_triangles,primitives=primitives,
  photoProjection=dict(cameras=cameras,textures=textures),source=dict(kind='photo-reconstruction',label='공식 360도 사진 재구성 · 실루엣 메시',url=manifest['sourcePage'],calibrationRmsPixels=rms,frameCount=36,configuration=('Korea Torres J100 petrol, Latte Greige exterior' if id=='torres' else 'Korea Musso EV O100 electric pickup, Ultra Marine exterior')+'; 36 calibrated official views. Smooth roof/hood, hidden underbody and pickup bed inferred; visual trim and wheels may differ from randomly sampled powertrain. Not manufacturer CAD.',limitations='Calibrated photographic visual hull, not manufacturer CAD. Unseen roof/underbody and pickup bed inferred. Photo trim can differ from race powertrain.'))
 encoded=base64.b64encode(gzip.compress(json.dumps(result,separators=(',',':')).encode(),compresslevel=9)).decode()
 (ROOT/'assets/models'/f'{id}-runtime.js').write_text('ManufacturerModels.registerCompressed('+json.dumps(encoded)+');\n',encoding='utf8')
 (out/'inspection.json').write_text(json.dumps(dict(id=id,vertices=len(all_vertices),triangles=total_triangles,bounds=result['bounds'],source=result['source'],stepMeters=step,textureBytes=sum(len(x) for x in textures),runtimeBytes=len(encoded)),indent=2)+'\n')
 print(id,'geometry',len(v),len(faces),'bounds',v.min(0),v.max(0),'runtime',len(encoded),flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*',default=list(CONFIG));parser.add_argument('--step',type=float,default=.022);parser.add_argument('--calibrate-only',action='store_true');args=parser.parse_args()
 for id in args.ids:build(id,args.step,args.calibrate_only)
