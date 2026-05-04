import React from 'react';
import { useState, useEffect } from 'react';

import "./RightIconRectInput.css";

function DropdownMenu({ extraClass, labelFront, placeholder = "", value = "", name = "", inputLabel = "", height = 40, type = "text", required, options, onChange }) {
  const [userValue, setValue] = useState(value);

  useEffect(() => {
    setValue(value); // Update internal state when value prop changes
  }, [value]);

  return (
    <div className={`right-iconned-input-contaner ${labelFront ? "label-front" : ""}`}>
      {inputLabel &&
        <label htmlFor={inputLabel} className={`right-iconned-input__label ${extraClass}__label`}>
          {inputLabel}
        </label>}
      <div className={`right-iconned-input ${extraClass}__input`} style={{ height: height }}>
        <select id={inputLabel} type={type} onChange={(e) => { setValue(e.target.value); onChange?.(e) }} placeholder={placeholder} value={userValue} name={name} required={required ? "required" : ""} >
          <option value="">Select one</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};

export default DropdownMenu;