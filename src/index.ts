/**
 * One tooltip on the page at a time, as on a Mac.
 *
 * Every tooltip asks a shared turn before it shows, and only the one whose turn it is may be
 * seen. The first one a mouse rests on waits a moment, so sweeping across a page doesn't flash
 * tooltips over everything. Once one is open, the next opens at once and the open one goes, until
 * no tooltip has been open for a short while. A tap, a click or the keyboard never waits: the
 * person asked for the tooltip.
 *
 * The wait lives here, not in the tooltip library, so give your library no delay of its own.
 */

/** How long a mouse rests on a cold anchor before its tooltip opens, by default. */
export const DEFAULT_COLD_DELAY_MS = 400;
/** How long tooltips stay warm after the last one closes, by default. */
export const DEFAULT_COOL_DOWN_MS = 500;

/** Anything that names one tooltip: a string id, a symbol, an object. Compared with `===`. */
export type TooltipOwner = unknown;

/** Whose turn it is. */
export type TurnState =
  /** Nothing is open, and a mouse must rest on an anchor before its tooltip opens. */
  | { status: 'cold' }
  /** A mouse is resting on `anchor`. Nothing shows yet; `owner` opens if the mouse stays. */
  | { status: 'waiting'; owner: TooltipOwner; anchor: Element }
  /**
   * `owner` is the one tooltip on screen. `quick` when it followed another, so it can come in
   * faster; `tookOverFrom` is the tooltip it replaced, which should go at once instead of fading.
   */
  | { status: 'open'; owner: TooltipOwner; quick: boolean; tookOverFrom: TooltipOwner | null }
  /** Nothing is open, but `last` just was: the next opens without waiting. */
  | { status: 'warm'; last: TooltipOwner };

/**
 * Where one tooltip stands. Only `open` and `open-quick` are seen. `replaced` is off screen like
 * the rest, but just lost the turn, so it should vanish at once instead of fading out.
 */
export type TooltipStage = 'off' | 'replaced' | 'waiting' | 'open' | 'open-quick';

/** Settings for {@link createTooltipTurn}. */
export interface TooltipTurnOptions {
  /** How long a mouse must rest on an anchor before the first tooltip opens. Default 400ms. */
  coldDelay?: number;
  /** How long after the last tooltip closes the next still opens at once. Default 500ms. */
  coolDown?: number;
}

/** Settings for one {@link TooltipTurn.ask} call. */
export interface AskOptions {
  /**
   * Whether a mouse is only passing over the anchor, which is what has to wait. Leave it out and
   * the store works it out from the last input: a press or a key means the person asked.
   */
  hover?: boolean;
}

/**
 * A shared turn that decides which one tooltip may be seen. Made by {@link createTooltipTurn}.
 * Its shape fits React's `useSyncExternalStore` and any other subscribe/get store.
 */
export interface TooltipTurn {
  /**
   * Listen for changes. While anyone listens, the store watches pointer and key input on
   * `window`, so it can tell a passing mouse from a press. When the last listener goes, the
   * turn resets to cold.
   * @param listener Called after every change. Read the new state with `getState` or `stage`.
   * @returns A function that stops listening.
   */
  subscribe(listener: () => void): () => void;
  /**
   * The whole turn: who has it and in what state. The same object until something changes.
   * @returns The current {@link TurnState}.
   */
  getState(): TurnState;
  /**
   * Where one tooltip stands. Show it only for `open` and `open-quick`.
   * @param owner The tooltip to look up.
   * @param at A turn to read instead of the current one.
   * @returns That tooltip's {@link TooltipStage}.
   */
  stage(owner: TooltipOwner, at?: TurnState): TooltipStage;
  /**
   * A tooltip wants to open. It waits (a cold mouse hover), opens at once (a press, a key, or
   * while warm), or takes over from the open one.
   * @param owner The tooltip asking: any value, compared with `===`.
   * @param anchor The element the tooltip explains. A hover with no anchor is ignored.
   * @param options Set `hover` to say yourself whether this is a passing mouse.
   */
  ask(owner: TooltipOwner, anchor: Element | null, options?: AskOptions): void;
  /**
   * A tooltip closed, gave up waiting, or is gone. Ignored if it isn't that tooltip's turn, so a
   * late close from a replaced tooltip is harmless.
   * @param owner The tooltip leaving.
   */
  leave(owner: TooltipOwner): void;
  /**
   * The nearest element matching `selector` around what the pointer is on, or else around what
   * has focus. Handy when a library tells you a tooltip opened but not on which anchor.
   * @param selector A CSS selector, for example `[data-tooltip-id="save"]`.
   * @returns The anchor, or `null` if neither the pointer nor focus is inside one.
   */
  findAnchor(selector: string): Element | null;
}

