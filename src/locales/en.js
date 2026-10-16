import ptBR from './pt-BR.js';

// English source keys are the canonical catalog; explicit forms handle plurals.
export default {
  ...Object.fromEntries(Object.keys(ptBR).map(key => [key, key])),
  'Moved “{title}” {count} days later': { one: 'Moved “{title}” {count} day later', other: 'Moved “{title}” {count} days later' },
  'Moved “{title}” {count} days earlier': { one: 'Moved “{title}” {count} day earlier', other: 'Moved “{title}” {count} days earlier' },
  '{count} tasks': { one: '{count} task', other: '{count} tasks' },
  '{count} days until {date}': { one: '{count} day until {date}', other: '{count} days until {date}' },
  ' with {count} starter tasks': { one: ' with {count} starter task', other: ' with {count} starter tasks' },
  ', its {count} subtasks,': { one: ', its {count} subtask,', other: ', its {count} subtasks,' },
};
