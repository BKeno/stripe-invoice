/**
 * Escapes special XML characters to prevent injection attacks.
 * Must be used for all user-provided data inserted into XML.
 */
export const escapeXml = (str: string): string => {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};