type Move =
  | { type: 'ask'; owner: TooltipOwner; anchor: Element | null; hover: boolean }
  | { type: 'rested'; owner: TooltipOwner }
  | { type: 'leave'; owner: TooltipOwner }
  | { type: 'cooled' };

const COLD: TurnState = { status: 'cold' };

/**
 * The only way a turn changes. A move that isn't allowed returns the same turn: a tooltip can't
 * close or finish waiting on another's turn, and a hover with no anchor has already moved on.
 */
function move(turn: TurnState, m: Move): TurnState {
  switch (m.type) {
    case 'ask': {
      if (m.hover && !m.anchor) return turn;
      if (turn.status === 'open') {
        if (turn.owner === m.owner) return turn;
        return { status: 'open', owner: m.owner, quick: true, tookOverFrom: turn.owner };
      }
      if (turn.status === 'warm') {
        // `last` may still be fading out: it goes at once, so two are never seen together.
        const last = turn.last === m.owner ? null : turn.last;
        return { status: 'open', owner: m.owner, quick: true, tookOverFrom: last };
      }
      if (m.hover && m.anchor) {
        const sameWait =
          turn.status === 'waiting' && turn.owner === m.owner && turn.anchor === m.anchor;
        // A new anchor starts the wait again, so sweeping down a column never opens one.
        return sameWait ? turn : { status: 'waiting', owner: m.owner, anchor: m.anchor };
      }
      return { status: 'open', owner: m.owner, quick: false, tookOverFrom: null };
    }
    case 'rested':
      return turn.status === 'waiting' && turn.owner === m.owner
        ? { status: 'open', owner: m.owner, quick: false, tookOverFrom: null }
        : turn;
    case 'leave':
      if (turn.status === 'waiting' && turn.owner === m.owner) return COLD;
      if (turn.status === 'open' && turn.owner === m.owner)
        return { status: 'warm', last: m.owner };
      return turn;
    case 'cooled':
      return turn.status === 'warm' ? COLD : turn;
  }
}

function stageOf(owner: TooltipOwner, at: TurnState): TooltipStage {
  if (at.status === 'waiting') return at.owner === owner ? 'waiting' : 'off';
  if (at.status === 'open') {
    if (at.owner === owner) return at.quick ? 'open-quick' : 'open';
    return at.tookOverFrom === owner ? 'replaced' : 'off';
  }
  return 'off';
}

/**
 * Make a turn of your own, for example with other delays. Every tooltip that should take turns
 * must share the same one. Most pages want the shared {@link tooltipTurn} instead.
 * @param options `coldDelay` and `coolDown` in milliseconds.
 * @returns A new {@link TooltipTurn}, cold.
 * @example
 * const turn = createTooltipTurn({ coldDelay: 600 });
 * turn.subscribe(() => {
 *   tip.hidden = !turn.stage(button).startsWith('open');
 * });
 * button.addEventListener('pointerenter', () => turn.ask(button, button));
 * button.addEventListener('pointerleave', () => turn.leave(button));
 * button.addEventListener('focus', () => turn.ask(button, button));
 * button.addEventListener('blur', () => turn.leave(button));
 */
