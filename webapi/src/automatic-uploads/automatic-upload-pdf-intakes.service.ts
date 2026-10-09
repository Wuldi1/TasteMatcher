import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  AutomaticUploadApprovalRequest,
  AutomaticUploadApprovalResponse,
  AutomaticUploadPdfIntakeDetail,
  AutomaticUploadPdfIntakeIngestResponse,
  AutomaticUploadPdfIntakeListItem,
  AutomaticUploadPdfIntakeStatus,
  AutomaticUploadPdfIntakeSummary,
  AutomaticUploadPreviewResponse,
  BlobService,
  CosmosService,
} from "@tastematcher/common";
import { createHash } from "crypto";
import { AuthenticatedUser } from "../auth/types/authenticated-request.interface";
import {
  AutomaticUploadImportUpload,
  AutomaticUploadsService,
} from "./automatic-uploads.service";

const CONTAINER = "automatic-upload-pdf-intakes";
const DOCUMENT_TYPE = "automaticUploadPdfIntake";

export interface PdfIntakeUpload {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

export interface PdfIntakeIngestFields {
  senderEmail?: string;
  gmailMessageId?: string;
  gmailThreadId?: string;
  subject?: string;
  originalFilename?: string;
  summary?: string;
}

interface PdfIntakeArtifacts {
  pdfBlobName: string;
  importJsonBlobName: string;
  summaryBlobName: string;
}

interface PdfIntakeDocument extends AutomaticUploadPdfIntakeListItem {
  type: typeof DOCUMENT_TYPE;
  artifacts: PdfIntakeArtifacts;
  importResult?: AutomaticUploadApprovalResponse;
}

@Injectable()
export class AutomaticUploadPdfIntakesService {
  constructor(
    private readonly automaticUploads: AutomaticUploadsService,
    private readonly blobService: BlobService,
    private readonly cosmosService: CosmosService,
  ) {}

  async ingest(
    fields: PdfIntakeIngestFields,
    pdf: PdfIntakeUpload | undefined,
    importFile: PdfIntakeUpload | undefined,
  ): Promise<AutomaticUploadPdfIntakeIngestResponse> {
    const domainId = this.requiredConfig("AUTOMATIC_UPLOAD_INTAKE_DOMAIN_ID");
    const expectedSender = this.requiredConfig(
      "AUTOMATIC_UPLOAD_INTAKE_SENDER",
    ).toLowerCase();
    const senderEmail = this.requiredField(
      fields.senderEmail,
      "senderEmail",
    ).toLowerCase();
    if (senderEmail !== expectedSender) {
      throw new BadRequestException("Sender is not allowed for PDF intake.");
    }
    const gmailMessageId = this.requiredField(
      fields.gmailMessageId,
      "gmailMessageId",
    );
    const originalFilename = this.requiredField(
      fields.originalFilename || pdf?.originalname,
      "originalFilename",
    );
    if (!pdf || pdf.mimetype !== "application/pdf") {
      throw new BadRequestException("A PDF file is required.");
    }
    if (!importFile) {
      throw new BadRequestException(
        "A generated import JSON file is required.",
      );
    }

    const summary = this.parseSummary(fields.summary);
    const existing = await this.findBySource(
      domainId,
      gmailMessageId,
      originalFilename,
    );
    if (existing) {
      return {
        intakeId: existing.id,
        status: existing.status,
        duplicate: true,
      };
    }

    const preview = this.automaticUploads.previewImportFile(
      domainId,
      { id: "gmail-pdf-intake", role: "domain_owner" },
      importFile as AutomaticUploadImportUpload,
    );
    const id = this.intakeId(gmailMessageId, originalFilename);
    const prefix = `domains/${domainId}/pdf-intakes/${id}`;
    const now = new Date().toISOString();
    const artifacts: PdfIntakeArtifacts = {
      pdfBlobName: `${prefix}/source.pdf`,
      importJsonBlobName: `${prefix}/auction-import.json`,
      summaryBlobName: `${prefix}/summary.json`,
    };

    await Promise.all([
      this.blobService.uploadPrivateBlob(
        CONTAINER,
        artifacts.pdfBlobName,
        pdf.buffer,
        "application/pdf",
        { domainId, intakeId: id },
      ),
      this.blobService.uploadPrivateBlob(
        CONTAINER,
        artifacts.importJsonBlobName,
        importFile.buffer,
        "application/json",
        { domainId, intakeId: id },
      ),
      this.blobService.uploadPrivateBlob(
        CONTAINER,
        artifacts.summaryBlobName,
        Buffer.from(JSON.stringify(summary), "utf8"),
        "application/json",
        { domainId, intakeId: id },
      ),
    ]);

    const document: PdfIntakeDocument = {
      id,
      type: DOCUMENT_TYPE,
      domainId,
      status: this.initialStatus(summary, preview),
      source: {
        senderEmail,
        gmailMessageId,
        gmailThreadId: this.optional(fields.gmailThreadId),
        subject: this.optional(fields.subject),
        originalFilename,
      },
      summary,
      artifacts,
      createdAt: now,
      updatedAt: now,
    };
    const container = await this.cosmosService.getContainer("Core");
    try {
      await container.items.create(document);
    } catch (error) {
      const duplicate = await this.findBySource(
        domainId,
        gmailMessageId,
        originalFilename,
      );
      if (duplicate) {
        return {
          intakeId: duplicate.id,
          status: duplicate.status,
          duplicate: true,
        };
      }
      throw error;
    }
    return { intakeId: id, status: document.status, duplicate: false };
  }

