/*
  Answers shared by the photo server actions and the browser code that retries
  them. A server-action file may export only functions, so they live here.
*/

/** A replace whose first answer was lost is told this on the retry. */
export const PHOTO_ALREADY_REPLACED = 'That photo has already been replaced.';
