"""
Advanced PDF Generation Engine for SPEAR
Smart layouts with dynamic content optimization and professional formatting
"""

import io
import uuid
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
from dataclasses import dataclass
from enum import Enum
import logging

from reportlab.lib.pagesizes import letter, A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import Color, black, white, grey, lightgrey
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    KeepTogether, CondPageBreak, Flowable, Frame, PageTemplate, BaseDocTemplate
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT, TA_JUSTIFY
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

logger = logging.getLogger(__name__)

class DocumentLayout(Enum):
    STANDARD = "standard"
    COMPACT = "compact"
    DETAILED = "detailed"
    CLINICAL = "clinical"
    BILLING = "billing"

class FieldType(Enum):
    HEADER = "header"
    PATIENT_INFO = "patient_info"
    PROVIDER_INFO = "provider_info"
    PAYER_INFO = "payer_info"
    ORDER_DETAILS = "order_details"
    CLINICAL_INFO = "clinical_info"
    BILLING_INFO = "billing_info"
    FOOTER = "footer"

@dataclass
class PDFSection:
    section_type: FieldType
    title: str
    content: List[Any]
    style: Optional[Dict[str, Any]] = None
    priority: int = 1
    conditional: bool = False
    condition_field: Optional[str] = None

@dataclass
class LayoutConfig:
    page_size: Tuple[float, float]
    margins: Dict[str, float]
    header_height: float
    footer_height: float
    content_width: float
    content_height: float
    font_family: str = "Helvetica"
    font_size_base: int = 10
    line_spacing: float = 1.2
    color_scheme: Optional[Dict[str, Color]] = None

