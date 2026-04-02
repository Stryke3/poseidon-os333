-- Allow any reasonable doc_type label (UI/intake may send new slot keys).
-- Core coerces uploads to a trimmed lowercase string (max 50 chars); see _coerce_order_document_doc_type.
ALTER TABLE order_documents DROP CONSTRAINT IF EXISTS order_documents_doc_type_check;

ALTER TABLE order_documents ADD CONSTRAINT order_documents_doc_type_check CHECK (
  char_length(btrim(doc_type)) BETWEEN 1 AND 50
);
