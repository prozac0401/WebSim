import sys, pathlib, json, base64, gzip, io, argparse
sys.path.insert(0,str(pathlib.Path('output/model-python').resolve()))
import numpy as np
from PIL import Image
from scipy.optimize import least_squares
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates, binary_fill_holes
from skimage.measure import marching_cubes
from scipy.sparse import coo_matrix

out=pathlib.Path('evolving_vehicles_2/assets/models');out.mkdir(exist_ok=True)
folder=pathlib.Path('evolving_vehicles_2/assets/reference/turntable/ray')
# Wheel hub centres measured on the unmodified manufacturer turntable images.
obs=[(1,1,-1,399,497),(1,-1,-1,1092,496),(37,1,1,1124,496),(37,-1,1,433,498),
 (46,1,1,882,514),(46,-1,1,389,465),(64,1,-1,657,513),(64,-1,-1,1111,455),
 (13,1,-1,414,444),(13,-1,-1,724,514),(25,1,1,1060,447),(25,-1,1,835,518)]
def basis(frame,p):
 theta=np.deg2rad((frame-1)*5)+p[7]
 right=np.array([-np.cos(theta),np.sin(theta),0])
 horiz=np.array([-np.sin(theta),-np.cos(theta),0])
 eye=horiz*np.cos(p[2])+np.array([0,0,np.sin(p[2])])
 up=-horiz*np.sin(p[2])+np.array([0,0,np.cos(p[2])])
 return right,up,eye
def project(x,frame,p):
 right,up,eye=basis(frame,p);x=x+np.array([p[5],p[6],0]);depth=p[1]-x@eye
 return np.array([p[3]+p[0]*(x@right)/depth,p[4]-p[0]*(x@up)/depth]).T
def error(p):
 return np.concatenate([project(np.array([a*1.26,s*p[8+(a<0)],.278]),f,p)-[u,v] for f,a,s,u,v in obs])
p=least_squares(error,[4000,15,.12,758,550,.08,0,0,.755,.755],bounds=([1000,5,.03,720,450,-.5,-.5,-.1,.68,.68],[15000,60,.3,800,650,.5,.5,.1,1.1,1.1])).x
print('calibration',p,'hub RMS',np.sqrt(np.mean(error(p)**2)),flush=True)
parser=argparse.ArgumentParser();parser.add_argument('--reuse-volume',action='store_true');args=parser.parse_args()
frames=list(range(1,73,3));pictures=[np.asarray(Image.open(folder/f'{f}.png').convert('RGBA')) for f in frames]
cache=pathlib.Path('output/model-tools/ray-silhouette-volume.npz')
if args.reuse_volume and cache.exists():
 volume=np.load(cache);v,faces=volume['vertices'],volume['faces']
else:
 step=.022
 axes=[np.arange(-1.92,1.93,step),np.arange(-1.07,1.08,step),np.arange(-.04,1.83,step)]
 grid=np.stack(np.meshgrid(*axes,indexing='ij'),axis=-1);points=grid.reshape(-1,3)
 sdf=np.full(len(points),1000,dtype=np.float32)
 for frame,im in zip(frames,pictures):
  mask=binary_fill_holes(im[:,:,3]>225)
  field=distance_transform_edt(mask)-distance_transform_edt(~mask)
  uv=project(points,frame,p)
  distance=map_coordinates(field,[uv[:,1],uv[:,0]],order=1,mode='constant',cval=-100)
  sdf=np.minimum(sdf,distance)
 sdf=sdf.reshape(grid.shape[:-1]);sdf=gaussian_filter(sdf,.6)
 # Remove the photographed ground shadow, keeping real tyre contact patches.
 wheel_zone=(np.abs(np.abs(grid[:,:,:,0])-1.26)<.34)&(np.abs(grid[:,:,:,1])>.56)
 sdf[(grid[:,:,:,2]<0)|((grid[:,:,:,2]<.18)&~wheel_zone)]=-10
 v,faces,n,values=marching_cubes(sdf,level=0,spacing=(step,step,step));v+=np.array([a[0] for a in axes])
 cache.parent.mkdir(parents=True,exist_ok=True);np.savez_compressed(cache,vertices=v,faces=faces)
