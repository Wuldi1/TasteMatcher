// ---------- CODEGEN CHECKLIST (must be satisfied) ----------
// 1. Uses TypeScript strict types (no `any`). If any `any` present, justify with comment.
// 2. Uses shared `common` types for API contracts where applicable.
// 3. Includes unit tests written first (test file present next to implementation).
// 4. Adds structured logging at function entry/exit and on errors.
// 5. Adds at least one assertion or guard for input validation.
// 6. No duplicate logic — reuse existing service/util or extract shared module.
// 7. Adds or updates README or docs if public API changes.
// 8. Adds meaningful JSDoc for exported functions/classes.
// 9. CI-friendly: code passes lint, typecheck, and tests locally.
// 10. Frontend-specific: N/A (backend service)
// -----------------------------------------------------------

import { app, InvocationContext } from "@azure/functions";
import { EmailClient } from "@azure/communication-email";
import type {
  Artwork,
  NewArtworkNotificationQueueMessage,
  User,
} from "@tastematcher/common";
import {
  CosmosService,
  cosineSimilarity,
  createLogger,
  getAIRecommendationsEligibility,
  metrics,
  normalizeVector,
} from "@tastematcher/common";

const logger = createLogger("NotifyUsersNewArtwork");

const NOTIFY_QUEUE_NAME = process.env.NEW_ARTWORK_QUEUE_NAME || "";
const EMAIL_CONNECTION_STRING =
  process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
const EMAIL_SENDER = process.env.AZURE_EMAIL_SENDER;
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const IS_PRD = process.env.NODE_ENV === "prd";
const MIN_SIMILARITY = Number.parseFloat(
  process.env.NEW_ARTWORK_NOTIFY_MIN_SIMILARITY || "0.2",
);
const MAX_RECIPIENTS = Number.parseInt(
  process.env.NEW_ARTWORK_NOTIFY_MAX_USERS || "50",
  10,
);
function validateMessage(
  message: unknown,
): asserts message is NewArtworkNotificationQueueMessage {
  const msg = message as Partial<NewArtworkNotificationQueueMessage>;
  if (!msg.messageId || typeof msg.messageId !== "string") {
    throw new Error("Invalid message: messageId is required");
  }
  if (!msg.artworkId || typeof msg.artworkId !== "string") {
    throw new Error("Invalid message: artworkId is required");
  }
  if (!msg.domainId || typeof msg.domainId !== "string") {
    throw new Error("Invalid message: domainId is required");
  }
  if (typeof msg.uploadedAt !== "number") {
    throw new Error("Invalid message: uploadedAt is required");
  }
}

