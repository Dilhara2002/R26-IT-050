import React from "react";

import "./IconButton.css";

/**
 * @description IconButton is a component that displays a button with an icon and text content
 * 
 * @param {Object} content - content of the button
 * @param {String} title - title of the button
 * @param {String} iconb - icon before text content
 * @param {String} icona - icon after text content
 * @param {Number} w - width
 * @param {Number} h - height
 * @param {Number} size - width and height. If `w` and `h` are not provided, this will be used
 * @param {String} bg - background color
 * @param {String} c - color
 * @param {String} is - icon size
 * @param {String} ts - text size
 * @param {Number} rm - right margin
 * @param {Number} lm - left margin
 * @param {Number} tm - top margin
 * @param {Number} bm - bottom margin
 * @param {String} extraClass - extra classes to add to the button
 * @param {Function} onClick - function to call when the button is clicked
 * @returns 
 */
function IconButton({ content, title, iconb, icona, w, h, size, bg, c, is, ts, rm, lm, tm, bm, extraClass, onClick }) {
  w = w || size;
  h = h || size;
  return (
    <button title={title} style={{width: `${w}px`, height:`${h}px`}} className={`icon-btn btn-bg-${bg} btn-clr-${c} btn-right-margin-${rm} btn-left-margin-${lm} ${extraClass}`} onClick={onClick}>
      {(iconb && content && <span className={`btn__icon btn__icon-${is}`}>{iconb || ""}</span>) || (iconb && <span className={`btn__icon btn__icon-${is}`}>{iconb || ""}</span>)}
      {content && <span className={`btn__text btn__text-${ts}`}>{content}</span>}
      {(icona && content && <span className={`btn__icon btn__icon-${is}`}>{icona || ""}</span>) || (icona && <span className={`btn__icon btn__icon-${is}`}>{icona || ""}</span>)}
    </button>
  );
}

export default IconButton;
