import {useAtom} from 'jotai';
import React from 'react';
import {ImageSrcAtom, IsUploadedImageAtom} from './atoms';
import {imageOptions} from './consts';
import {useResetState} from './hooks';

export function ExampleImages() {
  const [, setImageSrc] = useAtom(ImageSrcAtom);
  const [, setIsUploadedImage] = useAtom(IsUploadedImageAtom);
  const resetState = useResetState();
  return (
    <div className="flex flex-wrap items-start gap-3 shrink-0 w-[190px]">
      {imageOptions.map((image) => (
        <button
          key={image}
          className="p-0 w-[56px] h-[56px] relative overflow-hidden"
          onClick={() => {
            setIsUploadedImage(false);
            setImageSrc(image);
            resetState();
          }}>
          <img
            src={image}
            className="absolute left-0 top-0 w-full h-full object-cover"
          />
        </button>
      ))}
    </div>
  );
}
