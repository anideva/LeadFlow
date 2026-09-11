/**
 * Supported lead attributes available as template variables in LeadFlow.
 */
export const SUPPORTED_TEMPLATE_VARIABLES = [
  'firstName',
  'lastName',
  'email',
  'phone',
  'company',
  'source',
  'status',
  'priority'
] as const;

export type SupportedTemplateVariable = (typeof SUPPORTED_TEMPLATE_VARIABLES)[number];

export interface ExtractedVariablesResult {
  supported: string[];
  unsupported: string[];
}

// Matches mustache-like variables: {{variableName}}
const VARIABLE_REGEX = /\{\{([^}]+)\}\}/g;

/**
 * Extracts and classifies all template variable tokens from a given text string.
 */
export const extractTemplateVariables = (content: string): ExtractedVariablesResult => {
  if (!content || typeof content !== 'string') {
    return { supported: [], unsupported: [] };
  }

  const supportedSet = new Set<string>();
  const unsupportedSet = new Set<string>();

  const matches = content.matchAll(VARIABLE_REGEX);
  for (const match of matches) {
    const rawToken = match[1].trim();

    if ((SUPPORTED_TEMPLATE_VARIABLES as readonly string[]).includes(rawToken)) {
      supportedSet.add(rawToken);
    } else {
      unsupportedSet.add(rawToken);
    }
  }

  return {
    supported: Array.from(supportedSet),
    unsupported: Array.from(unsupportedSet)
  };
};

/**
 * Extracts variables from multiple content blocks (e.g. subject, htmlBody, textBody).
 */
export const extractAllTemplateVariables = (
  contents: (string | undefined | null)[]
): ExtractedVariablesResult => {
  const supportedSet = new Set<string>();
  const unsupportedSet = new Set<string>();

  for (const content of contents) {
    if (content) {
      const { supported, unsupported } = extractTemplateVariables(content);
      supported.forEach((v) => supportedSet.add(v));
      unsupported.forEach((v) => unsupportedSet.add(v));
    }
  }

  return {
    supported: Array.from(supportedSet),
    unsupported: Array.from(unsupportedSet)
  };
};

/**
 * Safely renders a template string with lead attributes.
 *
 * Rules:
 * - Replaces supported placeholders {{variableName}} with lead data.
 * - Missing lead values are replaced with an empty string ("").
 * - Does NOT evaluate expressions, functions, or executable code.
 */
export const renderTemplate = (
  templateText: string,
  leadData: Record<string, any>
): string => {
  if (!templateText || typeof templateText !== 'string') {
    return '';
  }

  return templateText.replace(VARIABLE_REGEX, (match, rawKey) => {
    const key = rawKey.trim();

    if ((SUPPORTED_TEMPLATE_VARIABLES as readonly string[]).includes(key)) {
      const val = leadData?.[key];
      if (val === undefined || val === null) {
        return '';
      }
      return String(val);
    }

    // Leave unrecognized patterns untouched if any slip through rendering
    return match;
  });
};
