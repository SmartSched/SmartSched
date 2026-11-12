// Small app-wide signals the blob listens to, so pages don't need to know it exists.
//   task-done: a task was checked off
//   cleared:   the last open task in a group (or today's last task block) was checked off
//   day-filed: the evening check-in was saved and the day went into the jar
export type JuiceEvent = 'task-done' | 'cleared' | 'day-filed';

const target = new EventTarget();

export function emitJuice(event: JuiceEvent) {
  target.dispatchEvent(new Event(event));
}

export function onJuice(event: JuiceEvent, handler: () => void) {
  target.addEventListener(event, handler);
  return () => target.removeEventListener(event, handler);
}
