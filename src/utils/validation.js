/**
 * Validate email format
 */
function validateEmail(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

/**
 * Validate callback URL
 */
function validateCallbackUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate UUID format
 */
function validateUUID(uuid) {
  const re = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return re.test(uuid);
}

/**
 * Validate numeric amount
 */
function validateAmount(amount) {
  const num = parseFloat(amount);
  return !isNaN(num) && num > 0 && num <= 1000000;
}

/**
 * Sanitize text input
 */
function sanitizeText(text, maxLength = 1000) {
  if (typeof text !== 'string') return '';
  return text
    .trim()
    .substring(0, maxLength)
    .replace(/[<>]/g, '');
}

/**
 * Validate agent name
 */
function validateAgentName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 3 && trimmed.length <= 100;
}

/**
 * Validate task title
 */
function validateTaskTitle(title) {
  if (!title || typeof title !== 'string') return false;
  const trimmed = title.trim();
  return trimmed.length >= 5 && trimmed.length <= 200;
}

/**
 * Validate message content
 */
function validateMessageContent(content) {
  if (!content || typeof content !== 'string') return false;
  const trimmed = content.trim();
  return trimmed.length >= 1 && trimmed.length <= 5000;
}

/**
 * Check if value is valid JSON
 */
function isValidJSON(str) {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  validateEmail,
  validateCallbackUrl,
  validateUUID,
  validateAmount,
  sanitizeText,
  validateAgentName,
  validateTaskTitle,
  validateMessageContent,
  isValidJSON
};
