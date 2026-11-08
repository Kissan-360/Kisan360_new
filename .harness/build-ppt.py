import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

SHOTS = r'C:\Users\RianH\OneDrive\Documents\Kisan360\.harness\shots'
OUT = r'C:\Users\RianH\OneDrive\Documents\Kisan360\Kisan360_SIH26132_Idea_PPT_v3.pptx'

# Use v3 as template base (preserves SIH template design)
prs = Presentation(OUT)

# Colors matching the SIH template
GREEN = RGBColor(0x04, 0x78, 0x57)      # emerald-700 (primary)
DARK = RGBColor(0x1C, 0x19, 0x17)       # stone-900
GRAY = RGBColor(0x57, 0x53, 0x4E)       # stone-600
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
LIGHT_BG = RGBColor(0xF5, 0xF5, 0xF4)   # stone-100
ACCENT = RGBColor(0xDC, 0x26, 0x26)     # red-600 (for warnings/important)

W = prs.slide_width   # 12192000 EMU
H = prs.slide_height  # 6858000 EMU

def add_bg(slide, color=LIGHT_BG):
    """Set slide background color."""
    bg = slide.background
    fill = bg.fill
    fill.solid()
    fill.fore_color.rgb = color

def add_rect(slide, left, top, width, height, fill_color=None, line_color=None):
    shape = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)
    shape.line.fill.background()
    if fill_color:
        shape.fill.solid()
        shape.fill.fore_color.rgb = fill_color
    if line_color:
        shape.line.color.rgb = line_color
        shape.line.width = Pt(1)
    return shape

def add_text_box(slide, left, top, width, height, text, size=14, bold=False, color=DARK, align=PP_ALIGN.LEFT):
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.alignment = align
    run = p.add_run()
    run.text = text
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = color
    return txBox

def add_multi_text(slide, left, top, width, height, lines, default_size=12, default_color=DARK):
    """Add a text box with multiple styled paragraphs. lines = [(text, size, bold, color), ...]"""
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    for i, line_data in enumerate(lines):
        if isinstance(line_data, str):
            text, size, bold, color = line_data, default_size, False, default_color
        else:
            text = line_data[0]
            size = line_data[1] if len(line_data) > 1 else default_size
            bold = line_data[2] if len(line_data) > 2 else False
            color = line_data[3] if len(line_data) > 3 else default_color
        if i == 0:
            p = tf.paragraphs[0]
        else:
            p = tf.add_paragraph()
        run = p.add_run()
        run.text = text
        run.font.size = Pt(size)
        run.font.bold = bold
        run.font.color.rgb = color
        p.space_after = Pt(4)
    return txBox

# ============================================================
# SLIDE 1: TITLE
# ============================================================
slide1 = prs.slides[0]
# Keep existing template shapes (logo, green panel, freeform)
# Just update the text content

# Update tagline to be bigger
for shape in slide1.shapes:
    if shape.has_text_frame:
        for para in shape.text_frame.paragraphs:
            full_text = para.text.strip()
            if 'Find where' in full_text:
                for run in para.runs:
                    run.font.size = Pt(24)
                    run.font.bold = True
                    run.font.color.rgb = GREEN
            if 'Team ID : TBD' in full_text:
                for run in para.runs:
                    if 'TBD' in run.text:
                        run.text = run.text.replace('TBD', 'TEAM_ID_HERE')
                        run.font.color.rgb = ACCENT

print("Slide 1: Title updated")

# ============================================================
# SLIDE 2: PROBLEM -> SOLUTION (rebuild from blank)
# ============================================================
slide2 = prs.slides[1]
# Remove all existing shapes
shapes_to_remove = list(slide2.shapes)
for shape in shapes_to_remove:
    sp = shape._element
    sp.getparent().remove(sp)

add_bg(slide2, WHITE)

# Section label
add_text_box(slide2, Inches(0.5), Inches(0.3), Inches(9), Inches(0.3),
             'THE PROBLEM & WHAT WE BUILT', size=9, bold=True, color=GREEN)