function buildArtworkEmail(
  recipientName: string | undefined,
  artwork: Artwork,
  similarity: number,
): { subject: string; text: string; html: string } {
  const title = artwork.title || "Untitled artwork";
  const artist = artwork.artist ? `by ${artwork.artist}` : "";
  const greeting = recipientName ? `Hi ${recipientName},` : "Hi there,";
  const viewLink = FRONTEND_URL
    ? `${FRONTEND_URL}/catalog?artworkId=${encodeURIComponent(artwork.id)}`
    : "";
  const subject = `New artwork you might like: ${title}`;
  const similarityText = `${Math.round(similarity * 100)}% match`;
  const priceLine =
    artwork.shouldDisplayPrice && typeof artwork.price === "number"
      ? `Price: ${artwork.price}`
      : "";

  const text = [
    greeting,
    "",
    `We added a new artwork that matches your taste (${similarityText}).`,
    `${title} ${artist}`.trim(),
    artwork.description || "",
    priceLine,
    viewLink ? `View: ${viewLink}` : "",
  ]
    .filter((line) => line.length > 0)
    .join("\n");

  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937;">
      <p>${greeting}</p>
      <p>We added a new artwork that matches your taste (${similarityText}).</p>
      <h2 style="margin: 16px 0 4px;">${title}</h2>
      ${artist ? `<p style="margin: 0 0 12px;">${artist}</p>` : ""}
      ${
        artwork.description
          ? `<p style="margin: 0 0 12px;">${artwork.description}</p>`
          : ""
      }
      ${
        priceLine
          ? `<p style="margin: 0 0 12px; font-weight: 600;">${priceLine}</p>`
          : ""
      }
      ${
        artwork.filename
          ? `<img src="${artwork.filename}" alt="${title}" style="max-width: 100%; border-radius: 8px; margin: 12px 0;" />`
          : ""
      }
      ${
        viewLink
          ? `<p><a href="${viewLink}" style="color: #2563eb;">View artwork</a></p>`
          : ""
      }
    </div>
  `;

  return { subject, text, html };
}

async function sendEmail(
  emailClient: EmailClient,
  senderAddress: string,
  recipient: string,
  content: { subject: string; text: string; html: string },
): Promise<void> {
  if (!IS_PRD) {
    logger.info({
      msg: "Non-production environment; skipping email send",
      recipient,
      subject: content.subject,
    });
    return;
  }

  const poller = await emailClient.beginSend({
    senderAddress,
    content: {
      subject: content.subject,
      plainText: content.text,
      html: content.html,
    },
    recipients: {
      to: [{ address: recipient }],
    },
  });
  await poller.pollUntilDone();
}

/**
 * Notify users in the domain about a new artwork they may like.
 */
export async function notifyUsersNewArtwork(
  queueItem: unknown,
  context: InvocationContext,
): Promise<void> {
  const start = Date.now();

  try {
    validateMessage(queueItem);
    const message = queueItem as NewArtworkNotificationQueueMessage;

    logger.info({
      msg: "Processing new artwork notification",
      messageId: message.messageId,
      artworkId: message.artworkId,
      domainId: message.domainId,
      invocationContextId: context.invocationId,
    });

    if (!EMAIL_CONNECTION_STRING || !EMAIL_SENDER) {
      logger.warn({
        msg: "Email configuration missing; skipping notifications",
      });
      return;
    }

    const cosmosService = new CosmosService();
    const artworksContainer = await cosmosService.getArtworksContainer();
    const usersContainer = await cosmosService.getContainer("Core");

    const { resource: artwork } = await artworksContainer
      .item(message.artworkId, message.domainId)
      .read<Artwork>();

    if (!artwork) {
      logger.warn({
        msg: "Artwork not found; skipping notifications",
        artworkId: message.artworkId,
        domainId: message.domainId,
      });
      return;
    }

    if (artwork.isPrivate) {
      logger.info({
        msg: "Artwork is private; skipping notifications",
        artworkId: artwork.id,
        domainId: artwork.domainId,
      });
      return;
    }

    if (!Array.isArray(artwork.vector) || artwork.vector.length !== 1024) {
      logger.warn({
        msg: "Artwork vector missing or invalid; skipping notifications",
        artworkId: artwork.id,
        domainId: artwork.domainId,
      });
      return;
    }

    const normalizedArtworkVector = normalizeVector(artwork.vector);

    const usersQuery = {
      query:
        "SELECT c.id, c.email, c.name, c.preferenceVector, c.role, c.status, c.swipeCount, c.onboardingStatus FROM c WHERE c.type = 'user' AND c.domainId = @domainId AND c.role = 'customer' AND c.status = 'active'",
      parameters: [{ name: "@domainId", value: message.domainId }],
    };

    const { resources: users } = await usersContainer.items
      .query<User>(usersQuery, { partitionKey: message.domainId })
      .fetchAll();

    const scoredUsers: Array<{ user: User; similarity: number }> = [];
    for (const user of users) {
      if (!user.email || !user.email.includes("@")) continue;
      const eligibility = getAIRecommendationsEligibility(user);
      if (!eligibility.isEligible) continue;
      if (
        !Array.isArray(user.preferenceVector) ||
        user.preferenceVector.length !== 1024
      ) {
        continue;
      }

      const similarity = cosineSimilarity(
        normalizeVector(user.preferenceVector),
        normalizedArtworkVector,
      );
      if (!Number.isFinite(similarity) || similarity < MIN_SIMILARITY) {
        continue;
      }
      scoredUsers.push({ user, similarity });
    }

    scoredUsers.sort((a, b) => b.similarity - a.similarity);
    const recipients = scoredUsers.slice(0, MAX_RECIPIENTS);

    if (recipients.length === 0) {
      logger.info({
        msg: "No eligible users for new artwork notification",
        artworkId: artwork.id,
        domainId: artwork.domainId,
      });
      return;
    }

    const emailClient = new EmailClient(EMAIL_CONNECTION_STRING);

    for (const entry of recipients) {
      const { user, similarity } = entry;
      if (!user.email) continue;
      const content = buildArtworkEmail(user.name, artwork, similarity);
      await sendEmail(emailClient, EMAIL_SENDER, user.email, content);
      metrics.increment("new_artwork_notification.sent", {
        domainId: artwork.domainId,
      });
    }

    const durationMs = Date.now() - start;
    logger.info({
      msg: "New artwork notifications completed",
      artworkId: artwork.id,
      domainId: artwork.domainId,
      recipients: recipients.length,
      durationMs,
      invocationContextId: context.invocationId,
    });
  } catch (error) {
    const durationMs = Date.now() - start;
    logger.error({
      msg: "New artwork notification failed",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      durationMs,
    });
    metrics.increment("new_artwork_notification.failed", {
      errorType: error instanceof Error ? error.constructor.name : "Unknown",
    });
    throw error;
  }
}

if (NOTIFY_QUEUE_NAME) {
  app.storageQueue("NotifyUsersNewArtwork", {
    queueName: NOTIFY_QUEUE_NAME,
    connection: "AzureWebJobsStorage",
    handler: notifyUsersNewArtwork,
  });
} else {
  logger.warn({
    msg: "NEW_ARTWORK_QUEUE_NAME not set; NotifyUsersNewArtwork not registered",
  });
}
