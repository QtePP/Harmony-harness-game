from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path
ROOT=str(Path(__file__).resolve().parent.parent)
W,H=1080,1920
TOP=(251,247,240); BOT=(239,228,211)
INK=(34,27,21); RED=(142,47,42); MUTED=(111,98,85); GOLD=(176,138,90)
FONT='/System/Library/Fonts/STHeiti Medium.ttc'
TITLE_FONT='/System/Library/Fonts/Supplemental/Songti.ttc'
SEAL=Image.open(f'{ROOT}/entry/src/main/resources/base/media/seal.png').convert('RGBA')

def f(path,size):
    return ImageFont.truetype(path,size,index=0)

def lerp(a,b,t): return tuple(round(a[i]+(b[i]-a[i])*t) for i in range(3))

def bg():
    im=Image.new('RGB',(W,H))
    d=ImageDraw.Draw(im)
    for y in range(H):
        d.line((0,y,W,y), fill=lerp(TOP,BOT,y/H))
    return im

def spaced(d,xy,text,font,fill,spacing=2):
    x,y=xy
    for ch in text:
        d.text((x,y),ch,font=font,fill=fill)
        x += d.textlength(ch,font=font)+spacing

def card(src, headline, sub, out):
    im=bg().convert('RGBA')
    d=ImageDraw.Draw(im)
    # soft red wash top right
    wash=Image.new('RGBA',(W,H),(0,0,0,0))
    wd=ImageDraw.Draw(wash); wd.ellipse((740,-260,1320,320), fill=(142,47,42,12))
    im=Image.alpha_composite(im,wash); d=ImageDraw.Draw(im)
    # brand
    im.alpha_composite(SEAL.resize((100,100),Image.LANCZOS),(72,64))
    d.text((196,72),'三国人生',font=f(TITLE_FONT,58),fill=INK)
    spaced(d,(200,150),'SANGUO LIFE',f(FONT,18),RED,3)
    d.line((72,190,300,190),fill=(142,47,42,90),width=3)
    # headline
    y=258
    for line in headline.split('\n'):
        d.text((90,y),line,font=f(FONT,80),fill=INK)
        y += 98
    d.text((94,y+8),sub,font=f(FONT,30),fill=MUTED)
    # phone shadow
    sh=Image.new('RGBA',(W,H),(0,0,0,0))
    ImageDraw.Draw(sh).rounded_rectangle((210,540,870,1856),radius=64,fill=(0,0,0,70))
    sh=sh.filter(ImageFilter.GaussianBlur(26))
    im=Image.alpha_composite(im,sh)
    # phone frame
    frame=Image.new('RGBA',(660,1316),(0,0,0,0))
    fd=ImageDraw.Draw(frame)
    fd.rounded_rectangle((0,0,660,1316),radius=64,fill=(27,23,19,255))
    fd.rounded_rectangle((24,24,636,1292),radius=48,fill=(10,9,8,255))
    shot=Image.open(src).convert('RGB').resize((600,1234),Image.LANCZOS)
    mask=Image.new('L',(600,1234),0)
    ImageDraw.Draw(mask).rounded_rectangle((0,0,600,1234),radius=44,fill=255)
    frame.paste(shot,(30,30),mask)
    im.alpha_composite(frame,(210,540))
    # footer
    d=ImageDraw.Draw(im)
    d.text((90,1878),'HarmonyOS · 本机运行 · 无 WebView · 无投屏',font=f(FONT,20),fill=MUTED)
    d.text((930,1876),'汉',font=f(TITLE_FONT,30),fill=(142,47,42,180))
    im.convert('RGB').save(out,quality=95)
    print(out)

cards=[
 ('01-board.png','一局三国，\n从五岁开始','名望、信义、人才，和一次待判定的选择。'),
 ('02-chat.png','照史载走，\n或者离开它','十二个岔路口，每一步都由引擎判定。'),
 ('03-trace.png','引擎裁判，\n模型叙述','骰子、数值、势力，全部来自本地引擎。'),
 ('04-settings.png','密钥只存本机，\n模型权限归你','ACP 流式、三档权限、能力开关。'),
]
for name,h,s in cards:
    card(f'{ROOT}/store-assets/screenshots/{name}',h,s,f'{ROOT}/store-assets/marketing/{name}')
