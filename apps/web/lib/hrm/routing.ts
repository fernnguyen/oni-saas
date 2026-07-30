export function isLockedHrmPath(
  pathname: string,
  hrmEnabled: boolean,
): boolean {
  if (hrmEnabled) return false;

  const segments = pathname.split('/').filter(Boolean);

  if (segments[0] === 't') {
    return segments[3] === 'hrm';
  }

  return segments[1] === 'hrm';
}