class AdvancedPDFGenerator:
    def __init__(self):
        self.color_schemes = self._initialize_color_schemes()
        self.layout_configs = self._initialize_layout_configs()
        self.style_templates = self._initialize_style_templates()
        
    def _initialize_color_schemes(self) -> Dict[str, Dict[str, Color]]:
        """Initialize professional color schemes"""
        return {
            "spear_clinical": {
                "primary": Color(0.07, 0.05, 0.04),  # Dark charcoal
                "secondary": Color(0.72, 0.61, 0.37),  # Gold
                "accent": Color(0.07, 0.13, 0.22),  # Dark blue
                "text": Color(0.97, 0.95, 0.91),  # Ivory
                "muted": Color(0.65, 0.69, 0.75),  # Medium grey
                "border": Color(0.14, 0.19, 0.27),  # Border grey
                "success": Color(0.08, 0.5, 0.24),  # Green
                "warning": Color(0.75, 0.52, 0.01),  # Orange
                "danger": Color(0.74, 0.11, 0.11),  # Red
            },
            "spear_billing": {
                "primary": Color(0.02, 0.04, 0.08),
                "secondary": Color(0.85, 0.75, 0.37),
                "accent": Color(0.12, 0.18, 0.35),
                "text": Color(0.95, 0.93, 0.88),
                "muted": Color(0.6, 0.64, 0.7),
                "border": Color(0.2, 0.25, 0.35),
                "success": Color(0.15, 0.6, 0.3),
                "warning": Color(0.8, 0.55, 0.02),
                "danger": Color(0.8, 0.15, 0.15),
            },
            "minimal": {
                "primary": Color(0, 0, 0),
                "secondary": Color(0.3, 0.3, 0.3),
                "accent": Color(0.1, 0.1, 0.1),
                "text": Color(0.2, 0.2, 0.2),
                "muted": Color(0.5, 0.5, 0.5),
                "border": Color(0.7, 0.7, 0.7),
                "success": Color(0, 0.5, 0),
                "warning": Color(0.8, 0.6, 0),
                "danger": Color(0.8, 0, 0),
            }
        }
    
    def _initialize_layout_configs(self) -> Dict[DocumentLayout, LayoutConfig]:
        """Initialize layout configurations for different document types"""
        return {
            DocumentLayout.STANDARD: LayoutConfig(
                page_size=letter,
                margins={"top": 0.75*inch, "bottom": 0.75*inch, "left": 0.75*inch, "right": 0.75*inch},
                header_height=1.0*inch,
                footer_height=0.5*inch,
                content_width=6.5*inch,
                content_height=9.0*inch,
                font_family="Helvetica",
                font_size_base=10,
                line_spacing=1.2,
                color_scheme=self.color_schemes["spear_clinical"]
            ),
            DocumentLayout.COMPACT: LayoutConfig(
                page_size=letter,
                margins={"top": 0.5*inch, "bottom": 0.5*inch, "left": 0.5*inch, "right": 0.5*inch},
                header_height=0.8*inch,
                footer_height=0.4*inch,
                content_width=7.5*inch,
                content_height=9.8*inch,
                font_family="Helvetica",
                font_size_base=9,
                line_spacing=1.1,
                color_scheme=self.color_schemes["minimal"]
            ),
            DocumentLayout.DETAILED: LayoutConfig(
                page_size=A4,
                margins={"top": 1.0*inch, "bottom": 1.0*inch, "left": 1.0*inch, "right": 1.0*inch},
                header_height=1.2*inch,
                footer_height=0.6*inch,
                content_width=7.5*inch,
                content_height=10.2*inch,
                font_family="Times-Roman",
                font_size_base=11,
                line_spacing=1.3,
                color_scheme=self.color_schemes["spear_clinical"]
            ),
            DocumentLayout.CLINICAL: LayoutConfig(
                page_size=letter,
                margins={"top": 0.8*inch, "bottom": 0.8*inch, "left": 0.8*inch, "right": 0.8*inch},
                header_height=1.0*inch,
                footer_height=0.5*inch,
                content_width=6.75*inch,
                content_height=8.7*inch,
                font_family="Helvetica",
                font_size_base=10,
                line_spacing=1.25,
                color_scheme=self.color_schemes["spear_clinical"]
            ),
            DocumentLayout.BILLING: LayoutConfig(
                page_size=letter,
                margins={"top": 0.75*inch, "bottom": 0.75*inch, "left": 0.75*inch, "right": 0.75*inch},
                header_height=1.0*inch,
                footer_height=0.6*inch,
                content_width=6.5*inch,
                content_height=8.9*inch,
                font_family="Helvetica",
                font_size_base=9,
                line_spacing=1.15,
                color_scheme=self.color_schemes["spear_billing"]
            )
        }
    
    def _initialize_style_templates(self) -> Dict[str, ParagraphStyle]:
        """Initialize reusable paragraph styles"""
        styles = getSampleStyleSheet()
        
        return {
            "title": ParagraphStyle(
                'CustomTitle',
                parent=styles['Title'],
                fontSize=16,
                spaceAfter=12,
                alignment=TA_CENTER,
                textColor=black
            ),
            "subtitle": ParagraphStyle(
                'CustomSubtitle',
                parent=styles['Heading2'],
                fontSize=12,
                spaceAfter=8,
                alignment=TA_LEFT,
                textColor=black
            ),
            "body": ParagraphStyle(
                'CustomBody',
                parent=styles['Normal'],
                fontSize=10,
                spaceAfter=6,
                alignment=TA_LEFT,
                textColor=black
            ),
            "small": ParagraphStyle(
                'CustomSmall',
                parent=styles['Normal'],
                fontSize=8,
                spaceAfter=3,
                alignment=TA_LEFT,
                textColor=grey
            ),
            "header": ParagraphStyle(
                'CustomHeader',
                parent=styles['Heading3'],
                fontSize=11,
                spaceAfter=4,
                alignment=TA_CENTER,
                textColor=black
            ),
            "footer": ParagraphStyle(
                'CustomFooter',
                parent=styles['Normal'],
                fontSize=8,
                spaceAfter=2,
                alignment=TA_CENTER,
                textColor=grey
            ),
            "label": ParagraphStyle(
                'CustomLabel',
                parent=styles['Normal'],
                fontSize=9,
                spaceAfter=2,
                alignment=TA_RIGHT,
                textColor=black,
                fontName='Helvetica-Bold'
            ),
            "value": ParagraphStyle(
                'CustomValue',
                parent=styles['Normal'],
                fontSize=9,
                spaceAfter=2,
                alignment=TA_LEFT,
                textColor=black
            ),
            "section_title": ParagraphStyle(
                'CustomSectionTitle',
                parent=styles['Heading3'],
                fontSize=11,
                spaceBefore=12,
                spaceAfter=6,
                alignment=TA_LEFT,
                textColor=black,
                fontName='Helvetica-Bold',
                borderWidth=0,
                borderColor=black,
                borderPadding=5
            )
        }
    
    def generate_swo_pdf(self, patient_data: Dict[str, Any], layout: DocumentLayout = DocumentLayout.STANDARD) -> bytes:
        """Generate Standard Written Order PDF with advanced layout"""
        config = self.layout_configs[layout]
        
        # Create PDF buffer
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=config.page_size,
            leftMargin=config.margins["left"],
            rightMargin=config.margins["right"],
            topMargin=config.margins["top"],
            bottomMargin=config.margins["bottom"]
        )
        
        # Build content sections
        sections = self._build_swo_sections(patient_data, config)
        
        # Create story (content flow)
        story = []
        
        # Add header
        story.extend(self._create_header("Standard Written Order", config))
        story.append(Spacer(1, 0.2*inch))
        
        # Add sections in order
        for section in sections:
            if section.conditional and section.condition_field:
                if not patient_data.get(section.condition_field):
                    continue
            
            story.extend(self._render_section(section, config))
            story.append(Spacer(1, 0.15*inch))
        
        # Add footer
        story.extend(self._create_footer(config))
        
        # Build PDF
        doc.build(story, onFirstPage=self._on_page_template, onLaterPages=self._on_page_template)
        
        buffer.seek(0)
        return buffer.getvalue()
    
    def generate_pod_pdf(self, patient_data: Dict[str, Any], layout: DocumentLayout = DocumentLayout.STANDARD) -> bytes:
        """Generate Proof of Delivery PDF with advanced layout"""
        config = self.layout_configs[layout]
        
        # Create PDF buffer
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=config.page_size,
            leftMargin=config.margins["left"],
            rightMargin=config.margins["right"],
            topMargin=config.margins["top"],
            bottomMargin=config.margins["bottom"]
        )
        
        # Build content sections
        sections = self._build_pod_sections(patient_data, config)
        
        # Create story (content flow)
        story = []
        
        # Add header
        story.extend(self._create_header("Proof of Delivery", config))
        story.append(Spacer(1, 0.2*inch))
        
        # Add sections in order
        for section in sections:
            story.extend(self._render_section(section, config))
            story.append(Spacer(1, 0.15*inch))
        
        # Add signature section
        story.extend(self._create_signature_section(config))
        
        # Add footer
        story.extend(self._create_footer(config))
        
        # Build PDF
        doc.build(story, onFirstPage=self._on_page_template, onLaterPages=self._on_page_template)
        
        buffer.seek(0)
        return buffer.getvalue()
    
    def generate_billing_packet_pdf(self, patient_data: Dict[str, Any], documents: List[Dict[str, Any]], layout: DocumentLayout = DocumentLayout.BILLING) -> bytes:
        """Generate comprehensive billing packet PDF"""
        config = self.layout_configs[layout]
        
        # Create PDF buffer
        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=config.page_size,
            leftMargin=config.margins["left"],
            rightMargin=config.margins["right"],
            topMargin=config.margins["top"],
            bottomMargin=config.margins["bottom"]
        )
        
        # Create story (content flow)
        story = []
        
        # Add header
        story.extend(self._create_header("Billing Support Packet", config))
        story.append(Spacer(1, 0.2*inch))
        
        # Add patient summary
        story.extend(self._create_patient_summary(patient_data, config))
        story.append(Spacer(1, 0.2*inch))
        
        # Add document checklist
        story.extend(self._create_document_checklist(documents, config))
        story.append(Spacer(1, 0.2*inch))
        
        # Add billing codes summary
        story.extend(self._create_billing_codes_summary(patient_data, config))
        
        # Add footer
        story.extend(self._create_footer(config))
        
        # Build PDF
        doc.build(story, onFirstPage=self._on_page_template, onLaterPages=self._on_page_template)
        
        buffer.seek(0)
        return buffer.getvalue()
    
    def _build_swo_sections(self, patient_data: Dict[str, Any], config: LayoutConfig) -> List[PDFSection]:
        """Build SWO document sections"""
        sections = []
        
        # Patient Information
        patient_info = self._create_patient_info_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.PATIENT_INFO,
            title="Patient Information",
            content=[patient_info],
            priority=1
        ))
        
        # Provider Information
        provider_info = self._create_provider_info_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.PROVIDER_INFO,
            title="Ordering Provider Information",
            content=[provider_info],
            priority=2
        ))
        
        # Payer Information
        payer_info = self._create_payer_info_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.PAYER_INFO,
            title="Insurance Information",
            content=[payer_info],
            priority=3
        ))
        
        # Order Details
        order_details = self._create_order_details_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.ORDER_DETAILS,
            title="Order Details",
            content=[order_details],
            priority=4
        ))
        
        # Clinical Information (if available)
        if patient_data.get("diagnosis_codes") or patient_data.get("clinical_notes"):
            clinical_info = self._create_clinical_info_table(patient_data, config)
            sections.append(PDFSection(
                section_type=FieldType.CLINICAL_INFO,
                title="Clinical Information",
                content=[clinical_info],
                priority=5
            ))
        
        return sorted(sections, key=lambda x: x.priority)
    
    def _build_pod_sections(self, patient_data: Dict[str, Any], config: LayoutConfig) -> List[PDFSection]:
        """Build POD document sections"""
        sections = []
        
        # Patient Information
        patient_info = self._create_patient_info_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.PATIENT_INFO,
            title="Patient Information",
            content=[patient_info],
            priority=1
        ))
        
        # Order Information
        order_info = self._create_order_summary_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.ORDER_DETAILS,
            title="Order Summary",
            content=[order_info],
            priority=2
        ))
        
        # Delivery Information
        delivery_info = self._create_delivery_info_table(patient_data, config)
        sections.append(PDFSection(
            section_type=FieldType.ORDER_DETAILS,
            title="Delivery Information",
            content=[delivery_info],
            priority=3
        ))
        
        return sorted(sections, key=lambda x: x.priority)
    
    def _create_header(self, title: str, config: LayoutConfig) -> List[Any]:
        """Create document header"""
        header_content = []
        
        # Main title
        title_style = ParagraphStyle(
            'DocumentTitle',
            parent=self.style_templates["title"],
            fontSize=18,
            spaceAfter=6,
            alignment=TA_CENTER,
            textColor=config.color_scheme["primary"],
            fontName='Helvetica-Bold'
        )
        header_content.append(Paragraph(title, title_style))
        
        # SPEAR branding
        brand_style = ParagraphStyle(
            'BrandStyle',
            parent=self.style_templates["subtitle"],
            fontSize=10,
            spaceAfter=12,
            alignment=TA_CENTER,
            textColor=config.color_scheme["secondary"],
            fontName='Helvetica'
        )
        header_content.append(Paragraph("SPEAR - Compliance-Driven Healthcare Execution", brand_style))
        
        # Document info line
        info_style = ParagraphStyle(
            'InfoStyle',
            parent=self.style_templates["small"],
            fontSize=8,
            spaceAfter=8,
            alignment=TA_CENTER,
            textColor=config.color_scheme["muted"],
            fontName='Helvetica'
        )
        doc_date = datetime.now().strftime("%B %d, %Y")
        doc_id = str(uuid.uuid4())[:8].upper()
        header_content.append(Paragraph(f"Generated: {doc_date} | Document ID: {doc_id}", info_style))
        
        return header_content
    
    def _create_footer(self, config: LayoutConfig) -> List[Any]:
        """Create document footer"""
        footer_content = []
        
        # Separator line
        footer_content.append(Spacer(1, 0.1*inch))
        
        # Footer text
        footer_style = ParagraphStyle(
            'FooterStyle',
            parent=self.style_templates["footer"],
            fontSize=8,
            spaceBefore=6,
            alignment=TA_CENTER,
            textColor=config.color_scheme["muted"],
            fontName='Helvetica'
        )
        
        footer_text = [
            "This document is confidential and intended for healthcare provider use only.",
            "© 2024 StrykeFox Medical - SPEAR Platform"
        ]
        
        for line in footer_text:
            footer_content.append(Paragraph(line, footer_style))
        
        return footer_content
    
    def _get_colors(self, config: LayoutConfig) -> Dict[str, Color]:
        """Get color scheme safely with fallback"""
        return config.color_scheme or self.color_schemes["minimal"]
    
    def _create_patient_info_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create patient information table"""
        colors = self._get_colors(config)
        data = [
            ["Patient Name:", f"{patient_data.get('first_name', '')} {patient_data.get('last_name', '')}".strip()],
            ["Date of Birth:", self._format_date(patient_data.get('dob'))],
            ["Phone:", patient_data.get('phone', 'N/A')],
            ["Address:", patient_data.get('address', 'N/A')],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), colors["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, colors["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_provider_info_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create provider information table"""
        data = [
            ["Ordering Provider:", patient_data.get('ordering_provider', 'N/A')],
            ["NPI:", patient_data.get('provider_npi', 'N/A')],
            ["Order Date:", self._format_date(patient_data.get('order_date'))],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_payer_info_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create payer information table"""
        data = [
            ["Insurance Provider:", patient_data.get('payer_name', 'N/A')],
            ["Member ID:", patient_data.get('member_id', 'N/A')],
            ["Group Number:", patient_data.get('group_number', 'N/A')],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_order_details_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create order details table"""
        procedure_name = patient_data.get('procedure_name', 'N/A')
        laterality = patient_data.get('laterality', '')
        if laterality and laterality != 'unknown':
            procedure_name += f" ({laterality})"
        
        data = [
            ["Procedure/DME:", procedure_name],
            ["HCPCS Codes:", self._format_code_list(patient_data.get('hcpcs_codes', []))],
            ["Diagnosis Codes:", self._format_code_list(patient_data.get('diagnosis_codes', []))],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_clinical_info_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create clinical information table"""
        data = [
            ["Clinical Notes:", patient_data.get('clinical_notes', 'N/A')],
            ["Laterality:", patient_data.get('laterality', 'N/A').title()],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_order_summary_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create order summary table for POD"""
        data = [
            ["Order Date:", self._format_date(patient_data.get('order_date'))],
            ["Procedure:", patient_data.get('procedure_name', 'N/A')],
            ["Provider:", patient_data.get('ordering_provider', 'N/A')],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_delivery_info_table(self, patient_data: Dict[str, Any], config: LayoutConfig) -> Table:
        """Create delivery information table for POD"""
        data = [
            ["Delivery Date:", datetime.now().strftime("%m/%d/%Y")],
            ["Delivery Method:", "Standard Shipping"],
            ["Tracking Number:", "N/A"],
            ["Delivery Status:", "Delivered"],
        ]
        
        table = Table(data, colWidths=[2*inch, 4*inch])
        table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        return table
    
    def _create_signature_section(self, config: LayoutConfig) -> List[Any]:
        """Create signature section for POD"""
        signature_content = []
        
        # Section title
        signature_content.append(Paragraph("Delivery Confirmation", self.style_templates["section_title"]))
        
        # Signature line table
        signature_data = [
            ["Patient Signature:", "_________________________"],
            ["Print Name:", "_________________________"],
            ["Date:", "_________________________"],
            ["", ""],
            ["Delivered By:", "_________________________"],
            ["Print Name:", "_________________________"],
            ["Date:", "_________________________"],
        ]
        
        signature_table = Table(signature_data, colWidths=[2*inch, 4*inch])
        signature_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        
        signature_content.append(signature_table)
        
        return signature_content
    
    def _create_patient_summary(self, patient_data: Dict[str, Any], config: LayoutConfig) -> List[Any]:
        """Create patient summary for billing packet"""
        summary_content = []
        
        # Section title
        summary_content.append(Paragraph("Patient Summary", self.style_templates["section_title"]))
        
        # Summary table
        summary_data = [
            ["Patient:", f"{patient_data.get('first_name', '')} {patient_data.get('last_name', '')}".strip()],
            ["DOB:", self._format_date(patient_data.get('dob'))],
            ["Member ID:", patient_data.get('member_id', 'N/A')],
            ["Provider:", patient_data.get('ordering_provider', 'N/A')],
            ["NPI:", patient_data.get('provider_npi', 'N/A')],
            ["Payer:", patient_data.get('payer_name', 'N/A')],
        ]
        
        summary_table = Table(summary_data, colWidths=[1.5*inch, 5*inch])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 0), (-1, -1), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        summary_content.append(summary_table)
        
        return summary_content
    
    def _create_document_checklist(self, documents: List[Dict[str, Any]], config: LayoutConfig) -> List[Any]:
        """Create document checklist"""
        checklist_content = []
        
        # Section title
        checklist_content.append(Paragraph("Document Checklist", self.style_templates["section_title"]))
        
        # Checklist table
        checklist_data = [["Document", "Status", "Generated Date"]]
        
        for doc in documents:
            doc_name = doc.get("document_type", "Unknown")
            status = "✓ Generated" if doc.get("generated_at") else "Pending"
            date = self._format_datetime(doc.get("generated_at"))
            checklist_data.append([doc_name, status, date])
        
        checklist_table = Table(checklist_data, colWidths=[3*inch, 2*inch, 2*inch])
        checklist_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), config.color_scheme["accent"]),
            ('TEXTCOLOR', (0, 0), (-1, 0), config.color_scheme["text"]),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 9),
            ('BACKGROUND', (0, 1), (-1, -1), config.color_scheme["text"]),
            ('TEXTCOLOR', (0, 1), (-1, -1), config.color_scheme["text"]),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        
        checklist_content.append(checklist_table)
        
        return checklist_content
    
    def _create_billing_codes_summary(self, patient_data: Dict[str, Any], config: LayoutConfig) -> List[Any]:
        """Create billing codes summary"""
        billing_content = []
        
        # Section title
        billing_content.append(Paragraph("Billing Codes Summary", self.style_templates["section_title"]))
        
        # HCPCS codes
        if patient_data.get('hcpcs_codes'):
            billing_content.append(Paragraph("HCPCS Codes:", self.style_templates["subtitle"]))
            hcpcs_data = [["Code", "Description", "Quantity"]]
            
            for code in patient_data['hcpcs_codes']:
                hcpcs_data.append([code, "Procedure/DME", "1"])
            
            hcpcs_table = Table(hcpcs_data, colWidths=[1.5*inch, 3.5*inch, 1.5*inch])
            hcpcs_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), config.color_scheme["accent"]),
                ('TEXTCOLOR', (0, 0), (-1, 0), config.color_scheme["text"]),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('BACKGROUND', (0, 1), (-1, -1), config.color_scheme["text"]),
                ('TEXTCOLOR', (0, 1), (-1, -1), config.color_scheme["text"]),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            billing_content.append(hcpcs_table)
            billing_content.append(Spacer(1, 0.1*inch))
        
        # Diagnosis codes
        if patient_data.get('diagnosis_codes'):
            billing_content.append(Paragraph("Diagnosis Codes:", self.style_templates["subtitle"]))
            dx_data = [["Code", "Description"]]
            
            for code in patient_data['diagnosis_codes']:
                dx_data.append([code, "Diagnosis"])
            
            dx_table = Table(dx_data, colWidths=[1.5*inch, 5*inch])
            dx_table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), config.color_scheme["accent"]),
                ('TEXTCOLOR', (0, 0), (-1, 0), config.color_scheme["text"]),
                ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
                ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, 0), 9),
                ('BACKGROUND', (0, 1), (-1, -1), config.color_scheme["text"]),
                ('TEXTCOLOR', (0, 1), (-1, -1), config.color_scheme["text"]),
                ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
                ('FONTSIZE', (0, 1), (-1, -1), 9),
                ('GRID', (0, 0), (-1, -1), 1, config.color_scheme["border"]),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('LEFTPADDING', (0, 0), (-1, -1), 6),
                ('RIGHTPADDING', (0, 0), (-1, -1), 6),
                ('TOPPADDING', (0, 0), (-1, -1), 3),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ]))
            
            billing_content.append(dx_table)
        
        return billing_content
    
    def _render_section(self, section: PDFSection, config: LayoutConfig) -> List[Any]:
        """Render a section with title and content"""
        rendered = []
        
        # Section title
        title_style = ParagraphStyle(
            'SectionTitle',
            parent=self.style_templates["section_title"],
            fontSize=12,
            spaceBefore=12,
            spaceAfter=8,
            alignment=TA_LEFT,
            textColor=config.color_scheme["primary"],
            fontName='Helvetica-Bold',
            borderWidth=0,
            borderColor=config.color_scheme["border"],
            borderPadding=5
        )
        
        rendered.append(Paragraph(section.title, title_style))
        
        # Add section content
        rendered.extend(section.content)
        
        return rendered
    
    def _on_page_template(self, canvas, doc):
        """Page template for headers and footers"""
        # Save the state of our canvas
        canvas.saveState()
        
        # Header
        canvas.setFont('Helvetica', 8)
        canvas.setFillColor(grey)
        canvas.drawString(doc.leftMargin, doc.height + doc.topMargin - 15, "SPEAR - Healthcare Execution Platform")
        
        # Footer
        canvas.setFont('Helvetica', 7)
        canvas.setFillColor(grey)
        canvas.drawCentredString(doc.width / 2, 0.5 * inch, "Page %d" % doc.page)
        
        # Restore the state of our canvas
        canvas.restoreState()
    
    def _format_date(self, date_value: Any) -> str:
        """Format date value for display"""
        if not date_value:
            return "N/A"
        
        if isinstance(date_value, str):
            try:
                # Try to parse string date
                parsed_date = datetime.strptime(date_value, "%Y-%m-%d")
                return parsed_date.strftime("%m/%d/%Y")
            except ValueError:
                return date_value
        elif isinstance(date_value, (date, datetime)):
            return date_value.strftime("%m/%d/%Y")
        
        return str(date_value)
    
    def _format_datetime(self, datetime_value: Any) -> str:
        """Format datetime value for display"""
        if not datetime_value:
            return "N/A"
        
        if isinstance(datetime_value, str):
            try:
                parsed_dt = datetime.fromisoformat(datetime_value.replace('Z', '+00:00'))
                return parsed_dt.strftime("%m/%d/%Y %H:%M")
            except ValueError:
                return datetime_value
        elif isinstance(datetime_value, datetime):
            return datetime_value.strftime("%m/%d/%Y %H:%M")
        
        return str(datetime_value)
    
    def _format_code_list(self, codes: List[str]) -> str:
        """Format code list for display"""
        if not codes:
            return "N/A"
        
        return ", ".join(str(code) for code in codes)

# Global PDF generator instance
pdf_generator = AdvancedPDFGenerator()
