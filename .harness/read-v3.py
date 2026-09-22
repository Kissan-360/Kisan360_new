import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

prs = Presentation(r'C:\Users\RianH\OneDrive\Documents\Kisan360\Kisan360_SIH26132_Idea_PPT_v3.pptx')
print(f'Slides: {len(prs.slides)}')
print(f'Size: {prs.slide_width}x{prs.slide_height} EMU')
print(f'Inches: {prs.slide_width/914400:.1f}x{prs.slide_height/914400:.1f}')
print()

for i, slide in enumerate(prs.slides):
    print(f'===== SLIDE {i+1} =====')
    for j, shape in enumerate(slide.shapes):
        pos_in = f'({shape.left/914400:.1f},{shape.top/914400:.1f})'
        size_in = f'({shape.width/914400:.1f}x{shape.height/914400:.1f})'
        print(f'  [{j}] {shape.name}: type={shape.shape_type}, pos={pos_in}, size={size_in}')
        if shape.has_text_frame:
            for para in shape.text_frame.paragraphs:
                t = para.text.strip()
                if t:
                    print(f'       TEXT: "{t[:180]}"')
        if hasattr(shape, 'image'):
            print(f'       IMG: {shape.image.content_type} ({len(shape.image.blob)} bytes)')
        if shape.has_table:
            print(f'       TABLE: {len(shape.table.rows)} rows x {len(shape.table.columns)} cols')
            for r, row in enumerate(shape.table.rows):
                for c, cell in enumerate(row.cells):
                    if cell.text.strip():
                        print(f'         [{r},{c}]: "{cell.text.strip()[:80]}"')
    print()
