/**
 * Data Parser Utility (Stealth Edition)
 * Parses and validates session records from multiple raw formats
 */
const DataParser = {
  /**
   * Parse JSON format records
   * Expects a JSON array of record objects
   * @param {string} text - Raw JSON string
   * @returns {{ success: boolean, entries: Array, error: string|null }}
   */
  parseJSON(text) {
    try {
      const trimmed = text.trim();
      const data = JSON.parse(trimmed);

      if (!Array.isArray(data)) {
        return {
          success: false,
          entries: [],
          error: "JSON input must be an array of objects.",
        };
      }

      if (data.length === 0) {
        return {
          success: false,
          entries: [],
          error: "JSON array is empty — nothing to import.",
        };
      }

      const entries = [];
      for (let i = 0; i < data.length; i++) {
        const validation = this.validateEntry(data[i]);
        if (!validation.valid) {
          return {
            success: false,
            entries: [],
            error: `Record at index ${i}: ${validation.error}`,
          };
        }
        entries.push(this.normalizeEntry(data[i]));
      }

      return { success: true, entries, error: null };
    } catch (e) {
      return {
        success: false,
        entries: [],
        error: `Invalid JSON: ${e.message}`,
      };
    }
  },

  /**
   * Parse Netscape / Standard Tab-Separated format
   * Format per line: domain \t flag \t path \t secure \t expiry \t name \t value
   * @param {string} text
   * @returns {{ success: boolean, entries: Array, error: string|null }}
   */
  parseNetscape(text) {
    try {
      const lines = text.trim().split("\n");
      const entries = [];

      for (let lineNum = 0; lineNum < lines.length; lineNum++) {
        const line = lines[lineNum].trim();

        // Skip empty lines and comments
        if (!line || line.startsWith("#") || line.startsWith("//")) {
          continue;
        }

        const parts = line.split("\t");
        if (parts.length < 7) {
          return {
            success: false,
            entries: [],
            error: `Line ${lineNum + 1}: Expected 7 tab-separated fields. Got ${parts.length}.`,
          };
        }

        const [domain, , path, secure, expiry, name, ...valueParts] = parts;
        const value = valueParts.join("\t");

        if (!name || !domain) {
          return {
            success: false,
            entries: [],
            error: `Line ${lineNum + 1}: Missing required field 'name' or 'domain'.`,
          };
        }

        const item = {
          name: name,
          value: value || "",
          domain: domain,
          path: path || "/",
          secure: secure.toUpperCase() === "TRUE",
          httpOnly: false,
          sameSite: "unspecified",
          expirationDate:
            parseInt(expiry, 10) > 0 ? parseInt(expiry, 10) : undefined,
        };

        entries.push(this.normalizeEntry(item));
      }

      if (entries.length === 0) {
        return {
          success: false,
          entries: [],
          error: "No valid records found in Netscape format.",
        };
      }

      return { success: true, entries, error: null };
    } catch (e) {
      return {
        success: false,
        entries: [],
        error: `Netscape parse error: ${e.message}`,
      };
    }
  },

  /**
   * Parse Base64-encoded JSON records
   * @param {string} text - Base64 string
   * @returns {{ success: boolean, entries: Array, error: string|null }}
   */
  parseBase64(text) {
    try {
      const cleaned = text.trim().replace(/\s+/g, "");

      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
        return {
          success: false,
          entries: [],
          error: "Input is not valid Base64.",
        };
      }

      let decoded;
      try {
        decoded = decodeURIComponent(escape(atob(cleaned)));
      } catch {
        const raw = atob(cleaned);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          bytes[i] = raw.charCodeAt(i);
        }
        decoded = new TextDecoder().decode(bytes);
      }

      return this.parseJSON(decoded);
    } catch (e) {
      return {
        success: false,
        entries: [],
        error: `Base64 decode error: ${e.message}`,
      };
    }
  },

  /**
   * Parse raw header string format
   * Accepts: "Name=Value; Name2=Value2" or with prefix "Cookie: Name=Value; Name2=Value2"
   * Also handles a single "Name=Value" pair
   * Domain is NOT included in header strings — must be supplied externally.
   * @param {string} text - The raw header string
   * @param {string} domain - Target domain to assign to all parsed entries
   * @returns {{ success: boolean, entries: Array, error: string|null }}
   */
  parseHeaderString(text, domain) {
    try {
      let raw = text.trim();

      if (!raw) {
        return { success: false, entries: [], error: "Header string is empty." };
      }

      if (!domain || typeof domain !== "string" || domain.trim() === "") {
        return {
          success: false,
          entries: [],
          error: "Domain is required for header string import (navigate to a website first).",
        };
      }

      const cleanDomain = domain.trim();

      // Strip common prefixes (case-insensitive)
      // Matches: "Cookie:", "Set-Cookie:", "cookie :", etc.
      const prefixMatch = raw.match(/^(?:set-)?cookie\s*:\s*/i);
      if (prefixMatch) {
        raw = raw.substring(prefixMatch[0].length);
      }

      // Strip trailing semicolons / whitespace
      raw = raw.replace(/;\s*$/, "").trim();

      if (!raw) {
        return { success: false, entries: [], error: "Header string contains no data after prefix." };
      }

      // Split on "; " or ";" to get name=value pairs
      // Use a smart split that respects values containing ";" inside URL-encoded content
      const pairs = this._splitHeaderPairs(raw);
      const entries = [];

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i].trim();
        if (!pair) continue;

        // Find the FIRST '=' — everything before is name, everything after is value
        const eqIndex = pair.indexOf("=");

        if (eqIndex === -1) {
          // Name-only (like a boolean flag), treat as name with empty value
          const name = pair.trim();
          if (!name) continue;
          entries.push(
            this.normalizeEntry({
              name: name,
              value: "",
              domain: cleanDomain.startsWith(".") ? cleanDomain : `.${cleanDomain}`,
              path: "/",
              secure: false,
              httpOnly: false,
              sameSite: "unspecified",
            })
          );
          continue;
        }

        const name = pair.substring(0, eqIndex).trim();
        const value = pair.substring(eqIndex + 1); // DO NOT trim value — whitespace may be intentional

        if (!name) {
          return {
            success: false,
            entries: [],
            error: `Pair at position ${i + 1}: empty name before '='.`,
          };
        }

        entries.push(
          this.normalizeEntry({
            name: name,
            value: value,
            domain: cleanDomain.startsWith(".") ? cleanDomain : `.${cleanDomain}`,
            path: "/",
            secure: false,
            httpOnly: false,
            sameSite: "unspecified",
          })
        );
      }

      if (entries.length === 0) {
        return {
          success: false,
          entries: [],
          error: "No valid name=value pairs found in header string.",
        };
      }

      return { success: true, entries, error: null };
    } catch (e) {
      return {
        success: false,
        entries: [],
        error: `Header parse error: ${e.message}`,
      };
    }
  },

  /**
   * Smart split for header pairs.
   * Standard header format uses "; " (semicolon + space) as separator.
   * Values themselves can contain encoded semicolons (%3B) which are safe.
   * This splits on literal "; " or ";" boundaries.
   * @param {string} raw
   * @returns {string[]}
   */
  _splitHeaderPairs(raw) {
    // Split on "; " first (standard), then on ";" (loose)
    // This correctly handles values with encoded chars like %3B
    return raw.split(/;\s*/);
  },

  /**
   * Auto-detect format and parse accordingly
   * @param {string} text
   * @param {string} [domain] - Optional domain for header string format
   * @returns {{ format: string, success: boolean, entries: Array, error: string|null, needsDomain?: boolean }}
   */
  autoDetect(text, domain) {
    const trimmed = text.trim();

    if (!trimmed) {
      return {
        format: "unknown",
        success: false,
        entries: [],
        error: "Input is empty.",
      };
    }

    // 1. Try JSON
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const result = this.parseJSON(trimmed);
      return { format: "json", ...result };
    }

    // 2. Try Netscape format
    if (
      trimmed.startsWith("#") ||
      trimmed.split("\n").some((line) => {
        const stripped = line.trim();
        return stripped && !stripped.startsWith("#") && stripped.split("\t").length >= 7;
      })
    ) {
      const result = this.parseNetscape(trimmed);
      if (result.success) return { format: "netscape", ...result };
    }

    // 3. Try Base64
    const noWhitespace = trimmed.replace(/\s/g, "");
    if (
      noWhitespace.length > 4 &&
      /^[A-Za-z0-9+/]+=*$/.test(noWhitespace)
    ) {
      const result = this.parseBase64(noWhitespace);
      if (result.success) return { format: "base64", ...result };
    }

    // 4. Try Header String format
    // Detect: starts with "Cookie:" prefix, OR contains at least one "name=value" pattern
    if (this._looksLikeHeaderString(trimmed)) {
      if (domain) {
        const result = this.parseHeaderString(trimmed, domain);
        if (result.success) return { format: "header", ...result };
        // If parse failed, still return error from header parser
        return { format: "header", ...result };
      } else {
        // Signal that we detected header format but need a domain
        return {
          format: "header",
          success: false,
          entries: [],
          needsDomain: true,
          error: "Header string format detected but domain is required. Navigate to a website first.",
        };
      }
    }

    return {
      format: "unknown",
      success: false,
      entries: [],
      error:
        "Unable to detect format. Supported: JSON array, Netscape, Base64 JSON, Header string (name=value; ...).",
    };
  },

  /**
   * Heuristic check: does this look like a header string?
   * Returns true if:
   * - Starts with "Cookie:" or "Set-Cookie:" (case-insensitive)
   * - OR is a single line containing at least one "word=something" pattern
   * @param {string} text
   * @returns {boolean}
   */
  _looksLikeHeaderString(text) {
    // Check for "Cookie:" prefix
    if (/^(?:set-)?cookie\s*:/i.test(text)) {
      return true;
    }

    // Must be single-line (header strings are one line)
    if (text.includes("\n")) {
      return false;
    }

    // Look for at least one valid name=value pattern
    // Name: alphanumeric, dash, underscore, dot
    // Value: anything non-empty after "="
    if (/^[A-Za-z0-9_.\-]+=[^\s]/.test(text)) {
      return true;
    }

    return false;
  },

  /**
   * Validate that an entry has required fields
   * @param {Object} item
   * @returns {{ valid: boolean, error: string|null }}
   */
  validateEntry(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { valid: false, error: "Entry must be a plain object." };
    }

    if (
      !item.name ||
      typeof item.name !== "string" ||
      item.name.trim() === ""
    ) {
      return {
        valid: false,
        error: "Entry must have a non-empty 'name' (string).",
      };
    }

    if (item.value === undefined || item.value === null) {
      return { valid: false, error: "Entry must have a 'value' field." };
    }

    if (
      !item.domain ||
      typeof item.domain !== "string" ||
      item.domain.trim() === ""
    ) {
      return {
        valid: false,
        error: "Entry must have a non-empty 'domain' (string).",
      };
    }

    if (item.sameSite) {
      const validValues = [
        "no_restriction",
        "lax",
        "strict",
        "unspecified",
        "none",
      ];
      const normalized = String(item.sameSite).toLowerCase();
      if (!validValues.includes(normalized)) {
        return {
          valid: false,
          error: `Invalid sameSite value: "${item.sameSite}". Allowed: no_restriction, lax, strict, unspecified, none.`,
        };
      }
    }

    if (
      item.expirationDate !== undefined &&
      item.expirationDate !== null
    ) {
      const num = Number(item.expirationDate);
      if (isNaN(num)) {
        return {
          valid: false,
          error: "expirationDate must be a valid timestamp number in seconds.",
        };
      }
    }

    if (item.path && typeof item.path !== "string") {
      return { valid: false, error: "path must be a string." };
    }

    return { valid: true, error: null };
  },

  /**
   * Normalize an entry object for standard storage
   * @param {Object} item
   * @returns {Object}
   */
  normalizeEntry(item) {
    let sameSite = (item.sameSite || "unspecified").toLowerCase();
    if (sameSite === "none") sameSite = "no_restriction";

    const normalized = {
      name: String(item.name).trim(),
      value: String(item.value ?? ""),
      domain: String(item.domain).trim(),
      path: item.path ? String(item.path) : "/",
      secure: Boolean(item.secure),
      httpOnly: Boolean(item.httpOnly),
      sameSite: sameSite,
    };

    if (item.expirationDate) {
      const ts = Number(item.expirationDate);
      if (!isNaN(ts) && ts > 0) {
        normalized.expirationDate = ts;
      }
    }

    if (normalized.sameSite === "no_restriction") {
      normalized.secure = true;
    }

    return normalized;
  },
};
