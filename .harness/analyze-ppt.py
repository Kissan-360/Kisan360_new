import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor

prs = Presentation(r'C:\Users\RianH\OneDrive\Documents\Kisan360\Kisan360_SIH26132_Idea_PPT_v3.pptx')
print(f'Total slides: {len(prs.slides)}')
print(f'Slide dimensions: {prs.slide_width} x {prs.slide_height} (16:9={prs.slide_width/prs.slide_height:.2f})')
print()

for i, slide in enumerate(prs.slides):
    print(f'=== Slide {i+1} ===')
    for shape in slide.shapes:
        print(f'  Shape: type={shape.shape_type}, name="{shape.name}", pos=({shape.left},{shape.top}), size=({shape.width},{shape.height})')
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                for run in para.runs:
                    font = run.font
                    color_str = 'inherit'
                    if font.color and font.color.rgb:
                        color_str = str(font.color.rgb)
                    print(f'    Text: "{run.text[:100]}" size={font.size}, bold={font.bold}, color={color_str}')
        if hasattr(shape, 'image'):
            print(f'    Image: {shape.image.content_type}, {len(shape.image.blob)} bytes')
    print()
