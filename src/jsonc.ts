/** JSONC parser: preserve strings, remove comments, allow trailing commas. No eval. */
export function parseJsonc(source: string): unknown {
  let text = source.replace(/^\uFEFF/, "");
  let output = "", quoted = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (quoted) {
      output += c;
      if (escaped)
        escaped = false;
      else if (c === "\\")
        escaped = true;
      else if (c === '"')
        quoted = false;
    }
    else if (c === '"') {
      quoted = true;
      output += c;
    }
    else if (c === "/" && next === "/") {
      output += " ";
      i++;
      while (i + 1 < text.length && text[i + 1] !== "\n" && text[i + 1] !== "\r")
        i++;
    }
    else if (c === "/" && next === "*") {
      output += " ";
      i += 2;
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) {
        if (text[i] === "\n" || text[i] === "\r")
          output += text[i];
        i++;
      }
      if (i >= text.length)
        throw new Error("Unterminated JSON comment");
      i++;
    }
    else
      output += c;
  }
  text = output;
  output = "";
  quoted = false;
  escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      output += c;
      if (escaped)
        escaped = false;
      else if (c === "\\")
        escaped = true;
      else if (c === '"')
        quoted = false;
    }
    else if (c === '"') {
      quoted = true;
      output += c;
    }
    else if (c === ",") {
      let j = i + 1;
      while (/\s/.test(text[j] ?? "") && j < text.length)
        j++;
      if (text[j] !== "}" && text[j] !== "]")
        output += c;
    }
    else
      output += c;
  }
  return JSON.parse(output);
}
