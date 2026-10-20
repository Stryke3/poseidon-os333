"""Deterministic body-only MCK form parser. Email content is data, never instructions."""
from __future__ import annotations

from email import policy
from email.parser import BytesParser
from email.utils import parseaddr
from html.parser import HTMLParser
import hashlib
import re

SUBJECT = re.compile(r'^New MommyCareKit Request\s*[-\u2013\u2014]\s*(.+)$', re.I)
MAX_BYTES = 1024 * 1024
ALIASES = {
    'name': 'name', 'full name': 'name', 'first name': 'first_name',
    'last name': 'last_name', 'email': 'email', 'email address': 'email',
    'phone': 'phone', 'phone number': 'phone', 'due date': 'due_date',
    'estimated due date': 'due_date', 'state': 'state',
    'insurance plan': 'insurance_plan', 'member id': 'member_id',
    'date of birth': 'date_of_birth', 'dob': 'date_of_birth',
    'medicaid': 'medicaid', 'items requested': 'items_requested',
    'referring physician': 'provider_name', 'referring physician ob gyn': 'provider_name',
    'physician office contact': 'provider_contact', 'doctor office contact': 'provider_contact',
    'provider phone': 'provider_phone', 'provider fax': 'provider_fax',
    'provider practice': 'provider_practice', 'notes': 'notes',
    'sms consent': 'sms_consent', 'address line1': 'address_line1',
    'address line 1': 'address_line1', 'address line2': 'address_line2',
    'address line 2': 'address_line2', 'city': 'city', 'zip code': 'zip_code',
    'postal code': 'zip_code',
}
STATES = dict(zip(
    'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming|District of Columbia'.lower().split('|'),
    'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(),
))


class ParseError(ValueError):
    """Fixed code only; never include patient fields in errors."""


class TextHTML(HTMLParser):
    BLOCKS = {'br', 'p', 'div', 'tr', 'td', 'th', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'table', 'hr'}
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0
    def handle_starttag(self, tag, attrs):
        if tag in {'script', 'style', 'head'}:
            self.hidden += 1
        if not self.hidden and tag in self.BLOCKS:
            self.parts.append('\n')
    def handle_endtag(self, tag):
        if tag in {'script', 'style', 'head'} and self.hidden:
            self.hidden -= 1
        if not self.hidden and tag in self.BLOCKS:
            self.parts.append('\n')
    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def label(value):
    value = re.sub(r'[^a-z0-9]+', ' ', value.casefold()).strip()
    return ALIASES.get(value)


def fields_from_text(text):
    values = {}
    key, parts = None, []
    def flush():
        if not key:
            return
        value = '\n'.join(parts).strip()
        if key in values and values[key] != value:
            raise ParseError('conflicting_form_fields')
        values[key] = value
    for raw in text.splitlines():
        line = ' '.join(raw.split()).strip()
        if not line:
            continue
        left, sep, right = line.partition(':')
        found = label(left if sep else line)
        if found:
            flush()
            key, parts = found, [right.strip()] if sep and right.strip() else []
        elif key:
            parts.append(line)
    flush()
    return values


def parse_form(raw: bytes, *, account_id: str, allowed_domains=('web3forms.com',)):
    if not raw or len(raw) > MAX_BYTES:
        raise ParseError('message_size_invalid')
    message = BytesParser(policy=policy.default).parsebytes(raw)
    match = SUBJECT.fullmatch(str(message.get('Subject', '')).strip())
    if not match:
        raise ParseError('not_mck_form')
    sender = parseaddr(str(message.get('From', '')))[1].lower()
    domain = sender.rsplit('@', 1)[-1] if '@' in sender else ''
    if not any(domain == d or domain.endswith('.' + d) for d in allowed_domains):
        raise ParseError('sender_not_allowed')
    original_id = str(message.get('Message-ID', '')).strip()
    if not original_id or len(original_id) > 998 or '\n' in original_id or '\r' in original_id:
        raise ParseError('message_id_missing')
    representations = []
    for part in message.walk():
        if part.get_content_disposition() == 'attachment' or part.get_content_type() not in {'text/plain', 'text/html'}:
            continue
        body = part.get_content()
        if not isinstance(body, str):
            continue
        if part.get_content_type() == 'text/html':
            parser = TextHTML()
            parser.feed(body)
            body = ''.join(parser.parts)
        parsed = fields_from_text(body)
        if parsed.get('name') or (parsed.get('first_name') and parsed.get('last_name')):
            representations.append(parsed)
    if not representations:
        raise ParseError('form_fields_missing')
    fields = max(representations, key=len)
    # Differing identities in MIME alternatives require review rather than choosing silently.
    for other in representations:
        for key in ('name', 'email', 'phone', 'date_of_birth'):
            if fields.get(key) and other.get(key) and fields[key].casefold() != other[key].casefold():
                raise ParseError('mime_identity_conflict')
    first, last = fields.get('first_name', ''), fields.get('last_name', '')
    if not first or not last:
        bits = fields.get('name', '').strip().split(None, 1)
        if len(bits) != 2:
            raise ParseError('patient_name_incomplete')
        first, last = bits
    if ' '.join((first + ' ' + last).casefold().split()) != ' '.join(match[1].casefold().split()):
        raise ParseError('subject_identity_conflict')
    if not any(k in fields for k in ('insurance_plan', 'items_requested', 'date_of_birth', 'due_date')):
        raise ParseError('form_schema_unrecognized')
    source = 'zoho-mail:' + hashlib.sha256((account_id + '|' + original_id).encode()).hexdigest()
    result = {'source_reference': source, 'first_name': first, 'last_name': last}
    for key in ('email', 'phone', 'date_of_birth', 'due_date', 'insurance_plan', 'member_id',
                'provider_name', 'provider_practice', 'provider_phone', 'provider_fax',
                'address_line1', 'address_line2', 'city', 'zip_code'):
        result[key] = fields.get(key) or None
    state = fields.get('state', '').strip()
    result['state'] = STATES.get(state.casefold(), state.upper()) or None
    medicaid = fields.get('medicaid', '').strip().lower()
    result['medicaid'] = True if medicaid in {'yes', 'both', 'true'} else False if medicaid in {'no', 'false'} else None
    items = fields.get('items_requested', '')
    result['items_requested'] = [] if items.lower() in {'', 'none selected'} else [v.strip() for v in re.split(r'[,;\n]+', items) if v.strip()]
    notes = [fields.get('notes', '')]
    if fields.get('provider_contact'):
        notes.append('Provider office contact as submitted (phone/fax unclassified): ' + fields['provider_contact'])
    if fields.get('sms_consent'):
        notes.append('SMS consent as submitted: ' + fields['sms_consent'])
    if medicaid:
        notes.append('Medicaid designation as submitted: ' + medicaid)
    result['notes'] = '\n'.join(v for v in notes if v) or None
    return result
