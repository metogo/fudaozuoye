import React from 'react';

export default function PhotoPicker({ camera, album, select }) {
  function picked(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (file) select(file);
  }
  return (
    <>
      <input className="file" tabIndex={-1} aria-hidden="true" ref={camera} aria-label="拍作业" type="file" accept="image/*" capture="environment" onChange={picked} />
      <input className="file" tabIndex={-1} aria-hidden="true" ref={album} aria-label="选择作业照片" type="file" accept="image/*" onChange={picked} />
    </>
  );
}
