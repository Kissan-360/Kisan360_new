import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.enum.dml import MSO_THEME_COLOR

prs = Presentation(r'C:\Users\RianH\OneDrive\Documents\Kisan360\Kisan360_SIH26132_Idea_PPT_v3.pptx')
print(f'Slides: {len(prs.slides)}, Size: {prs.slide_width}x{prs.slide_height}')

# Analyze slide 1 template structure
slide1 = prs.slides[0]
print('\n=== SLIDE 1 STRUCTURE ===')
for shape in slide1.shapes:
    info = f'  {shape.name}: type={shape.shape_type}, pos=({shape.left},{shape.top}), size=({shape.width},{shape.height})'
    if shape.has_text_frame:
        texts = []
        for para in shape.text_frame.paragraphs:
            t = para.text.strip()
            if t:
                texts.append(t[:120])
        info += f'\n    Texts: {texts}'
        # Check first run's font
        for para in shape.text_frame.paragraphs:
            for run in para.runs:
                if run.text.strip():
                    try:
                        color = run.font.color.rgb if run.font.color and run.font.color.type is not None else 'scheme'
                    except:
                        color = 'scheme'
                    info += f'\n    Font: size={run.font.size}, bold={run.font.bold}, color={color}'
                    break
            break
    if hasattr(shape, 'image'):
        info += f'\n    Image: {shape.image.content_type}, {len(shape.image.blob)} bytes'
    print(info)

# Check slide backgrounds
print('\n=== BACKGROUNDS ===')
for i, slide in enumerate(prs.slides):
    bg = slide.background
    print(f'  Slide {i+1}: fill type={bg.fill.type if bg.fill else "none"}')

# Check if there are layouts we can reuse
print('\n=== LAYOUTS ===')
for i, layout in enumerate(prs.slide_layouts):
    print(f'  Layout {i}: {layout.name}')
