/** Convert a number to decimal string without scientific notation. */
function toPlainDecimal(n: number): string {
  if (!isFinite(n)) return String(n)
  return n.toFixed(20).replace(/\.?0+$/, '')
}

/** Expand a valid JSON exponent token without a binary floating-point round trip. */
function expandScientificToken(token: string): string {
  const match = token.match(/^(-?)(\d+)(?:\.(\d*))?[eE]([+-]?\d+)$/);
  if (!match) return token;
  const [, sign, integer, fraction = "", rawExponent] = match;
  const exponent = Number(rawExponent);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1_000) return token;

  const digits = integer + fraction;
  const decimalIndex = integer.length + exponent;
  let expanded: string;
  if (decimalIndex <= 0) {
    expanded = `0.${"0".repeat(-decimalIndex)}${digits}`;
  } else if (decimalIndex >= digits.length) {
    expanded = digits + "0".repeat(decimalIndex - digits.length);
  } else {
    expanded = `${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
  }
  const [rawWhole, rawFraction] = expanded.split(".");
  const whole = rawWhole.replace(/^0+(?=\d)/, "") || "0";
  const normalizedFraction = rawFraction?.replace(/0+$/, "") ?? "";
  expanded = normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
  return `${sign}${expanded}`;
}

/**
 * Fix scientific notation in a JSON string by parsing and re-serializing.
 *
 * The previous regex approach was unsafe — it matched hex-like substrings
 * inside quoted strings (e.g., UUID segment "4236e614" → "Infinity").
 *
 * This version uses a proper JSON reviver to only touch actual number values.
 */
export function fixScientificNotation(json: string): string {
  try {
    const parsed = JSON.parse(json, (_key, value) => {
      // Only transform actual number values (not strings containing digits)
      if (typeof value === 'number' && isFinite(value)) {
        const str = String(value)
        if (str.includes('e') || str.includes('E')) {
          // Return as a tagged placeholder that we'll replace in the output
          return `__SCI_FIX__${toPlainDecimal(value)}__`
        }
      }
      return value
    })
    // Re-serialize and unwrap the placeholders (they'll be quoted strings)
    return JSON.stringify(parsed).replace(/"__SCI_FIX__([^"]+)__"/g, '$1')
  } catch {
    // If parsing fails, return original
    return json
  }
}

/**
 * Rewrite exponent-form JSON numbers without buffering the whole response.
 *
 * JSON numbers are the only tokens held between chunks; strings and structural
 * data pass through immediately. This keeps the API's historical no-scientific-
 * notation guarantee while preserving streaming and bounded memory use.
 */
export function fixScientificNotationStream(
  body: ReadableStream<Uint8Array>
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let inString = false;
  let escaped = false;
  let numberToken = "";

  const consume = (text: string, final = false): string => {
    const output: string[] = [];

    const flushNumber = () => {
      if (!numberToken) return;
      if (/[eE]/.test(numberToken)) {
        output.push(expandScientificToken(numberToken));
      } else {
        output.push(numberToken);
      }
      numberToken = "";
    };

    for (const character of text) {
      if (numberToken) {
        if (/[0-9eE+.-]/.test(character)) {
          numberToken += character;
          continue;
        }
        flushNumber();
      }

      if (inString) {
        output.push(character);
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') inString = false;
        continue;
      }

      if (character === '"') {
        inString = true;
        output.push(character);
      } else if (character === "-" || /[0-9]/.test(character)) {
        numberToken = character;
      } else {
        output.push(character);
      }
    }

    if (final) flushNumber();
    return output.join("");
  };

  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      const output = consume(decoder.decode(chunk, { stream: true }));
      if (output) controller.enqueue(encoder.encode(output));
    },
    flush(controller) {
      const output = consume(decoder.decode(), true);
      if (output) controller.enqueue(encoder.encode(output));
    },
  }));
}
