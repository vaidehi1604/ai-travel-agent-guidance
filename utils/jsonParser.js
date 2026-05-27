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

  // 1. Try direct parse (with arithmetic fix fallback)
  try {
    return tryParse(content);
  } catch (e) {
    // Proceed to extraction methods
  }

  // 2. Extract JSON block by finding indices of brackets
  try {
    const firstCurly = content.indexOf('{');
    const firstSquare = content.indexOf('[');
    
    let startIdx = -1;
    let endToken = '';
    
    if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
      startIdx = firstCurly;
      endToken = '}';
    } else if (firstSquare !== -1) {
      startIdx = firstSquare;
      endToken = ']';
    }
    
    if (startIdx !== -1) {
      const lastIdx = content.lastIndexOf(endToken);
      if (lastIdx > startIdx) {
        const candidate = content.substring(startIdx, lastIdx + 1);
        try {
          return tryParse(candidate);
        } catch (err) {
          // If candidate parsing fails, proceed to markdown code blocks match
        }
      }
    }
  } catch (e) {
    // Proceed to markdown code blocks match
  }

  // 3. Try stripping markdown code blocks
  try {
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                      content.match(/```([\s\S]*?)```/);
    
    const cleanContent = jsonMatch ? jsonMatch[1].trim() : content.trim();
    return tryParse(cleanContent);
  } catch (e2) {
    console.error("Final JSON parse failure:", e2.message);
    return null;
  }
};

module.exports = { safeJsonParse };
