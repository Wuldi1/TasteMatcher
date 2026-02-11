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

import { EmailClient } from "@azure/communication-email";
import { app, InvocationContext, Timer } from "@azure/functions";
import type { Comment, Domain, Proposal, User } from "@tastematcher/common";
import {
  CosmosService,
  createLogger,
  getAIRecommendationsEligibility,
} from "@tastematcher/common";

const logger = createLogger("DailyDomainOwnerSummary");

const SUMMARY_CRON = process.env.DOMAIN_DAILY_SUMMARY_CRON || "0 0 8 * * *";
const EMAIL_CONNECTION_STRING =
  process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
const EMAIL_SENDER = process.env.AZURE_EMAIL_SENDER;
const FRONTEND_URL = process.env.FRONTEND_URL || "";
const IS_PRD = process.env.NODE_ENV === "prd";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

type PreferenceRow = {
  userId: string;
  liked?: boolean;
  comment?: string;
  createdAt?: number;
};

type ProposalSummary = {
  id: string;
  userId: string;
  status: string;
  updatedAt?: number;
  createdAt: number;
  submittedAt?: number;
  items: Proposal["items"];
};

type UserPreferenceStats = {
  totalSwiped: number;
  totalLikes: number;
  totalDislikes: number;
  totalComments: number;
  recentSwiped: number;
  recentLikes: number;
  recentDislikes: number;
  recentComments: number;
};

type UserProposalStats = {
  totalProposals: number;
  statusCounts: Record<string, number>;
  itemStatusCounts: Record<string, number>;
  lastUpdatedAt?: number;
  recentProposals: ProposalSummary[];
};

function formatDate(timestamp?: number): string {
  if (!timestamp) return "—";
  return new Date(timestamp).toLocaleString();
}

function formatCount(value: number): string {
  return value === 1 ? "1" : value.toString();
}

function summarizeComments(comments: Comment[] | undefined, since: number) {
  if (!comments || comments.length === 0) {
    return { total: 0, recent: 0 };
  }
  const recent = comments.filter((c) => c.createdAt >= since).length;
  return { total: comments.length, recent };
}

