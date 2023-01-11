export function formatTime(time: string | number) {
  return new Date(time).toISOString();
}
