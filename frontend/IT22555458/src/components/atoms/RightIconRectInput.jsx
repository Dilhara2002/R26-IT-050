import { useState, useEffect } from "react"

import "./RightIconRectInput.css"

/**
 * @description RightIconRectInput is a component that displays an input field with an icon on the right side.
 * 
 * @param {Boolean} labelFront - If label to display in front of the input field
 * @param {String} placeholder - placeholder text for the input field
 * @param {String} value - value of the input field
 * @param {String} name - name of the input field
 * @param {String} inputLabel - label for the input field
 * @param {String} icon - icon to display on the right side of the input field. Should be a google material icon
 * @param {Number} height - height of the input field
 * @param {String} type - type of the input field (text, password, email, etc)
 * @param {Boolean} required - whether the input field is required
 * @param {Function} onChange - function to call when the input field value changes
 * @param {String} extraClass - extra classes to add to the input field
 * @returns 
 */
function RightIconRectInput({ labelFront=false, placeholder = "", value = "", name = "", inputLabel = "", icon, height = 40, type = "text", required, onChange, extraClass }) {
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
        <input id={inputLabel} type={type} onChange={(e) => { setValue(e.target.value); onChange?.(e) }} placeholder={placeholder} value={userValue} name={name} required={required ? "required" : ""} />
        {icon && <span className="">{icon}</span>}
      </div>
    </div>
  );
}

export default RightIconRectInput;