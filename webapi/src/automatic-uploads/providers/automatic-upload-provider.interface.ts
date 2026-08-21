import {
  AutomaticUploadDraft,
  AutomaticUploadPreviewResponse,
  AutomaticUploadProvider,
} from "@tastematcher/common";

export interface AutomaticUploadParseContext {
  sourceUrl: string;
}

export interface AutomaticUploadProviderAdapter {
  readonly provider: AutomaticUploadProvider;
  readonly displayName: string;
  canParse(url: URL): boolean;
  parse(
    html: string,
    context: AutomaticUploadParseContext,
  ): AutomaticUploadPreviewResponse;
  enrichDraftFromLotDetail?(
    draft: AutomaticUploadDraft,
    detailHtml: string,
  ): AutomaticUploadDraft;
}
