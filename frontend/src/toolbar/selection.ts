

type Rectangle = {
  id: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  selected: boolean;
};

type Element = Rectangle;

export function getSelectedElement(
  x: number,
  y: number,
  elements: Element[]
): Element | null {

  // Go backwards so the top-most element is checked first
  for (let i = elements.length - 1; i >= 0; i--) {

    const element = elements[i];

    if (element.type === "rectangle") {

      const inside =
        x >= element.x &&
        x <= element.x + element.width &&
        y >= element.y &&
        y <= element.y + element.height;

      if (inside) {
        return element;
      }
    }
  }

  return null;
}