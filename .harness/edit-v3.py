import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

OUT = r'C:\Users\RianH\OneDrive\Documents\Kisan360\Kisan360_SIH26132_Idea_PPT_v3.pptx'
prs = Presentation(OUT)

GREEN = RGBColor(0x04, 0x78, 0x57)
DARK = RGBColor(0x1C, 0x19, 0x17)
GRAY = RGBColor(0x57, 0x53, 0x4E)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
AMBER = RGBColor(0xD9, 0x77, 0x06)
LIGHT_GREEN = RGBColor(0xEC, 0xFD, 0xF5)
BORDER_GREEN = RGBColor(0xD1, 0xFA, 0xE5)

def set_text(shape, text, size=12, bold=False, color=DARK, align=PP_ALIGN.LEFT):
    """Replace all text in a shape with a single styled run."""
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

def set_multiline(shape, lines, default_size=10, default_color=DARK):
    """Replace all text with multiple styled paragraphs. lines = [(text, size, bold, color), ...]"""
    tf = shape.text_frame
    for p in tf.paragraphs:
        p.clear()
    for i, line_data in enumerate(lines):
        text = line_data[0]
        size = line_data[1] if len(line_data) > 1 else default_size
        bold = line_data[2] if len(line_data) > 2 else False
        color = line_data[3] if len(line_data) > 3 else default_color
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        p.space_after = Pt(4)
        run = p.add_run()
        run.text = text
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color

# =================================================================
# SLIDE 1: Fix Team ID only
# =================================================================
slide1 = prs.slides[0]
for shape in slide1.shapes:
    if shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            if 'TBD' in para.text:
                for run in para.runs:
                    if 'TBD' in run.text:
                        run.text = run.text.replace('TBD', 'TEAM_ID_HERE')
                        run.font.color.rgb = RGBColor(0xD9, 0x77, 0x06)
                        print("  Fixed Team ID")

print("Slide 1: Done")

# =================================================================
# SLIDE 2: Tighten text + make inversion graphic the hero
# =================================================================
slide2 = prs.slides[1]

# Find the main text block (TextBox 8) and tighten it
for shape in slide2.shapes:
    if shape.name == 'TextBox 8' and shape.has_text_frame:
        # Replace dense text with tight 2-bullet problem + one-liner solution
        set_multiline(shape, [
            ("Idea in one line", 11, True, GREEN),
            ("", 4, False, DARK),
            ("Kisan360 shows where a lot will actually realize the most — not just the highest headline mandi price — then connects that decision to buyers, offers and payment.", 10, False, DARK),
            ("", 4, False, DARK),
            ("The problem (PS 26132)", 11, True, GREEN),
            ("", 4, False, DARK),
            ("~86% of holdings are small & marginal — they distress-sell at harvest with weak bargaining power.", 10, False, DARK),
            ("The highest mandi price can leave the farmer with less money after transport, loading, and fees.", 10, False, DARK),
            ("", 4, False, DARK),
            ("Why it wins", 11, True, GREEN),
            ("", 4, False, DARK),
            ("Deterministic net ranking. Buyer coverage. Lot → offer → escrow → receipt. FPO pooling. AGMARK grading with trained vision model.", 10, False, DARK),
        ])
        print("  Tightened text block")

# The ranking example (shapes 9-21) is already the visual hero — keep it
# Just update the bottom explanation text to be shorter
for shape in slide2.shapes:
    if shape.name == 'TextBox 15377' and shape.has_text_frame:
        set_text(shape,
            "Same mandi tops both price and take-home today. Edge vs next-best (APMC Bhusaval): +₹770/q.",
            size=9, color=GRAY)
        print("  Shortened ranking explanation")

print("Slide 2: Done")

# =================================================================
# SLIDE 3: Add maturity badges under the flow diagram
# =================================================================
slide3 = prs.slides[2]

# Add 3 green pill badges below the architecture flow diagram
# Flow diagram ends at y≈2.3 (the last shapes are at y=2.5)
# Badges go at y≈3.5, just above the data flow text
badge_y = Emu(3100000)  # ~3.4 inches
badge_h = Emu(350000)   # ~0.38 inches
badge_w = Emu(1400000)  # ~1.5 inches

badges = [
    ("TRL 6", 0.8),
    ("577 tests · 0 failures", 2.8),
    ("22 API routes", 4.8),
]

