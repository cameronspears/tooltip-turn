// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_COLD_DELAY_MS,
  DEFAULT_COOL_DOWN_MS,
  createTooltipTurn,
  type TooltipTurn,
} from '../src/index.js';
import { mouseOnto, press } from './events.js';

const a = Symbol('a');
const b = Symbol('b');

const anchor = () => {
  const button = document.createElement('button');
  button.append(document.createElement('span'));
  document.body.append(button);
  return button;
};

describe('one tooltip turn', () => {
  let turn: TooltipTurn;
  let unsubscribe: () => void;
  const changes = vi.fn();

  beforeEach(() => {
    vi.useFakeTimers();
    changes.mockClear();
    turn = createTooltipTurn();
    unsubscribe = turn.subscribe(changes);
  });

  afterEach(() => {
    unsubscribe();
    document.body.replaceChildren();
    vi.useRealTimers();
  });

  it('opens a tooltip only after the mouse has rested on it', () => {
    const button = anchor();
    mouseOnto(button.firstElementChild!);
    turn.ask(a, button);
    expect(turn.stage(a)).toBe('waiting');

    vi.advanceTimersByTime(DEFAULT_COLD_DELAY_MS - 1);
    expect(turn.stage(a)).toBe('waiting');
    vi.advanceTimersByTime(1);
    expect(turn.stage(a)).toBe('open');
    expect(changes).toHaveBeenCalledTimes(2);
  });

  it('gives up if the mouse moved off before the wait ended', () => {
    const button = anchor();
    mouseOnto(button);
    turn.ask(a, button);
    mouseOnto(document.body, button);
    vi.advanceTimersByTime(DEFAULT_COLD_DELAY_MS);
    expect(turn.getState()).toEqual({ status: 'cold' });
  });

  it('starts the wait again on a new anchor, so sweeping past opens nothing', () => {
    const first = anchor();
    const second = anchor();
    mouseOnto(first);
    turn.ask(a, first);
    vi.advanceTimersByTime(DEFAULT_COLD_DELAY_MS - 100);
    mouseOnto(second, first);
    turn.ask(b, second);
    vi.advanceTimersByTime(DEFAULT_COLD_DELAY_MS - 100);
    expect(turn.stage(a)).toBe('off');
    expect(turn.stage(b)).toBe('waiting');
  });

  it('never makes a tap, a click or the keyboard wait', () => {
    const button = anchor();
    press(button);
    turn.ask(a, button);
    expect(turn.stage(a)).toBe('open');
    turn.leave(a);
    vi.advanceTimersByTime(DEFAULT_COOL_DOWN_MS);

    mouseOnto(button);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
    turn.ask(b, button);
    expect(turn.stage(b)).toBe('open');
  });

  it('opens at once when the anchor being rested on is pressed', () => {
    const button = anchor();
    mouseOnto(button);
    turn.ask(a, button);
    press(button.firstElementChild!);
    expect(turn.stage(a)).toBe('open');
  });

  it('keeps one tooltip open: the next replaces it without waiting', () => {
    const first = anchor();
    const second = anchor();
    mouseOnto(first);
    turn.ask(a, first);
    vi.advanceTimersByTime(DEFAULT_COLD_DELAY_MS);

    mouseOnto(second, first);
    turn.ask(b, second);
    expect(turn.stage(b)).toBe('open-quick');
    expect(turn.stage(a)).toBe('replaced');

    // The first tooltip's late close changes nothing.
    turn.leave(a);
    expect(turn.stage(b)).toBe('open-quick');
  });

  it('stays warm for a moment after the last one closes, then makes a mouse wait again', () => {
    const button = anchor();
    press(button);
    turn.ask(a, button);
    turn.leave(a);

    mouseOnto(button);
    vi.advanceTimersByTime(DEFAULT_COOL_DOWN_MS - 1);
    turn.ask(b, button);
    expect(turn.stage(b)).toBe('open-quick');
    // The one that just closed may still be fading out, so it goes at once.
    expect(turn.stage(a)).toBe('replaced');
    turn.leave(b);

    vi.advanceTimersByTime(DEFAULT_COOL_DOWN_MS);
    expect(turn.getState()).toEqual({ status: 'cold' });
    turn.ask(b, button);
    expect(turn.stage(b)).toBe('waiting');
  });

  it('uses the delays it is given', () => {
    unsubscribe();
    turn = createTooltipTurn({ coldDelay: 50, coolDown: 100 });
    unsubscribe = turn.subscribe(changes);
    const button = anchor();
    mouseOnto(button);
    turn.ask(a, button);
    vi.advanceTimersByTime(50);
    expect(turn.stage(a)).toBe('open');
    turn.leave(a);
    vi.advanceTimersByTime(100);
    expect(turn.getState()).toEqual({ status: 'cold' });
  });

  it('finds the anchor around what the pointer is on', () => {
    const button = anchor();
    button.setAttribute('data-tip', 'x');
    mouseOnto(button.firstElementChild!);
    expect(turn.findAnchor('[data-tip]')).toBe(button);
    expect(turn.findAnchor('[data-other]')).toBeNull();
  });
  it('ignores a hover with no anchor, and opens at once when told it is not a hover', () => {
    const button = anchor();
    mouseOnto(button);
    turn.ask(a, null);
    expect(turn.getState()).toEqual({ status: 'cold' });
    turn.ask(a, button, { hover: false });
    expect(turn.stage(a)).toBe('open');
  });

  it('finds the focused anchor when the pointer is elsewhere', () => {
    const button = anchor();
    button.setAttribute('data-tip', 'x');
    mouseOnto(document.body);
    button.focus();
    expect(turn.findAnchor('[data-tip]')).toBe(button);
  });

  it('resets to cold when the last listener goes', () => {
    const button = anchor();
    press(button);
    turn.ask(a, button);
    unsubscribe();
    expect(turn.getState()).toEqual({ status: 'cold' });
    unsubscribe = turn.subscribe(changes);
  });

  it('accepts any value as an owner', () => {
    const button = anchor();
    press(button);
    turn.ask('save', button);
    expect(turn.stage('save')).toBe('open');
    turn.ask(button, button);
    expect(turn.stage(button)).toBe('open-quick');
    expect(turn.stage('save')).toBe('replaced');
  });
});
