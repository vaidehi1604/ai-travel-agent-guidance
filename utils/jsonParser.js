/**
 * Safely parse JSON from LLM responses
 * Handles markdown code blocks, arithmetic expressions, and potential noise
 */
const safeJsonParse = (content) => {
  if (!content) return null;

  // Helper: fix arithmetic expressions like "40000 + 39200" in JSON values
  const fixArithmetic = (str) => {
    return str.replace(/:\s*([\d.]+\s*[+\-*/]\s*[\d.]+(?:\s*[+\-*/]\s*[\d.]+)*)\s*([,}\]])/g, (match, expr, delimiter) => {
      try {
        const result = Function('"use strict"; return (' + expr + ')')();
        return ': ' + result + delimiter;
      } catch {
        return match;
      }
    });
  };

  const tryParse = (str) => {
    try {
      return JSON.parse(str);
    } catch {
      // Try fixing arithmetic expressions then parse again
      const fixed = fixArithmetic(str);
      return JSON.parse(fixed);
    }
  };

  try {
    // 1. Try direct parse (with arithmetic fix fallback)
    return tryParse(content);
  } catch (e) {
    try {
      // 2. Try stripping markdown code blocks
      const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                        content.match(/```([\s\S]*?)```/);
      
      const cleanContent = jsonMatch ? jsonMatch[1].trim() : content.trim();
      return tryParse(cleanContent);
    } catch (e2) {
      console.error("Final JSON parse failure:", e2.message);
      return null;
    }
  }
};

module.exports = { safeJsonParse };