for text, x_inches in badges:
    badge = slide3.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE,
        Inches(x_inches), badge_y, badge_w, badge_h
    )
    badge.fill.solid()
    badge.fill.fore_color.rgb = GREEN
    badge.line.fill.background()
    tf = badge.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = text
    run.font.size = Pt(11)
    run.font.bold = True
    run.font.color.rgb = WHITE

# Also add a "575 tests green" note to the tech stack text
for shape in slide3.shapes:
    if shape.name == 'TextBox 23' and shape.has_text_frame:
        set_multiline(shape, [
            ("Tech stack", 11, True, GREEN),
            ("", 3, False, DARK),
            ("React + Vite + Tailwind + TF.js (in-browser freshness grader).", 10, False, DARK),
            ("Node/Express API — 22 routes; Python FastAPI: net-realization, disease CNN, advisory RAG.", 10, False, DARK),
            ("AGMARKNET live + stamped snapshot; MongoDB Atlas with memory fallback; Groq LLM explains only.", 10, False, DARK),
        ])
        print("  Tightened tech stack text, added badges")

print("Slide 3: Done")

# =================================================================
# SLIDE 4: Restructure risks as Risk → Mitigation → Screen Proof
# =================================================================
slide4 = prs.slides[3]

# Replace the text block with structured risk cards
for shape in slide4.shapes:
    if shape.name == 'TextBox 8' and shape.has_text_frame:
        set_multiline(shape, [
            ("Feasibility — prototype runs today", 12, True, GREEN),
            ("", 4, False, DARK),
            ("Full journey clickable: dashboard → ranking → lot → offer → buyer accept → payment → receipt.", 10, False, DARK),
            ("Deployable per-district over AGMARKNET/eNAM, nothing to replace.", 10, False, DARK),
            ("", 6, False, DARK),
            ("Risks — and where the screen says so", 11, True, GREEN),
            ("", 4, False, DARK),
            ("1. AGMARKNET API down → stamped snapshot fallback, UI badge says \"CACHED\"", 10, False, DARK),
            ("   → visible on every price card as source + age", 9, False, GRAY),
            ("", 3, False, DARK),
            ("2. Transport/storage costs are assumptions → every assumption tagged on-screen", 10, False, DARK),
            ("   → \"Assumption\" label next to each cost item in the calculator", 9, False, GRAY),
            ("", 3, False, DARK),
            ("3. Buyers & payments are simulated → 4-tier trust labels + \"SIMULATED\" banners", 10, False, DARK),
            ("   → red SIMULATED badge on every payment and offer card", 9, False, GRAY),
        ])
        print("  Restructured risks with screen-proof mapping")

print("Slide 4: Done")

# =================================================================
# SLIDE 5: Already well-structured — minor tightening
# =================================================================
slide5 = prs.slides[4]

# Tighten the honesty card text
for shape in slide5.shapes:
    if shape.name == 'TextBox 17417' and shape.has_text_frame:
        set_text(shape,
            "\"Estimated decision difference — not an income guarantee.\"",
            size=11, bold=True, color=DARK, align=PP_ALIGN.CENTER)
    if shape.name == 'TextBox 17418' and shape.has_text_frame:
        set_text(shape,
            "Every metric labeled: Live, Estimated, Assumption, or Simulated — never a guaranteed benefit.",
            size=9, color=GRAY, align=PP_ALIGN.CENTER)

# Tighten beneficiary descriptions
tight_benefits = {
    'TextBox 17422': ("Farmer", 11, True, DARK),
    'TextBox 17423': ("Better sale choice per lot, backed by transparent net-realization evidence.", 9, False, GRAY),
    'TextBox 17426': ("FPO", 11, True, DARK),
    'TextBox 17427': ("Bulk transport tier + buyer minimums unlocked through 50q+ pooling.", 9, False, GRAY),
    'TextBox 17431': ("Buyer", 11, True, DARK),
    'TextBox 17432': ("Aggregated, AGMARK-graded lots — lower sourcing risk.", 9, False, GRAY),
    'TextBox 17436': ("Government", 11, True, DARK),
    'TextBox 17437': ("Decision layer built on public AGMARKNET data; new district = data entry.", 9, False, GRAY),
}
for shape in slide5.shapes:
    if shape.name in tight_benefits and shape.has_text_frame:
        text, size, bold, color = tight_benefits[shape.name]
        set_text(shape, text, size=size, bold=bold, color=color)

print("Slide 5: Done")

# =================================================================
# SLIDE 6: Keep as-is (references, boring on purpose)
# =================================================================
print("Slide 6: Kept as-is")

# Save
prs.save(OUT)
print(f"\nSaved to {OUT}")
