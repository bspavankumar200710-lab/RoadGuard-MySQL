"""
RoadGuard Project Documentation PDF Generator
Formatted strictly according to M S RAMAIAH INSTITUTE OF TECHNOLOGY (MSRIT)
Department of Computer Science and Engineering
Course: ARTIFICIAL INTELLIGENCE AND MACHINE LEARNING (Course Code: 24CS52)
Academic Year: 2026-2027

Generates: d:\\RoadGuard-MySQL\\RoadGuard_Project_Documentation.pdf
"""

import os
import sys
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate
from reportlab.pdfgen import canvas
import pypdf

# Import modular section builders
from report_builder.styles import get_report_styles
from report_builder.preliminaries import build_preliminaries
from report_builder.academic_chapters import build_academic_chapters
from report_builder.engineering_docs import build_engineering_docs
from report_builder.references_appendices import build_references_and_appendices

# -------------------------------------------------------------
# TWO-PASS NUMBERED CANVAS FOR DYNAMIC "PAGE X OF Y" AND RUNNING HEADERS
# -------------------------------------------------------------
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, page_count):
        # Page 1: Cover page (no header or footer)
        if self._pageNumber == 1:
            return
        
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#475569"))
        
        # Pages 2 and 3: Certificate & Declaration (suppress header, retain footer)
        if self._pageNumber > 3:
            # Running Header
            self.drawString(54, 750, "M S Ramaiah Institute of Technology  |  Department of CSE  |  Course: 24CS52")
            self.drawRightString(558, 750, "ROADGUARD Project Documentation")
            self.setStrokeColor(colors.HexColor("#CBD5E1"))
            self.setLineWidth(0.5)
            self.line(54, 744, 558, 744)
        
        # Running Footer (Pages 2+)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.setLineWidth(0.5)
        self.line(54, 45, 558, 45)
        self.drawString(54, 34, "RoadGuard: Feedback-Guided AI for Real-Time Road Damage Detection & Auditable Suppression")
        page_str = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(558, 34, page_str)
        self.restoreState()

def generate_roadguard_documentation(output_pdf_path):
    print(f"Starting RoadGuard MSRIT 24CS52 Documentation PDF generation...")
    
    # Target directory setup
    output_dir = os.path.dirname(output_pdf_path)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)
    
    logo_path = os.path.join(output_dir, "docs_images", "msrit_logo.png")
    if not os.path.exists(logo_path):
        logo_path = os.path.join(output_dir, "msrit_logo.png")
    
    images_dir = os.path.join(output_dir, "docs_images")
    if not os.path.exists(images_dir):
        images_dir = r"C:\Users\DELL\.gemini\antigravity\brain\196688a9-59d1-4b05-8d16-c1a9dbe519fd\.user_uploaded"
    
    # Document Template Setup
    # Letter size: 612 x 792 pt. Margins: 54 pt Left/Right, 54 pt Top/Bottom.
    # Usable width: 504 pt. Usable height: 684 pt.
    doc = SimpleDocTemplate(
        output_pdf_path,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    
    styles = get_report_styles()
    story = []
    
    # 1. Preliminary Pages (Cover, Certificate, Declaration, Abstract, Table of Contents)
    print("Building Preliminary Pages...")
    build_preliminaries(styles, story, logo_path)
    
    # 2. Academic Chapters 1 through 9
    print("Building Academic Chapters 1-9...")
    build_academic_chapters(styles, story)
    
    # 3. Additional Project Documentation (Planning, SRS, System Design with 13 Figures, Testing, Deliverables)
    print("Building Engineering Documentation & embedding 13 Application Screenshots...")
    build_engineering_docs(styles, story, images_dir)
    
    # 4. References & Appendices (IEEE Citations, MySQL DDL, REST APIs, 5 Rules, Evaluator Rubric)
    print("Building References and Appendices...")
    build_references_and_appendices(styles, story)
    
    # 5. Compile Document
    print(f"Compiling document to: {output_pdf_path}")
    doc.build(story, canvasmaker=NumberedCanvas)
    
    # 6. Verify with pypdf
    if os.path.exists(output_pdf_path):
        reader = pypdf.PdfReader(output_pdf_path)
        num_pages = len(reader.pages)
        file_size_kb = os.path.getsize(output_pdf_path) / 1024.0
        print(f"\n========================================================")
        print(f"SUCCESS: RoadGuard Documentation PDF compiled successfully!")
        print(f"Output File: {output_pdf_path}")
        print(f"Total Pages: {num_pages}")
        print(f"File Size:   {file_size_kb:.1f} KB")
        print(f"========================================================\n")
        return num_pages
    else:
        raise FileNotFoundError(f"PDF compilation failed; {output_pdf_path} was not created.")

if __name__ == "__main__":
    target_pdf = r"d:\RoadGuard-MySQL\RoadGuard_Project_Documentation.pdf"
    generate_roadguard_documentation(target_pdf)
