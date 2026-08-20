import { AutomaticUploadPreviewResponse } from "@tastematcher/common";

export interface AutomaticUploadParseContext {
  sourceUrl: string;
}

export interface AutomaticUploadProviderAdapter {
  readonly provider: "phillips";
  canParse(url: URL): boolean;
  parse(
    html: string,
    context: AutomaticUploadParseContext,
  ): AutomaticUploadPreviewResponse;
}
