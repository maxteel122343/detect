import {useAtom} from 'jotai';
import React from 'react';
import {DetectTypeAtom, HoverEnteredAtom} from './atoms';
import {DetectTypes} from './Types';

export function DetectTypeSelector() {
  return (
    <div className="flex flex-col flex-shrink-0">
      <div className="mb-3 uppercase">Give me:</div>
      <div className="flex flex-col gap-3">
        {['2D bounding boxes', 'Points'].map((label) => (
          <SelectOption key={label} label={label} />
        ))}
      </div>
    </div>
  );
}

const SelectOption: React.FC<{label: string}> = ({label}) => {
  const [detectType, setDetectType] = useAtom(DetectTypeAtom);
  const [, setHoverEntered] = useAtom(HoverEnteredAtom);

  return (
    <button
      className={`py-6 items-center bg-transparent text-center gap-3`}
      style={{
        borderColor: detectType === label ? 'var(--accent-color)' : undefined,
        backgroundColor:
          detectType === label ? 'var(--border-color)' : undefined,
      }}
      onClick={() => {
        setHoverEntered(false);
        setDetectType(label as DetectTypes);
      }}>
      {label}
    </button>
  );
}
