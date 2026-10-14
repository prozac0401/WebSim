"""Calibrated K5 volume reconstruction from official Kia turntable photos.

Requires numpy, scipy, scikit-image and Pillow in output/model-python (or the
normal Python environment). Camera calibration uses independently measured wheel
hub pixels, actual wheelbase and tyre radius. Front/rear hub-face half-tracks
are fitted independently. The 3D hull intersects 24 sampled silhouettes from
the 72-frame source; runtime cameras project and blend the original photographs.
This is a photo reconstruction, never manufacturer CAD.
"""
import sys, pathlib, json, base64, gzip, io, argparse
sys.path.insert(0,str(pathlib.Path('output/model-python').resolve()))
import numpy as np
from PIL import Image, ImageDraw
from scipy.optimize import least_squares
from scipy.ndimage import gaussian_filter, distance_transform_edt, map_coordinates, binary_fill_holes
from skimage.measure import marching_cubes

HERE=pathlib.Path(__file__).resolve().parent
DEFINITIONS={
 'k5':dict(length=4.905,width=1.860,height=1.445,wheelbase=2.850,radius=.336,track=.86,
  page='https://www.kia.com/kr/vehicles/k5/features',
  hubs=[(1,1,-1,375,446),(1,-1,-1,1124,446),
   (13,1,-1,430,406),(13,-1,-1,754,466),
   (25,1,1,1085,406),(25,-1,1,823,466),
   (37,1,1,1173,445),(37,-1,1,428,446),
   (49,1,1,794,470),(49,-1,1,443,407),
   (61,1,-1,792,474),(61,-1,-1,1083,409)])
}

def basis(frame,p):
 theta=np.deg2rad((frame-1)*5)+p[7]
 right=np.array([-np.cos(theta),np.sin(theta),0.])
 horiz=np.array([-np.sin(theta),-np.cos(theta),0.])
 eye=horiz*np.cos(p[2])+np.array([0,0,np.sin(p[2])])
 up=-horiz*np.sin(p[2])+np.array([0,0,np.cos(p[2])])
 return right,up,eye

def project(x,frame,p):
 right,up,eye=basis(frame,p);x=x+np.array([p[5],p[6],0]);depth=p[1]-x@eye
 return np.array([p[3]+p[0]*(x@right)/depth,p[4]-p[0]*(x@up)/depth]).T

