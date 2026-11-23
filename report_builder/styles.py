"""
Styles, Colors, and Helper Flowables for RoadGuard MSRIT Academic Documentation
"""

import os
from reportlab.lib import colors
from reportlab.platypus import (
    Paragraph, Spacer, Table, TableStyle, Image, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

# Brand and Academic Color Palette
COLOR_BURGUNDY = colors.HexColor("#800020")   # MSRIT Academic Burgundy
COLOR_NAVY = colors.HexColor("#1E3A8A")       # Deep Engineering Navy
COLOR_SLATE_DARK = colors.HexColor("#0F172A") # Primary Header Dark
COLOR_TEXT = colors.HexColor("#1E293B")       # Dark Slate Body
COLOR_MUTED = colors.HexColor("#475569")      # Muted Slate
COLOR_BORDER = colors.HexColor("#CBD5E1")     # Light Border Grey
COLOR_BG_CARD = colors.HexColor("#F8FAFC")    # Clean Surface Grey
COLOR_BG_LIGHT = colors.HexColor("#F1F5F9")   # Soft Accent Background
COLOR_ACCENT_BLUE = colors.HexColor("#2563EB")# Active Blue
COLOR_SUCCESS = colors.HexColor("#059669")    # Verification Emerald
COLOR_ALERT = colors.HexColor("#DC2626")      # Negative / Penalty Red

def get_report_styles():
    sample = getSampleStyleSheet()
    styles = {}
    
    styles['CoverDept'] = ParagraphStyle(
        'CoverDept',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=COLOR_BURGUNDY,
        alignment=1, # Center
        spaceAfter=6
    )
    
    styles['CoverSubDept'] = ParagraphStyle(
        'CoverSubDept',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=COLOR_SLATE_DARK,
        alignment=1,
        spaceAfter=14
    )
    
    styles['CoverReport'] = ParagraphStyle(
        'CoverReport',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=COLOR_MUTED,
        alignment=1,
        spaceAfter=10
    )
    
    styles['CoverTitle'] = ParagraphStyle(
        'CoverTitle',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=17,
        leading=22,
        textColor=COLOR_NAVY,
        alignment=1,
        spaceAfter=14
    )
    
    styles['CoverCourseLabel'] = ParagraphStyle(
        'CoverCourseLabel',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=COLOR_MUTED,
        alignment=1,
        spaceAfter=4
    )
    
    styles['CoverCourse'] = ParagraphStyle(
        'CoverCourse',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=COLOR_BURGUNDY,
        alignment=1,
        spaceAfter=4
    )
    
    styles['CoverCourseCode'] = ParagraphStyle(
        'CoverCourseCode',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=COLOR_NAVY,
        alignment=1,
        spaceAfter=14
    )
    
    styles['CoverMetaLabel'] = ParagraphStyle(
        'CoverMetaLabel',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=COLOR_SLATE_DARK,
        alignment=1,
        spaceAfter=4
    )
    
    styles['CoverMetaVal'] = ParagraphStyle(
        'CoverMetaVal',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT,
        alignment=1,
        spaceAfter=10
    )
    
    styles['CoverCollege'] = ParagraphStyle(
        'CoverCollege',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=COLOR_BURGUNDY,
        alignment=1,
        spaceAfter=4
    )
    
    styles['CoverCollegeSub'] = ParagraphStyle(
        'CoverCollegeSub',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=COLOR_MUTED,
        alignment=1,
        spaceAfter=4
    )
    
    styles['SectionTitle'] = ParagraphStyle(
        'SectionTitle',
        parent=sample['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=14,
        leading=18,
        textColor=COLOR_NAVY,
        spaceBefore=14,
        spaceAfter=8,
        keepWithNext=True
    )
    
    styles['SubSectionTitle'] = ParagraphStyle(
        'SubSectionTitle',
        parent=sample['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=COLOR_SLATE_DARK,
        spaceBefore=10,
        spaceAfter=5,
        keepWithNext=True
    )
    
    styles['SubSubSectionTitle'] = ParagraphStyle(
        'SubSubSectionTitle',
        parent=sample['Heading3'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=COLOR_MUTED,
        spaceBefore=7,
        spaceAfter=3,
        keepWithNext=True
    )
    
    styles['Body'] = ParagraphStyle(
        'Body',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT,
        alignment=4, # Justified
        spaceAfter=6
    )
    
    styles['BodyBold'] = ParagraphStyle(
        'BodyBold',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=13,
        textColor=COLOR_SLATE_DARK,
        spaceAfter=6
    )
    
    styles['Bullet'] = ParagraphStyle(
        'Bullet',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=COLOR_TEXT,
        leftIndent=14,
        firstLineIndent=-10,
        spaceAfter=3
    )
    
    styles['Callout'] = ParagraphStyle(
        'Callout',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=COLOR_TEXT
    )
    
    styles['TableHeader'] = ParagraphStyle(
        'TableHeader',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8,
        leading=10,
        textColor=colors.white,
        alignment=1 # Center
    )
    
    styles['TableCell'] = ParagraphStyle(
        'TableCell',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=COLOR_TEXT
    )
    
    styles['TableCellCenter'] = ParagraphStyle(
        'TableCellCenter',
        parent=sample['Normal'],
        fontName='Helvetica',
        fontSize=7.5,
        leading=10,
        textColor=COLOR_TEXT,
        alignment=1
    )
    
    styles['TableCellBold'] = ParagraphStyle(
        'TableCellBold',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=7.5,
        leading=10,
        textColor=COLOR_SLATE_DARK
    )
    
    styles['Code'] = ParagraphStyle(
        'Code',
        parent=sample['Normal'],
        fontName='Courier',
        fontSize=7.5,
        leading=10,
        textColor=COLOR_SLATE_DARK
    )
    
    styles['FigureTitle'] = ParagraphStyle(
        'FigureTitle',
        parent=sample['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=11,
        textColor=COLOR_NAVY,
        alignment=1,
        spaceAfter=4
    )
    
    styles['FigureCaption'] = ParagraphStyle(
        'FigureCaption',
        parent=sample['Normal'],
        fontName='Helvetica-Oblique',
        fontSize=7.5,
        leading=10,
        textColor=COLOR_MUTED,
        alignment=1,
        spaceBefore=4
    )
    
    return styles

def create_callout_box(title, text, styles, border_color=COLOR_ACCENT_BLUE, bg_color=COLOR_BG_CARD, width=504):
    p_title = Paragraph(f"<b>{title}</b>", styles['SubSubSectionTitle'])
    p_text = Paragraph(text, styles['Callout'])
    
    t = Table([[p_title], [p_text]], colWidths=[width])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), bg_color),
        ('BOX', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('LINELEFT', (0, 0), (0, -1), 3.0, border_color),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t

def create_figure_card(img_path, fig_num, title, caption, styles, width=504, img_w=430, img_h=242):
    if not os.path.exists(img_path):
        p_missing = Paragraph(f"[Image file not found: {img_path}]", styles['Body'])
        return p_missing
    
    p_title = Paragraph(f"<b>Figure {fig_num}:</b> {title}", styles['FigureTitle'])
    img_flow = Image(img_path, width=img_w, height=img_h)
    p_caption = Paragraph(caption, styles['FigureCaption'])
    
    table_data = [
        [p_title],
        [img_flow],
        [p_caption]
    ]
    
    t = Table(table_data, colWidths=[width])
    t.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BACKGROUND', (0, 0), (-1, -1), COLOR_BG_CARD),
        ('BOX', (0, 0), (-1, -1), 0.75, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, 0), 5),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('TOPPADDING', (0, 1), (-1, 1), 2),
        ('BOTTOMPADDING', (0, 1), (-1, 1), 2),
        ('TOPPADDING', (0, 2), (-1, 2), 4),
        ('BOTTOMPADDING', (0, 2), (-1, 2), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return KeepTogether([Spacer(1, 4), t, Spacer(1, 6)])

def create_table_card(header_row, data_rows, col_widths, styles, header_bg=COLOR_NAVY):
    table_data = []
    
    # Header
    h_cells = [Paragraph(f"<b>{h}</b>", styles['TableHeader']) for h in header_row]
    table_data.append(h_cells)
    
    # Data Rows
    for r_idx, r in enumerate(data_rows):
        row_cells = []
        for c_idx, val in enumerate(r):
            if isinstance(val, str) and (val.startswith("<b>") or c_idx == 0):
                row_cells.append(Paragraph(str(val), styles['TableCellBold']))
            elif isinstance(val, str) and val in ['PASS', 'Verified', 'Active', '100%', '0%', 'Eligible']:
                row_cells.append(Paragraph(f"<font color='#059669'><b>{val}</b></font>", styles['TableCellCenter']))
            elif isinstance(val, str) and val in ['FAIL', 'Pending', 'High']:
                row_cells.append(Paragraph(f"<font color='#DC2626'><b>{val}</b></font>", styles['TableCellCenter']))
            else:
                row_cells.append(Paragraph(str(val), styles['TableCell']))
        table_data.append(row_cells)
    
    t = Table(table_data, colWidths=col_widths)
    ts = [
        ('BACKGROUND', (0, 0), (-1, 0), header_bg),
        ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('GRID', (0, 0), (-1, -1), 0.5, COLOR_BORDER),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
    ]
    # Row striping
    for i in range(1, len(table_data)):
        if i % 2 == 0:
            ts.append(('BACKGROUND', (0, i), (-1, i), COLOR_BG_LIGHT))
        else:
            ts.append(('BACKGROUND', (0, i), (-1, i), colors.white))
    t.setStyle(TableStyle(ts))
    return t