# Main headline
add_text_box(slide2, Inches(0.5), Inches(0.6), Inches(5.5), Inches(0.6),
             "Farmers lose 20-40% because they can't see the real price.", size=22, bold=True, color=DARK)

# Problem bullets (left column)
problem_lines = [
    ("86% of Indian farms are small & marginal (<2 ha)", 11, True, DARK),
    ("They sell at the nearest mandi out of compulsion", 10, False, GRAY),
    ("Headline price minus transport/loading/fees = actual take-home", 10, False, GRAY),
    ("The highest price can leave less money in your pocket", 10, False, GRAY),
]
add_multi_text(slide2, Inches(0.5), Inches(1.4), Inches(5.5), Inches(1.8), problem_lines)

# Solution
add_text_box(slide2, Inches(0.5), Inches(3.0), Inches(5.5), Inches(0.3),
             'WHAT KISAN360 DOES', size=9, bold=True, color=GREEN)

solution_lines = [
    ("5-step selling journey: prices -> compare -> decide -> trade -> receipt", 11, True, DARK),
    ("Live AGMARKNET data across 70 Maharashtra mandis, 33 crops", 10, False, GRAY),
    ("Deterministic net-realization calculator: every cost item documented", 10, False, GRAY),
    ("AI crop grading on the farmer's phone (99.2% accuracy, TF.js)", 10, False, GRAY),
]
add_multi_text(slide2, Inches(0.5), Inches(3.3), Inches(5.5), Inches(1.8), solution_lines)

# Key stat cards (bottom)
card_y = Inches(5.0)
card_h = Inches(1.2)
card_w = Inches(2.6)
stats = [
    ("86%", "Small farmers\n(<2 ha)"),
    ("70", "Maharashtra\nmandis live"),
    ("33", "Crops\ntracked"),
    ("3", "Languages\n(MR/HI/EN)"),
]
for i, (num, label) in enumerate(stats):
    x = Inches(0.5 + i * 2.85)
    card = add_rect(slide2, x, card_y, card_w, card_h, fill_color=RGBColor(0xEC, 0xFD, 0xF5))
    card.line.color.rgb = RGBColor(0xD1, 0xFA, 0xE5)
    card.line.width = Pt(1)
    add_text_box(slide2, x + Inches(0.15), card_y + Inches(0.1), card_w - Inches(0.3), Inches(0.5),
                 num, size=28, bold=True, color=GREEN, align=PP_ALIGN.CENTER)
    add_text_box(slide2, x + Inches(0.15), card_y + Inches(0.6), card_w - Inches(0.3), Inches(0.5),
                 label, size=9, color=GRAY, align=PP_ALIGN.CENTER)

# Screenshot on right
img_path = os.path.join(SHOTS, 'ppt-landing.png')
slide2.shapes.add_picture(img_path, Inches(6.8), Inches(0.5), Inches(5.0), Inches(6.0))

print("Slide 2: Problem -> Solution rebuilt")

# ============================================================
# SLIDE 3: HOW IT WORKS (5-step journey)
# ============================================================
slide3 = prs.slides[2]
shapes_to_remove = list(slide3.shapes)
for shape in shapes_to_remove:
    sp = shape._element
    sp.getparent().remove(sp)

add_bg(slide3, WHITE)

add_text_box(slide3, Inches(0.5), Inches(0.3), Inches(9), Inches(0.3),
             'HOW IT WORKS', size=9, bold=True, color=GREEN)

add_text_box(slide3, Inches(0.5), Inches(0.6), Inches(11), Inches(0.6),
             "The farmer's selling journey — from confusion to cash", size=22, bold=True, color=DARK)

# 5 steps as horizontal flow
steps = [
    ("1", "INFORM", "See live mandi\nprices on dashboard", "ppt-dashboard.png"),
    ("2", "COMPARE", "Net-realization ranks\nmandis by take-home", "ppt-netreal.png"),
    ("3", "DECIDE", "Sell now / store /\nFPO pool", "ppt-grade.png"),
    ("4", "CONNECT", "Buyer matching with\ntrust tiers", "ppt-trade.png"),
    ("5", "EXECUTE", "Offer -> escrow\n-> receipt", "ppt-trade.png"),
]

