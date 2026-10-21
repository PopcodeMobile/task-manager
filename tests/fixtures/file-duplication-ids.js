// Shared API strings: preserve spelling, permit punctuation, bound UTF-16 units.
export const acceptedFileIds = [
  '.',
  'copy.v2',
  '/copy',
  '_copy',
  '-copy',
  ' copy ',
  'copy/v2',
  'copy v2',
  'é',
  '\u0085',
  '\u180e',
  ' \u200b ',
  '\u00a0x\u00a0',
  'a'.repeat(128),
  '😀'.repeat(64),
  '\tX\n',
];
export const rejectedFileIds = ['', ' ', '\t\n', '\u00a0', '\uFEFF', '\u2000', '\u2028', 'a'.repeat(129), '😀'.repeat(65), 'a'.repeat(127) + '😀', null, 1, {}];
export const unrepresentableFileIds = ['\u0000', '\uD800', '\uDC00'];
