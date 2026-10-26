import os,subprocess,moderngl, numpy as np, json,base64, re, io,sys,pathlib,math
from PIL import Image,ImageDraw
root=pathlib.Path(__file__).resolve().parents[3];here=root/'output/brake-public-qa'
ctx=moderngl.create_standalone_context(backend='egl')
src=subprocess.check_output(['git','show','3b3e29473d9ea2c8cdb4e3b39823f3c536d1c7e9:evolving_vehicles_2/vehicle-surfaces.js'],cwd=root,text=True) if os.environ.get('BRAKE_BASELINE') else (root/'evolving_vehicles_2/vehicle-surfaces.js').read_text()
here=here/('baseline' if os.environ.get('BRAKE_BASELINE') else 'candidate')
v=re.search(r'const vertex=`(.*?)`;',src,re.S)[1];f=re.search(r'const fragment=`(.*?)`;',src,re.S)[1]
def shader(s,frag=False):
 s=re.sub(r'precision highp float;','',s).replace('attribute ','in ').replace('varying ','in ' if frag else 'out ').replace('texture2D(','texture(')
 if frag:s='out vec4 fragmentColor;\n'+s.replace('gl_FragColor','fragmentColor')
 return '#version 330\n'+s
pr=ctx.program(vertex_shader=shader(v),fragment_shader=shader(f,True))
w,h=620,360;fb=ctx.simple_framebuffer((w,h));fb.use();ctx.enable(moderngl.DEPTH_TEST);ctx.depth_func='<='
def uniform(n,v):
 if n in pr:pr[n].value=v
for n,val in {'uModelScale':(1,1,1),'uModelOffset':(0,0,0),'uWheel':(0,0,0,0),'uCar':(0,0,0),'uPose':(0,0),'uTarget':(0,0,.85),'uCamera':(math.pi/2,.10,7,750),'uViewport':(w,h,w/2,h/2),'uClip':(.1,30),'uEye':(-7,0,1.55),'uPaint':(0,0,0,0),'uPhotoMode':False,'uTexture':0,'uFlakes':3,'uPhotoTextureA':1,'uPhotoTextureB':2}.items():uniform(n,val)
blank=ctx.texture((1,1),4,b'\xff'*4);blank.use(3);blank.use(1);blank.use(2)
images=[]
for id in sys.argv[1:]:
 d=json.loads((here/(id+'.json')).read_text());ps=[]
 for p in sorted(d['primitives'],key=lambda p:(bool(p.get('brakeLight',{}).get('overlay')),-p.get('alpha',1))):
  vs=np.frombuffer(base64.b64decode(p['vertices']),np.float32).reshape(-1,8)
  co=[.76,.79,.81] if p.get('paint') else [c*p.get('brakeLight',{}).get('restScale',1) for c in p['color']];mt=p['material'];a=np.column_stack([vs[:,:6],np.tile(co,(len(vs),1)),np.full(len(vs),mt),vs[:,6:8]]).astype('f4')
  idx=base64.b64decode(p['indices']);vbo=ctx.buffer(a.tobytes());ibo=ctx.buffer(idx)
  vao=ctx.vertex_array(pr,[(vbo,'3f 3f 3f 1f 2f','aPosition','aNormal','aColor','aMaterial','aUV')],ibo,index_element_size=p['indexType'])
  texture=p.get('texture');tex=None
  if texture:
   im=Image.open(io.BytesIO(base64.b64decode(texture.split(',')[1]))).convert('RGBA');tex=ctx.texture(im.size,4,im.tobytes());tex.build_mipmaps();tex.filter=(moderngl.LINEAR_MIPMAP_LINEAR,moderngl.LINEAR)
  ps.append((p,vao,tex))
 row=[]
 for intensity in [0,1]:
  fb.clear(.25,.3,.32,1,depth=1)
  for p,vao,tex in ps:
   brake=intensity if p.get('brakeLight') else 0
   if p.get('brakeLight',{}).get('overlay') and not brake:continue
   uniform('uBrake',brake);boost=p.get('brakeLight',{}).get('boost',0);uniform('uBrakeBoost',boost);alpha=p.get('alpha',1);alpha=alpha*brake if p.get('brakeLight',{}).get('overlay') else alpha+(1-alpha)*brake*boost;uniform('uOpacity',alpha);uniform('uHasTexture',bool(tex));uniform('uOpaqueTexture',p.get('textureOpaque',False))
   (tex or blank).use(0)
   if alpha<.99:ctx.enable(moderngl.BLEND);ctx.blend_func=(moderngl.SRC_ALPHA,moderngl.ONE_MINUS_SRC_ALPHA);fb.depth_mask=False
   else:ctx.disable(moderngl.BLEND);fb.depth_mask=True
   vao.render()
  fb.depth_mask=True
  im=Image.frombytes('RGB',(w,h),fb.read(components=3)).transpose(Image.Transpose.FLIP_TOP_BOTTOM)
  ImageDraw.Draw(im).text((10,8),id+(' BRAKE' if intensity else ' OFF'),fill='white');im.save(here/(id+('-on.png' if intensity else '-off.png')));row.append(im)
 joined=Image.new('RGB',(w*2,h));joined.paste(row[0],(0,0));joined.paste(row[1],(w,0));images.append(joined)
 for p,vao,tex in ps:
  vao.release()
  if tex:tex.release()
allim=Image.new('RGB',(w*2,h*len(images)))
for i,im in enumerate(images):allim.paste(im,(0,h*i))
allim.save(here/'native.png')
print(str(here/'native.png'))