# Smooth sampling ridges before computing lighting normals. Roof heights are
# constrained to the gently crowned real roof, never the noisy voxel envelope.
edges=np.concatenate([faces[:,[0,1]],faces[:,[1,2]],faces[:,[2,0]]]);edges=np.concatenate([edges,edges[:,::-1]])
adj=coo_matrix((np.ones(len(edges)),(edges[:,0],edges[:,1])),shape=(len(v),len(v))).tocsr();weights=np.asarray(adj.sum(axis=1)).ravel()
for _ in range(12):v=.72*v+.28*(adj@v)/weights[:,None]
t=np.clip((v[:,2]-1.60)/.05,0,1);t=t*t*(3-2*t)
# The side and front photographs show a nearly level roof skin and a thin
# header above the glass. The previous 155 mm painted cap rounded over the
# window frames; keep only a 32 mm upper band and a shallow crown instead.
crown=1.682-.007*(v[:,1]/.76)**4-.003*((v[:,0]+.49)/1.06)**4
v[:,2]=v[:,2]*(1-t)+crown*t
# Clip at an exact material boundary so the thin roof edge is continuous,
# including the sloping windshield junction; whole-triangle masks are jagged.
threshold=1.650;verts=v.tolist();roof_faces=[];body_faces=[];cuts={}
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
if np.mean(np.sum(normals*(centres-[0,0,.8]),axis=1))<0:normals=-normals;faces=faces[:,::-1]
vertex_normals=np.zeros_like(v)
for j in range(3):np.add.at(vertex_normals,faces[:,j],normals)
vertex_normals/=np.maximum(np.linalg.norm(vertex_normals,axis=1)[:,None],1e-9)
normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9)
roof=np.arange(len(faces))<roof_count
data=np.concatenate([v,vertex_normals,np.zeros((len(v),2))],axis=1).astype('<f4')
primitives=[]
for mask,name,photo,color,mat in [(~roof,'calibrated-photo-body',True,[1,1,1],4),(roof,'smooth-inferred-roof',False,[.70,.695,.65],0)]:
 triangles=faces[mask];used,indices=np.unique(triangles.reshape(-1),return_inverse=True);index_type=2 if len(used)<65536 else 4
 packed=base64.b64encode(data[used].tobytes()).decode();indices=indices.astype('<u2' if index_type==2 else '<u4')
 primitives.append(dict(name=name,vertices=packed,indices=base64.b64encode(indices.tobytes()).decode(),indexType=index_type,triangles=len(triangles),color=color,paint=False,material=mat,alpha=1,photoProjected=photo,textureOpaque=True))
cameras=[];textures=[]
for i,(frame,im) in enumerate(zip(frames,pictures)):
 # A few pixels beyond the photographed roof contour are unobserved, not a
 # black cavity. Extend only the exterior background colour; preserve all
 # glazing/interior pixels inside the closed silhouette.
 interior=binary_fill_holes(im[:,:,3]>225)
 nearest=distance_transform_edt(~interior,return_distances=False,return_indices=True)
 rgb=im[:,:,:3].copy();rgb[~interior]=rgb[nearest[0][~interior],nearest[1][~interior]]
 r,u,eye=basis(frame,p);tex=Image.fromarray(rgb);tex.thumbnail((1024,1024));b=io.BytesIO();tex.save(b,format='JPEG',quality=91)
 textures.append('data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())
 cameras.append(dict(eye=eye.tolist(),right=r.tolist(),up=u.tolist(),focal=float(p[0]),distance=float(p[1]),center=p[3:5].tolist(),offset=[float(p[5]),float(p[6]),0],width=im.shape[1],height=im.shape[0],textureIndex=i))
print('geometry',len(v),len(faces),v.min(0),v.max(0),flush=True)
result=dict(id='ray',bounds=dict(min=v.min(0).tolist(),max=v.max(0).tolist()),triangles=len(faces),primitives=primitives,photoProjection=dict(cameras=cameras,textures=textures),source=dict(kind='photo-reconstruction',label='Kia Ray · 공식 회전 사진 기반 3D 재구성',url='https://www.kia.com/kr/vehicles/ray/features',configuration='24 calibrated official exterior views; nearly flat roof with a thin continuous header inferred from side/front photographs. Occluded roof detail is estimated, not manufacturer CAD.'))
encoded=base64.b64encode(gzip.compress(json.dumps(result,separators=(',',':')).encode())).decode()
(out/'ray-runtime.js').write_text('ManufacturerModels.registerCompressed('+json.dumps(encoded)+');',encoding='utf8')
(out/'ray-calibration.json').write_text(json.dumps({'parameters':p.tolist(),'rms':float(np.sqrt(np.mean(error(p)**2)))}))
