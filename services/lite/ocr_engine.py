"""
Advanced OCR Parsing Engine for SPEAR
Multi-strategy document parsing with intelligent field extraction
"""

import re
import uuid
import json
import hashlib
from datetime import datetime, date
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
from dataclasses import dataclass, asdict
from enum import Enum
import logging

logger = logging.getLogger(__name__)

class DocumentType(Enum):
    INTAKE_FORM = "intake"
    INSURANCE_CARD = "insurance"
    PRESCRIPTION = "prescription"
    MEDICAL_RECORD = "medical_records"
    LAB_RESULT = "lab_result"
    INVOICE = "invoice"
    UNKNOWN = "unknown"

class FieldType(Enum):
    PATIENT_NAME = "patient_name"
    PATIENT_DOB = "patient_dob"
    PAYER_NAME = "payer_name"
    MEMBER_ID = "member_id"
    PROVIDER_NAME = "provider_name"
    PROVIDER_NPI = "provider_npi"
    ORDER_DATE = "order_date"
    PROCEDURE_CODE = "procedure_code"
    DIAGNOSIS_CODE = "diagnosis_code"
    LATERALITY = "laterality"
    PHONE = "phone"
    ADDRESS = "address"
    EMAIL = "email"

@dataclass
class ExtractedField:
    field_type: FieldType
    value: str
    confidence: float
    source_text: str
    extraction_method: str
    coordinates: Optional[Dict[str, Any]] = None
    validation_status: str = "pending"
    validation_errors: List[str] = None

    def __post_init__(self):
        if self.validation_errors is None:
            self.validation_errors = []

@dataclass
class DocumentAnalysis:
    document_id: str
    document_type: DocumentType
    text_content: str
    extracted_fields: List[ExtractedField]
    overall_confidence: float
    quality_score: float
    processing_time: float
    metadata: Dict[str, Any]

