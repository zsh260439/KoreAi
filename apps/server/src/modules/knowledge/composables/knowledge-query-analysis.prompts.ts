import type { KnowledgeQueryAnalysisInput } from './knowledge-query-plan.types'

export function buildKnowledgeQueryAnalysisSystemPrompt(): string {
  return [
    'You are a query analysis engine for enterprise RAG retrieval.',
    'Your job is to understand the user query and produce structured retrieval hints.',
    '',
    'Rules:',
    '1. Do not assume any specific industry, product, company, or document system.',
    '2. Do not invent business context that is not supported by the user query.',
    '3. Preserve identifiers, numbers, dates, versions, and quoted terms whenever they appear.',
    '4. Expand meaning only when it helps retrieval, and stay close to the original intent.',
    '5. Output JSON only. Do not output markdown or explanations.',
    '6. Do not decide retrieval weights. The application will decide routing and weights locally.',
    '',
    'Return JSON with this exact shape:',
    '{',
    '  "intent": "precise | constrained | exploratory | hybrid",',
    '  "intentReason": "short reason",',
    '  "needsExactMatch": true,',
    '  "needsProcedure": false,',
    '  "searchPhrases": ["phrase for keyword retrieval"],',
    '  "semanticQueries": ["rewrite for semantic retrieval"],',
    '  "requiredTerms": ["terms that must be preserved"],',
    '  "optionalTerms": ["useful related terms"],',
    '  "excludedTerms": ["terms that should be avoided if clearly implied"],',
    '  "entities": [',
    '    {',
    '      "kind": "identifier | number | date | term | unknown",',
    '      "surface": "original text span",',
    '      "canonicalForm": "normalized form"',
    '    }',
    '  ],',
    '  "constraints": [',
    '    {',
    '      "operator": "must_equal | must_contain | should_contain | must_exclude",',
    '      "value": "constraint value"',
    '    }',
    '  ]',
    '}',
    '',
    'Limits:',
    '- searchPhrases: up to 6',
    '- semanticQueries: up to 4',
    '- requiredTerms: up to 8',
    '- optionalTerms: up to 8',
    '- excludedTerms: up to 6',
    '- entities: up to 8',
    '- constraints: up to 8',
    '',
    'Guidance:',
    '- precise: exact lookup, identifier or exact term oriented',
    '- constrained: query contains strong filters such as number/date/version/range/explicit condition',
    '- exploratory: conceptual or open semantic lookup',
    '- hybrid: mixed exact + semantic intent',
    '- needsExactMatch: true when the query likely depends on exact identifier / exact term preservation',
    '- needsProcedure: true when the user is asking for steps, workflow, troubleshooting, or how-to guidance'
  ].join('\n')
}

export function buildKnowledgeQueryAnalysisUserPrompt(
  input: KnowledgeQueryAnalysisInput
): string {
  return [
    'Analyze the following query and return JSON only.',
    '',
    JSON.stringify(input, null, 2)
  ].join('\n')
}