def build(id,calibrate_only=False):
 d=DEFINITIONS[id];out=HERE/id;out.mkdir(exist_ok=True);folder=HERE.parent/'reference'/'turntable'/id
 def error(p):
  return np.concatenate([project(np.array([a*d['wheelbase']/2,s*(p[8]+a*p[9]),d['radius']]),f,p)-[u,v] for f,a,s,u,v in d['hubs']])
 p=least_squares(error,[4000,16,.12,750,535,0,0,0,d['track'],0],
  bounds=([900,5,.01,700,400,-.5,-.3,-.15,.65,-.04],[18000,110,.3,800,650,.5,.3,.15,1.0,.04]),xtol=1e-12,ftol=1e-12,gtol=1e-12,max_nfev=2000).x
 rms=float(np.sqrt(np.mean(error(p)**2)));print(id,'calibration',p.tolist(),'hub RMS',rms,flush=True)
 if rms>3:raise ValueError(f'{id}: camera reprojection RMS {rms:.1f}px needs correction')
 calibration={'parameters':p.tolist(),'hubRmsPixels':rms,'hubs':d['hubs'],'physicalDimensions':{k:d[k] for k in ['length','width','height','wheelbase','radius','track']}}
 (out/'calibration.json').write_text(json.dumps(calibration,indent=2)+'\n')
 contact=Image.new('RGB',(1500*2,660*3),(110,110,110))
 for i,f in enumerate([1,13,25,37,49,61]):
  im=Image.open(folder/f'{f}.png').convert('RGBA');background=Image.new('RGB',im.size,(110,110,110));background.paste(im,mask=im.getchannel('A'));draw=ImageDraw.Draw(background)
  for ff,a,s,u,v in d['hubs']:
   if ff!=f:continue
   q=project(np.array([a*d['wheelbase']/2,s*(p[8]+a*p[9]),d['radius']]),f,p);draw.ellipse((u-4,v-4,u+4,v+4),outline='red',width=2);draw.line((q[0]-8,q[1],q[0]+8,q[1]),fill='lime',width=1);draw.line((q[0],q[1]-8,q[0],q[1]+8),fill='lime',width=1)
  contact.paste(background,((i%2)*1500,(i//2)*660))
 contact.save(out/'calibration-preview.jpg')
 if calibrate_only:return
 frames=list(range(1,73,3));pictures=[np.asarray(Image.open(folder/f'{f}.png').convert('RGBA')) for f in frames]
 step=.024
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
 sdf=gaussian_filter(sdf.reshape(grid.shape[:-1]),.75)
 v,faces,n,_=marching_cubes(sdf,level=0,spacing=(step,step,step));v+=np.array([a[0] for a in axes])
 centres=v[faces].mean(1);normals=np.cross(v[faces[:,1]]-v[faces[:,0]],v[faces[:,2]]-v[faces[:,0]]);normals/=np.maximum(np.linalg.norm(normals,axis=1)[:,None],1e-9)
 if np.mean(np.sum(normals*(centres-[0,0,.7]),axis=1))<0:normals=-normals;faces=faces[:,::-1]
 # The public source cameras are projected at runtime and blended by viewing
 # direction. The mesh is indexed once; the unseen roof has its own paint.
 vertexNormals=np.zeros_like(v)
 for i in range(3):np.add.at(vertexNormals,faces[:,i],normals)
 vertexNormals/=np.maximum(np.linalg.norm(vertexNormals,axis=1)[:,None],1e-9)
 # Side/front references place the metal crown between the tops of the two
 # windscreens. Do not paint the shallow fastback rear glass as part of the roof.
 roof=(centres[:,2]>1.32)&(normals[:,2]>.74)&(centres[:,0]>-1.22)&(centres[:,0]<.28)
 # Fit the shallow crown continuously so the voxel surface does not introduce
 # concentric highlight steps. Shared boundary vertices move with the roof.
 roofVertices=np.unique(faces[roof]);rv=v[roofVertices];x,y=rv[:,0],rv[:,1]
 design=np.stack([np.ones(len(x)),x,y,x*x,x*y,y*y],axis=1)
 crown=np.linalg.lstsq(design,rv[:,2],rcond=None)[0]
 roofHeight=design@crown
 print(id,'continuous crown max correction mm',round(float(np.max(abs(roofHeight-rv[:,2])))*1000,2),flush=True)
 v[roofVertices,2]=roofHeight
 # High views cannot see the hood/rear deck from a side photograph. Use the
 # calibrated head-on photos for these upward-facing patches at every orbit.
 frontPhoto=(~roof)&(centres[:,0]>.28)&(centres[:,2]>.66)&(normals[:,2]>.25)&(abs(centres[:,1])<.78)
 rearPhoto=(~roof)&(centres[:,0]<-1.22)&(centres[:,2]>.72)&(normals[:,2]>.25)&(abs(centres[:,1])<.80)
 primitives=[]
 for name,mask,photo,cameraIndex in [('photo-volume',~roof&~frontPhoto&~rearPhoto,True,None),('front-upper-photo',frontPhoto,True,frames.index(55)),('rear-upper-photo',rearPhoto,True,frames.index(19)),('inferred-painted-roof',roof,False,None)]:
  selectedFaces=faces[mask];unique,inverse=np.unique(selectedFaces,return_inverse=True);verts=v[unique];ns=vertexNormals[unique]
  if not photo:
   x,y=verts[:,0],verts[:,1];ns=np.stack([-(crown[1]+2*crown[3]*x+crown[4]*y),-(crown[2]+crown[4]*x+2*crown[5]*y),np.ones(len(x))],axis=1);ns/=np.linalg.norm(ns,axis=1)[:,None]
  data=np.concatenate([verts,ns,np.zeros((len(verts),2))],axis=1).astype('<f4');indices=inverse.astype('<u4')
  primitive=dict(name=name,vertices=base64.b64encode(data.tobytes()).decode(),indices=base64.b64encode(indices.tobytes()).decode(),indexType=4,triangles=len(selectedFaces),bounds=dict(min=verts.min(0).tolist(),max=verts.max(0).tolist()),color=[1,1,1] if photo else [.76,.77,.77],paint=False,material=4 if photo else 0,alpha=1,photoProjected=photo)
  if cameraIndex is not None:primitive['photoCameraIndex']=cameraIndex
  primitives.append(primitive)
 cameras=[];textures=[]
 for frame,im in zip(frames,pictures):
  right,up,eye=basis(frame,p);b=io.BytesIO();Image.fromarray(im[:,:,:3]).save(b,format='JPEG',quality=90,subsampling=0)
  textures.append('data:image/jpeg;base64,'+base64.b64encode(b.getvalue()).decode())
  cameras.append(dict(eye=eye.tolist(),right=right.tolist(),up=up.tolist(),focal=float(p[0]),distance=float(p[1]),center=p[3:5].tolist(),offset=[float(p[5]),float(p[6]),0],width=im.shape[1],height=im.shape[0],textureIndex=len(textures)-1))
 result=dict(id=id,bounds=dict(min=v.min(0).tolist(),max=v.max(0).tolist()),triangles=len(faces),primitives=primitives,photoProjection=dict(cameras=cameras,textures=textures),source=dict(kind='photo-reconstruction',label='기아 공식 360도 이미지 · 실루엣 재구성',url=d['page'],configuration='24 unmodified Kia K5 Noblesse turntable frames, calibrated hub projections, volumetric silhouette intersection, camera-projected photo textures. Top roof is inferred paint. Not manufacturer CAD.',hubRmsPixels=rms))
 encoded=base64.b64encode(gzip.compress(json.dumps(result,separators=(',',':')).encode())).decode();(HERE/f'{id}-runtime.js').write_text('ManufacturerModels.registerCompressed('+json.dumps(encoded)+');\n',encoding='utf8')
 summary={**result,'photoProjection':{'cameras':cameras,'textureCount':len(textures)},'primitives':[{k:(len(value) if k=='texture' else value) for k,value in item.items() if k not in ['vertices','indices']} for item in primitives]}
 (HERE/f'{id}-runtime-summary.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf8')
 print(id,'geometry',len(v),len(faces),'bounds',v.min(0).tolist(),v.max(0).tolist(),'runtime MB',len(encoded)/1e6,flush=True)

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('ids',nargs='*',default=list(DEFINITIONS));parser.add_argument('--calibrate-only',action='store_true');args=parser.parse_args()
 for id in args.ids:build(id,args.calibrate_only)
