/** Static React/Tailwind authoring guard. Dynamic geometry and domain data remain runtime values. */
import ts from 'typescript';
const scaled = /^(?:(?:padding|margin)(?:-[a-z-]+)?|(?:row-|column-)?gap|font-size|border(?:-[a-z-]+)?-radius)$/;
const colorProperty = /(?:^color$|color$|^background$|^fill$|^stroke$|^--)/;
const colorLiteral = /#[\da-f]{3,8}\b|\b(?:rgb|rgba|hsl|hsla)\(/i;
const unbox = node => {
  while (node && (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression(node)))
    node = node.expression;
  return node;
};
const cssName = key => (key.startsWith('--') ? key : key.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`));

export function semanticAliases(sources) {
  const aliases = new Set();
  for (const file of sources.filter(file => file.path.endsWith('.css'))) {
    for (const theme of file.source.matchAll(/@theme\s+(?:inline\s*)?\{([^}]+)\}/g))
      for (const match of theme[1].matchAll(/--(color|font|spacing|radius|text|font-weight|leading|duration|ease)-([\w-]+)\s*:\s*var\(--[\w-]+\)\s*;/g))
        aliases.add(`${match[1]}:${match[2]}`);
  }
  return aliases;
}

function utilityBase(value) {
  let depth = 0,
    start = 0;
  for (let i = 0; i < value.length; i++) {
    if ('[('.includes(value[i])) depth++;
    if ('])'.includes(value[i])) depth--;
    if (value[i] === ':' && depth === 0) start = i + 1;
  }
  return value.slice(start).replace(/^!|!$/g, '').replace(/^-/, '');
}
function utilityViolation(token, aliases) {
  const value = utilityBase(token);
  if (value === 'rounded') return 'fixed or unmapped utility';
  const arbitrary = value.match(/^\[([\w-]+):(.+)\]$/);
  if (arbitrary) return styleViolation(arbitrary[1], arbitrary[2]);
  const match = value.match(
    /^(p[xysetblr]?|m[xysetblr]?|gap(?:-[xy])?|space-[xy]|rounded(?:-[a-z]+)?|text|bg|border(?:-[xysetblr])?|ring|outline|fill|stroke|font|leading|duration|delay|ease|tracking|animate)-(.+)$/,
  );
  if (!match) return null;
  const [, prefix, raw] = match;
  // Width/position/layout remain geometry. Border widths/styles are not palette values.
  if (/^(border|ring|outline|stroke)/.test(prefix) && /^(?:\d+|solid|dashed|dotted|double|none)$/.test(raw)) return null;
  if (prefix === 'text' && /^(?:left|right|center|justify|start|end|wrap|nowrap|balance|pretty|ellipsis|clip)$/.test(raw)) return null;
  if (prefix === 'bg' && /^(?:none|cover|contain|center|fixed|local|scroll|clip-.+|origin-.+|repeat.*|no-repeat)$/.test(raw)) return null;
  if (['transparent', 'current', 'inherit'].includes(raw)) return null;
  if (raw === '0' || (/^m/.test(prefix) && raw === 'auto')) return null;
  if (/^\[(?:[\w-]+:)?var\(--[\w-]+\)\]$/.test(raw) || /^\(--[\w-]+\)$/.test(raw)) return null;
  const name = raw.split('/')[0];
  const groups = /^(p|m|gap|space)/.test(prefix)
    ? ['spacing']
    : prefix.startsWith('rounded')
      ? ['radius']
      : prefix === 'text'
        ? ['color', 'text']
        : prefix === 'font'
          ? ['font', 'font-weight']
          : prefix === 'leading'
            ? ['leading']
            : ['duration', 'delay'].includes(prefix)
              ? ['duration']
              : prefix === 'ease'
                ? ['ease']
                : ['color'];
  return groups.some(group => aliases.has(`${group}:${name}`)) && !raw.includes('/') ? null : 'fixed or unmapped utility';
}
function styleViolation(property, value, numeric = false) {
  if (colorProperty.test(property) && colorLiteral.test(value)) return 'fixed color';
  if (scaled.test(property) && (numeric || /(?<![\w.-])-?\d*\.?\d+(?:px|rem|em|%)(?![\w-])/.test(value.replace(/var\(--[\w-]+\)/g, ''))) && value !== '0')
    return `fixed ${property}`;
  if (/^(font-weight|line-height)$/.test(property) && /^\d/.test(value) && value !== '0') return `fixed ${property}`;
  if (/^(animation|transition)/.test(property) && /\b\d*\.?\d+(?:ms|s)\b/.test(value)) return 'fixed motion';
  return null;
}
export function auditReactSource(path, source, aliases) {
  const root = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, /\.[jt]sx$/.test(path) ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const failures = [];
  const declarations = new Map();
  const scope = node => {
    for (let current = node.parent; current; current = current.parent)
      if (ts.isBlock(current) || ts.isSourceFile(current) || ts.isArrowFunction(current)) return current;
    return root;
  };
  const collect = node => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const entries = declarations.get(node.name.text) ?? [];
      entries.push({ scope: scope(node), value: node.initializer, constant: !!(node.parent.flags & ts.NodeFlags.Const) });
      declarations.set(node.name.text, entries);
    }
    ts.forEachChild(node, collect);
  };
  collect(root);
  function binding(node, constantsOnly = false) {
    if (!ts.isIdentifier(node)) return null;
    const entries = declarations.get(node.text) ?? [];
    const declares = name =>
      ts.isIdentifier(name) ? name.text === node.text : name.elements.some(element => ts.isBindingElement(element) && declares(element.name));
    for (let parent = node; parent; parent = parent.parent) {
      const entry = entries.find(candidate => candidate.scope === parent);
      if (entry) return !constantsOnly || entry.constant ? entry.value : null;
      if (ts.isFunctionLike(parent) && parent.parameters.some(parameter => declares(parameter.name))) return null;
    }
    return null;
  }
  function staticValue(node, seen = new Set()) {
    node = unbox(node);
    if (!node || seen.has(node)) return undefined;
    seen = new Set(seen).add(node);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isIdentifier(node)) return staticValue(binding(node, true), seen);
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator)) {
      const value = staticValue(node.operand, seen);
      if (typeof value === 'number') return node.operator === ts.SyntaxKind.MinusToken ? -value : value;
    }
    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const part = staticValue(span.expression, seen);
        if (part === undefined) return undefined;
        value += String(part) + span.literal.text;
      }
      return value;
    }
    // Imports, calls and runtime expressions are unknown, never evaluated.
    return undefined;
  }
  function propertyName(node) {
    if (node && ts.isComputedPropertyName(node)) {
      const value = staticValue(node.expression);
      return value === undefined ? '' : String(value);
    }
    return node && (ts.isIdentifier(node) || ts.isStringLiteral(node)) ? node.text : '';
  }
  function report(node, message) {
    const { line, character } = root.getLineAndCharacterOfPosition(node.getStart(root));
    failures.push(`${path}:${line + 1}:${character + 1}: ${message}`);
  }
  function visitValue(node, mode, property = '', seen = new Set()) {
    node = unbox(node);
    if (!node || seen.has(node)) return;
    seen = new Set(seen).add(node);
    const resolved = binding(node);
    if (resolved) return visitValue(resolved, mode, property, seen);
    if (ts.isConditionalExpression(node)) {
      visitValue(node.whenTrue, mode, property, seen);
      visitValue(node.whenFalse, mode, property, seen);
    } else if (ts.isBinaryExpression(node)) {
      // Short-circuit/fallback branches can contain static design values.
      if ([ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(node.operatorToken.kind)) {
        visitValue(node.left, mode, property, seen);
        visitValue(node.right, mode, property, seen);
      }
    } else if (ts.isObjectLiteralExpression(node)) {
      for (const field of node.properties) {
        if (ts.isSpreadAssignment(field)) visitValue(field.expression, mode, property, seen);
        if (ts.isPropertyAssignment(field)) {
          if (mode === 'style') visitValue(field.initializer, mode, cssName(propertyName(field.name)), seen);
          else {
            // clsx object keys are classes; cva nested values are classes.
            inspectClasses(field.name, propertyName(field.name));
            visitValue(field.initializer, mode, property, seen);
          }
        }
        if (ts.isShorthandPropertyAssignment(field)) visitValue(field.name, mode, mode === 'style' ? cssName(field.name.text) : property, seen);
      }
    } else if (ts.isArrayLiteralExpression(node)) node.elements.forEach(item => visitValue(item, mode, property, seen));
    else if (ts.isCallExpression(node) && mode === 'class') {
      if (['cn', 'clsx', 'cva'].includes(node.expression.getText(root))) node.arguments.forEach(arg => visitValue(arg, mode, property, seen));
    } else if (
      ts.isPrefixUnaryExpression(node) &&
      ts.isNumericLiteral(node.operand) &&
      [ts.SyntaxKind.MinusToken, ts.SyntaxKind.PlusToken].includes(node.operator)
    ) {
      if (mode === 'style') {
        const value = (node.operator === ts.SyntaxKind.MinusToken ? '-' : '') + node.operand.text;
        const violation = styleViolation(property, value, true);
        if (violation) report(node, `${violation}: ${property}: ${value}`);
      }
    } else if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      if (mode === 'class') inspectClasses(node, node.text);
      else {
        const violation = styleViolation(property, node.text, ts.isNumericLiteral(node));
        if (violation) report(node, `${violation}: ${property}: ${node.text}`);
      }
    } else if (ts.isTemplateExpression(node)) {
      // Resolve local constants before policy checks; unresolved data stays unknown.
      // A marker preserves token boundaries: p-${runtime} is unknown, but adjacent p-4 is still authored.
      const value = node.head.text + node.templateSpans.map(span => (staticValue(span.expression) ?? '\0') + span.literal.text).join('');
      if (mode === 'class') {
        for (const token of value.split(/\s+/)) if (!token.includes('\0')) inspectClasses(node, token);
      } else
        for (const chunk of value.split('\0')) {
          const violation = styleViolation(property, chunk);
          if (violation) report(node, `${violation}: ${property}: ${chunk}`);
        }
    }
  }
  function inspectClasses(node, value) {
    for (const token of value.split(/\s+/).filter(Boolean)) {
      const violation = utilityViolation(token, aliases);
      if (violation) report(node, `${violation}: ${token}`);
    }
  }
  const inspect = node => {
    if (ts.isJsxAttribute(node) && ['style', 'className'].includes(node.name.getText(root)) && node.initializer) {
      const value = ts.isJsxExpression(node.initializer) ? node.initializer.expression : node.initializer;
      visitValue(value, node.name.getText(root) === 'style' ? 'style' : 'class');
    }
    if (ts.isCallExpression(node) && ['cn', 'clsx', 'cva'].includes(node.expression.getText(root))) visitValue(node, 'class');
    ts.forEachChild(node, inspect);
  };
  inspect(root);
  return failures;
}
