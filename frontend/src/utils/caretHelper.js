export function getCaretCoordinates(element, position) {
  const isInput = element.nodeName === "INPUT";
  const div = document.createElement("div");
  document.body.appendChild(div);

  const style = div.style;
  const computed = window.getComputedStyle(element);

  style.whiteSpace = "pre-wrap";
  style.wordWrap = "break-word";
  style.position = "absolute";
  style.visibility = "hidden";
  style.overflow = "hidden"; // Fix scrollbar offset

  // Transfer textarea properties to div
  const properties = [
    "direction", "boxSizing", "width", "height", "overflowX", "overflowY",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "borderStyle", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "fontStyle", "fontVariant", "fontWeight", "fontStretch", "fontSize",
    "fontSizeAdjust", "lineHeight", "fontFamily", "textAlign", "textTransform",
    "textIndent", "textDecoration", "letterSpacing", "wordSpacing", "tabSize", "MozTabSize"
  ];

  properties.forEach((prop) => {
    if (isInput && prop === "lineHeight") {
      style.lineHeight = computed.height;
    } else {
      style[prop] = computed[prop];
    }
  });

  // Include scroll position offsets
  div.textContent = element.value.substring(0, position);
  
  // A span is placed exactly where the caret would be
  const span = document.createElement("span");
  span.textContent = element.value.substring(position) || ".";
  div.appendChild(span);

  const coordinates = {
    top: span.offsetTop + parseInt(computed.borderTopWidth) - element.scrollTop,
    left: span.offsetLeft + parseInt(computed.borderLeftWidth) - element.scrollLeft,
    height: parseInt(computed.lineHeight) || parseInt(computed.fontSize)
  };

  document.body.removeChild(div);
  return coordinates;
}
