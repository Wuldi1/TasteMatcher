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
const FRONTEND_URL = (
  process.env.FRONTEND_URL || "https://tastematcher.art"
).replace(/\/+$/, "");
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
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
  const viewLink = `${FRONTEND_URL}/catalog?artworkId=${encodeURIComponent(artwork.id)}`;
  const subject = `New artwork you might like: ${title}`;
  const similarityText = `${Math.round(similarity * 100)}% match`;
  const priceLine =
    artwork.shouldDisplayPrice && typeof artwork.price === "number"
      ? `Price: ${new Intl.NumberFormat("en-US", {
          style: "currency",
          currency: "USD",
          maximumFractionDigits: 0,
        }).format(artwork.price)}`
      : "";
  const imageUrl = safeImageUrl(artwork.filename);

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

  const html = `<!doctype html>
    <html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
    <body style="margin:0;background:#f6f4ef;color:#242a25;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#f6f4ef;padding:28px 12px;"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:620px;background:#fffefa;border:1px solid #d9d5ca;">
      <tr><td style="padding:26px 28px;background:#23372d;color:#fffefa;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#d6c19d;">Selected for your eye</div>
        <h1 style="margin:12px 0 0;font-family:Georgia,'Times New Roman',serif;font-size:30px;line-height:1.2;font-weight:400;color:#fffefa;">A new work to consider</h1>
        <p style="margin:12px 0 0;color:#e7ece8;font-size:15px;line-height:1.7;">${escapeHtml(greeting)} We found a ${escapeHtml(similarityText)} with the taste you have shared.</p>
      </td></tr>
      <tr><td style="padding:28px;">
      <h2 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:400;color:#242a25;">${escapeHtml(title)}</h2>
      ${artist ? `<p style="margin:6px 0 16px;color:#8a6c3e;font-size:14px;">${escapeHtml(artist)}</p>` : ""}
      ${
        artwork.description
          ? `<p style="margin:0 0 16px;color:#666a61;font-size:15px;line-height:1.7;">${escapeHtml(artwork.description)}</p>`
          : ""
      }
      ${
        priceLine
          ? `<p style="margin:0 0 16px;font-size:14px;font-weight:700;color:#242a25;">${escapeHtml(priceLine)}</p>`
          : ""
      }
      ${
        imageUrl
          ? `<img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(title)}" style="display:block;width:100%;height:auto;margin:18px 0;border:0;" />`
          : ""
      }
      <div style="margin-top:24px;"><a href="${escapeHtml(viewLink)}" style="display:inline-block;background:#344d40;color:#fffefa;text-decoration:none;padding:14px 24px;font-size:14px;font-weight:700;">View artwork</a></div>
      </td></tr>
      <tr><td style="padding:20px 28px;background:#f0eee8;border-top:1px solid #d9d5ca;font-size:12px;line-height:1.6;color:#666a61;">
        TasteMatcher · Private art advisory<br>
        <a href="${FRONTEND_URL}/privacy-policy" style="color:#344d40;">Privacy Policy</a>&nbsp;&nbsp;·&nbsp;&nbsp;<a href="${FRONTEND_URL}/terms-of-service" style="color:#344d40;">Terms of Service</a>
      </td></tr>
    </table></td></tr></table></body></html>
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
        "SELECT c.id, c.email, c.name, c.preferenceVector, c.likedPreferenceVector, c.role, c.status, c.swipeCount, c.onboardingStatus FROM c WHERE c.type = 'user' AND c.domainId = @domainId AND c.role = 'customer' AND c.status = 'active'",
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

      const notificationVector =
        Array.isArray(user.likedPreferenceVector) &&
        user.likedPreferenceVector.length === 1024 &&
        user.likedPreferenceVector.some((value) => value !== 0)
          ? user.likedPreferenceVector
          : user.preferenceVector;
      const similarity = cosineSimilarity(
        normalizeVector(notificationVector),
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
