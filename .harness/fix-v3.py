import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pptx import Presentation
from pptx.util import Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN

OUT = r'C:\Users\RianH\OneDrive\Documents\Kisan360\Kisan360_SIH26132_Idea_PPT_v3.pptx'
prs = Presentation(OUT)

GREEN = RGBColor(0x04, 0x78, 0x57)
DARK = RGBColor(0x1C, 0x19, 0x17)
GRAY = RGBColor(0x57, 0x53, 0x4E)

def set_multiline(shape, lines, default_size=10, default_color=DARK):
    tf = shape.text_frame
    for p in tf.paragraphs:
        p.clear()
    for i, line_data in enumerate(lines):
        text = line_data[0]
        size = line_data[1] if len(line_data) > 1 else default_size
        bold = line_data[2] if len(line_data) > 2 else False
        color = line_data[3] if len(line_data) > 3 else default_color
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.space_after = Pt(4)
        run = p.add_run()
        run.text = text
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color

def set_text(shape, text, size=12, bold=False, color=DARK, align=PP_ALIGN.LEFT):
    tf = shape.text_frame
    for p in tf.paragraphs:
        p.clear()
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color

# =================================================================
# SLIDE 3: Fix tech stack text (find by content, not name)
# =================================================================
slide3 = prs.slides[2]
for shape in slide3.shapes:
    if shape.has_text_frame:
        full = shape.text_frame.text
        if 'Quality bar: 575' in full:
            set_multiline(shape, [
                ("Tech stack", 11, True, GREEN),
                ("", 3, False, DARK),
                ("React + Vite + Tailwind + TF.js (in-browser freshness grader).", 10, False, DARK),
                ("Node/Express API — 22 routes; Python FastAPI: net-realization, disease CNN, advisory RAG.", 10, False, DARK),
                ("AGMARKNET live + stamped snapshot; MongoDB Atlas with memory fallback; Groq LLM explains only.", 10, False, DARK),
            ])
            print("  Fixed Slide 3 tech stack")
            break

# =================================================================
# SLIDE 5: Fix duplicates and missing descriptions
# =================================================================
slide5 = prs.slides[4]

# Find and fix each shape by its position/name
for shape in slide5.shapes:
    if not shape.has_text_frame:
        continue
    
    # TextBox 17417: should be "Every metric labeled..." (was overwritten with quote)
    if shape.name == 'TextBox 17417':
        set_text(shape,
            "Every metric labeled: Live, Estimated, Assumption, or Simulated — never a guaranteed benefit.",
            size=9, color=GRAY, align=PP_ALIGN.CENTER)
        print("  Fixed Slide 5 honesty text")
    
    # TextBox 17422: should be "Better sale choice..." (was overwritten with "Farmer")
    if shape.name == 'TextBox 17422':
        set_text(shape,
            "Better sale choice per lot, backed by transparent net-realization evidence.",
            size=9, color=GRAY)
        print("  Fixed Slide 5 Farmer description")

# Save
prs.save(OUT)
print(f"\nSaved to {OUT}")
