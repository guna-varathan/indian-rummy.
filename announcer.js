let announceTimer = null;

/**
 * Updates the screen reader live region so the message is spoken aloud.
 * @param {string} message - The message to be read aloud by screen readers.
 */
export function announce(message) {
  const announcer = document.getElementById('announcer');
  if (!announcer) {
    console.warn('Announcer element (#announcer) was not found in the document.');
    return;
  }
  if (announceTimer) clearTimeout(announceTimer);
  announcer.textContent = '';
  announceTimer = setTimeout(() => {
    announcer.textContent = message;
    announceTimer = null;
  }, 80);
}

export default announce;
