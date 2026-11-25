// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DEFAULT_COLD_DELAY_MS, createTooltipTurn, tooltipTurn } from '../src/index.js';
import { useTooltipTurn } from '../src/react.js';
import { mouseOnto, press } from './events.js';

const IDS = ['one', 'two', 'three', 'four'];
let root: ReturnType<typeof createRoot>;

function Tip({ id, store }: { id: string; store?: ReturnType<typeof createTooltipTurn> }) {
  const { visible, stage, anchorProps, tooltipProps } = useTooltipTurn(`tip-${id}`, { store });
  return (
    <span>
      <button data-anchor={id} {...anchorProps}>
        {id}
      </button>
      <span {...tooltipProps} data-stage={stage} hidden={!visible}>
        About {id}
      </span>
    </span>
  );
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(IDS.map((id) => <Tip key={id} id={id} />));
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.useRealTimers();
});

const anchor = (id: string) => document.querySelector(`[data-anchor="${id}"]`)!;
const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));
const move = (target: Element, from: Element | null = null) =>
  act(async () => mouseOnto(target, from));
/** Tooltips a person can see. */
const seen = () =>
  [...document.querySelectorAll('[role="tooltip"]:not([hidden])')].map((tip) => tip.id);

it('opens only the tooltip being rested on after the mouse has brushed past others', async () => {
  let from: Element = document.body;
  for (const id of ['one', 'two', 'three']) {
    await move(anchor(id), from);
    await wait(150);
    expect(seen()).toEqual([]);
    from = anchor(id);
  }

  await move(anchor('four'), from);
  await wait(DEFAULT_COLD_DELAY_MS + 200);
  expect(seen()).toEqual(['tip-four']);

  // A press elsewhere closes it and opens nothing more.
  await act(async () => press(document.body));
  await wait(600);
  expect(seen()).toEqual([]);
});

it('swaps to the next tooltip at once, and never shows two', async () => {
  await move(anchor('one'));
  await wait(DEFAULT_COLD_DELAY_MS + 200);
  expect(seen()).toEqual(['tip-one']);

  await move(anchor('two'), anchor('one'));
  expect(seen()).toEqual(['tip-two']);
  expect(document.getElementById('tip-one')!.dataset.stage).toBe('replaced');
  expect(document.getElementById('tip-two')!.dataset.stage).toBe('open-quick');
});

it('closes on Escape and when the mouse leaves', async () => {
  await move(anchor('one'));
  await wait(DEFAULT_COLD_DELAY_MS + 200);
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  });
  expect(seen()).toEqual([]);

  await wait(600);
  await move(anchor('two'), anchor('one'));
  await wait(DEFAULT_COLD_DELAY_MS + 200);
  expect(seen()).toEqual(['tip-two']);
  await move(document.body, anchor('two'));
  expect(seen()).toEqual([]);
});

it('opens at once on a tap, and a second tap closes it', async () => {
  await act(async () => press(anchor('three'), 'touch'));
  expect(seen()).toEqual(['tip-three']);
  await act(async () => press(anchor('three'), 'touch'));
  expect(seen()).toEqual([]);
});

it('points the anchor at its tooltip', () => {
  expect(anchor('one').getAttribute('aria-describedby')).toBe('tip-one');
  expect(document.getElementById('tip-one')!.getAttribute('role')).toBe('tooltip');
});

it('gives the turn back when an open tooltip unmounts', async () => {
  await act(async () => press(anchor('one'), 'touch'));
  expect(tooltipTurn.getState().status).toBe('open');
  await act(async () => root.render(IDS.slice(1).map((id) => <Tip key={id} id={id} />)));
  expect(tooltipTurn.getState().status).toBe('warm');
});

it('uses the store it is given', async () => {
  const store = createTooltipTurn({ coldDelay: 50 });
  await act(async () => root.render(<Tip id="own" store={store} />));
  await move(anchor('own'));
  await wait(50);
  expect(seen()).toEqual(['tip-own']);
  expect(tooltipTurn.getState().status).toBe('cold');
});

it('renders every tooltip off on the server', () => {
  const html = renderToString(<Tip id="server" />);
  expect(html).toContain('data-stage="off"');
  expect(html).toContain('hidden');
});
