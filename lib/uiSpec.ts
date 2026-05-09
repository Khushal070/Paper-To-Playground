// UISpec contract: the agent emits a UISpec, the frontend renders it
// from a fixed library of 12 primitives. Discriminated by `type`.

export type DataSource =
  | "mock_attention"
  | "mock_denoise"
  | "mock_optimizer_path"
  | "mock_chart"
  | "mock_lora_perf"
  | "mock_image"
  | "static"
  // Open union: agents may emit paper-specific keys (e.g. "mock_diffusion").
  // The `string & {}` trick keeps autocomplete on the known keys above
  // while still accepting any string literal.
  | (string & {});

interface ComponentBase {
  id: string;
  label?: string;
}

export interface TextBlockComponent extends ComponentBase {
  type: "text_block";
  text: string;
}

export interface AnnotationComponent extends ComponentBase {
  type: "annotation";
  text: string;
  kind?: "info" | "warning" | "tip" | "note";
}

export interface TextInputComponent extends ComponentBase {
  type: "text_input";
  placeholder?: string;
  defaultValue?: string;
}

export interface SliderComponent extends ComponentBase {
  type: "slider";
  min: number;
  max: number;
  default: number;
  step?: number;
}

export interface DropdownOption {
  value: string;
  label: string;
}

export interface DropdownComponent extends ComponentBase {
  type: "dropdown";
  options: DropdownOption[];
  defaultValue?: string;
}

export interface ButtonComponent extends ComponentBase {
  type: "button";
  action?: string;
}

export interface HeatmapComponent extends ComponentBase {
  type: "heatmap";
  rows: number;
  cols: number;
  data_source: DataSource;
}

export type ChartType = "line" | "bar" | "scatter";

export interface ChartComponent extends ComponentBase {
  type: "chart";
  chartType: ChartType;
  data_source: DataSource;
}

export interface ImageDisplayComponent extends ComponentBase {
  type: "image_display";
  data_source: DataSource;
  alt?: string;
}

export interface GraphVizComponent extends ComponentBase {
  type: "graph_viz";
  data_source: DataSource;
}

export interface CodeBlockComponent extends ComponentBase {
  type: "code_block";
  code: string;
  language?: string;
}

export interface ComparisonPairComponent extends ComponentBase {
  type: "comparison_pair";
  left: string;
  right: string;
  leftLabel?: string;
  rightLabel?: string;
}

export type UIComponent =
  | TextBlockComponent
  | AnnotationComponent
  | TextInputComponent
  | SliderComponent
  | DropdownComponent
  | ButtonComponent
  | HeatmapComponent
  | ChartComponent
  | ImageDisplayComponent
  | GraphVizComponent
  | CodeBlockComponent
  | ComparisonPairComponent;

export type UILayout = "vertical" | "grid";

export interface UISpec {
  paperTitle: string;
  summary: string;
  components: UIComponent[];
  layout: UILayout;
}
