import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'src/workspace/local-panel.js');
const configPath = join(root, 'tsconfig.json');
const config = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
const original = readFileSync(target, 'utf8');
function compile(source = original) {
  const host = ts.createCompilerHost(config.options);
  const readFile = host.readFile;
  host.readFile = path => (path === target ? source : readFile(path));
  const program = ts.createProgram(config.fileNames, config.options, host);
  return { program, diagnostics: ts.getPreEmitDiagnostics(program) };
}
function replace(before, after) {
  assert.ok(original.includes(before), 'mutation must target the actual adapter implementation');
  return original.replace(before, after);
}
test('the actual local adapter exposes concrete public result structures', t => {
  const { program, diagnostics } = compile();
  assert.deepEqual(
    diagnostics.map(d => ts.flattenDiagnosticMessageText(d.messageText, ' ')),
    [],
  );
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(target);
  const factory = source.statements.find(node => node.name?.text === 'createLocalPanelAdapter');
  const adapter = checker.getReturnTypeOfSignature(checker.getSignatureFromDeclaration(factory));
  for (const name of ['command', 'workspaces', 'personal', 'list', 'preferences']) {
    const method = checker.getTypeOfSymbolAtLocation(adapter.getProperty(name), factory);
    const result = checker.getAwaitedType(checker.getReturnTypeOfSignature(method.getCallSignatures()[0]));
    assert.equal(result.flags & ts.TypeFlags.Any, 0, `${name} must not erase its result structure to any`);
    t.diagnostic(`${name}: ${checker.typeToString(method)}`);
  }
});
test('TypeScript rejects a numeric event ID produced by the actual local command', t => {
  const source = replace('eventId: appendEvent(data, operation, command.input)', 'eventId: 123');
  const { diagnostics } = compile(source);
  const error = diagnostics.find(d => d.file?.fileName === target && /number.*string/s.test(ts.flattenDiagnosticMessageText(d.messageText, ' ')));
  assert.ok(error, 'actual command envelope must be checked in its source');
  t.diagnostic(ts.flattenDiagnosticMessageText(error.messageText, ' '));
});
test('TypeScript rejects removing the actual local adapter lifecycle method', t => {
  const source = replace('    dispose() {\n      controller.abort();\n    },\n', '');
  const { diagnostics } = compile(source);
  const error = diagnostics.find(d => d.file?.fileName === target && /dispose/.test(ts.flattenDiagnosticMessageText(d.messageText, ' ')));
  assert.ok(error, 'actual lifecycle contract must be checked in its source');
  t.diagnostic(ts.flattenDiagnosticMessageText(error.messageText, ' '));
});