  async list(domainId: string): Promise<AutomaticUploadPdfIntakeListItem[]> {
    const container = await this.cosmosService.getContainer("Core");
    const { resources } = await container.items
      .query<PdfIntakeDocument>(
        {
          query:
            "SELECT * FROM c WHERE c.type = @type ORDER BY c.createdAt DESC",
          parameters: [{ name: "@type", value: DOCUMENT_TYPE }],
        },
        { partitionKey: domainId },
      )
      .fetchAll();
    return resources.map((document) => this.toListItem(document));
  }

  async get(
    domainId: string,
    intakeId: string,
    actor: AuthenticatedUser,
  ): Promise<AutomaticUploadPdfIntakeDetail> {
    const document = await this.getDocument(domainId, intakeId);
    const importBuffer = await this.blobService.downloadBlob(
      CONTAINER,
      document.artifacts.importJsonBlobName,
    );
    const preview = this.automaticUploads.previewImportFile(domainId, actor, {
      originalname: "auction-import.json",
      mimetype: "application/json",
      size: importBuffer.length,
      buffer: importBuffer,
    });
    return {
      ...this.toListItem(document),
      preview,
      importResult: document.importResult,
    };
  }

  async downloadSource(
    domainId: string,
    intakeId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const document = await this.getDocument(domainId, intakeId);
    return {
      buffer: await this.blobService.downloadBlob(
        CONTAINER,
        document.artifacts.pdfBlobName,
      ),
      filename: document.source.originalFilename,
    };
  }

  async approve(
    domainId: string,
    intakeId: string,
    actor: AuthenticatedUser,
    body: unknown,
  ): Promise<AutomaticUploadApprovalResponse> {
    const detail = await this.get(domainId, intakeId, actor);
    if (detail.status === "importing" || detail.status === "imported") {
      throw new ConflictException(
        detail.status === "imported"
          ? "This PDF intake has already been imported."
          : "This PDF intake is already importing.",
      );
    }
    if (!this.isApprovalBody(body)) {
      throw new BadRequestException("A valid approval request is required.");
    }
    const trustedById = new Map(
      detail.preview.drafts.map((draft) => [draft.draftId, draft]),
    );
    const drafts = body.drafts.map((clientDraft) => {
      const trusted = trustedById.get(clientDraft.draftId);
      if (!trusted) {
        throw new BadRequestException(
          `Unknown PDF intake draft: ${clientDraft.draftId}`,
        );
      }
      return {
        draftId: trusted.draftId,
        source: trusted.source,
        artwork: clientDraft.artwork,
      };
    });
    const request: AutomaticUploadApprovalRequest = {
      provider: "import_file",
      sourceUrl: detail.preview.source.sourceAuctionUrl,
      drafts,
    };
    await this.updateStatus(domainId, intakeId, "importing");
    try {
      const result = await this.automaticUploads.approve(
        domainId,
        actor,
        request,
      );
      const completed = result.created.length + result.skipped.length;
      const status: AutomaticUploadPdfIntakeStatus =
        result.failed.length === 0
          ? "imported"
          : completed > 0
            ? "partially_imported"
            : "needs_attention";
      await this.updateStatus(domainId, intakeId, status, {
        approvedAt: new Date().toISOString(),
        approvedBy: actor.id,
        importResult: result,
      });
      return result;
    } catch (error) {
      await this.updateStatus(domainId, intakeId, "needs_attention");
      throw error;
    }
  }

