import {useAtom} from 'jotai';
import React from 'react';
import {DetectTypeAtom, HoverEnteredAtom, RevealOnHoverModeAtom, ThemeAtom} from './atoms';
import {useResetState} from './hooks';

export function TopBar() {
  const resetState = useResetState();
  const [revealOnHover, setRevealOnHoverMode] = useAtom(RevealOnHoverModeAtom);
  const [detectType] = useAtom(DetectTypeAtom);
  const [, setHoverEntered] = useAtom(HoverEnteredAtom);
  const [theme, setTheme] = useAtom(ThemeAtom);

  return (
    <div className="flex w-full items-center px-3 py-2 border-b justify-between">
      <div className="flex gap-3 items-center">
        <button
          onClick={() => {
            resetState();
          }}
          className="!p-0 !border-none underline bg-transparent"
          style={{
            minHeight: '0',
          }}>
          <div>Reset session</div>
        </button>
      </div>
      <div className="flex gap-3 items-center">
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="!p-0 !border-none bg-transparent flex items-center justify-center p-2 rounded-full hover:bg-[var(--border-color)] transition-colors w-8 h-8"
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          style={{ minHeight: '0' }}
        >
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
        {detectType === '2D bounding boxes' ? (
          <div>
            <label className="flex items-center gap-2 px-3 select-none whitespace-nowrap">
              <input
                type="checkbox"
                checked={revealOnHover}
                onChange={(e) => {
                  if (e.target.checked) {
                    setHoverEntered(false);
                  }
                  setRevealOnHoverMode(e.target.checked);
                }}
              />
              <div>reveal on hover</div>
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