step_w = Inches(2.0)
step_h = Inches(3.5)
start_x = Inches(0.4)
step_y = Inches(1.5)

for i, (num, title, desc, img_file) in enumerate(steps):
    x = start_x + i * Inches(2.3)

    # Step number circle
    circle = slide3.shapes.add_shape(MSO_SHAPE.OVAL, x + Inches(0.7), step_y, Inches(0.5), Inches(0.5))
    circle.fill.solid()
    circle.fill.fore_color.rgb = GREEN
    circle.line.fill.background()
    tf = circle.text_frame
    tf.word_wrap = False
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    run = p.add_run()
    run.text = num
    run.font.size = Pt(18)
    run.font.bold = True
    run.font.color.rgb = WHITE

    # Step title
    add_text_box(slide3, x, step_y + Inches(0.6), step_w, Inches(0.3),
                 title, size=13, bold=True, color=DARK, align=PP_ALIGN.CENTER)

    # Description
    add_text_box(slide3, x, step_y + Inches(0.95), step_w, Inches(0.6),
                 desc, size=9, color=GRAY, align=PP_ALIGN.CENTER)

    # Screenshot thumbnail
    img_path = os.path.join(SHOTS, img_file)
    slide3.shapes.add_picture(img_path, x + Inches(0.05), step_y + Inches(1.6), Inches(1.9), Inches(1.4))

    # Arrow between steps (except last)
    if i < 4:
        arrow_x = x + step_w + Inches(0.05)
        add_text_box(slide3, arrow_x, step_y + Inches(0.1), Inches(0.3), Inches(0.3),
                     "->", size=16, bold=True, color=GREEN, align=PP_ALIGN.CENTER)

# Bottom note
add_text_box(slide3, Inches(0.5), Inches(5.8), Inches(11), Inches(0.5),
             "Every number carries source + timestamp + assumption tags. Simulated parts are labeled 'DEMO'.",
             size=9, color=GRAY, align=PP_ALIGN.CENTER)

print("Slide 3: How It Works rebuilt")

# ============================================================
# SLIDE 4: TECHNICAL DEPTH (the numbers slide)
# ============================================================
slide4 = prs.slides[3]
shapes_to_remove = list(slide4.shapes)
for shape in shapes_to_remove:
    sp = shape._element
    sp.getparent().remove(sp)

add_bg(slide4, WHITE)

add_text_box(slide4, Inches(0.5), Inches(0.3), Inches(9), Inches(0.3),
             'TECHNICAL DEPTH', size=9, bold=True, color=GREEN)

add_text_box(slide4, Inches(0.5), Inches(0.6), Inches(11), Inches(0.6),
             "Built for correctness, not just demos", size=22, bold=True, color=DARK)

# 4 big numbers (top row)
big_stats = [
    ("577", "Backend tests\n0 failures"),
    ("33", "Crops tracked\n70 mandis"),
    ("99.2%", "ML accuracy\n23,609 images"),
    ("1,221", "Keys per language\n3 languages"),
]
for i, (num, label) in enumerate(big_stats):
    x = Inches(0.5 + i * 2.85)
    card = add_rect(slide4, x, Inches(1.4), Inches(2.6), Inches(1.4), fill_color=RGBColor(0xEC, 0xFD, 0xF5))
    card.line.color.rgb = RGBColor(0xD1, 0xFA, 0xE5)
    card.line.width = Pt(1)
    add_text_box(slide4, x + Inches(0.1), Inches(1.5), Inches(2.4), Inches(0.6),
                 num, size=32, bold=True, color=GREEN, align=PP_ALIGN.CENTER)
    add_text_box(slide4, x + Inches(0.1), Inches(2.05), Inches(2.4), Inches(0.6),
                 label, size=10, color=GRAY, align=PP_ALIGN.CENTER)

