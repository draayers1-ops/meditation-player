from PIL import Image, ImageDraw, ImageFilter
import math
BG=(15,23,42)  # #0f172a
def grad_circle(size, radius_frac, bg_full=True):
    S=size*4
    img=Image.new("RGBA",(S,S),BG+(255,))
    # soft glow
    glow=Image.new("RGBA",(S,S),(0,0,0,0)); g=ImageDraw.Draw(glow)
    c=S/2; r=S*radius_frac
    g.ellipse([c-r*1.15,c-r*1.15,c+r*1.15,c+r*1.15],fill=(129,140,248,90))
    glow=glow.filter(ImageFilter.GaussianBlur(S*0.04)); img.alpha_composite(glow)
    # gradient disc (teal -> lavender, top to bottom)
    grad=Image.new("RGBA",(S,S))
    top=(94,234,212); bot=(165,140,255)
    px=grad.load()
    for y in range(S):
        t=y/(S-1); col=tuple(int(top[i]*(1-t)+bot[i]*t) for i in range(3))+(255,)
        for x in range(S): px[x,y]=col
    mask=Image.new("L",(S,S),0); ImageDraw.Draw(mask).ellipse([c-r,c-r,c+r,c+r],fill=255)
    img.paste(grad,(0,0),mask)
    # inner calm ring
    d=ImageDraw.Draw(img); ri=r*0.45; w=int(S*0.012)
    d.ellipse([c-ri,c-ri,c+ri,c+ri],outline=(255,255,255,200),width=w)
    return img.resize((size,size),Image.LANCZOS)
grad_circle(192,0.40).save("icons/icon-192.png")
grad_circle(512,0.40).save("icons/icon-512.png")
grad_circle(512,0.30).save("icons/icon-maskable-512.png")  # content within safe zone
grad_circle(180,0.40).convert("RGB").save("icons/apple-touch-icon.png")
