import React, { useState, useRef, useEffect, useCallback } from 'react';

import './ImagePreview.css';

function ImagePreview({ id, name, required, onChange, ref}) {
  const [previewUrl, setPreviewUrl] = useState(null);
  const [fileName, setFileName] = useState('Choose File');
  const inputRef = useRef(null);

  const handleFileChange = useCallback((event) => {
    const file = event.target.files?.[0];
    if (file) {
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      onChange?.(file);
    }
  }, [onChange]);

  // Reset functionality
  const reset = useCallback(() => {
    setPreviewUrl(null);
    setFileName('Choose File');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
    onChange?.(null);
  }, [onChange]);

  // Cleanup object URLs
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Expose reset method and forward ref
  React.useImperativeHandle(ref, () => ({
    ...(inputRef.current),
    reset,
  }));

  return (
    <label className="image-upload" id={id}>
      <input
        type="file"
        name={name}
        id={id}
        className="image-upload__input"
        accept="image/*"
        onChange={handleFileChange}
        ref={inputRef}
        required={required}
      />
      <div
        className="image-upload__preview"
        style={{ backgroundImage: previewUrl ? `url(${previewUrl})` : undefined }}
      />
      <div className="image-upload__path">{fileName}</div>
    </label>
  );
}

export default ImagePreview;