# Architecture (left bottom)
add_text_box(slide4, Inches(0.5), Inches(3.2), Inches(5.5), Inches(0.3),
             'ARCHITECTURE', size=9, bold=True, color=GREEN)

arch_lines = [
    ("React + Vite + Tailwind + TF.js (in-browser grader)", 10, False, DARK),
    ("Node/Express API — 22 routes, MongoDB Atlas", 10, False, DARK),
    ("Python FastAPI: net-realization, disease CNN, advisory RAG", 10, False, DARK),
    ("AGMARKNET live + stamped snapshot; Groq LLM explains only", 10, False, DARK),
    ("3 services on Render: web (static), API (Node), calc (Python)", 10, False, DARK),
]
add_multi_text(slide4, Inches(0.5), Inches(3.5), Inches(5.5), Inches(2.5), arch_lines)

# Grade screenshot (right bottom)
img_path = os.path.join(SHOTS, 'ppt-grade.png')
slide4.shapes.add_picture(img_path, Inches(6.8), Inches(3.2), Inches(5.0), Inches(3.3))

# Bottom label
add_text_box(slide4, Inches(6.8), Inches(6.1), Inches(5.0), Inches(0.3),
             "AI Grading Model loaded — runs in-browser, zero server upload",
             size=8, color=GRAY, align=PP_ALIGN.CENTER)

print("Slide 4: Technical Depth rebuilt")

# ============================================================
# SLIDE 5: LIVE PROOF + FEASIBILITY
# ============================================================
slide5 = prs.slides[4]
shapes_to_remove = list(slide5.shapes)
for shape in shapes_to_remove:
    sp = shape._element
    sp.getparent().remove(sp)

add_bg(slide5, WHITE)

add_text_box(slide5, Inches(0.5), Inches(0.3), Inches(9), Inches(0.3),
             'LIVE PROOF & FEASIBILITY', size=9, bold=True, color=GREEN)

add_text_box(slide5, Inches(0.5), Inches(0.6), Inches(7), Inches(0.6),
             "TRL 6 — deployed today", size=22, bold=True, color=DARK)

# URL badge
url_card = add_rect(slide5, Inches(0.5), Inches(1.3), Inches(5), Inches(0.45), fill_color=GREEN)
add_text_box(slide5, Inches(0.7), Inches(1.33), Inches(4.5), Inches(0.4),
             "kisan360-web.onrender.com", size=14, bold=True, color=WHITE, align=PP_ALIGN.LEFT)

# 3 screenshots side by side
screenshots = [
    ("ppt-dashboard.png", "Dashboard — live AGMARKNET pulse"),
    ("ppt-netreal.png", "Net Realization — deterministic ranking"),
    ("ppt-trade.png", "Trade — lots, buyers, offers"),
]
for i, (img_file, caption) in enumerate(screenshots):
    x = Inches(0.5 + i * 3.9)
    img_path = os.path.join(SHOTS, img_file)
    slide5.shapes.add_picture(img_path, x, Inches(2.0), Inches(3.6), Inches(2.2))
    add_text_box(slide5, x, Inches(4.25), Inches(3.6), Inches(0.3),
                 caption, size=9, color=GRAY, align=PP_ALIGN.CENTER)

# Risks (bottom)
add_text_box(slide5, Inches(0.5), Inches(4.8), Inches(11), Inches(0.3),
             'RISKS & MITIGATIONS', size=9, bold=True, color=GREEN)

