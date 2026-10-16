import DOMPurify from 'dompurify';

// Workspace descriptions support formatting, never executable markup or action attributes.
export function safeRichText(value) {
  return DOMPurify.sanitize(String(value || ''), {
    ALLOWED_TAGS: ['p', 'br', 'div', 'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'a'],
    ALLOWED_ATTR: ['href', 'title'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  });
}
