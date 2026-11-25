/** A mouse moving onto `target` from `from`, as the browser reports it. */
export function mouseOnto(target: Element, from: Element | null = null) {
  if (from) from.dispatchEvent(pointer('pointerout', target));
  target.dispatchEvent(pointer('pointerover', from));
}

/** A press on `target`. */
export function press(target: Element, pointerType = 'mouse') {
  target.dispatchEvent(pointer('pointerdown', null, pointerType));
}

// jsdom has no PointerEvent, so build one from a MouseEvent.
function pointer(type: string, relatedTarget: Element | null, pointerType = 'mouse') {
  const event = new MouseEvent(type, { bubbles: true, buttons: 0, relatedTarget });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  return event;
}