function buildEmailContent(input: {
  domain: Domain;
  owner: User;
  users: User[];
  preferenceStats: Map<string, UserPreferenceStats>;
  proposalStats: Map<string, UserProposalStats>;
  nowEligibleUserIds: Set<string>;
  recentProposalUpdates: ProposalSummary[];
  since: number;
}): { subject: string; text: string; html: string } {
  const {
    domain,
    owner,
    users,
    preferenceStats,
    proposalStats,
    nowEligibleUserIds,
    recentProposalUpdates,
    since,
  } = input;

  const greeting = owner.name ? `Hi ${owner.name},` : "Hi there,";
  const subject = `Daily user summary for ${domain.name || domain.id}`;
  const eligibleLines =
    nowEligibleUserIds.size === 0
      ? ["None"]
      : users
          .filter((u) => nowEligibleUserIds.has(u.id))
          .map((u) => `${u.name || u.email} (${u.email})`);

  const proposalLines =
    recentProposalUpdates.length === 0
      ? ["None"]
      : recentProposalUpdates.map((proposal) => {
          const user = users.find((u) => u.id === proposal.userId);
          const userLabel = user?.name || user?.email || proposal.userId;
          const statusLabel = proposal.status || "unknown";
          const updatedAt = formatDate(
            proposal.updatedAt || proposal.createdAt,
          );
          return `${userLabel}: proposal ${proposal.id} ${statusLabel} (${updatedAt})`;
        });

  const userLines = users.map((user) => {
    const pref = preferenceStats.get(user.id) || {
      totalSwiped: 0,
      totalLikes: 0,
      totalDislikes: 0,
      totalComments: 0,
      recentSwiped: 0,
      recentLikes: 0,
      recentDislikes: 0,
      recentComments: 0,
    };
    const proposal = proposalStats.get(user.id) || {
      totalProposals: 0,
      statusCounts: {},
      itemStatusCounts: {},
      lastUpdatedAt: undefined,
      recentProposals: [],
    };
    const commentStats = summarizeComments(user.comments, since);
    const totalComments = pref.totalComments + commentStats.total;
    const recentComments = pref.recentComments + commentStats.recent;

    const eligibility = getAIRecommendationsEligibility({
      ...user,
      swipeCount: pref.totalSwiped,
    });
    const eligibilityLabel = eligibility.isEligible
      ? "eligible"
      : `not eligible (${eligibility.reasons.join(", ")})`;

    const proposalStatusSummary = Object.entries(proposal.statusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");
    const itemStatusSummary = Object.entries(proposal.itemStatusCounts)
      .map(([status, count]) => `${status}: ${count}`)
      .join(", ");

    return [
      `${user.name || user.email} (${user.email})`,
      `Role: ${user.role} | Status: ${user.status} | Onboarding: ${user.onboardingStatus}`,
      `Swipes: ${pref.totalSwiped} (last 24h: ${pref.recentSwiped})`,
      `Likes: ${pref.totalLikes} | Dislikes: ${pref.totalDislikes}`,
      `Comments: ${totalComments} (last 24h: ${recentComments})`,
      `AI Suggestions: ${eligibilityLabel}`,
      `Proposals: ${proposal.totalProposals} | ${proposalStatusSummary || "none"} | last update ${formatDate(
        proposal.lastUpdatedAt,
      )}`,
      itemStatusSummary ? `Proposal items: ${itemStatusSummary}` : "",
    ]
      .filter((line) => line.length > 0)
      .join("\n");
  });

  const text = [
    greeting,
    "",
    `Daily summary for ${domain.name || domain.id}`,
    "",
    "Recap (last 24 hours):",
    `- Proposal updates: ${formatCount(recentProposalUpdates.length)}`,
    ...proposalLines.map((line) => `  - ${line}`),
    `- Newly eligible for AI Suggestions: ${formatCount(
      nowEligibleUserIds.size,
    )}`,
    ...eligibleLines.map((line) => `  - ${line}`),
    "",
    "User details:",
    ...userLines.map((line) => `\n${line}`),
  ].join("\n");

  const htmlUserCards = users
    .map((user) => {
      const pref = preferenceStats.get(user.id) || {
        totalSwiped: 0,
        totalLikes: 0,
        totalDislikes: 0,
        totalComments: 0,
        recentSwiped: 0,
        recentLikes: 0,
        recentDislikes: 0,
        recentComments: 0,
      };
      const proposal = proposalStats.get(user.id) || {
        totalProposals: 0,
        statusCounts: {},
        itemStatusCounts: {},
        lastUpdatedAt: undefined,
        recentProposals: [],
      };
      const commentStats = summarizeComments(user.comments, since);
      const totalComments = pref.totalComments + commentStats.total;
      const recentComments = pref.recentComments + commentStats.recent;
      const eligibility = getAIRecommendationsEligibility({
        ...user,
        swipeCount: pref.totalSwiped,
      });
      const eligibilityLabel = eligibility.isEligible
        ? "Eligible"
        : `Not eligible (${eligibility.reasons.join(", ")})`;
      const proposalStatusSummary = Object.entries(proposal.statusCounts)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ");
      const itemStatusSummary = Object.entries(proposal.itemStatusCounts)
        .map(([status, count]) => `${status}: ${count}`)
        .join(", ");

      return `
        <div style="border:1px solid #e5e7eb; border-radius: 12px; padding: 12px; margin: 12px 0;">
          <strong>${user.name || user.email}</strong> <span style="color:#6b7280;">(${user.email})</span><br />
          <span style="color:#374151;">Role:</span> ${user.role} |
          <span style="color:#374151;">Status:</span> ${user.status} |
          <span style="color:#374151;">Onboarding:</span> ${user.onboardingStatus}<br />
          <span style="color:#374151;">Swipes:</span> ${pref.totalSwiped} (last 24h: ${pref.recentSwiped})<br />
          <span style="color:#374151;">Likes:</span> ${pref.totalLikes} |
          <span style="color:#374151;">Dislikes:</span> ${pref.totalDislikes}<br />
          <span style="color:#374151;">Comments:</span> ${totalComments} (last 24h: ${recentComments})<br />
          <span style="color:#374151;">AI Suggestions:</span> ${eligibilityLabel}<br />
          <span style="color:#374151;">Proposals:</span> ${proposal.totalProposals} ${
            proposalStatusSummary ? `| ${proposalStatusSummary}` : ""
          } | last update ${formatDate(proposal.lastUpdatedAt)}<br />
          ${
            itemStatusSummary
              ? `<span style="color:#374151;">Proposal items:</span> ${itemStatusSummary}<br />`
              : ""
          }
        </div>
      `;
    })
    .join("");

  const htmlProposalUpdates =
    recentProposalUpdates.length === 0
      ? "<li>None</li>"
      : recentProposalUpdates
          .map((proposal) => {
            const user = users.find((u) => u.id === proposal.userId);
            const userLabel = user?.name || user?.email || proposal.userId;
            const statusLabel = proposal.status || "unknown";
            const updatedAt = formatDate(
              proposal.updatedAt || proposal.createdAt,
            );
            return `<li>${userLabel}: proposal ${proposal.id} ${statusLabel} (${updatedAt})</li>`;
          })
          .join("");

  const htmlEligibility =
    nowEligibleUserIds.size === 0
      ? "<li>None</li>"
      : users
          .filter((u) => nowEligibleUserIds.has(u.id))
          .map((u) => `<li>${u.name || u.email} (${u.email})</li>`)
          .join("");

  const viewLink = FRONTEND_URL ? `${FRONTEND_URL}/management` : undefined;

  const html = `
    <div style="margin:0; background:#f8fafc; padding:24px;">
      <div style="max-width:680px; margin:0 auto; font-family: Arial, sans-serif; color:#0f172a;">
        <div style="background:linear-gradient(135deg,#0ea5e9,#22c55e); border-radius:16px; padding:20px; color:#ffffff;">
          <div style="font-size:14px; opacity:0.9;">Daily summary</div>
          <div style="font-size:24px; font-weight:700; margin-top:6px;">
            ${domain.name || domain.id}
          </div>
          <div style="margin-top:8px; font-size:14px; opacity:0.9;">${greeting}</div>
        </div>

        <div style="margin-top:16px; background:#ffffff; border:1px solid #e2e8f0; border-radius:16px; padding:16px;">
          <h3 style="margin:0 0 12px; font-size:16px; color:#0f172a;">Recap (last 24 hours)</h3>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-bottom:12px;">
            <div style="flex:1; min-width:180px; background:#eff6ff; border-radius:12px; padding:12px; border:1px solid #bfdbfe;">
              <div style="font-size:12px; color:#1d4ed8; font-weight:600;">Proposal updates</div>
              <div style="font-size:20px; font-weight:700; color:#1e40af;">${recentProposalUpdates.length}</div>
            </div>
            <div style="flex:1; min-width:180px; background:#f0fdf4; border-radius:12px; padding:12px; border:1px solid #bbf7d0;">
              <div style="font-size:12px; color:#15803d; font-weight:600;">Newly AI eligible</div>
              <div style="font-size:20px; font-weight:700; color:#166534;">${nowEligibleUserIds.size}</div>
            </div>
          </div>
          <div style="margin-bottom:8px; font-weight:600; color:#0f172a;">Proposal changes</div>
          <ul style="margin:0 0 12px; padding-left:18px; color:#334155;">
            ${htmlProposalUpdates}
          </ul>
          <div style="margin-bottom:8px; font-weight:600; color:#0f172a;">New AI eligible users</div>
          <ul style="margin:0; padding-left:18px; color:#334155;">
            ${htmlEligibility}
          </ul>
        </div>

        <div style="margin-top:16px;">
          <h3 style="margin:0 0 8px; font-size:16px; color:#0f172a;">User details</h3>
          ${htmlUserCards}
        </div>

        ${
          viewLink
            ? `<div style="margin-top:16px;">
                <a href="${viewLink}" style="display:inline-block; background:#0ea5e9; color:#ffffff; text-decoration:none; padding:10px 16px; border-radius:10px; font-weight:600;">
                  Open Management
                </a>
              </div>`
            : ""
        }
      </div>
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

export async function dailyDomainOwnerSummary(
  _timer: Timer,
  context: InvocationContext,
): Promise<void> {
  const start = Date.now();

  if (!EMAIL_CONNECTION_STRING || !EMAIL_SENDER) {
    logger.warn({
      msg: "Missing email configuration; skipping daily summary",
    });
    return;
  }

  try {
    const cosmosService = new CosmosService();
    const coreContainer = await cosmosService.getContainer("Core");
    const preferencesContainer =
      await cosmosService.getArtworkPreferencesContainer();
    const proposalsContainer = await cosmosService.getContainer("Proposals");

    const { resources: domains } = await coreContainer.items
      .query<Domain>({
        query: "SELECT * FROM c WHERE c.type = 'domain'",
      })
      .fetchAll();

    const emailClient = new EmailClient(EMAIL_CONNECTION_STRING);
    const since = Date.now() - ONE_DAY_MS;

    for (const domain of domains ?? []) {
      const { resources: users } = await coreContainer.items
        .query<User>({
          query:
            "SELECT * FROM c WHERE c.type = 'user' AND c.domainId = @domainId",
          parameters: [{ name: "@domainId", value: domain.id }],
        })
        .fetchAll();

      const domainOwners = (users ?? []).filter(
        // TODO : For now we will use Global Admin only, later we will open to Domain Owner aswell
        (user) => user.role === "global_admin",
      );
      if (domainOwners.length === 0) {
        logger.warn({
          msg: "No domain owners found; skipping domain summary",
          domainId: domain.id,
        });
        continue;
      }

      const { resources: preferences } = await preferencesContainer.items
        .query<PreferenceRow>(
          {
            query:
              "SELECT c.userId, c.liked, c.comment, c.createdAt FROM c WHERE c.type = @type AND c.domainId = @domainId",
            parameters: [
              { name: "@type", value: "artworkPreference" },
              { name: "@domainId", value: domain.id },
            ],
          },
          { partitionKey: domain.id },
        )
        .fetchAll();

      const preferenceStats = new Map<string, UserPreferenceStats>();
      for (const pref of preferences ?? []) {
        const stats = preferenceStats.get(pref.userId) || {
          totalSwiped: 0,
          totalLikes: 0,
          totalDislikes: 0,
          totalComments: 0,
          recentSwiped: 0,
          recentLikes: 0,
          recentDislikes: 0,
          recentComments: 0,
        };
        stats.totalSwiped += 1;
        if (pref.liked === true) {
          stats.totalLikes += 1;
        } else if (pref.liked === false) {
          stats.totalDislikes += 1;
        }
        if (pref.comment) {
          stats.totalComments += 1;
        }
        if ((pref.createdAt ?? 0) >= since) {
          stats.recentSwiped += 1;
          if (pref.liked === true) {
            stats.recentLikes += 1;
          } else if (pref.liked === false) {
            stats.recentDislikes += 1;
          }
          if (pref.comment) {
            stats.recentComments += 1;
          }
        }
        preferenceStats.set(pref.userId, stats);
      }

      const { resources: proposals } = await proposalsContainer.items
        .query<ProposalSummary>(
          {
            query:
              "SELECT c.id, c.userId, c.status, c.updatedAt, c.createdAt, c.submittedAt, c.items FROM c WHERE c.type = @type AND c.domainId = @domainId",
            parameters: [
              { name: "@type", value: "proposal" },
              { name: "@domainId", value: domain.id },
            ],
          },
          { partitionKey: domain.id },
        )
        .fetchAll();

      const proposalStats = new Map<string, UserProposalStats>();
      const recentProposalUpdates: ProposalSummary[] = [];

      for (const proposal of proposals ?? []) {
        const stats = proposalStats.get(proposal.userId) || {
          totalProposals: 0,
          statusCounts: {},
          itemStatusCounts: {},
          lastUpdatedAt: undefined,
          recentProposals: [],
        };
        stats.totalProposals += 1;
        stats.statusCounts[proposal.status] =
          (stats.statusCounts[proposal.status] || 0) + 1;

        const proposalUpdatedAt = proposal.updatedAt || proposal.createdAt;
        if (!stats.lastUpdatedAt || proposalUpdatedAt > stats.lastUpdatedAt) {
          stats.lastUpdatedAt = proposalUpdatedAt;
        }

        for (const item of proposal.items ?? []) {
          stats.itemStatusCounts[item.status] =
            (stats.itemStatusCounts[item.status] || 0) + 1;
        }

        if (proposalUpdatedAt >= since) {
          stats.recentProposals.push(proposal);
          recentProposalUpdates.push(proposal);
        }

        proposalStats.set(proposal.userId, stats);
      }

      const nowEligibleUserIds = new Set<string>();
      for (const user of users ?? []) {
        const pref = preferenceStats.get(user.id);
        const totalSwiped = pref?.totalSwiped ?? 0;
        const recentSwiped = pref?.recentSwiped ?? 0;
        const eligibility = getAIRecommendationsEligibility({
          ...user,
          swipeCount: totalSwiped,
        });
        if (
          eligibility.isEligible &&
          totalSwiped >= 20 &&
          totalSwiped - recentSwiped < 20
        ) {
          nowEligibleUserIds.add(user.id);
        }
      }

      for (const owner of domainOwners) {
        const content = buildEmailContent({
          domain,
          owner,
          users: users ?? [],
          preferenceStats,
          proposalStats,
          nowEligibleUserIds,
          recentProposalUpdates,
          since,
        });
        await sendEmail(emailClient, EMAIL_SENDER, owner.email, content);
      }

      logger.info({
        msg: "Domain summary sent",
        domainId: domain.id,
        owners: domainOwners.length,
        users: users?.length ?? 0,
      });
    }

    logger.info({
      msg: "Daily domain owner summary completed",
      durationMs: Date.now() - start,
      invocationContextId: context.invocationId,
    });
  } catch (error) {
    logger.error({
      msg: "Daily domain owner summary failed",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    throw error;
  }
}

app.timer("DailyDomainOwnerSummary", {
  schedule: SUMMARY_CRON,
  handler: dailyDomainOwnerSummary,
});
