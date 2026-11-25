import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { tooltipTurn, type AskOptions, type TooltipStage, type TooltipTurn } from './index.js';

export type { AskOptions, TooltipStage, TooltipTurn } from './index.js';

/** Settings for {@link useTooltipTurn}. */
export interface UseTooltipTurnOptions {
  /** The turn to share. Defaults to the page's shared `tooltipTurn`. */
  store?: TooltipTurn;
}

/** Props to spread on the element a tooltip explains. */
export interface TooltipAnchorProps {
  /** A mouse arriving asks for the turn (and may wait). */
  onPointerEnter(event: ReactPointerEvent<Element>): void;
  /** A mouse leaving gives the turn back. */
  onPointerLeave(event: ReactPointerEvent<Element>): void;
  /** A tap or pen press opens the tooltip at once, or closes it if open. */
  onPointerDown(event: ReactPointerEvent<Element>): void;
  /** Focus asks for the turn; from the keyboard it never waits. */
  onFocus(event: FocusEvent<Element>): void;
  /** Losing focus gives the turn back. */
  onBlur(event: FocusEvent<Element>): void;
  /** Points at the tooltip, so screen readers read it with the anchor. */
  'aria-describedby': string;
}

/** What {@link useTooltipTurn} returns. */
export interface UseTooltipTurn {
  /** Where this tooltip stands. Show it only when `visible`. */
  stage: TooltipStage;
  /** True for `open` and `open-quick`. */
  visible: boolean;
  /** Spread on the element the tooltip explains. */
  anchorProps: TooltipAnchorProps;
  /** Spread on the tooltip itself. */
  tooltipProps: { id: string; role: 'tooltip' };
  /** Ask for the turn yourself, for example from a tooltip library's open callback. */
  ask(anchor: Element | null, options?: AskOptions): void;
  /** Give the turn back, for example from a tooltip library's close callback. */
  leave(): void;
}

const offStage = (): TooltipStage => 'off';

/**
 * One tooltip's place in the page's turn. Re-renders only when this tooltip's stage changes.
 * Escape or a press outside the anchor closes it while open, and it leaves the turn on unmount.
 * @param id The tooltip element's id. The anchor points at it with aria-describedby.
 * @param options `store` to share a turn other than the default one.
 * @returns The stage, whether to show the tooltip, and props for the anchor and the tooltip.
 * @example
 * function SaveButton() {
 *   const tip = useTooltipTurn('save-tip');
 *   return (
 *     <>
 *       <button {...tip.anchorProps}>Save</button>
 *       <div {...tip.tooltipProps} hidden={!tip.visible}>Save your changes</div>
 *     </>
 *   );
 * }
 */
export function useTooltipTurn(id: string, options: UseTooltipTurnOptions = {}): UseTooltipTurn {
  const store = options.store ?? tooltipTurn;
  const [owner] = useState(() => Symbol(id));
  const anchorRef = useRef<Element | null>(null);

  const readStage = useCallback(() => store.stage(owner), [store, owner]);
  const stage = useSyncExternalStore(store.subscribe, readStage, offStage);
  const visible = stage === 'open' || stage === 'open-quick';

  const ask = useCallback(
    (anchor: Element | null, askOptions?: AskOptions) => {
      anchorRef.current = anchor;
      store.ask(owner, anchor, askOptions);
    },
    [store, owner],
  );
  const leave = useCallback(() => store.leave(owner), [store, owner]);

  // While open: Escape, or a press outside the anchor, closes it. Taps don't always move focus
  // (Safari doesn't focus a tapped button), so blur alone isn't enough.
  useEffect(() => {
    if (!visible) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') leave();
    };
    const onPointerDown = (event: PointerEvent) => {
      const anchor = anchorRef.current;
      if (!anchor || !(event.target instanceof Node) || !anchor.contains(event.target)) leave();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [visible, leave]);

  // A tooltip that unmounts never reports closing.
  useEffect(() => leave, [leave]);

  const anchorProps: TooltipAnchorProps = {
    onPointerEnter: (event) => {
      if (event.pointerType === 'mouse') ask(event.currentTarget);
    },
    onPointerLeave: (event) => {
      if (event.pointerType === 'mouse') leave();
    },
    // A tap or a pen press toggles the tooltip, and never waits.
    onPointerDown: (event) => {
      if (event.pointerType === 'mouse') return;
      if (visible) leave();
      else ask(event.currentTarget, { hover: false });
    },
    onFocus: (event) => ask(event.currentTarget),
    onBlur: () => leave(),
    'aria-describedby': id,
  };

  return { stage, visible, anchorProps, tooltipProps: { id, role: 'tooltip' }, ask, leave };
}
