// Avery label sheets (US Letter). Measurements in inches, from Avery's templates.
export interface LabelSheet {
  id: string;
  name: string;
  cols: number;
  rows: number;
  width: number;
  height: number;
  top: number;
  left: number;
  /** Distance from one label's left edge to the next. */
  pitchX: number;
  /** Distance from one label's top edge to the next. */
  pitchY: number;
}

export const LABEL_SHEETS: LabelSheet[] = [
  { id: "5160", name: "Avery 5160 / 8160 (30 per sheet, 1\" × 2⅝\")", cols: 3, rows: 10, width: 2.625, height: 1, top: 0.5, left: 0.1875, pitchX: 2.75, pitchY: 1 },
  { id: "5163", name: "Avery 5163 / 8163 (10 per sheet, 2\" × 4\")", cols: 2, rows: 5, width: 4, height: 2, top: 0.5, left: 0.15625, pitchX: 4.1875, pitchY: 2 },
  { id: "5164", name: "Avery 5164 / 8164 (6 per sheet, 3⅓\" × 4\")", cols: 2, rows: 3, width: 4, height: 3.3333, top: 0.5, left: 0.15625, pitchX: 4.1875, pitchY: 3.3333 },
];

export const sheetById = (id: string | undefined) => LABEL_SHEETS.find((s) => s.id === id) ?? LABEL_SHEETS[1];
