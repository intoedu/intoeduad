"""인투유학 로고 생성: 심볼(지구본 + 날아 들어가는 종이비행기) + 글자(인투유학 / INTOEDU)
글자는 Pretendard(OFL) 윤곽선으로 바꿔 넣어 SVG만으로 어디서나 똑같이 보이게 한다."""
import sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONTS = Path(sys.argv[1])
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)

NAVY = "#0f2a6b"
BLUE = "#1d4ed8"
SKY = "#38bdf8"
WHITE = "#ffffff"


def text_path(font_file, text, size, x, y, tracking=0.0):
    """글자를 SVG path로. (x, y) = 왼쪽 기준선. 반환: (path d, 너비)"""
    font = TTFont(FONTS / font_file)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    scale = size / upm
    pen = SVGPathPen(gs)
    cx = 0.0
    for ch in text:
        name = cmap.get(ord(ch))
        if name is None:
            continue
        tpen = TransformPen(pen, (scale, 0, 0, -scale, x + cx, y))
        gs[name].draw(tpen)
        cx += gs[name].width * scale + tracking
    return pen.getCommands(), cx - tracking


def symbol(cx, cy, r, bg=BLUE, fg=WHITE, accent=SKY):
    """원형 심볼: 파란 원 안에 지구본(테두리·자오선·적도) + 궤도를 따라 들어가는 종이비행기"""
    s = r / 100.0  # 기준 반지름 100
    g = []
    g.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{bg}"/>')
    # 지구본
    gr = 50 * s
    gx, gy = cx - 8 * s, cy + 8 * s
    sw = 7 * s
    g.append(f'<g fill="none" stroke="{fg}" stroke-width="{sw:.2f}" stroke-linecap="round">')
    g.append(f'<circle cx="{gx:.2f}" cy="{gy:.2f}" r="{gr:.2f}"/>')
    g.append(f'<ellipse cx="{gx:.2f}" cy="{gy:.2f}" rx="{gr*0.45:.2f}" ry="{gr:.2f}"/>')
    g.append(f'<line x1="{gx-gr:.2f}" y1="{gy:.2f}" x2="{gx+gr:.2f}" y2="{gy:.2f}"/>')
    g.append('</g>')
    # 궤도(하늘색 곡선): 왼쪽 아래에서 시작해 지구본 오른쪽 위로
    g.append(
        f'<path d="M {cx-70*s:.2f} {cy+42*s:.2f} C {cx-40*s:.2f} {cy+84*s:.2f}, {cx+66*s:.2f} {cy+40*s:.2f}, {cx+46*s:.2f} {cy-24*s:.2f}" '
        f'fill="none" stroke="{accent}" stroke-width="{8*s:.2f}" stroke-linecap="round"/>'
    )
    # 종이비행기(궤도 끝, 위로 향함)
    px, py = cx + 42 * s, cy - 42 * s
    k = 0.8
    pts = [(px + 26 * k * s, py - 22 * k * s), (px - 26 * k * s, py - 2 * k * s), (px - 4 * k * s, py + 4 * k * s), (px + 2 * k * s, py + 26 * k * s)]
    poly = " ".join(f"{a:.2f},{b:.2f}" for a, b in pts)
    g.append(f'<polygon points="{poly}" fill="{fg}" stroke="{bg}" stroke-width="{3*s:.2f}" stroke-linejoin="round"/>')
    fold = f"{px+26*k*s:.2f},{py-22*k*s:.2f} {px-4*k*s:.2f},{py+4*k*s:.2f} {px+2*k*s:.2f},{py+26*k*s:.2f}"
    g.append(f'<polygon points="{fold}" fill="#dbeafe"/>')
    return "\n".join(g)


def svg(w, h, body, bg=None):
    rect = f'<rect width="{w}" height="{h}" fill="{bg}"/>' if bg else ""
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{rect}{body}</svg>\n'


# 1) 심볼만
(OUT / "intoedu-symbol.svg").write_text(svg(512, 512, symbol(256, 256, 240)))

# 2) 가로형 로고 (심볼 + 인투유학 + INTOEDU)
d_ko, w_ko = text_path("Pretendard-ExtraBold.otf", "인투유학", 150, 330, 205)
d_en, w_en = text_path("Pretendard-SemiBold.otf", "INTOEDU", 46, 336, 275, tracking=9)
W = int(330 + max(w_ko, w_en) + 40)
body = symbol(150, 160, 130) + f'<path d="{d_ko}" fill="{NAVY}"/><path d="{d_en}" fill="{BLUE}"/>'
(OUT / "intoedu-logo-horizontal.svg").write_text(svg(W, 320, body))
body_w = symbol(150, 160, 130, bg=WHITE, fg=BLUE, accent=SKY) + f'<path d="{d_ko}" fill="{WHITE}"/><path d="{d_en}" fill="#bfdbfe"/>'
(OUT / "intoedu-logo-horizontal-dark.svg").write_text(svg(W, 320, body_w, bg=NAVY))

# 3) 카카오톡 채널 프로필(정사각형, 원으로 잘려도 내용이 원 안에 들어가게 가운데 정렬)
S = 1024
sym = symbol(S / 2, 392, 230, bg=WHITE, fg=BLUE, accent=SKY)
d_k, w_k = text_path("Pretendard-ExtraBold.otf", "인투유학", 150, 0, 0)
d_k, w_k = text_path("Pretendard-ExtraBold.otf", "인투유학", 150, (S - w_k) / 2, 790)
d_e, w_e = text_path("Pretendard-SemiBold.otf", "INTOEDU", 50, 0, 0, tracking=10)
d_e, w_e = text_path("Pretendard-SemiBold.otf", "INTOEDU", 50, (S - w_e) / 2, 868, tracking=10)
body = sym + f'<path d="{d_k}" fill="{WHITE}"/><path d="{d_e}" fill="#bfdbfe"/>'
(OUT / "intoedu-kakao-profile.svg").write_text(svg(S, S, body, bg=BLUE))

# 원으로 잘렸을 때 미리 보기
preview = (
    f'<defs><clipPath id="c"><circle cx="{S/2}" cy="{S/2}" r="{S/2}"/></clipPath></defs>'
    f'<g clip-path="url(#c)"><rect width="{S}" height="{S}" fill="{BLUE}"/>{body}</g>'
)
(OUT / "intoedu-kakao-profile-circle-preview.svg").write_text(svg(S, S, preview))
print("ok", W)