class AdvancedOCREngine:
    def __init__(self):
        self.field_patterns = self._initialize_field_patterns()
        self.validation_rules = self._initialize_validation_rules()
        self.document_templates = self._initialize_document_templates()
        
    def _initialize_field_patterns(self) -> Dict[FieldType, List[Dict[str, Any]]]:
        """Initialize regex patterns and extraction strategies for each field type"""
        return {
            FieldType.PATIENT_NAME: [
                {
                    "pattern": r"(?:patient|name|patient name)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:DOB|Birth|Born)",
                    "confidence": 0.8,
                    "method": "contextual_extraction"
                },
                {
                    "pattern": r"Name[:\s]+([A-Z][a-z]+,\s*[A-Z][a-z]+(?:\s+[A-Z]\.?)?)",
                    "confidence": 0.85,
                    "method": "labeled_extraction"
                }
            ],
            FieldType.PATIENT_DOB: [
                {
                    "pattern": r"(?:DOB|Date of Birth|Birth Date|Born)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                    "confidence": 0.95,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})(?:\s*(?:DOB|Birth|Born))",
                    "confidence": 0.8,
                    "method": "contextual_extraction"
                },
                {
                    "pattern": r"(?:patient|name).*?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                    "confidence": 0.7,
                    "method": "proximity_extraction"
                }
            ],
            FieldType.PAYER_NAME: [
                {
                    "pattern": r"(?:insurance|payer|provider|plan)[:\s]+([A-Z][a-zA-Z\s&]+(?:Insurance|Healthcare|Health|Medical|Plan)?)",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"([A-Z][a-zA-Z\s&]+(?:Insurance|Healthcare|Health|Medical|Plan)?)\s*(?:ID|Member|Group)",
                    "confidence": 0.85,
                    "method": "contextual_extraction"
                },
                {
                    "pattern": r"Blue\s+Cross\s+Blue\s+Shield|BCBS|Aetna|UnitedHealthcare|Cigna|Humana|Kaiser",
                    "confidence": 0.95,
                    "method": "known_payers"
                }
            ],
            FieldType.MEMBER_ID: [
                {
                    "pattern": r"(?:member|ID|member ID|group|group ID)[:\s]+([A-Z0-9-]+)",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"([A-Z]{2}\d{8,10}|W\d{8}|\d{9})",
                    "confidence": 0.7,
                    "method": "format_pattern"
                }
            ],
            FieldType.PROVIDER_NAME: [
                {
                    "pattern": r"(?:provider|doctor|physician|Dr\.?|ordering provider)[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"Dr\.?\s+([A-Z][a-z]+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)",
                    "confidence": 0.85,
                    "method": "title_extraction"
                },
                {
                    "pattern": r"(?:ordering|prescribing|referring)\s+by[:\s]+([A-Z][a-z]+\s+[A-Z][a-z]+)",
                    "confidence": 0.8,
                    "method": "action_extraction"
                }
            ],
            FieldType.PROVIDER_NPI: [
                {
                    "pattern": r"(?:NPI|National Provider Identifier)[:\s]+(\d{10})",
                    "confidence": 0.95,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"NPI[:\s]*(\d{10})",
                    "confidence": 0.9,
                    "method": "abbreviated_extraction"
                }
            ],
            FieldType.ORDER_DATE: [
                {
                    "pattern": r"(?:order|date|order date|prescribed|issued)[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                },
                {
                    "pattern": r"Date[:\s]+(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})",
                    "confidence": 0.7,
                    "method": "generic_date"
                }
            ],
            FieldType.PROCEDURE_CODE: [
                {
                    "pattern": r"\b([A-Z]\d{4,5})\b",
                    "confidence": 0.8,
                    "method": "hcpcs_pattern"
                },
                {
                    "pattern": r"(?:CPT|HCPCS|procedure)[:\s]+([A-Z]\d{4,5})",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                }
            ],
            FieldType.DIAGNOSIS_CODE: [
                {
                    "pattern": r"\b([A-Z]\d{2}(?:\.\d{1,2})?)\b",
                    "confidence": 0.8,
                    "method": "icd10_pattern"
                },
                {
                    "pattern": r"(?:ICD-?10|diagnosis|dx)[:\s]+([A-Z]\d{2}(?:\.\d{1,2})?)",
                    "confidence": 0.9,
                    "method": "labeled_extraction"
                }
            ],
            FieldType.LATERALITY: [
                {
                    "pattern": r"\b(left|right|bilateral|both)\b",
                    "confidence": 0.8,
                    "method": "keyword_extraction"
                },
                {
                    "pattern": r"\b(L|R|B|LT|RT|BL)\b",
                    "confidence": 0.6,
                    "method": "abbreviation_extraction"
                }
            ],
            FieldType.PHONE: [
                {
                    "pattern": r"(\(?[2-9]\d{2}\)?[-.\s]?[2-9]\d{2}[-.\s]?\d{4})",
                    "confidence": 0.9,
                    "method": "phone_pattern"
                },
                {
                    "pattern": r"(?:phone|tel|telephone)[:\s]+(\(?[2-9]\d{2}\)?[-.\s]?[2-9]\d{2}[-.\s]?\d{4})",
                    "confidence": 0.95,
                    "method": "labeled_extraction"
                }
            ],
            FieldType.EMAIL: [
                {
                    "pattern": r"([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
                    "confidence": 0.9,
                    "method": "email_pattern"
                }
            ],
            FieldType.ADDRESS: [
                {
                    "pattern": r"(\d+\s+[A-Z][a-zA-Z\s]+(?:Ave|St|Dr|Blvd|Road|Lane|Court|Way|Circle|Square)\s*[A-Z]{2}\s*\d{5})",
                    "confidence": 0.85,
                    "method": "address_pattern"
                }
            ]
        }
    
    def _initialize_validation_rules(self) -> Dict[FieldType, List[Dict[str, Any]]]:
        """Initialize validation rules for each field type"""
        return {
            FieldType.PATIENT_DOB: [
                {
                    "rule": "date_format",
                    "params": {"formats": ["%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"]},
                    "error": "Invalid date format"
                },
                {
                    "rule": "reasonable_date",
                    "params": {"min_year": 1900, "max_year": datetime.now().year},
                    "error": "Date outside reasonable range"
                }
            ],
            FieldType.PROVIDER_NPI: [
                {
                    "rule": "length",
                    "params": {"min": 10, "max": 10},
                    "error": "NPI must be exactly 10 digits"
                },
                {
                    "rule": "digits_only",
                    "params": {},
                    "error": "NPI must contain only digits"
                }
            ],
            FieldType.MEMBER_ID: [
                {
                    "rule": "min_length",
                    "params": {"min": 5},
                    "error": "Member ID too short"
                }
            ],
            FieldType.PROCEDURE_CODE: [
                {
                    "rule": "hcpcs_format",
                    "params": {},
                    "error": "Invalid HCPCS code format"
                }
            ],
            FieldType.DIAGNOSIS_CODE: [
                {
                    "rule": "icd10_format",
                    "params": {},
                    "error": "Invalid ICD-10 code format"
                }
            ]
        }
    
    def _initialize_document_templates(self) -> Dict[DocumentType, Dict[str, Any]]:
        """Initialize document type templates for structured extraction"""
        return {
            DocumentType.INTAKE_FORM: {
                "field_order": [
                    FieldType.PATIENT_NAME,
                    FieldType.PATIENT_DOB,
                    FieldType.PAYER_NAME,
                    FieldType.MEMBER_ID,
                    FieldType.PHONE,
                    FieldType.ADDRESS,
                    FieldType.EMAIL
                ],
                "required_fields": [FieldType.PATIENT_NAME, FieldType.PATIENT_DOB],
                "confidence_threshold": 0.8
            },
            DocumentType.INSURANCE_CARD: {
                "field_order": [
                    FieldType.PAYER_NAME,
                    FieldType.MEMBER_ID,
                    FieldType.GROUP_NUMBER,
                    FieldType.PHONE,
                    FieldType.ADDRESS
                ],
                "required_fields": [FieldType.PAYER_NAME, FieldType.MEMBER_ID],
                "confidence_threshold": 0.85
            },
            DocumentType.PRESCRIPTION: {
                "field_order": [
                    FieldType.PATIENT_NAME,
                    FieldType.PATIENT_DOB,
                    FieldType.PROVIDER_NAME,
                    FieldType.PROVIDER_NPI,
                    FieldType.ORDER_DATE,
                    FieldType.PROCEDURE_CODE,
                    FieldType.DIAGNOSIS_CODE
                ],
                "required_fields": [FieldType.PATIENT_NAME, FieldType.PROVIDER_NAME, FieldType.ORDER_DATE],
                "confidence_threshold": 0.9
            }
        }
    
    def extract_text_from_pdf(self, pdf_path: Path) -> Tuple[str, float]:
        """Extract text from PDF with quality assessment"""
        try:
            # This would integrate with actual PDF parsing libraries
            # For now, simulating text extraction
            import subprocess
            import tempfile
            
            with tempfile.NamedTemporaryFile(mode='w+', suffix='.txt', delete=False) as temp_file:
                # Use pdftotext for extraction (would be installed in production)
                try:
                    result = subprocess.run(
                        ['pdftotext', str(pdf_path), temp_file.name],
                        capture_output=True,
                        text=True,
                        timeout=30
                    )
                    
                    if result.returncode == 0:
                        with open(temp_file.name, 'r') as f:
                            text = f.read()
                        
                        # Calculate quality score based on text characteristics
                        quality_score = self._calculate_text_quality(text)
                        return text, quality_score
                    else:
                        logger.error(f"pdftotext failed: {result.stderr}")
                        return "", 0.0
                        
                except subprocess.TimeoutExpired:
                    logger.error("PDF text extraction timed out")
                    return "", 0.0
                except FileNotFoundError:
                    logger.warning("pdftotext not available, using fallback")
                    # Fallback extraction method would go here
                    return self._fallback_text_extraction(pdf_path)
                    
        except Exception as e:
            logger.error(f"Error extracting text from PDF: {e}")
            return "", 0.0
    
    def _calculate_text_quality(self, text: str) -> float:
        """Calculate quality score for extracted text"""
        if not text:
            return 0.0
        
        quality_factors = {
            "length": min(len(text) / 1000, 1.0),  # More text = better quality
            "readability": self._calculate_readability(text),
            "structure": self._calculate_structure_score(text),
            "completeness": self._calculate_completeness(text)
        }
        
        # Weighted average of quality factors
        weights = {"length": 0.2, "readability": 0.3, "structure": 0.3, "completeness": 0.2}
        
        quality_score = sum(
            quality_factors[factor] * weights[factor] 
            for factor in quality_factors
        )
        
        return min(quality_score, 1.0)
    
    def _calculate_readability(self, text: str) -> float:
        """Calculate readability score based on text characteristics"""
        if not text:
            return 0.0
        
        # Count readable characters vs garbage
        readable_chars = len(re.findall(r'[a-zA-Z0-9\s.,!?-]', text))
        total_chars = len(text)
        
        if total_chars == 0:
            return 0.0
        
        return readable_chars / total_chars
    
    def _calculate_structure_score(self, text: str) -> float:
        """Calculate structure score based on formatting patterns"""
        if not text:
            return 0.0
        
        structure_indicators = [
            r'\n\s*\n',  # Paragraph breaks
            r':\s',     # Labeled fields
            r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',  # Dates
            r'\(\d{3}\)\s*\d{3}[-.\s]?\d{4}',  # Phone numbers
        ]
        
        structure_score = 0.0
        for pattern in structure_indicators:
            if re.search(pattern, text):
                structure_score += 0.25
        
        return min(structure_score, 1.0)
    
    def _calculate_completeness(self, text: str) -> float:
        """Calculate completeness based on expected field presence"""
        if not text:
            return 0.0
        
        field_indicators = [
            r'(?:patient|name)',
            r'(?:DOB|birth|born)',
            r'(?:insurance|payer)',
            r'(?:member|ID)',
            r'(?:provider|doctor)',
            r'(?:date|order)',
        ]
        
        found_fields = sum(1 for pattern in field_indicators if re.search(pattern, text, re.IGNORECASE))
        return found_fields / len(field_indicators)
    
    def _fallback_text_extraction(self, pdf_path: Path) -> Tuple[str, float]:
        """Fallback text extraction method"""
        # This would implement a basic PDF parser
        # For now, return empty with low quality
        return "", 0.1
    
    def detect_document_type(self, text: str) -> DocumentType:
        """Detect document type based on content patterns"""
        type_scores = {}
        
        for doc_type in DocumentType:
            if doc_type == DocumentType.UNKNOWN:
                continue
                
            score = self._calculate_type_score(text, doc_type)
            type_scores[doc_type] = score
        
        if not type_scores:
            return DocumentType.UNKNOWN
        
        best_type = max(type_scores, key=type_scores.get)
        
        # Return UNKNOWN if confidence is too low
        if type_scores[best_type] < 0.3:
            return DocumentType.UNKNOWN
        
        return best_type
    
    def _calculate_type_score(self, text: str, doc_type: DocumentType) -> float:
        """Calculate confidence score for document type detection"""
        type_indicators = {
            DocumentType.INTAKE_FORM: [
                r'(?:patient|intake|registration|admission)',
                r'(?:medical\s+history|patient\s+information)',
                r'(?:emergency\s+contact|next\s+of\s+kin)'
            ],
            DocumentType.INSURANCE_CARD: [
                r'(?:insurance|member|group|plan)',
                r'(?:ID|card|member\s+ID)',
                r'(?:coverage|benefits|co[-\s]?pay)'
            ],
            DocumentType.PRESCRIPTION: [
                r'(?:prescription|Rx|medication)',
                r'(?:dispense|take|dosage)',
                r'(?:refill|pharmacy|sig)'
            ],
            DocumentType.MEDICAL_RECORD: [
                r'(?:progress\s+note|SOAP|assessment)',
                r'(?:diagnosis|treatment|examination)',
                r'(?:vitals|subjective|objective)'
            ],
            DocumentType.LAB_RESULT: [
                r'(?:lab|laboratory|test\s+result)',
                r'(?:specimen|sample|culture)',
                r'(?:reference\s+range|normal\s+range)'
            ],
            DocumentType.INVOICE: [
                r'(?:invoice|bill|statement)',
                r'(?:amount|due|balance)',
                r'(?:charge|payment|receipt)'
            ]
        }
        
        indicators = type_indicators.get(doc_type, [])
        if not indicators:
            return 0.0
        
        matches = sum(1 for pattern in indicators if re.search(pattern, text, re.IGNORECASE))
        return matches / len(indicators)
    
    def extract_fields(self, text: str, document_type: DocumentType) -> List[ExtractedField]:
        """Extract all fields from text using multiple strategies"""
        extracted_fields = []
        
        # Get template for document type if available
        template = self.document_templates.get(document_type, {})
        
        # Extract fields using all available patterns
        for field_type, patterns in self.field_patterns.items():
            field_matches = self._extract_field_with_patterns(text, field_type, patterns)
            extracted_fields.extend(field_matches)
        
        # Resolve conflicts and select best matches
        resolved_fields = self._resolve_field_conflicts(extracted_fields)
        
        # Validate fields
        for field in resolved_fields:
            self._validate_field(field)
        
        # Apply document type-specific filtering
        if template:
            resolved_fields = self._filter_by_template(resolved_fields, template)
        
        return resolved_fields
    
    def _extract_field_with_patterns(self, text: str, field_type: FieldType, patterns: List[Dict[str, Any]]) -> List[ExtractedField]:
        """Extract field using multiple patterns"""
        matches = []
        
        for pattern_info in patterns:
            pattern = pattern_info["pattern"]
            base_confidence = pattern_info["confidence"]
            method = pattern_info["method"]
            
            try:
                for match in re.finditer(pattern, text, re.IGNORECASE | re.MULTILINE):
                    # Get the captured group (first group if available, otherwise full match)
                    value = match.group(1) if match.groups() else match.group(0)
                    
                    # Clean up the extracted value
                    cleaned_value = self._clean_field_value(value, field_type)
                    
                    if cleaned_value:
                        field = ExtractedField(
                            field_type=field_type,
                            value=cleaned_value,
                            confidence=base_confidence,
                            source_text=match.group(0),
                            extraction_method=method,
                            coordinates={
                                "start": match.start(),
                                "end": match.end(),
                                "line": text[:match.start()].count('\n') + 1
                            }
                        )
                        matches.append(field)
                        
            except re.error as e:
                logger.warning(f"Invalid regex pattern for {field_type}: {e}")
                continue
        
        return matches
    
    def _clean_field_value(self, value: str, field_type: FieldType) -> str:
        """Clean and normalize extracted field values"""
        if not value:
            return ""
        
        # Basic cleaning
        cleaned = value.strip()
        
        # Field-specific cleaning
        if field_type == FieldType.PATIENT_NAME:
            # Remove titles and extra spaces
            cleaned = re.sub(r'^(Mr|Mrs|Ms|Dr)\.?\s+', '', cleaned, flags=re.IGNORECASE)
            cleaned = re.sub(r'\s+', ' ', cleaned)
            
        elif field_type == FieldType.PATIENT_DOB:
            # Normalize date format
            cleaned = re.sub(r'[-/]\s*', '/', cleaned)
            
        elif field_type == FieldType.PROVIDER_NPI:
            # Keep only digits
            cleaned = re.sub(r'[^\d]', '', cleaned)
            
        elif field_type == FieldType.PHONE:
            # Normalize phone format
            cleaned = re.sub(r'[^\d]', '', cleaned)
            if len(cleaned) == 10:
                cleaned = f"({cleaned[:3]}) {cleaned[3:6]}-{cleaned[6:]}"
                
        elif field_type in [FieldType.PROCEDURE_CODE, FieldType.DIAGNOSIS_CODE]:
            # Uppercase medical codes
            cleaned = cleaned.upper()
            
        elif field_type == FieldType.LATERALITY:
            # Normalize laterality
            cleaned = cleaned.lower()
            if cleaned in ['l', 'lt']:
                cleaned = 'left'
            elif cleaned in ['r', 'rt']:
                cleaned = 'right'
            elif cleaned in ['b', 'bl']:
                cleaned = 'bilateral'
        
        return cleaned
    
    def _resolve_field_conflicts(self, fields: List[ExtractedField]) -> List[ExtractedField]:
        """Resolve conflicts between multiple extractions of the same field"""
        # Group by field type
        field_groups = {}
        for field in fields:
            field_type = field.field_type
            if field_type not in field_groups:
                field_groups[field_type] = []
            field_groups[field_type].append(field)
        
        resolved_fields = []
        
        for field_type, group in field_groups.items():
            if len(group) == 1:
                resolved_fields.append(group[0])
            else:
                # Select best match based on confidence and method
                best_field = max(group, key=lambda f: (
                    f.confidence,
                    self._method_priority(f.extraction_method),
                    len(f.value)  # Prefer longer, more complete values
                ))
                resolved_fields.append(best_field)
        
        return resolved_fields
    
    def _method_priority(self, method: str) -> int:
        """Priority ranking for extraction methods"""
        priorities = {
            "labeled_extraction": 5,
            "contextual_extraction": 4,
            "known_payers": 4,
            "title_extraction": 3,
            "action_extraction": 3,
            "format_pattern": 2,
            "keyword_extraction": 2,
            "proximity_extraction": 1,
            "generic_date": 1,
            "abbreviated_extraction": 1,
            "abbreviation_extraction": 1
        }
        return priorities.get(method, 0)
    
    def _validate_field(self, field: ExtractedField) -> None:
        """Validate extracted field using applicable rules"""
        rules = self.validation_rules.get(field.field_type, [])
        
        for rule in rules:
            validation_result = self._apply_validation_rule(field, rule)
            
            if not validation_result["valid"]:
                field.validation_status = "failed"
                field.validation_errors.append(validation_result["error"])
                field.confidence *= 0.8  # Reduce confidence for failed validation
            else:
                field.validation_status = "passed"
    
    def _apply_validation_rule(self, field: ExtractedField, rule: Dict[str, Any]) -> Dict[str, Any]:
        """Apply a single validation rule to a field"""
        rule_name = rule["rule"]
        params = rule.get("params", {})
        
        if rule_name == "date_format":
            return self._validate_date_format(field.value, params)
        elif rule_name == "reasonable_date":
            return self._validate_reasonable_date(field.value, params)
        elif rule_name == "length":
            return self._validate_length(field.value, params)
        elif rule_name == "digits_only":
            return self._validate_digits_only(field.value, params)
        elif rule_name == "min_length":
            return self._validate_min_length(field.value, params)
        elif rule_name == "hcpcs_format":
            return self._validate_hcpcs_format(field.value, params)
        elif rule_name == "icd10_format":
            return self._validate_icd10_format(field.value, params)
        else:
            return {"valid": True, "error": None}
    
    def _validate_date_format(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate date format"""
        formats = params.get("formats", ["%m/%d/%Y", "%m-%d-%Y"])
        
        for fmt in formats:
            try:
                datetime.strptime(value, fmt)
                return {"valid": True, "error": None}
            except ValueError:
                continue
        
        return {"valid": False, "error": params.get("error", "Invalid date format")}
    
    def _validate_reasonable_date(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate date is within reasonable range"""
        try:
            # Try to parse the date
            for fmt in ["%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y"]:
                try:
                    parsed_date = datetime.strptime(value, fmt)
                    break
                except ValueError:
                    continue
            else:
                return {"valid": False, "error": "Could not parse date"}
            
            min_year = params.get("min_year", 1900)
            max_year = params.get("max_year", datetime.now().year)
            
            if min_year <= parsed_date.year <= max_year:
                return {"valid": True, "error": None}
            else:
                return {"valid": False, "error": params.get("error", "Date outside reasonable range")}
                
        except Exception:
            return {"valid": False, "error": "Date validation error"}
    
    def _validate_length(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate field length"""
        length = len(value)
        min_len = params.get("min", 0)
        max_len = params.get("max", float('inf'))
        
        if min_len <= length <= max_len:
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": params.get("error", f"Length must be between {min_len} and {max_len}")}
    
    def _validate_digits_only(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate field contains only digits"""
        if value.isdigit():
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": params.get("error", "Must contain only digits")}
    
    def _validate_min_length(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate minimum field length"""
        min_len = params.get("min", 0)
        
        if len(value) >= min_len:
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": params.get("error", f"Must be at least {min_len} characters")}
    
    def _validate_hcpcs_format(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate HCPCS code format"""
        if re.match(r'^[A-Z]\d{4,5}$', value):
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": params.get("error", "Invalid HCPCS code format")}
    
    def _validate_icd10_format(self, value: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Validate ICD-10 code format"""
        if re.match(r'^[A-Z]\d{2}(\.\d{1,2})?$', value):
            return {"valid": True, "error": None}
        else:
            return {"valid": False, "error": params.get("error", "Invalid ICD-10 code format")}
    
    def _filter_by_template(self, fields: List[ExtractedField], template: Dict[str, Any]) -> List[ExtractedField]:
        """Filter fields based on document template requirements"""
        # For now, just return all fields
        # In a full implementation, this would filter based on template rules
        return fields
    
    def analyze_document(self, pdf_path: Path, document_id: Optional[str] = None) -> DocumentAnalysis:
        """Complete document analysis pipeline"""
        start_time = datetime.now()
        
        if not document_id:
            document_id = str(uuid.uuid4())
        
        # Extract text
        text_content, quality_score = self.extract_text_from_pdf(pdf_path)
        
        if not text_content:
            return DocumentAnalysis(
                document_id=document_id,
                document_type=DocumentType.UNKNOWN,
                text_content="",
                extracted_fields=[],
                overall_confidence=0.0,
                quality_score=quality_score,
                processing_time=(datetime.now() - start_time).total_seconds(),
                metadata={"error": "No text extracted"}
            )
        
        # Detect document type
        document_type = self.detect_document_type(text_content)
        
        # Extract fields
        extracted_fields = self.extract_fields(text_content, document_type)
        
        # Calculate overall confidence
        if extracted_fields:
            overall_confidence = sum(f.confidence for f in extracted_fields) / len(extracted_fields)
            overall_confidence *= quality_score  # Adjust by text quality
        else:
            overall_confidence = 0.0
        
        processing_time = (datetime.now() - start_time).total_seconds()
        
        return DocumentAnalysis(
            document_id=document_id,
            document_type=document_type,
            text_content=text_content,
            extracted_fields=extracted_fields,
            overall_confidence=overall_confidence,
            quality_score=quality_score,
            processing_time=processing_time,
            metadata={
                "field_count": len(extracted_fields),
                "validation_passed": sum(1 for f in extracted_fields if f.validation_status == "passed"),
                "validation_failed": sum(1 for f in extracted_fields if f.validation_status == "failed"),
            }
        )

# Global OCR engine instance
ocr_engine = AdvancedOCREngine()
