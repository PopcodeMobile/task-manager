import type { KeyboardEvent } from 'react';
/** One roving keyboard stop for the visible radios; arrow keys select and focus. */
export function radioKeys(event: KeyboardEvent<HTMLElement>) {
  if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
  const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="radio"]:not(:disabled)')];
  if (!choices.length) return;
  event.preventDefault();
  const current = choices.indexOf(document.activeElement as HTMLButtonElement);
  const index =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? choices.length - 1
        : (Math.max(0, current) + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) + choices.length) % choices.length;
  choices[index].focus();
  choices[index].click();
}