risks = [
    ("AGMARKNET down", "Stamped snapshot fallback, UI says CACHED"),
    ("Atlas unreachable", "Memory DB + reseed on restart"),
    ("Buyers simulated", "4-tier trust labels + SIMULATED banners everywhere"),
    ("Calculator sleeps", "90s cold-start timeout, 'waking up' message"),
]
for i, (risk, fix) in enumerate(risks):
    x = Inches(0.5 + (i % 2) * 5.8)
    y = Inches(5.1 + (i // 2) * 0.55)
    add_text_box(slide5, x, y, Inches(2), Inches(0.25),
                 risk + ":", size=9, bold=True, color=DARK)
    add_text_box(slide5, x + Inches(2), y, Inches(3.5), Inches(0.25),
                 fix, size=9, color=GRAY)

print("Slide 5: Live Proof rebuilt")

# ============================================================
# SLIDE 6: IMPACT + ROADMAP
# ============================================================
slide6 = prs.slides[5]
shapes_to_remove = list(slide6.shapes)
for shape in shapes_to_remove:
    sp = shape._element
    sp.getparent().remove(sp)

add_bg(slide6, WHITE)

add_text_box(slide6, Inches(0.5), Inches(0.3), Inches(9), Inches(0.3),
             'IMPACT & ROADMAP', size=9, bold=True, color=GREEN)

add_text_box(slide6, Inches(0.5), Inches(0.6), Inches(11), Inches(0.6),
             "Who benefits and what comes next", size=22, bold=True, color=DARK)

# Beneficiaries (left column)
add_text_box(slide6, Inches(0.5), Inches(1.4), Inches(5.5), Inches(0.3),
             'BENEFICIARIES', size=9, bold=True, color=GREEN)

beneficiaries = [
    ("Farmer", "Better sale choice per lot, backed by transparent evidence and net-realization math"),
    ("FPO", "Bulk transport tier + buyer minimums unlocked through 50q+ pooling"),
    ("Buyer", "Aggregated, AGMARK-graded lots — lower sourcing risk, consistent volume"),
    ("Government", "Decision layer built on public AGMARKNET data; new district = data entry, not rebuild"),
]
for i, (who, what) in enumerate(beneficiaries):
    y = Inches(1.7 + i * 0.7)
    add_text_box(slide6, Inches(0.5), y, Inches(1.2), Inches(0.25),
                 who, size=11, bold=True, color=GREEN)
    add_text_box(slide6, Inches(1.8), y, Inches(4.2), Inches(0.5),
                 what, size=10, color=GRAY)

# TRL 7 roadmap (right column)
add_text_box(slide6, Inches(6.8), Inches(1.4), Inches(5), Inches(0.3),
             'TRL 7+ ROADMAP', size=9, bold=True, color=GREEN)

roadmap = [
    ("Real payments", "Razorpay/UPI integration, Aadhaar eKYC, RBI licensing"),
    ("Multi-state", "Andhra Pradesh, Karnataka data expansion beyond Maharashtra"),
    ("Offline PWA", "Service worker sync, USSD/IVR for feature phones"),
    ("Per-crop vision", "Extend grader from 9 to 20+ crops (PS requirement)"),
]
for i, (item, detail) in enumerate(roadmap):
    y = Inches(1.7 + i * 0.7)
    add_text_box(slide6, Inches(6.8), y, Inches(1.5), Inches(0.25),
                 item, size=11, bold=True, color=DARK)
    add_text_box(slide6, Inches(8.3), y, Inches(3.5), Inches(0.5),
                 detail, size=10, color=GRAY)

# Bottom quote
quote_card = add_rect(slide6, Inches(0.5), Inches(4.6), Inches(11.2), Inches(0.8), fill_color=RGBColor(0xEC, 0xFD, 0xF5))
quote_card.line.color.rgb = RGBColor(0xD1, 0xFA, 0xE5)
quote_card.line.width = Pt(1)
add_text_box(slide6, Inches(0.8), Inches(4.7), Inches(10.6), Inches(0.5),
             '"New crop, district, mandi or buyer = data entry, not a rebuild."',
             size=14, bold=True, color=GREEN, align=PP_ALIGN.CENTER)

# Team info
add_text_box(slide6, Inches(0.5), Inches(5.7), Inches(11.2), Inches(0.4),
             "Team Kisan360 | CMR University | Prof. Bhagya (Mentor)\nRian Hussain, Nishant Sutariya, Keerthan M S, Musalareddy Chaitna, Koneti Praneeth Kumar, Muruga Santhosh",
             size=10, color=GRAY, align=PP_ALIGN.CENTER)

print("Slide 6: Impact & Roadmap rebuilt")

# Save
prs.save(OUT)
print(f"\nSaved to {OUT}")