export function createTooltipTurn(options: TooltipTurnOptions = {}): TooltipTurn {
  const coldDelay = options.coldDelay ?? DEFAULT_COLD_DELAY_MS;
  const coolDown = options.coolDown ?? DEFAULT_COOL_DOWN_MS;

  let turn: TurnState = COLD;
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  // A press or a key means the person asked; a mouse moving means they may only be passing by.
  let asked = false;
  // The element under the pointer. `undefined` until the first pointer move is seen.
  let hovered: Element | null | undefined;
  let watching = false;

  const clearTimer = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  // Whether a pointer or focus is still on the anchor. If we haven't seen the pointer yet, trust
  // the caller, who will say when it leaves.
  const stillOn = (anchor: Element) => {
    if (!anchor.isConnected) return false;
    if (hovered === undefined) return true;
    return anchor.contains(hovered) || anchor.contains(document.activeElement);
  };

  function dispatch(m: Move) {
    const next = move(turn, m);
    if (next === turn) return;
    turn = next;
    clearTimer();
    if (next.status === 'waiting') {
      timer = setTimeout(() => {
        timer = null;
        // Libraries often report a mouse leaving a little late, so look for ourselves.
        dispatch({ type: stillOn(next.anchor) ? 'rested' : 'leave', owner: next.owner });
      }, coldDelay);
    } else if (next.status === 'warm') {
      timer = setTimeout(() => {
        timer = null;
        dispatch({ type: 'cooled' });
      }, coolDown);
    }
    listeners.forEach((listener) => listener());
  }

  const onPointerDown = (event: PointerEvent) => {
    asked = true;
    // Pressing the anchor you are resting on is asking for its tooltip.
    if (turn.status === 'waiting' && event.target instanceof Node) {
      if (turn.anchor.contains(event.target)) dispatch({ type: 'rested', owner: turn.owner });
    }
  };
  const onKeyDown = () => {
    asked = true;
  };
  const onPointerOver = (event: PointerEvent) => {
    hovered = event.target instanceof Element ? event.target : null;
    // Moving onto a new element with a mouse is hover again. Only the mouse: touch fires this too.
    if (event.pointerType === 'mouse' && event.buttons === 0) asked = false;
  };
  const onPointerOut = (event: PointerEvent) => {
    // The pointer left the page.
    if (!event.relatedTarget) hovered = null;
  };

  const inputEvents = [
    ['pointerdown', onPointerDown],
    ['keydown', onKeyDown],
    ['pointerover', onPointerOver],
    ['pointerout', onPointerOut],
  ] as const;

  function watchInput() {
    if (watching || typeof window === 'undefined') return;
    watching = true;
    for (const [type, handler] of inputEvents) {
      window.addEventListener(type, handler as EventListener, { capture: true, passive: true });
    }
  }

  function unwatchInput() {
    if (!watching) return;
    watching = false;
    for (const [type, handler] of inputEvents) {
      window.removeEventListener(type, handler as EventListener, { capture: true });
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      watchInput();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          unwatchInput();
          clearTimer();
          turn = COLD;
          asked = false;
          hovered = undefined;
        }
      };
    },
    getState: () => turn,
    stage: (owner, at = turn) => stageOf(owner, at),
    ask(owner, anchor, askOptions = {}) {
      watchInput();
      dispatch({ type: 'ask', owner, anchor, hover: askOptions.hover ?? !asked });
    },
    leave(owner) {
      dispatch({ type: 'leave', owner });
    },
    findAnchor(selector) {
      if (typeof document === 'undefined') return null;
      for (const from of [hovered, document.activeElement]) {
        const found = from?.isConnected ? from.closest(selector) : null;
        if (found) return found;
      }
      return null;
    },
  };
}

/**
 * The page's shared turn, with the default delays (400ms to open cold, 500ms to cool down).
 * @example
 * import { tooltipTurn } from 'tooltip-turn';
 * tooltipTurn.ask(button, button);
 */
export const tooltipTurn: TooltipTurn = createTooltipTurn();