  private async getDocument(
    domainId: string,
    intakeId: string,
  ): Promise<PdfIntakeDocument> {
    const container = await this.cosmosService.getContainer("Core");
    const { resource } = await container
      .item(intakeId, domainId)
      .read<PdfIntakeDocument>();
    if (!resource || resource.type !== DOCUMENT_TYPE) {
      throw new NotFoundException("PDF intake was not found.");
    }
    return resource;
  }

  private async findBySource(
    domainId: string,
    gmailMessageId: string,
    originalFilename: string,
  ): Promise<PdfIntakeDocument | undefined> {
    const container = await this.cosmosService.getContainer("Core");
    const { resources } = await container.items
      .query<PdfIntakeDocument>(
        {
          query:
            "SELECT TOP 1 * FROM c WHERE c.type = @type AND c.source.gmailMessageId = @messageId AND c.source.originalFilename = @filename",
          parameters: [
            { name: "@type", value: DOCUMENT_TYPE },
            { name: "@messageId", value: gmailMessageId },
            { name: "@filename", value: originalFilename },
          ],
        },
        { partitionKey: domainId },
      )
      .fetchAll();
    return resources[0];
  }

  private async updateStatus(
    domainId: string,
    intakeId: string,
    status: AutomaticUploadPdfIntakeStatus,
    extra: Partial<PdfIntakeDocument> = {},
  ): Promise<void> {
    const container = await this.cosmosService.getContainer("Core");
    const document = await this.getDocument(domainId, intakeId);
    await container.item(intakeId, domainId).replace({
      ...document,
      ...extra,
      status,
      updatedAt: new Date().toISOString(),
    });
  }

  private toListItem(
    document: PdfIntakeDocument,
  ): AutomaticUploadPdfIntakeListItem {
    const {
      id,
      domainId,
      status,
      source,
      summary,
      createdAt,
      updatedAt,
      approvedAt,
      approvedBy,
    } = document;
    return {
      id,
      domainId,
      status,
      source,
      summary,
      createdAt,
      updatedAt,
      approvedAt,
      approvedBy,
    };
  }

  private parseSummary(
    value: string | undefined,
  ): AutomaticUploadPdfIntakeSummary {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.requiredField(value, "summary"));
    } catch {
      throw new BadRequestException("summary must be valid JSON.");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new BadRequestException("summary must be an object.");
    }
    const record = parsed as Record<string, unknown>;
    const missing =
      record.missing && typeof record.missing === "object"
        ? (record.missing as Record<string, unknown>)
        : {};
    const count = (source: Record<string, unknown>, key: string): number => {
      const candidate = source[key];
      return typeof candidate === "number" && candidate >= 0 ? candidate : 0;
    };
    return {
      artworkCount: count(record, "artworkCount"),
      includedCount: count(record, "includedCount"),
      excludedCount: count(record, "excludedCount"),
      warningCount: count(record, "warningCount"),
      missing: {
        title: count(missing, "title"),
        artist: count(missing, "artist"),
        price: count(missing, "price"),
        endDate: count(missing, "endDate"),
        image: count(missing, "image"),
      },
      warnings: this.stringList(record.warnings),
      unparsed: this.stringList(record.unparsed),
    };
  }

  private initialStatus(
    summary: AutomaticUploadPdfIntakeSummary,
    preview: AutomaticUploadPreviewResponse,
  ): AutomaticUploadPdfIntakeStatus {
    const hasBlockingIssue = preview.drafts.some((draft) =>
      draft.issues.some((issue) => issue.blocking),
    );
    return summary.includedCount > 0 && !hasBlockingIssue
      ? "ready_for_review"
      : "needs_attention";
  }

  private intakeId(messageId: string, filename: string): string {
    return `pdf-intake-${createHash("sha256")
      .update(`${messageId}\0${filename}`)
      .digest("hex")
      .slice(0, 24)}`;
  }

  private requiredConfig(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is required.`);
    return value;
  }

  private requiredField(value: string | undefined, name: string): string {
    if (!value?.trim()) throw new BadRequestException(`${name} is required.`);
    return value.trim();
  }

  private optional(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }

  private stringList(value: unknown): string[] | undefined {
    if (!Array.isArray(value)) return undefined;
    return value.filter((item): item is string => typeof item === "string");
  }

  private isApprovalBody(
    body: unknown,
  ): body is AutomaticUploadApprovalRequest {
    if (!body || typeof body !== "object") return false;
    const request = body as Partial<AutomaticUploadApprovalRequest>;
    return Array.isArray(request.drafts) && request.drafts.length > 0;
  }
}
